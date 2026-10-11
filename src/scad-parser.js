// Parse OpenSCAD Customizer-style parameters from a .scad source.
//
// Supported conventions (compatible with OpenSCAD's Customizer):
//   /* [Group name] */            -> starts a group ("Hidden" hides the params)
//   // Description               -> line above a param = its description
//   name = 10;   // [0:100]      -> slider range (also [min:step:max])
//   name = "a";  // [a, b, c]    -> dropdown (also [value:Label, ...])
//   name = 10;   // Some text    -> trailing plain text = description
// Parsing stops at the first module/function definition.

const ASSIGN_RE = /^\s*(\$?[A-Za-z_][\w]*)\s*=\s*(.+?)\s*;\s*(?:\/\/\s*(.*))?$/;
const GROUP_RE = /^\s*\/\*\s*\[([^\]]+)\]\s*\*\/\s*$/;
const STOP_RE = /^\s*(module|function)\s+\w+/;

export function parseScad(source, fileName) {
  const lines = source.split(/\r?\n/);
  const params = [];
  let group = 'Thông số';
  let pendingDesc = null;

  for (const line of lines) {
    if (STOP_RE.test(line)) break;

    const g = line.match(GROUP_RE);
    if (g) {
      group = g[1].trim();
      pendingDesc = null;
      continue;
    }

    const comment = line.match(/^\s*\/\/\s?(.*)$/);
    if (comment) {
      pendingDesc = comment[1].trim() || null;
      continue;
    }

    const a = line.match(ASSIGN_RE);
    if (!a) {
      if (line.trim() !== '') pendingDesc = null;
      continue;
    }

    const [, name, rawValue, trailing] = a;
    const value = parseLiteral(rawValue);
    if (value === undefined) { pendingDesc = null; continue; }

    let description = pendingDesc;
    let constraint = null;
    if (trailing) {
      const t = trailing.trim();
      if (t.startsWith('[')) {
        const end = t.indexOf(']');
        constraint = t.slice(1, end === -1 ? undefined : end);
        const rest = end === -1 ? '' : t.slice(end + 1).trim();
        if (rest) description = rest;
      } else if (/^-?\d+(\.\d+)?$/.test(t)) {
        constraint = t; // single number = max (customizer convention)
      } else {
        description = t;
      }
    }
    pendingDesc = null;

    const isSpecial = name.startsWith('$');
    const groupName = isSpecial ? 'Nâng cao' : group;
    if (/^hidden$/i.test(groupName)) continue;

    params.push(buildParam(name, value, description, constraint, groupName));
  }

  const meta = parseHeader(lines, fileName);
  const groups = [];
  for (const p of params) {
    let gEntry = groups.find((x) => x.name === p.group);
    if (!gEntry) groups.push((gEntry = { name: p.group, params: [] }));
    gEntry.params.push(p);
  }
  // Keep "Nâng cao" last
  groups.sort((x, y) => (x.name === 'Nâng cao') - (y.name === 'Nâng cao'));
  return { ...meta, params, groups };
}

