// Parse OpenSCAD's OFF export (which keeps per-face colors from color())
// into a non-indexed BufferGeometry with vertex colors.

import * as THREE from 'three';

export function parseOff(text, defaultColor = '#f59e0b') {
  const lines = text.split('\n');
  let i = 0;
  const next = () => {
    while (i < lines.length) {
      const l = lines[i++].replace(/#.*/, '').trim();
      if (l) return l;
    }
    return null;
  };

  let header = next();
  if (!/^C?OFF/.test(header)) throw new Error('Không phải file OFF');
  let counts = header.replace(/^C?OFF/, '').trim();
  if (!counts) counts = next();
  const [nv, nf] = counts.split(/\s+/).map(Number);

  const verts = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const p = next().split(/\s+/);
    verts[v * 3] = +p[0];
    verts[v * 3 + 1] = +p[1];
    verts[v * 3 + 2] = +p[2];
  }

  const def = new THREE.Color(defaultColor);
  const pos = [];
  const col = [];
  let hasColor = false;
  for (let f = 0; f < nf; f++) {
    const p = next().split(/\s+/).map(Number);
    const n = p[0];
    const idx = p.slice(1, 1 + n);
    const c = p.slice(1 + n);
    let r = def.r, g = def.g, b = def.b;
    if (c.length >= 3) {
      hasColor = true;
      const scale = c.some((x) => x > 1) ? 255 : 1;
      const tmp = new THREE.Color().setRGB(c[0] / scale, c[1] / scale, c[2] / scale, THREE.SRGBColorSpace);
      ({ r, g, b } = tmp);
    }
    for (let t = 1; t < n - 1; t++) {
      for (const k of [idx[0], idx[t], idx[t + 1]]) {
        pos.push(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2]);
        col.push(r, g, b);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  return { geometry: geom, hasColor, triangles: pos.length / 9 };
}
