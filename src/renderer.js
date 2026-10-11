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
  return { files, main: '/scads/' + model.path, defines, format, fonts };
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