// Header comment layout: title line, short description, then an empty
// comment line before any technical notes (which are not shown).
function parseHeader(lines, fileName) {
  const texts = [];
  for (const line of lines) {
    const c = line.match(/^\s*\/\/\s?(.*)$/);
    if (!c) {
      if (line.trim() === '') { if (texts.length) break; else continue; }
      break;
    }
    const raw = c[1].trim();
    const t = raw.replace(/^[=\-*#\s]+|[=\-*#\s]+$/g, '').trim();
    if (t) texts.push(t);
    else if (texts.length && !/^[=\-*#]{3,}$/.test(raw)) break; // blank comment ends the header
  }
  // A first line like "Foo.scad — converted from Foo.3mf" names the file, not the model
  if (texts.length > 1 && /\.scad\b/i.test(texts[0])) texts.shift();
  const fallback = fileName.replace(/\.scad$/i, '').replace(/[_-]+/g, ' ');
  const title = texts[0]?.replace(/^["“'](.*)["”']$/, '$1').replace(/\s*\(.*\)\s*$/, '').trim();
  return {
    title: title || capitalize(fallback),
    description: texts.slice(1).join(' '),
  };
}

function buildParam(name, value, description, constraint, group) {
  const p = { name, group, description, label: description || prettify(name), default: value };

  if (typeof value === 'boolean') p.type = 'bool';
  else if (typeof value === 'string') p.type = 'string';
  else if (Array.isArray(value)) p.type = value.every((v) => typeof v === 'number') ? 'vector' : 'unknown';
  else p.type = 'number';

  if (constraint != null) {
    const c = constraint.trim();
    const isRange = /^-?[\d.]+\s*:\s*-?[\d.]+(\s*:\s*-?[\d.]+)?$/.test(c);
    if (isRange && (p.type === 'number' || p.type === 'vector')) {
      const nums = c.split(':').map(Number);
      if (nums.length === 2) [p.min, p.max] = nums;
      else [p.min, p.step, p.max] = nums;
    } else if (/^-?[\d.]+$/.test(c) && p.type === 'number') {
      p.min = 0;
      p.max = Number(c);
    } else if (c.includes(',')) {
      p.options = splitTopLevel(c).map((opt) => {
        const [v, ...lab] = opt.split(':');
        const val = parseLiteral(v.trim()) ?? v.trim();
        const coerced = p.type === 'number' ? Number(val) : String(val);
        return { value: coerced, label: lab.length ? lab.join(':').trim() : String(coerced) };
      });
    }
  }

  if (p.type === 'number' && !p.options) {
    if (p.step == null) p.step = guessStep(value, p.min, p.max);
    if (p.min == null || p.max == null) {
      const span = Math.max(Math.abs(value) * 4, 10);
      p.min ??= value < 0 ? -niceCeil(span) : 0;
      p.max ??= niceCeil(span);
    }
  }
  if (p.type === 'vector') {
    const m = Math.max(...value.map(Math.abs), 5);
    p.step ??= value.some((v) => !Number.isInteger(v)) ? 0.1 : 1;
    p.min ??= -niceCeil(m * 4);
    p.max ??= niceCeil(m * 4);
  }
  if (name === '$fn' && p.type === 'number') {
    Object.assign(p, { label: 'Độ mịn bề mặt ($fn)', min: 8, max: 256, step: 1 });
  }
  return p;
}

// Parse a literal OpenSCAD value: number, string, bool, or (nested) vector.
// Returns undefined for expressions the customizer can't edit.
export function parseLiteral(raw) {
  const s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number(s);
  if (/^"(?:[^"\\]|\\.)*"$/.test(s)) {
    return s.slice(1, -1).replace(/\\(.)/g, (_, ch) => ({ n: '\n', t: '\t' }[ch] ?? ch));
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    const items = splitTopLevel(inner).map(parseLiteral);
    return items.some((x) => x === undefined) ? undefined : items;
  }
  return undefined;
}

function splitTopLevel(s) {
  const out = [];
  let depth = 0, inStr = false, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') cur += s[++i] ?? '';
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') depth--;
    else if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Convert a JS value back into OpenSCAD syntax for `-D name=value`.
export function toScadLiteral(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  if (Array.isArray(v)) return '[' + v.map(toScadLiteral).join(', ') + ']';
  return 'undef';
}

function guessStep(v, min, max) {
  if (min != null && max != null && max - min <= 2) return 0.01;
  const dec = (String(v).split('.')[1] || '').length;
  if (dec === 0) return Number.isInteger(v) && Math.abs(v) >= 1 ? 1 : 0.1;
  return dec === 1 ? 0.1 : 0.01;
}

function niceCeil(n) {
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

function prettify(name) {
  return capitalize(name.replace(/^\$/, '').replace(/_/g, ' '));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
