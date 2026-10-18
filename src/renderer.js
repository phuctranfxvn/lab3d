// Thin client around the OpenSCAD worker. Preview renders are coalesced so
// only the most recent request runs when the user drags a slider quickly.

import { fontsForRender } from './fonts.js';
import { toScadLiteral } from './scad-parser.js';

const worker = new Worker(new URL('./openscad.worker.js', import.meta.url), { type: 'module' });
const pending = new Map();
let nextId = 1;

worker.onmessage = (e) => {
  const job = pending.get(e.data.id);
  if (!job) return;
  pending.delete(e.data.id);
  job.resolve(e.data);
};

function run(job) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, { resolve });
    worker.postMessage({ id, ...job });
  });
}

// Files kept next to the .scad files: meshes/images for import()/surface() and
// fonts a model ships with. The worker downloads them only when a render needs them.
const assetUrls = import.meta.glob(
  '/scads/**/*.{stl,STL,off,obj,3mf,amf,dxf,svg,png,dat,csv,json,ttf,otf,TTF,OTF}',
  { query: '?url', import: 'default', eager: true },
);

const dirOf = (path) => path.split('/').slice(0, -1).join('/');

// A file is mounted when the model's source names it; a font is mounted
// whenever it sits in the model's folder, since text() refers to it by family.
function assetsForRender(model) {
  const dir = dirOf('/scads/' + model.path);
  const assets = [];
  for (const [path, url] of Object.entries(assetUrls)) {
    const font = /\.(ttf|otf)$/i.test(path);
    const name = path.split('/').pop();
    if (font ? dirOf(path) === dir : model.source.includes(name)) assets.push({ path, url, font });
  }
  return assets;
}

// Every .scad in the library is mounted so include<>/use<> between them works.
export function buildJob(model, allModels, values, format) {
  const files = {};
  for (const m of allModels) files['/scads/' + m.path] = m.source;
  const defines = [];
  for (const p of model.params) {
    const v = values[p.name];
    if (v === undefined || JSON.stringify(v) === JSON.stringify(p.default)) continue;
    defines.push(`${p.name}=${toScadLiteral(v)}`);
  }
  const fonts = fontsForRender(Object.values(files).join('\n'), values);
  return { files, main: '/scads/' + model.path, defines, format, fonts, assets: assetsForRender(model) };
}

export function render(job) {
  return run(job);
}

let latest = null;
let running = false;

// Resolves with the result of this request, or `null` if a newer one replaced it.
export function renderLatest(job) {
  return new Promise((resolve) => {
    if (latest) latest.resolve(null);
    latest = { job, resolve };
    pump();
  });
}

async function pump() {
  if (running || !latest) return;
  running = true;
  const { job, resolve } = latest;
  latest = null;
  try {
    resolve(await run(job));
  } finally {
    running = false;
    pump();
  }
}

export function summarizeLog(log) {
  const warnings = log.filter((l) => /^(WARNING|DEPRECATED)/.test(l));
  const errors = log.filter((l) => /^(ERROR|EXPORT-ERROR)|Parser error|Execution aborted/i.test(l));
  return { warnings, errors };
}

// ---------- Background (%) objects ----------
// OpenSCAD drops `%` objects from every export, so the viewer would never see
// them. The model is exported as a CSG tree instead (every variable and
// transform already evaluated), pruned to just the `%` branches with their
// transforms, and that tree is rendered on its own. Rendering it apart from
// the model also means a broken mesh there can't break the model's booleans.

const stripCode = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*|"(?:\\.|[^"\\])*"/g, ' ');

// Cheap check so models without `%` skip the extra CSG pass. A modulo after
// `)` can give a false positive, which only costs that pass.
export function hasBackground(source) {
  return /(?:^|[;{})])\s*%/m.test(stripCode(source));
}

// CSG text -> [{ head, mod, children | null }]
function parseCsg(text) {
  let i = 0;
  const nodes = () => {
    const list = [];
    for (;;) {
      while (i < text.length && /\s/.test(text[i])) i++;
      if (i >= text.length || text[i] === '}') { i++; return list; }
      let mod = '';
      while ('%#!*'.includes(text[i])) mod += text[i++];
      const start = i;
      let depth = 0;
      for (; i < text.length; i++) {
        const c = text[i];
        if (c === '"') { for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++; }
        else if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        else if (!depth && (c === ';' || c === '{')) break;
      }
      const head = text.slice(start, i).trim();
      const open = text[i++] === '{';
      list.push({ head, mod, children: open ? nodes() : null });
    }
  };
  return nodes();
}

