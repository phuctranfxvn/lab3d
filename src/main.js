import './style.css';
import { fonts, categories, findFont, missingChars, loadFontFace } from './fonts.js';
import { buildJob, render, renderLatest, renderColorParts, renderBackground, hasBackground, summarizeLog } from './renderer.js';
import { build3mf, offToMesh, stlToMesh, joinStl, toHexColor, TARGETS } from './three-mf.js';
import { parseScad, parseLiteral } from './scad-parser.js';
import { parseOff } from './off.js';
import { Viewer } from './viewer.js';
import { icons } from './icons.js';
import { createSky } from './sky.js';

// ---------- Model library (every .scad under /scads, picked up by Vite) ----------

const OTHER_CATEGORY = 'Khác';

const sources = import.meta.glob('/scads/**/*.scad', { query: '?raw', import: 'default', eager: true });

const models = Object.entries(sources)
  .map(([fullPath, source]) => {
    const path = fullPath.replace(/^\/scads\//, '');
    const id = path.replace(/\.scad$/i, '');
    // The sub-folder a file sits in is its category
    const category = path.includes('/') ? path.split('/')[0] : OTHER_CATEGORY;
    return { id, path, source, category, ...parseScad(source, path.split('/').pop()) };
  })
  .sort((a, b) => a.title.localeCompare(b.title, 'vi'));

const modelCategories = [...new Set(models.map((m) => m.category))]
  .sort((a, b) => (a === OTHER_CATEGORY) - (b === OTHER_CATEGORY) || a.localeCompare(b, 'vi'))
  .map((name) => ({ name, models: models.filter((m) => m.category === name) }));

const categoryHref = (name) => `#/c/${encodeURIComponent(name)}`;

const FILAMENTS = [
  { name: 'Xanh Doraemon', hex: '#1ea0e6' },
  { name: 'Đỏ vòng cổ', hex: '#e8312f' },
  { name: 'Vàng chuông', hex: '#ffc928' },
  { name: 'Trắng', hex: '#f7f7f2' },
  { name: 'Hồng cánh cửa', hex: '#f490b4' },
  { name: 'Xanh lá', hex: '#3fb27f' },
  { name: 'Tím', hex: '#8e6cf0' },
  { name: 'Đen', hex: '#2b2d33' },
];

const app = document.getElementById('app');
let cleanup = () => {};

// ---------- Helpers ----------

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), sv);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};
const icon = (name) => h('span', { class: 'icon', html: icons[name] });

const fmt = (n, d = 1) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const slug = (s) =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// A string param is a color if it's named like one or holds a CSS color
const isColorParam = (p) =>
  p.type === 'string' && !p.options && (/colou?r|mau/i.test(p.name) || /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(p.default));
// The free-text param (e.g. the name on a keychain), if the model has one
const isTextParam = (p) => p.type === 'string' && !p.options && !/font/i.test(p.name) && !isColorParam(p);

function hash(str) {
  let x = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 0x01000193);
  return (x >>> 0).toString(36);
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* quota / private mode */ } },
};

function toast(msg, kind = 'ok') {
  const el = h('div', { class: `toast ${kind}` }, icon(kind === 'ok' ? 'check' : 'alert'), msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2600);
}

// ---------- Routing ----------

function route() {
  cleanup();
  cleanup = () => {};
  const hashStr = location.hash.slice(1);
  const [path, query = ''] = hashStr.split('?');
  const m = path.match(/^\/m\/(.+)$/);
  const c = path.match(/^\/c\/(.+)$/);
  const model = m && models.find((x) => x.id === decodeURIComponent(m[1]));
  const category = c && modelCategories.find((x) => x.name === decodeURIComponent(c[1]));
  if (model) renderEditor(model, new URLSearchParams(query));
  else if (category) renderCategory(category);
  else renderHome(new URLSearchParams(query).get('q') || '');
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function header(extra) {
  return h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' },
      h('span', { class: 'brand-mark', html: icons.logo }),
      h('span', { class: 'brand-text' }, h('b', {}, 'Lab3D'), h('small', {}, 'Túi thần kỳ mô hình 3D')),
    ),
    extra,
  );
}

// ---------- Home / gallery ----------

