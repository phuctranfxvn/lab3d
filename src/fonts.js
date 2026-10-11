// Font catalogue from fonts/ (see scripts/fonts-plugin.js). Fonts are only
// downloaded when a preview needs them or OpenSCAD renders with them.

import catalogue, { categoryOrder } from 'virtual:fonts';

export const fonts = catalogue;

export const categories = [...new Set(fonts.map((f) => f.category))].sort((a, b) => {
  const ia = categoryOrder.indexOf(a), ib = categoryOrder.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'vi');
});

// Used when a model renders text without naming one of our fonts
const DEFAULT_FONT = fonts.find((f) => /^Be Vietnam Pro/.test(f.name)) ?? fonts[0];

export function findFont(name) {
  return fonts.find((f) => f.name === name) ?? fonts.find((f) => f.family.toLowerCase() === String(name).split(':')[0].trim().toLowerCase());
}

// Only mount the fonts a render can actually reference: those named in the
// source or in any current string value, plus a default fallback. A font file
// loaded with `use <Name.ttf>` is also placed next to the .scad files, which
// is where OpenSCAD looks for it.
export function fontsForRender(sourceText, values) {
  const haystack = (sourceText + '\n' + Object.values(values).filter((v) => typeof v === 'string').join('\n')).toLowerCase();
  const used = fonts.filter((f) => haystack.includes(f.family.toLowerCase()));
  if (DEFAULT_FONT && !used.includes(DEFAULT_FONT)) used.push(DEFAULT_FONT);

  // "Pacifico-Regular.ttf" -> "pacifico", to match a font stored under another file name
  const key = (s) => s.split('/').pop().replace(/\.(ttf|otf)$/i, '').replace(/[-_\[].*$/, '').replace(/\s+/g, '').toLowerCase();
  const useFiles = [...sourceText.matchAll(/\buse\s*<([^>]+\.(?:ttf|otf))>/gi)].map((m) => m[1].trim());
  for (const u of useFiles) {
    const f = fonts.find((x) => x.file.toLowerCase() === u.split('/').pop().toLowerCase()) ?? fonts.find((x) => key(x.family) === key(u));
    if (f && !used.includes(f)) used.push(f);
  }
  return used.map((f) => ({
    file: f.file,
    url: f.url,
    also: useFiles
      .filter((u) => u.split('/').pop().toLowerCase() === f.file.toLowerCase() || key(f.family) === key(u))
      .map((u) => '/scads/' + u),
  }));
}

const covers = (font, cp) => {
  const r = font.ranges;
  let lo = 0, hi = r.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < r[mid][0]) hi = mid - 1;
    else if (cp > r[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
};

// Characters of `text` the font can't draw. A precomposed letter counts as
// supported when its decomposed parts are (HarfBuzz composes them).
export function missingChars(font, text) {
  const missing = new Set();
  for (const ch of String(text)) {
    if (/\s/.test(ch)) continue;
    if (covers(font, ch.codePointAt(0))) continue;
    const parts = [...ch.normalize('NFD')];
    if (parts.length > 1 && parts.every((p) => covers(font, p.codePointAt(0)))) continue;
    missing.add(ch);
  }
  return [...missing];
}

const loaded = new Map();

// Register a font with the browser (once) so previews can use it
export function loadFontFace(font) {
  if (!loaded.has(font.name)) {
    const face = new FontFace(font.name, `url("${font.url}")`);
    loaded.set(font.name, face.load().then((f) => { document.fonts.add(f); return f; }).catch(() => null));
  }
  return loaded.get(font.name);
}