const csgText = (n) => n.head + (n.children ? ` {\n${n.children.map(csgText).join('\n')}\n}` : ';');
const KEEP_HEAD = /^(multmatrix|color)\s*\(/;

// Only the `%` branches survive; their ancestors keep transforms and colors,
// anything else (booleans, groups) becomes a plain group().
function pruneToBackground(n) {
  if (n.mod.includes('%')) return { ...n, mod: '' };
  if (!n.children) return null;
  const children = n.children.map(pruneToBackground).filter(Boolean);
  if (!children.length) return null;
  return { head: KEEP_HEAD.test(n.head) ? n.head : 'group()', mod: '', children };
}

let bgCache = { key: null, result: null };

// Resolves with { ok, data (binary STL), log } for the `%` objects of a job,
// or null when the model draws none.
export async function renderBackground(job) {
  const csg = await render({ ...job, format: 'csg' });
  if (!csg.ok) return null;
  const roots = parseCsg(new TextDecoder().decode(csg.data)).map(pruneToBackground).filter(Boolean);
  if (!roots.length) return null;
  // import() records the file's mtime, which changes on every render and
  // isn't a valid argument when the CSG is read back
  const source = roots.map(csgText).join('\n').replace(/,\s*timestamp = \d+/g, '');
  if (bgCache.key !== source) {
    bgCache = {
      key: source,
      result: render({ ...job, files: { ...job.files, '/lab3d_bg.csg': source }, main: '/lab3d_bg.csg', defines: [], format: 'stl' }),
    };
  }
  return bgCache.result;
}

// ---------- Multi-color export ----------
// OpenSCAD lets a file redefine the built-in color() module. A wrapper that
// includes the model does that to (1) list the colors actually used and
// (2) render each color on its own as a closed solid. Nested color() calls
// belong to the outermost one.

const COLOR_ECHO = 'ECHO: LAB3D_COLOR = ';

function wrapJob(base, wrapperBody, extraDefines = []) {
  const files = { ...base.files, '/lab3d_wrap.scad': `include <${base.main}>\n${wrapperBody}\n` };
  return { ...base, files, main: '/lab3d_wrap.scad', format: 'off', defines: [...base.defines, ...extraDefines] };
}

const decode = (buf) => new TextDecoder().decode(buf);

// Resolves to [{ color, data }] where `color` is the color() argument as
// OpenSCAD source (e.g. "white", "#8E0FA0", [1, 0, 0]) or null for geometry
// with no color(), and `data` is that part's OFF output.
export async function renderColorParts(model, allModels, values, onProgress = () => {}) {
  const base = buildJob(model, allModels, values, 'off');

  onProgress('Đang dò màu…');
  const probe = await render(wrapJob(base,
    'module color(c, alpha = 1) { if (is_undef($lab3d_in)) echo(LAB3D_COLOR = c); let ($lab3d_in = true) children(); }'));
  if (!probe.ok) throw Object.assign(new Error('probe failed'), { log: probe.log });
  const colors = [...new Set(probe.log.filter((l) => l.startsWith(COLOR_ECHO)).map((l) => l.slice(COLOR_ECHO.length).trim()))];
  if (!colors.length) return [{ color: null, data: probe.data }];

  // Geometry drawn outside color(); fails with "top level object is empty" if none
  const rest = await render(wrapJob(base, 'module color(c, alpha = 1) {}'));

  const parts = [];
  for (const [i, c] of colors.entries()) {
    onProgress(`Đang tách màu ${i + 1}/${colors.length}…`);
    let res = await render(wrapJob(base,
      'module color(c, alpha = 1) { if (!is_undef($lab3d_in)) children(); else if (c == LAB3D_TARGET) let ($lab3d_in = true) children(); }',
      [`LAB3D_TARGET=${c}`]));
    // Uncolored geometry is kept by the filter above, so subtract it again
    if (res.ok && rest.ok) {
      res = await render({
        files: { '/lab3d_part.off': decode(res.data), '/lab3d_rest.off': decode(rest.data),
          '/lab3d_diff.scad': 'difference() { import("/lab3d_part.off"); import("/lab3d_rest.off"); }' },
        main: '/lab3d_diff.scad', defines: [], format: 'off', fonts: [],
      });
    }
    if (res.ok) parts.push({ color: c, data: res.data });
  }
  if (rest.ok) parts.push({ color: null, data: rest.data });
  return parts;
}