function modelCard(m, { showCategory = false } = {}) {
  const thumb = h('div', { class: 'card-thumb loading' }, h('div', { class: 'shimmer' }));
  const card = h('a', { class: 'card', href: `#/m/${encodeURIComponent(m.id)}` },
    thumb,
    h('div', { class: 'card-body' },
      showCategory && h('span', { class: 'card-category' }, icon('folder'), m.category),
      h('h3', {}, m.title),
      m.description && h('p', {}, m.description),
      h('div', { class: 'chips' },
        h('span', { class: 'chip' }, icon('sliders'), `${m.params.length} thông số`),
        ...m.groups.slice(0, 3).map((g) => h('span', { class: 'chip ghost' }, g.name)),
      ),
    ),
    h('span', { class: 'card-cta' }, 'Lấy bảo bối', icon('arrow')),
  );
  return { card, slots: [{ el: thumb, model: m }] };
}

function categoryCard(cat) {
  // Collage of the first few designs in the category
  const shown = cat.models.slice(0, 4);
  const slots = shown.map((m) => ({ el: h('div', { class: 'collage-cell loading' }, h('div', { class: 'shimmer' })), model: m }));
  const card = h('a', { class: 'card category-card', href: categoryHref(cat.name) },
    h('div', { class: `card-thumb collage n${shown.length}` }, slots.map((s) => s.el)),
    h('div', { class: 'card-body' },
      h('h3', {}, icon('folder'), cat.name),
      h('p', {}, cat.models.map((m) => m.title).join(' · ')),
    ),
    h('span', { class: 'card-cta' }, `${cat.models.length} mẫu`, icon('arrow')),
  );
  return { card, slots };
}

// Fill thumbnail slots one at a time (each needs an OpenSCAD render)
function fillThumbnails(slots, isCancelled) {
  (async () => {
    for (const slot of slots) {
      if (isCancelled()) return;
      const url = await getThumbnail(slot.model).catch(() => null);
      slot.el.classList.remove('loading');
      slot.el.replaceChildren(url ? h('img', { src: url, alt: slot.model.title }) : h('div', { class: 'thumb-fallback' }, icon('cube')));
    }
  })();
}

const pocketCount = () => h('div', { class: 'topbar-right' }, h('span', { class: 'pill' }, icon('bell'), `${models.length} bảo bối`));

function renderHome(initialQuery = '') {
  document.title = 'Lab3D · Túi thần kỳ';
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Tìm bảo bối trong mọi danh mục…', 'aria-label': 'Tìm bảo bối' });
  search.value = initialQuery;
  const section = h('section', { class: 'library' });

  let cancelled = false;
  let generation = 0;
  cleanup = () => { cancelled = true; };

  function show() {
    const raw = search.value.trim();
    const q = slug(raw);
    const gen = ++generation;
    const isCancelled = () => cancelled || gen !== generation;
    // Keep the query in the URL so "back" from a design returns to the results
    history.replaceState(null, '', raw ? `#/?q=${encodeURIComponent(raw)}` : '#/');

    if (!models.length) {
      section.replaceChildren(h('div', { class: 'empty big' },
        icon('folder'),
        h('h3', {}, 'Túi thần kỳ đang trống'),
        h('p', {}, 'Tạo thư mục danh mục trong ', h('code', {}, 'scads/'), ', đặt file .scad vào rồi tải lại trang.')));
      return;
    }

    if (!q) {
      const items = modelCategories.map(categoryCard);
      section.replaceChildren(
        h('div', { class: 'section-head' },
          h('h2', {}, 'Danh mục'),
          h('span', { class: 'section-count' }, `${modelCategories.length} danh mục · ${models.length} mẫu`)),
        h('div', { class: 'gallery' }, items.map((i) => i.card)),
      );
      fillThumbnails(items.flatMap((i) => i.slots), isCancelled);
      return;
    }

    const found = models.filter((m) => slug(`${m.title} ${m.description} ${m.category} ${m.path}`).includes(q));
    const items = found.map((m) => modelCard(m, { showCategory: true }));
    section.replaceChildren(
      h('div', { class: 'section-head' },
        h('h2', {}, 'Kết quả cho “', raw, '”'),
        h('span', { class: 'section-count' }, `${found.length} mẫu`),
        h('button', { class: 'btn ghost-link', onclick: () => { search.value = ''; show(); search.focus(); } }, icon('close'), 'Xoá tìm kiếm')),
      found.length
        ? h('div', { class: 'gallery' }, items.map((i) => i.card))
        : h('div', { class: 'empty' }, 'Túi thần kỳ không có bảo bối nào như vậy.'),
    );
    fillThumbnails(items.flatMap((i) => i.slots), isCancelled);
  }

  search.addEventListener('input', show);

  app.replaceChildren(
    header(pocketCount()),
    createSky(),
    h('main', { class: 'home' },
      h('section', { class: 'hero' },
        h('div', { class: 'hero-art', html: icons.pocket }),
        h('div', { class: 'hero-text' },
          h('h1', {}, 'Chọn bảo bối, chỉnh theo ý, ', h('span', { class: 'grad' }, 'in ra ngay!')),
          h('p', { class: 'lead' }, 'Mô hình 3D dựng lại tức thì ngay trong trình duyệt, tải STL hoặc 3MF về máy in.'),
        ),
        search,
      ),
      section,
    ),
  );
  show();
  if (initialQuery) search.focus();
}

