// Runs OpenSCAD (WebAssembly build with the Manifold backend) off the main thread.
// A fresh Emscripten instance is created per render because callMain() is
// single-shot; the compiled WebAssembly.Module is cached so this stays fast.

import OpenSCAD from './vendor/openscad.js';
import wasmUrl from './vendor/openscad.wasm?url';

let wasmModule;
const fileCache = new Map();

async function getWasmModule() {
  if (!wasmModule) {
    wasmModule = (async () => {
      const res = await fetch(wasmUrl);
      try {
        return await WebAssembly.compileStreaming(res.clone());
      } catch {
        return WebAssembly.compile(await res.arrayBuffer());
      }
    })();
  }
  return wasmModule;
}

function getFile(url) {
  if (!fileCache.has(url)) {
    const data = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b));
    data.catch(() => fileCache.delete(url));
    fileCache.set(url, data);
  }
  return fileCache.get(url);
}

function mkdirp(FS, path) {
  let cur = '';
  for (const part of path.split('/').filter(Boolean)) {
    cur += '/' + part;
    try { FS.mkdir(cur); } catch { /* exists */ }
  }
}

self.onmessage = async (e) => {
  const { id, files, main, defines, format, fonts, assets = [] } = e.data;
  const log = [];
  const started = performance.now();
  try {
    const [module, fontData, assetData] = await Promise.all([
      getWasmModule(),
      Promise.all(fonts.map(async (f) => [f, await getFile(f.url)])),
      Promise.all(assets.map(async (a) => [a, await getFile(a.url)])),
    ]);

    const instance = await OpenSCAD({
      noInitialRun: true,
      print: (t) => log.push(t),
      printErr: (t) => log.push(t),
      instantiateWasm(imports, receive) {
        WebAssembly.instantiate(module, imports).then((inst) => receive(inst, module));
        return {};
      },
    });
    const { FS } = instance;

    mkdirp(FS, '/fonts');
    for (const [font, data] of fontData) {
      FS.writeFile('/fonts/' + font.file, data);
      for (const path of font.also ?? []) {
        mkdirp(FS, path.split('/').slice(0, -1).join('/'));
        FS.writeFile(path, data);
      }
    }

    for (const [asset, data] of assetData) {
      mkdirp(FS, asset.path.split('/').slice(0, -1).join('/'));
      FS.writeFile(asset.path, data);
      if (asset.font) FS.writeFile('/fonts/' + asset.path.split('/').pop(), data);
    }

    for (const [path, content] of Object.entries(files)) {
      mkdirp(FS, path.split('/').slice(0, -1).join('/'));
      FS.writeFile(path, content);
    }

    const out = '/out.' + format;
    const args = [main, '-o', out, '--backend=manifold', `--export-format=${format === 'stl' ? 'binstl' : format}`];
    for (const d of defines) args.push('-D', d);

    let code;
    try {
      code = instance.callMain(args);
    } catch (err) {
      // Emscripten throws ExitStatus on exit(); anything else is a crash
      code = typeof err?.status === 'number' ? err.status : 1;
      if (typeof err?.status !== 'number') log.push(String(err));
    }

    let output = null;
    try { output = FS.readFile(out); } catch { /* no output */ }

    if (code !== 0 || !output || output.length === 0) {
      self.postMessage({ id, ok: false, log, ms: performance.now() - started });
      return;
    }
    const data = output.slice().buffer;
    self.postMessage({ id, ok: true, data, log, ms: performance.now() - started }, [data]);
  } catch (err) {
    log.push(String(err?.stack || err));
    self.postMessage({ id, ok: false, log, ms: performance.now() - started });
  }
};
