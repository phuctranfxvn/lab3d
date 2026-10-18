// Builds a 3MF file (one object made of one part per color) entirely in the
// browser, since the OpenSCAD WebAssembly build can't export 3MF itself.

// OFF text -> indexed mesh { vertices: number[], triangles: number[] }
export function offToMesh(text) {
  const lines = text.split('\n');
  let i = 0;
  const next = () => {
    while (i < lines.length) {
      const l = lines[i++].replace(/#.*/, '').trim();
      if (l) return l;
    }
    return null;
  };
  let counts = next().replace(/^C?OFF/, '').trim() || next();
  const [nv, nf] = counts.split(/\s+/).map(Number);
  const vertices = [];
  for (let v = 0; v < nv; v++) {
    const p = next().split(/\s+/);
    vertices.push(+p[0], +p[1], +p[2]);
  }
  const triangles = [];
  for (let f = 0; f < nf; f++) {
    const p = next().split(/\s+/).map(Number);
    for (let t = 1; t < p[0] - 1; t++) triangles.push(p[1], p[1 + t], p[2 + t]);
  }
  return { vertices, triangles };
}

// Binary STL -> indexed mesh, merging repeated corners
export function stlToMesh(buffer) {
  const dv = new DataView(buffer);
  const count = dv.getUint32(80, true);
  const index = new Map();
  const vertices = [];
  const triangles = [];
  for (let f = 0; f < count; f++) {
    for (let k = 0; k < 3; k++) {
      const o = 84 + f * 50 + 12 + k * 12;
      const x = dv.getFloat32(o, true), y = dv.getFloat32(o + 4, true), z = dv.getFloat32(o + 8, true);
      const key = `${x},${y},${z}`;
      let id = index.get(key);
      if (id === undefined) {
        id = vertices.length / 3;
        index.set(key, id);
        vertices.push(x, y, z);
      }
      triangles.push(id);
    }
  }
  return { vertices, triangles };
}

// Binary STLs -> one binary STL holding every triangle (no boolean union)
export function joinStl(buffers) {
  const count = buffers.reduce((n, b) => n + new DataView(b).getUint32(80, true), 0);
  const out = new Uint8Array(84 + count * 50);
  new DataView(out.buffer).setUint32(80, count, true);
  let at = 84;
  for (const b of buffers) {
    const body = new Uint8Array(b, 84, new DataView(b).getUint32(80, true) * 50);
    out.set(body, at);
    at += body.length;
  }
  return out.buffer;
}

const colorCtx =typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;

// CSS/OpenSCAD color name, hex string or [r, g, b(, a)] in 0..1 -> "#RRGGBB"
export function toHexColor(c) {
  if (Array.isArray(c)) {
    return '#' + c.slice(0, 3).map((x) => Math.round(Math.min(1, Math.max(0, +x || 0)) * 255).toString(16).padStart(2, '0')).join('');
  }
  if (!colorCtx) return '#cccccc';
  colorCtx.fillStyle = '#000';
  colorCtx.fillStyle = String(c);
  const v = colorCtx.fillStyle;
  return v.startsWith('#') ? v : '#000000';
}

const esc = (s) => String(s).replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
const num = (n) => +n.toFixed(5);
const enc = new TextEncoder();

export const TARGETS = {
  creator5: { label: 'Orca-Flashforge · Creator 5', hint: 'Mở ra đúng máy, mỗi phần đã gán sẵn khay sợi đúng màu' },
  generic: { label: 'Slicer khác (3MF chuẩn)', hint: 'Bambu Studio, PrusaSlicer, Cura…: tự gán sợi cho từng phần' },
};

// parts: [{ name, color: "#RRGGBB", mesh: { vertices, triangles } }]
export async function build3mf(parts, { name = 'model', target = 'creator5' } = {}) {
  const files = target === 'creator5' ? await orcaProject(parts, name) : coreModel(parts, name);
  return zip(files.map(([path, text]) => ({ name: path, data: typeof text === 'string' ? enc.encode(text) : text })));
}

function meshXml(out, mesh, offset = [0, 0, 0]) {
  const { vertices: v, triangles: t } = mesh;
  out.push('<mesh><vertices>\n');
  for (let k = 0; k < v.length; k += 3) {
    out.push(`<vertex x="${num(v[k] - offset[0])}" y="${num(v[k + 1] - offset[1])}" z="${num(v[k + 2] - offset[2])}"/>\n`);
  }
  out.push('</vertices><triangles>\n');
  for (let k = 0; k < t.length; k += 3) out.push(`<triangle v1="${t[k]}" v2="${t[k + 1]}" v3="${t[k + 2]}"/>\n`);
  out.push('</triangles></mesh>');
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
  ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
  ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
  ' <Default Extension="png" ContentType="image/png"/>\n</Types>';
const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>';

// Plain 3MF core spec: one object made of colored components (basematerials)
function coreModel(parts, name) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n',
    `<metadata name="Title">${esc(name)}</metadata>\n<metadata name="Application">Lab3D</metadata>\n<resources>\n`,
    '<basematerials id="1">\n',
    ...parts.map((p) => `<base name="${esc(p.name)}" displaycolor="${p.color.toUpperCase()}FF"/>\n`),
    '</basematerials>\n',
  ];
  parts.forEach((p, idx) => {
    out.push(`<object id="${idx + 2}" type="model" name="${esc(p.name)}" pid="1" pindex="${idx}">`);
    meshXml(out, p.mesh);
    out.push('</object>\n');
  });
  const groupId = parts.length + 2;
  out.push(
    `<object id="${groupId}" type="model" name="${esc(name)}"><components>\n`,
    ...parts.map((_, idx) => `<component objectid="${idx + 2}"/>\n`),
    `</components></object>\n</resources>\n<build><item objectid="${groupId}"/></build>\n</model>\n`,
  );
  return [['[Content_Types].xml', CONTENT_TYPES], ['_rels/.rels', ROOT_RELS], ['3D/3dmodel.model', out.join('')]];
}