function renderCategory(cat) {
  document.title = `${cat.name} · Lab3D`;
  const items = cat.models.map((m) => modelCard(m));
  app.replaceChildren(
    header(pocketCount()),
    h('main', { class: 'home' },
      h('section', { class: 'category-head' },
        h('a', { class: 'back', href: '#/' }, icon('back'), 'Túi thần kỳ'),
        h('h1', {}, cat.name),
        h('p', { class: 'muted' }, `${cat.models.length} mẫu thiết kế`),
      ),
      h('div', { class: 'gallery' }, items.map((i) => i.card)),
    ),
  );
  let cancelled = false;
  cleanup = () => { cancelled = true; };
  fillThumbnails(items.flatMap((i) => i.slots), () => cancelled);
}

async function getThumbnail(model) {
  const key = 'thumb:v2:' + hash(model.source + models.map((m) => m.source).join(''));
  const cached = store.get(key);
  if (cached) return cached;

  const values = Object.fromEntries(model.params.map((p) => [p.name, p.default]));
  const res = await render(buildJob(model, models, values, 'off'));
  if (!res.ok) return null;
  const { geometry } = parseOff(new TextDecoder().decode(res.data), FILAMENTS[0].hex);

  const box = h('div', { style: { position: 'fixed', left: '-10000px', width: '480px', height: '360px' } });
  document.body.append(box);
  const v = new Viewer(box, { interactive: false });
  v.setGeometry(geometry, { fit: true });
  const url = v.snapshot(480, 360);
  v.dispose();
  box.remove();
  store.set(key, url);
  return url;
}

// ---------- Editor ----------

function readValues(model, query) {
  const values = {};
  for (const p of model.params) {
    values[p.name] = p.default;
    if (!query.has(p.name)) continue;
    const raw = query.get(p.name);
    try {
      if (p.type === 'number') { const n = Number(raw); if (Number.isFinite(n)) values[p.name] = n; }
      else if (p.type === 'bool') values[p.name] = raw === 'true';
      else if (p.type === 'vector') { const v = JSON.parse(raw); if (Array.isArray(v) && v.length === p.default.length) values[p.name] = v.map(Number); }
      else values[p.name] = raw;
    } catch { /* ignore malformed */ }
  }
  return values;
}

function queryFor(model, values) {
  const q = new URLSearchParams();
  for (const p of model.params) {
    const v = values[p.name];
    if (same(v, p.default)) continue;
    q.set(p.name, Array.isArray(v) ? JSON.stringify(v) : String(v));
  }
  const s = q.toString();
  return `#/m/${encodeURIComponent(model.id)}${s ? '?' + s : ''}`;
}

