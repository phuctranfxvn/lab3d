// Vite plugin exposing `virtual:fonts`: every .ttf/.otf under fonts/ with the
// family name OpenSCAD expects, its category (sub-folder name) and its
// character coverage, so the browser never has to download a font just to
// list it.

import fs from 'node:fs';
import path from 'node:path';

const VIRTUAL_ID = 'virtual:fonts';
const RESOLVED_ID = '\0' + VIRTUAL_ID;
const CATEGORY_ORDER = ['Viết tay', 'Vui nhộn', 'Không chân', 'Có chân', 'Đơn cách'];

export default function fontsPlugin({ dir = 'fonts' } = {}) {
  let root;
  let fontsDir;

  return {
    name: 'lab3d-fonts',
    configResolved(config) {
      root = config.root;
      fontsDir = path.resolve(root, dir);
    },
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      const files = listFonts(fontsDir);
      const imports = [];
      const entries = [];
      files.forEach((rel, i) => {
        const abs = path.join(fontsDir, rel);
        this.addWatchFile(abs);
        const info = readFontInfo(fs.readFileSync(abs));
        const parts = rel.split(path.sep);
        imports.push(`import u${i} from ${JSON.stringify('/' + path.posix.join(dir, ...parts) + '?url')};`);
        entries.push(
          `{ file: ${JSON.stringify(parts.at(-1))}, url: u${i}, name: ${JSON.stringify(info.name)}, ` +
            `family: ${JSON.stringify(info.family)}, category: ${JSON.stringify(parts.length > 1 ? parts[0] : 'Khác')}, ` +
            `ranges: ${JSON.stringify(info.ranges)} }`,
        );
      });
      return `${imports.join('\n')}\nexport default [\n${entries.join(',\n')}\n];\nexport const categoryOrder = ${JSON.stringify(CATEGORY_ORDER)};\n`;
    },
    configureServer(server) {
      // Adding/removing a font file should refresh the list without a restart
      server.watcher.add(fontsDir);
      const refresh = (file) => {
        if (!file.startsWith(fontsDir) || !/\.(ttf|otf)$/i.test(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    },
  };
}

function listFonts(base) {
  if (!fs.existsSync(base)) return [];
  return fs
    .readdirSync(base, { recursive: true })
    .filter((f) => /\.(ttf|otf)$/i.test(f))
    .sort((a, b) => a.localeCompare(b));
}

export function readFontInfo(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables = {};
  const numTables = dv.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16;
    tables[String.fromCharCode(...buf.subarray(r, r + 4))] = dv.getUint32(r + 8);
  }
  const names = readNames(dv, tables.name);
  const family = names[16] || names[1] || 'Unknown';
  const style = names[17] || names[2];
  return {
    family,
    // The string OpenSCAD's text(font=...) matches via fontconfig
    name: style && !/^regular$/i.test(style) ? `${family}:style=${style}` : family,
    ranges: tables.cmap != null ? readCmapRanges(dv, tables.cmap) : [],
  };
}

function readNames(dv, offset) {
  const names = {};
  if (offset == null) return names;
  const count = dv.getUint16(offset + 2);
  const strings = offset + dv.getUint16(offset + 4);
  for (let i = 0; i < count; i++) {
    const r = offset + 6 + i * 12;
    const platform = dv.getUint16(r);
    const id = dv.getUint16(r + 6);
    const len = dv.getUint16(r + 8);
    const off = strings + dv.getUint16(r + 10);
    if (![1, 2, 16, 17].includes(id) || names[id]) continue;
    let s = '';
    if (platform === 3 || platform === 0) for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(off + j));
    else if (platform === 1) for (let j = 0; j < len; j++) s += String.fromCharCode(dv.getUint8(off + j));
    else continue;
    names[id] = s;
  }
  return names;
}

// Covered code points as merged [start, end] ranges (cmap format 4 or 12)
function readCmapRanges(dv, cmap) {
  const n = dv.getUint16(cmap + 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const r = cmap + 4 + i * 8;
    const platform = dv.getUint16(r);
    const encoding = dv.getUint16(r + 2);
    const sub = cmap + dv.getUint32(r + 4);
    const format = dv.getUint16(sub);
    const score = format === 12 ? 3 : format === 4 && (platform === 3 || platform === 0) ? 2 : 0;
    if (score && (!best || score > best.score)) best = { sub, format, score, platform, encoding };
  }
  if (!best) return [];

  const ranges = [];
  if (best.format === 12) {
    const groups = dv.getUint32(best.sub + 12);
    for (let i = 0; i < groups; i++) {
      const g = best.sub + 16 + i * 12;
      ranges.push([dv.getUint32(g), dv.getUint32(g + 4)]);
    }
  } else {
    const segX2 = dv.getUint16(best.sub + 6);
    const ends = best.sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + s * 2);
      const start = dv.getUint16(starts + s * 2);
      const delta = dv.getUint16(deltas + s * 2);
      const ro = dv.getUint16(rangeOffsets + s * 2);
      if (start === 0xffff) continue;
      for (let c = start; c <= end; c++) {
        let glyph;
        if (ro === 0) glyph = (c + delta) & 0xffff;
        else {
          const addr = rangeOffsets + s * 2 + ro + (c - start) * 2;
          glyph = dv.getUint16(addr);
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (!glyph) continue;
        const last = ranges.at(-1);
        if (last && last[1] === c - 1) last[1] = c;
        else ranges.push([c, c]);
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged.at(-1);
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