// ---------- Orca / Bambu project (what Orca-Flashforge needs to show colors) ----------
// Layout and quirks follow ~/Documents/3D printing/mkw-creator-converter:
// geometry in 3D/Objects/*.model referenced through the production extension,
// per-part filament slots in Metadata/model_settings.config, and the filament
// colors in Metadata/project_settings.config (the Creator 5 profile).

// Flash Studio distrusts projects claiming a newer version than its own
// (Bambu's 02.06.x always does), so stamp the Flashforge profile version.
const PROJECT_VERSION = '2.3.2';

const uuid = () => crypto.randomUUID();
const hex32 = () => crypto.randomUUID().replace(/-/g, '');

async function orcaProject(parts, name) {
  const profile = (await import('./profiles/creator5.json')).default;
  const config = JSON.parse(JSON.stringify(profile));
  const slots = (config.filament_type || ['PLA']).length || 1;

  // Center the model on the bed, resting on it
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const v = p.mesh.vertices;
    for (let k = 0; k < v.length; k += 3) {
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], v[k + a]); max[a] = Math.max(max[a], v[k + a]); }
    }
  }
  const origin = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  const bed = (config.printable_area || ['0x0', '256x256']).map((xy) => xy.split('x').map(Number));
  const bedX = Math.max(...bed.map((b) => b[0])) / 2, bedY = Math.max(...bed.map((b) => b[1])) / 2;

  // Parts are objects 1..n in the object file; the assembled object is n + 1
  const objId = parts.length + 1;
  const objPath = '/3D/Objects/object_1.model';
  const NS = 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"';

  const objOut = ['<?xml version="1.0" encoding="UTF-8"?>\n', `<model unit="millimeter" xml:lang="en-US" ${NS}>\n`,
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>\n <resources>\n'];
  parts.forEach((p, i) => {
    objOut.push(`  <object id="${i + 1}" p:UUID="${uuid()}" type="model">`);
    meshXml(objOut, p.mesh, origin);
    objOut.push('</object>\n');
  });
  objOut.push(' </resources>\n <build/>\n</model>\n');

  const mainModel = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="en-US" ${NS}>`,
    ` <metadata name="Application">BambuStudio-${PROJECT_VERSION}</metadata>`,
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
    ` <metadata name="Title">${esc(name)}</metadata>`,
    ' <resources>',
    `  <object id="${objId}" p:UUID="${uuid()}" type="model">`,
    '   <components>',
    ...parts.map((_, i) => `    <component p:path="${objPath}" objectid="${i + 1}" p:UUID="${uuid()}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>`),
    '   </components>',
    '  </object>',
    ' </resources>',
    ` <build p:UUID="${uuid()}">`,
    `  <item objectid="${objId}" p:UUID="${uuid()}" transform="1 0 0 0 1 0 0 0 1 ${num(bedX)} ${num(bedY)} 0" printable="1"/>`,
    ' </build>',
    '</model>',
  ].join('\n');

  // One filament slot per color (wrapping if there are more colors than slots)
  const colors = parts.slice(0, slots).map((p) => p.color.toUpperCase() + 'FF');
  config.filament_colour = colors;
  config.filament_multi_colour = colors.slice();
  config.version = PROJECT_VERSION;
  config.from = 'project';
  config.name = 'project_settings';

  const modelSettings = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<config>',
    `  <object id="${objId}">`,
    `    <metadata key="name" value="${esc(name)}"/>`,
    '    <metadata key="extruder" value="1"/>',
    ...parts.flatMap((p, i) => [
      `    <part id="${i + 1}" subtype="normal_part">`,
      `      <metadata key="name" value="${esc(p.name)}"/>`,
      '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>',
      `      <metadata key="extruder" value="${(i % slots) + 1}"/>`,
      '    </part>',
    ]),
    '  </object>',
    '  <plate>',
    '    <metadata key="plater_id" value="1"/>',
    '    <metadata key="plater_name" value=""/>',
    '    <metadata key="locked" value="false"/>',
    '    <model_instance>',
    `      <metadata key="object_id" value="${objId}"/>`,
    '      <metadata key="instance_id" value="0"/>',
    '      <metadata key="identify_id" value="1"/>',
    '    </model_instance>',
    '  </plate>',
    '  <assemble>',
    `   <assemble_item object_id="${objId}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 ${num(bedX)} ${num(bedY)} 0" offset="0 0 0" />`,
    '  </assemble>',
    '</config>',
  ].join('\n');

  const sliceInfo = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n' +
    '    <header_item key="X-BBL-Client-Type" value="slicer"/>\n' +
    `    <header_item key="X-BBL-Client-Version" value="${PROJECT_VERSION}"/>\n` +
    `    <header_item key="OrcaSlicer-Version" value="${PROJECT_VERSION}"/>\n` +
    `    <uuid value="${hex32()}"/>\n  </header>\n</config>\n`;

  return [
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['3D/3dmodel.model', mainModel],
    ['3D/_rels/3dmodel.model.rels',
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
      ` <Relationship Target="${objPath}" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>`],
    [objPath.slice(1), objOut.join('')],
    ['Metadata/model_settings.config', modelSettings],
    ['Metadata/project_settings.config', JSON.stringify(config, null, 4) + '\n'],
    ['Metadata/slice_info.config', sliceInfo],
    ['Metadata/filament_sequence.json', '{"plate_1":{"nozzle_sequence":[],"optimal_assignment":[],"sequence":[]}}'],
  ];
}

// ---------- Minimal ZIP writer (deflate when the browser supports it) ----------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

async function zip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const deflated = await deflateRaw(f.data);
    const method = deflated && deflated.length < f.data.length ? 8 : 0;
    const body = method === 8 ? deflated : f.data;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);

    offset += 30 + name.length + body.length;
  }

  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'model/3mf' });
}