function renderEditor(model, query) {
  document.title = `${model.title} · Lab3D`;
  const values = readValues(model, query);
  const controls = new Map(); // param name -> { set(v), row }

  // --- viewer column ---
  const stage = h('div', { class: 'stage' });
  const status = h('div', { class: 'status' });
  const dims = h('div', { class: 'dims' });
  const overlay = h('div', { class: 'overlay', hidden: true });
  const logPanel = h('div', { class: 'log', hidden: true });
  const logBtn = h('button', { class: 'tool warn', hidden: true, onclick: () => (logPanel.hidden = !logPanel.hidden) });

  let viewer;
  let currentColor = null;
  let hasFileColors = false;
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Màu xem trước' });

  function buildSwatches() {
    const items = [];
    if (hasFileColors) items.push({ name: 'Màu theo file', hex: null });
    items.push(...FILAMENTS);
    swatches.replaceChildren(...items.map((f) =>
      h('button', {
        class: `swatch ${f.hex === currentColor ? 'active' : ''} ${f.hex ? '' : 'auto'}`,
        style: f.hex ? { '--c': f.hex } : null,
        title: f.name,
        'aria-label': f.name,
        onclick: () => { currentColor = f.hex; viewer.setColor(f.hex); buildSwatches(); },
      }),
    ));
  }

  const toolbar = h('div', { class: 'toolbar' },
    ...[['iso', 'Góc nghiêng', 'cube'], ['top', 'Nhìn từ trên', 'top'], ['front', 'Nhìn chính diện', 'front']].map(([v, t, ic]) =>
      h('button', { class: 'tool', title: t, 'aria-label': t, onclick: () => viewer.view(v) }, icon(ic))),
    h('button', { class: 'tool', title: 'Vừa khung', 'aria-label': 'Vừa khung', onclick: () => viewer.fit() }, icon('fit')),
    h('span', { class: 'sep' }),
    h('button', {
      class: 'tool', title: 'Hiện cạnh', 'aria-label': 'Hiện cạnh', 'aria-pressed': 'false',
      onclick: (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); viewer.setEdges(on); },
    }, icon('edges')),
    logBtn,
  );

  const downloadBtn = h('button', { class: 'btn primary big', onclick: download }, icon('download'), h('span', {}, 'Tải STL'));
  const label3mf = h('span', {}, '3MF màu');
  let target3mf = TARGETS[store.get('lab3d:3mf-target')] ? store.get('lab3d:3mf-target') : 'creator5';
  const download3mfBtn = h('button', { class: 'btn big secondary', onclick: download3mf }, icon('layers'), label3mf);
  const targetMenu = h('div', { class: 'target-menu', role: 'menu', hidden: true });
  const targetBtn = h('button', {
    class: 'btn big secondary target-toggle', 'aria-label': 'Chọn slicer cho file 3MF', 'aria-haspopup': 'menu',
    onclick: (e) => { e.stopPropagation(); targetMenu.hidden = !targetMenu.hidden; },
  }, icon('chevron'));
  function drawTargets() {
    download3mfBtn.title = `Xuất 3MF cho: ${TARGETS[target3mf].label}`;
    targetMenu.replaceChildren(
      h('div', { class: 'target-menu-title' }, 'Xuất file 3MF cho'),
      ...Object.entries(TARGETS).map(([key, t]) => h('button', {
        class: `target-item ${key === target3mf ? 'active' : ''}`, role: 'menuitemradio', 'aria-checked': String(key === target3mf),
        onclick: () => { target3mf = key; store.set('lab3d:3mf-target', key); drawTargets(); targetMenu.hidden = true; },
      }, h('b', {}, t.label), h('small', {}, t.hint))),
    );
  }
  drawTargets();
  const closeMenu = (e) => { if (!targetMenu.contains(e.target)) targetMenu.hidden = true; };
  document.addEventListener('click', closeMenu);

  const viewerCol = h('section', { class: 'viewer-col' },
    stage, toolbar, status, overlay, logPanel,
    h('div', { class: 'stage-bottom' }, h('div', { class: 'stage-meta' }, dims, swatches), h('div', { class: 'download-group' }, h('div', { class: 'split' }, download3mfBtn, targetBtn, targetMenu), downloadBtn)),
  );

  // --- params column ---
  const resetAllBtn = h('button', { class: 'btn ghost', onclick: resetAll }, icon('reset'), 'Mặc định');
  const shareBtn = h('button', { class: 'btn ghost', onclick: share }, icon('link'), 'Chia sẻ');
  const generateBtn = h('button', { class: 'btn primary generate', title: 'Dựng mô hình (Ctrl/⌘ + Enter)', onclick: () => generate() }, icon('bolt'), h('span', {}, 'Generate'));

  const panel = h('aside', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('a', { class: 'back', href: categoryHref(model.category) }, icon('back'), model.category),
      h('h1', {}, model.title),
      model.description && h('p', { class: 'muted' }, model.description),
      h('code', { class: 'file' }, 'scads/' + model.path),
    ),
    h('div', { class: 'groups' }, model.groups.map((g, i) => buildGroup(g, i))),
    h('div', { class: 'panel-foot' }, generateBtn, resetAllBtn, shareBtn),
  );

  app.replaceChildren(
    header(h('div', { class: 'topbar-right' }, h('span', { class: 'pill' }, icon('bolt'), 'Dựng bằng OpenSCAD'))),
    h('main', { class: 'editor' }, panel, viewerCol),
  );

  viewer = new Viewer(stage);
  buildSwatches();

  // --- param groups & controls ---

  function buildGroup(group, index) {
    const collapsed = store.get(`collapse:${model.id}:${group.name}`) === '1';
    const body = h('div', { class: 'group-body' }, group.params.map(buildControl));
    const sec = h('section', { class: `group ${collapsed ? 'collapsed' : ''}` },
      h('button', {
        class: 'group-head', 'aria-expanded': String(!collapsed),
        onclick: (e) => {
          const c = sec.classList.toggle('collapsed');
          e.currentTarget.setAttribute('aria-expanded', String(!c));
          store.set(`collapse:${model.id}:${group.name}`, c ? '1' : '0');
        },
      },
        h('span', { class: 'group-index' }, String(index + 1).padStart(2, '0')),
        h('span', { class: 'group-name' }, group.name),
        h('span', { class: 'group-count' }, group.params.length),
        icon('chevron'),
      ),
      body,
    );
    return sec;
  }

  function buildControl(p) {
    const resetBtn = h('button', { class: 'mini-reset', title: 'Về mặc định', 'aria-label': 'Về mặc định', onclick: () => setValue(p, p.default) }, icon('reset'));
    const label = h('div', { class: 'param-label' },
      h('label', { for: `p-${p.name}` }, p.label),
      h('code', { class: 'var' }, p.name),
      resetBtn,
    );
    const row = h('div', { class: 'param', 'data-type': p.type }, label);
    let set;

    if (p.options) {
      if (p.options.length <= 4) {
        const seg = h('div', { class: 'segmented', role: 'radiogroup' });
        const btns = p.options.map((o) => h('button', { onclick: () => setValue(p, o.value) }, o.label));
        seg.append(...btns);
        row.append(seg);
        set = (v) => btns.forEach((b, i) => b.classList.toggle('active', same(p.options[i].value, v)));
      } else {
        const sel = h('select', { id: `p-${p.name}`, onchange: () => setValue(p, p.options[sel.selectedIndex].value) },
          p.options.map((o) => h('option', {}, o.label)));
        row.append(h('div', { class: 'select-wrap' }, sel, icon('chevron')));
        set = (v) => { sel.selectedIndex = Math.max(0, p.options.findIndex((o) => same(o.value, v))); };
      }
    } else if (p.type === 'number') {
      const range = h('input', { type: 'range', min: p.min, max: p.max, step: p.step, 'aria-label': p.label });
      const num = h('input', { id: `p-${p.name}`, type: 'number', step: 'any', class: 'num' });
      range.addEventListener('input', () => setValue(p, Number(range.value)));
      num.addEventListener('change', () => { if (num.value !== '' && Number.isFinite(+num.value)) setValue(p, Number(num.value)); else set(values[p.name]); });
      label.insertBefore(num, resetBtn);
      row.append(h('div', { class: 'range-wrap' }, range,
        h('div', { class: 'range-scale' }, h('span', {}, fmt(p.min, 3)), h('span', {}, fmt(p.max, 3)))));
      set = (v) => {
        if (v > Number(range.max)) range.max = v;
        if (v < Number(range.min)) range.min = v;
        range.value = v;
        const pct = ((v - range.min) / (range.max - range.min)) * 100;
        range.style.setProperty('--pct', `${pct}%`);
        if (document.activeElement !== num) num.value = +v.toFixed(4);
      };
    } else if (p.type === 'bool') {
      const sw = h('input', { id: `p-${p.name}`, type: 'checkbox', class: 'switch', onchange: () => setValue(p, sw.checked) });
      label.insertBefore(sw, resetBtn);
      set = (v) => { sw.checked = v; };
    } else if (p.type === 'vector') {
      const axes = p.default.length <= 3 ? ['X', 'Y', 'Z'] : p.default.map((_, i) => `#${i + 1}`);
      const inputs = p.default.map((_, i) => {
        const inp = h('input', { type: 'number', step: p.step, 'aria-label': `${p.label} ${axes[i]}` });
        inp.addEventListener('input', () => {
          if (inp.value === '' || !Number.isFinite(+inp.value)) return;
          const next = [...values[p.name]];
          next[i] = Number(inp.value);
          setValue(p, next);
        });
        return inp;
      });
      row.append(h('div', { class: 'vector' }, inputs.map((inp, i) => h('label', { class: 'axis' }, h('span', {}, axes[i]), inp))));
      set = (v) => inputs.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = v[i]; });
    } else if (p.type === 'string' && /font/i.test(p.name)) {
      const picker = buildFontPicker(p);
      row.append(picker.el);
      set = picker.update;
      row.refreshSample = picker.refreshSample;
    } else if (isColorParam(p)) {
      const picker = h('input', { type: 'color', class: 'color-input', 'aria-label': p.label });
      const txt = h('input', { id: `p-${p.name}`, type: 'text', class: 'text color-text', spellcheck: 'false', autocomplete: 'off' });
      const presets = FILAMENTS.map((f) =>
        h('button', { class: 'swatch', style: { '--c': f.hex }, title: f.name, 'aria-label': f.name, onclick: () => setValue(p, f.hex) }));
      picker.addEventListener('input', () => setValue(p, picker.value));
      txt.addEventListener('change', () => setValue(p, txt.value.trim() || p.default));
      row.append(h('div', { class: 'color-row' }, h('label', { class: 'color-chip' }, picker), txt), h('div', { class: 'color-presets' }, presets));
      set = (v) => {
        const hex = toHexColor(v);
        picker.value = hex;
        if (document.activeElement !== txt) txt.value = v;
        presets.forEach((b, i) => b.classList.toggle('active', FILAMENTS[i].hex.toLowerCase() === hex.toLowerCase()));
      };
    } else if (p.type === 'string') {
      const inp = h('input', { id: `p-${p.name}`, type: 'text', class: 'text', spellcheck: 'false', autocomplete: 'off' });
      inp.addEventListener('input', () => setValue(p, inp.value));
      row.append(inp);
      set = (v) => { if (document.activeElement !== inp) inp.value = v; };
    } else {
      row.append(h('div', { class: 'muted small' }, 'Kiểu giá trị này chưa hỗ trợ chỉnh sửa.'));
      set = () => {};
    }

    const update = (v) => { set(v); row.classList.toggle('changed', !same(v, p.default)); };
    controls.set(p.name, { set: update, row });
    update(values[p.name]);
    return row;
  }

  function buildFontPicker(p) {
    const prettyName = (n) => n.replace(':style=', ' · ');
    let category = 'Tất cả';
    let query = '';

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const card = e.target;
        io.unobserve(card);
        loadFontFace(card.font).then(() => card.classList.add('ready'));
      }
    }, { rootMargin: '120px' });

    const cards = fonts.map((f) => {
      const sample = h('span', { class: 'font-sample', style: { fontFamily: `"${f.name}", system-ui` } });
      const warn = h('span', { class: 'font-warn' });
      const card = h('button', { class: 'font-card', title: f.name, onclick: () => setValue(p, f.name) },
        sample,
        h('span', { class: 'font-name' }, prettyName(f.name)),
        warn,
      );
      Object.assign(card, { font: f, sample, warn });
      io.observe(card);
      return card;
    });

    const unknownCard = h('button', { class: 'font-card missing', disabled: true });
    const grid = h('div', { class: 'font-grid' }, unknownCard, cards);
    const empty = h('div', { class: 'font-empty', hidden: true }, 'Không có font phù hợp.');

    const counts = Object.fromEntries(categories.map((c) => [c, fonts.filter((f) => f.category === c).length]));
    const chipBtns = ['Tất cả', ...categories].map((c) =>
      h('button', { class: 'font-chip', onclick: () => { category = c; filter(); } },
        c, h('small', {}, String(c === 'Tất cả' ? fonts.length : counts[c]))));
    const search = h('input', { type: 'search', class: 'font-search', placeholder: 'Tìm font…', 'aria-label': 'Tìm font' });
    search.addEventListener('input', () => { query = slug(search.value); filter(); });

    const current = h('div', { class: 'font-current' });

    function filter() {
      chipBtns.forEach((b, i) => b.classList.toggle('active', (i === 0 ? 'Tất cả' : categories[i - 1]) === category));
      let shown = 0;
      for (const c of cards) {
        const ok = (category === 'Tất cả' || c.font.category === category) && (!query || slug(c.font.name).includes(query));
        c.hidden = !ok;
        shown += ok;
      }
      empty.hidden = shown > 0;
    }

    function refreshSample() {
      const text = sampleText();
      for (const c of cards) {
        c.sample.textContent = text;
        const miss = missingChars(c.font, text);
        c.classList.toggle('lacks', miss.length > 0);
        c.warn.textContent = miss.length ? `Thiếu: ${miss.slice(0, 4).join(' ')}` : '';
      }
    }

    function update(v) {
      const font = findFont(v);
      for (const c of cards) c.classList.toggle('active', c.font === font);
      unknownCard.hidden = !!font;
      if (!font) {
        unknownCard.replaceChildren(
          h('span', { class: 'font-sample' }, sampleText()),
          h('span', { class: 'font-name' }, prettyName(v)),
          h('span', { class: 'font-warn' }, 'Chưa có trong fonts/'),
        );
      }
      const miss = font ? missingChars(font, sampleText()) : [];
      current.replaceChildren(...[
        h('span', { class: 'font-current-label' }, 'Đang dùng'),
        h('b', {}, prettyName(v)),
        font && h('span', { class: 'chip ghost' }, font.category),
        !font && h('span', { class: 'chip warn' }, 'không tìm thấy font'),
        miss.length > 0 && h('span', { class: 'chip warn' }, `thiếu ký tự ${miss.join(' ')}`),
      ].filter(Boolean));
    }

    // Start on the current font's category so the selection is visible
    const initial = findFont(values[p.name]);
    if (initial) category = initial.category;
    filter();
    refreshSample();
    requestAnimationFrame(() => {
      const active = cards.find((c) => c.font === initial);
      if (!active) return;
      const delta = active.getBoundingClientRect().top - grid.getBoundingClientRect().top;
      grid.scrollTop += delta - grid.clientHeight / 2 + active.offsetHeight / 2;
    });

    const el = h('div', { class: 'font-picker' },
      current,
      h('div', { class: 'font-tools' }, h('div', { class: 'font-chips' }, chipBtns), search),
      grid,
      empty,
    );
    return { el, update, refreshSample: () => { refreshSample(); update(values[p.name]); } };
  }

  function sampleText() {
    const s = model.params.find(isTextParam);
    return (s && values[s.name]) || 'Aa Bb 123';
  }

  function setValue(p, v) {
    values[p.name] = v;
    controls.get(p.name).set(v);
    if (p.type === 'string') for (const c of controls.values()) c.row.refreshSample?.();
    history.replaceState(null, '', queryFor(model, values));
    markDirty();
  }

  function resetAll() {
    for (const p of model.params) {
      values[p.name] = p.default;
      controls.get(p.name).set(p.default);
    }
    for (const c of controls.values()) c.row.refreshSample?.();
    history.replaceState(null, '', queryFor(model, values));
    markDirty();
  }

  async function share() {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast('Đã sao chép liên kết với thông số hiện tại');
    } catch {
      prompt('Sao chép liên kết:', url);
    }
  }

  // --- rendering ---

  // Parameter edits only mark the model as changed; it is rebuilt when
  // Generate is pressed (or Ctrl/Cmd + Enter), so heavy models don't render on every keystroke.
  let first = true;
  let alive = true;
  let dirty = false;

  function markDirty() {
    dirty = true;
    generateBtn.classList.add('pending');
    if (generateBtn.classList.contains('loading')) return;
    status.className = 'status pending';
    status.replaceChildren(icon('alert'), 'Thông số đã đổi · nhấn Generate');
  }

  async function generate() {
    dirty = false;
    generateBtn.classList.remove('pending');
    generateBtn.classList.add('loading');
    status.className = 'status busy';
    status.replaceChildren(h('span', { class: 'spinner' }), 'Đang lục túi…');
    // `false` means a newer Generate replaced this one and owns the button now
    if (await doRender() === false) return;
    generateBtn.classList.remove('loading');
    if (dirty) markDirty();
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
  };
  document.addEventListener('keydown', onKey);

  async function doRender() {
    stage.classList.add('dim');
    const job = buildJob(model, models, values, 'off');
    const res = await renderLatest(job);
    if (!res || !alive) return false;
    stage.classList.remove('dim');
    showLog(res.log);

    if (!res.ok) {
      status.className = 'status error';
      status.replaceChildren(icon('alert'), 'Lỗi khi dựng');
      overlay.hidden = false;
      const { errors } = summarizeLog(res.log);
      overlay.replaceChildren(h('div', { class: 'overlay-card' },
        icon('alert'),
        h('h3', {}, 'Ối! Không dựng được mô hình'),
        h('pre', {}, (errors.length ? errors : res.log.slice(-6)).join('\n') || 'Không có đầu ra.'),
      ));
      return;
    }

    overlay.hidden = true;
    const { geometry, hasColor, triangles } = parseOff(new TextDecoder().decode(res.data), FILAMENTS[0].hex);
    if (hasColor !== hasFileColors || first) {
      hasFileColors = hasColor;
      if (!hasColor && currentColor === null) currentColor = FILAMENTS[0].hex;
      buildSwatches();
    }
    viewer.setGeometry(geometry, { fit: first });
    viewer.setColor(currentColor);
    first = false;
    showBackground(job);

    const { min, max } = geometry.boundingBox;
    const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
    dims.replaceChildren(
      h('span', { class: 'dim-val' }, h('i', {}, 'R'), fmt(size.x)),
      h('span', { class: 'dim-val' }, h('i', {}, 'S'), fmt(size.y)),
      h('span', { class: 'dim-val' }, h('i', {}, 'C'), fmt(size.z)),
      h('span', { class: 'dim-unit' }, 'mm'),
      h('span', { class: 'dim-tris' }, `${fmt(triangles, 0)} tam giác`),
    );
    status.className = 'status ok';
    status.replaceChildren(icon('check'), `Đã dựng · ${fmt(res.ms, 0)} ms`);
  }

  // `%` objects arrive after the model, so a slow one never holds up the preview
  let bgToken = 0;
  async function showBackground(job) {
    if (!hasBackground(model.source)) return;
    const token = ++bgToken;
    const res = await renderBackground(job);
    if (!alive || token !== bgToken) return;
    viewer.setGhost(res?.ok ? res.data : null);
  }

  function showLog(log) {
    const { warnings } = summarizeLog(log);
    logBtn.hidden = warnings.length === 0;
    logBtn.replaceChildren(icon('alert'), h('span', {}, String(warnings.length)));
    logBtn.title = `${warnings.length} cảnh báo từ OpenSCAD`;
    logPanel.replaceChildren(
      h('div', { class: 'log-head' }, h('b', {}, 'Nhật ký OpenSCAD'), h('button', { class: 'tool', 'aria-label': 'Đóng', onclick: () => (logPanel.hidden = true) }, icon('close'))),
      h('pre', {}, log.map((l) => h('div', { class: /^WARNING/.test(l) ? 'w' : /ERROR/.test(l) ? 'e' : '' }, l))),
    );
    if (!warnings.length) logPanel.hidden = true;
  }

  function fileBaseName() {
    const textParam = model.params.find(isTextParam);
    // Non-default choices (e.g. part = "white" for one AMS color) go in the file name
    const choices = model.params.filter((p) => p.options && p.type === 'string' && values[p.name] !== p.default).map((p) => slug(values[p.name]));
    const base = slug(model.id.split('/').pop());
    const text = textParam && slug(values[textParam.name]);
    // "moc-khoa-ten-laura" + "laura" would repeat the name
    return [base, text && !base.split('-').includes(text) ? text : null, ...choices].filter(Boolean).join('-');
  }

  function saveBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function withBusy(btn, fn) {
    btn.disabled = true;
    btn.classList.add('loading');
    try { await fn(); } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  // The `%` objects shown in the viewer go into downloads too, as separate
  // shells: they're often meshes OpenSCAD can't union with the model.
  async function backgroundFor(job) {
    if (!hasBackground(model.source)) return null;
    const res = await renderBackground(job);
    return res?.ok ? res.data : null;
  }

  function download() {
    return withBusy(downloadBtn, async () => {
      try {
        const job = buildJob(model, models, values, 'stl');
        const [res, bg] = await Promise.all([render(job), backgroundFor(job)]);
        if (!res.ok) throw new Error('render failed');
        const name = `${fileBaseName()}.stl`;
        saveBlob(new Blob([bg ? joinStl([res.data, bg]) : res.data], { type: 'model/stl' }), name);
        toast(`Bảo bối đã về máy: ${name}`);
      } catch {
        toast('Không xuất được STL — xem nhật ký lỗi', 'error');
      }
    });
  }

  // One object, one part per color() used in the model, each with its color
  function download3mf() {
    return withBusy(download3mfBtn, async () => {
      try {
        const parts = await renderColorParts(model, models, values, (msg) => (label3mf.textContent = msg));
        label3mf.textContent = 'Đang dựng phần nền…';
        const bg = await backgroundFor(buildJob(model, models, values, 'off'));
        label3mf.textContent = 'Đang đóng gói…';
        const meshes = parts.map((part) => {
          const value = part.color == null ? null : parseLiteral(part.color) ?? part.color.replace(/^"|"$/g, '');
          return {
            name: value == null ? 'Không màu' : Array.isArray(value) ? toHexColor(value) : String(value),
            color: value == null ? FILAMENTS[0].hex : toHexColor(value),
            mesh: offToMesh(new TextDecoder().decode(part.data)),
          };
        });
        if (bg) meshes.push({ name: 'Phần nền', color: FILAMENTS.find((f) => f.name === 'Trắng').hex, mesh: stlToMesh(bg) });
        const name = `${fileBaseName()}.3mf`;
        saveBlob(await build3mf(meshes, { name: model.title, target: target3mf }), name);
        toast(`Bảo bối đã về máy: ${name} (${meshes.length} màu, ${TARGETS[target3mf].label})`);
      } catch {
        toast('Không xuất được 3MF — xem nhật ký lỗi', 'error');
      } finally {
        label3mf.textContent = '3MF màu';
      }
    });
  }


  generate();

  cleanup = () => {
    alive = false;
    document.removeEventListener('click', closeMenu);
    document.removeEventListener('keydown', onKey);
    viewer.dispose();
  };
}

route();
