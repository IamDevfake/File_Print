/* ขยายภาพด้วย ESRGAN-slim (โมเดลเล็ก ~1 MB) บน TensorFlow.js + WebGL แบ่งเป็นชิ้นเล็กเพื่อไม่กินแรม */
/* tf.min.js มีโค้ดสำรอง Function("regeneratorRuntime = r") ซึ่ง CSP (ไม่มี unsafe-eval) บล็อก ประกาศตัวแปรไว้ก่อนเพื่อไม่ให้ไปถึงโค้ดนั้น */
if(!('regeneratorRuntime' in self))self.regeneratorRuntime=undefined;
window.AI = (() => {
  const models = {}; let backend = '';
  const supported = () => typeof WebAssembly === 'object' || !!document.createElement('canvas').getContext('webgl2');
  /* ลองโหลดจากเว็บของเราก่อน ถ้าไม่พบจะดาวน์โหลดอัตโนมัติจาก jsDelivr (npm เวอร์ชันเดียวกัน) */
  const CDN = 'https://cdn.jsdelivr.net/npm/', MISS = 'ไม่พบไฟล์ในเว็บ กำลังดาวน์โหลดอัตโนมัติ';
  const TF = ['lib/tf-4.22.0.min.js', CDN + '@tensorflow/tfjs@4.22.0/dist/tf.min.js'];
  const WASM = ['lib/tf-backend-wasm-4.22.0.min.js', CDN + '@tensorflow/tfjs-backend-wasm@4.22.0/dist/tf-backend-wasm.min.js'];
  const MODEL = sc => [`models/slim-x${sc}/model.json`, `${CDN}@upscalerjs/esrgan-slim@1.0.0/models/x${sc}/model.json`];
  /* โหลดสคริปต์จากเว็บเราก่อน ไม่พบก็ไปที่ jsDelivr คืนค่าลำดับที่ใช้ได้ (0=เว็บเรา, 1=CDN) */
  async function loadScript(urls, label, cb) {
    let last;
    for (const [i, url] of urls.entries()) {
      try {
        const r = await fetch(url);
        if (!r.ok || /text\/html/.test(r.headers.get('content-type') || '')) throw new Error('ไม่พบไฟล์ ' + url);
        const total = +r.headers.get('content-length') || 1.5e6, rd = r.body.getReader(), msg = (i ? MISS : 'โหลด') + label;
        for (let got = 0; ;) { const { done, value } = await rd.read(); if (done) break; got += value.length; cb(Math.min(1, got / total) * .5, msg) }
        await new Promise((ok, no) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => no(new Error('โหลดสคริปต์ไม่ได้ ' + url)); document.head.append(s) });
        return i;
      } catch (e) { last = e }
    }
    throw last;
  }
  /* ลำดับความเร็ว: WebGL (การ์ดจอ) > WASM (CPU แบบเร็ว) > CPU ธรรมดา */
  async function pickBackend(cb) {
    if (await tf.setBackend('webgl').catch(() => false)) return 'webgl';
    try {
      cb(.5, 'WebGL ใช้ไม่ได้ ลองโหมด WASM');
      const i = await loadScript(WASM, 'ตัวช่วย WASM', cb);
      tf.wasm.setWasmPaths(i ? CDN + '@tensorflow/tfjs-backend-wasm@4.22.0/dist/' : new URL('lib/', location.href).href);
      if (await tf.setBackend('wasm')) return 'wasm';
    } catch (e) { console.warn('wasm ไม่พร้อม', e) }
    if (await tf.setBackend('cpu')) return 'cpu';
    throw new Error('ไม่มี backend ที่ใช้ได้');
  }
  async function prepareInline(sc, cb) {
    if (!window.tf) await loadScript(TF, 'ไลบรารี AI', cb);
    if (!models[sc]) {
      backend = await pickBackend(cb); await tf.ready();
      for (const [i, url] of MODEL(sc).entries()) {
        try { models[sc] = await tf.loadLayersModel(url, { onProgress: p => cb(.6 + p * .4, (i ? MISS : 'โหลด') + 'โมเดล AI') }); break }
        catch (e) { if (i) throw e }
      }
    }
    cb(1, 'พร้อมแล้ว (' + ({ webgl: 'การ์ดจอ', wasm: 'WASM', cpu: 'CPU ช้า' })[backend] + ')');
  }
  /* ตรวจชิ้นที่ได้จากโมเดล (เหมือนใน ai.worker.js) กันปื้นดำ/เขียว/เทาจากการคำนวณบน GPU ผิดพลาด */
  function tileOK(d, ow, oh, idata) {
    const n = ow * oh; let a = 0, b = 0, c = 0;
    for (let i = 0; i < d.length; i += 3) {
      const r = d[i], g = d[i + 1], u = d[i + 2];
      if (!(r >= 0 && r <= 1 && g >= 0 && g <= 1 && u >= 0 && u <= 1)) return false;
      a += r; b += g; c += u;
    }
    const s = idata.data, m = s.length / 4; let r0 = 0, g0 = 0, b0 = 0;
    for (let i = 0; i < s.length; i += 4) { r0 += s[i]; g0 += s[i + 1]; b0 += s[i + 2] }
    const k = 1 / (255 * m);
    return Math.abs(a / n - r0 * k) < .15 && Math.abs(b / n - g0 * k) < .15 && Math.abs(c / n - b0 * k) < .15;
  }
  async function inferInline(m, idata) {
    const t = tf.tidy(() => m.predict(tf.browser.fromPixels(idata).toFloat().div(255).expandDims(0)).squeeze().clipByValue(0, 1));
    const [oh, ow] = t.shape, d = await t.data(); t.dispose();
    return { d, ow, oh };
  }
  async function upscaleInline(src, sc, cb) {
    const m = models[sc], W = src.width, H = src.height, T = 96, P = 8;
    const out = document.createElement('canvas'); out.width = W * sc; out.height = H * sc;
    const o = out.getContext('2d'); o.imageSmoothingQuality = 'high';
    const sx = src.getContext('2d', { willReadFrequently: true });
    const nx = Math.ceil(W / T), ny = Math.ceil(H / T), tot = nx * ny, t0 = performance.now(); let n = 0, fixed = 0;
    for (let ty = 0; ty < ny; ty++)for (let tx = 0; tx < nx; tx++) {
      const x = tx * T, y = ty * T, w = Math.min(T, W - x), h = Math.min(T, H - y);
      const x0 = Math.max(0, x - P), y0 = Math.max(0, y - P), x1 = Math.min(W, x + w + P), y1 = Math.min(H, y + h + P);
      const idata = sx.getImageData(x0, y0, x1 - x0, y1 - y0);
      let r = null;
      for (let a = 0; a < 2 && !r; a++) { const q = await inferInline(m, idata); if (tileOK(q.d, q.ow, q.oh, idata)) r = q }
      if (r) {
        const { d, ow, oh } = r, px = new Uint8ClampedArray(ow * oh * 4);
        for (let i = 0, a = 0, b = 0; i < ow * oh; i++) { px[b++] = d[a++] * 255; px[b++] = d[a++] * 255; px[b++] = d[a++] * 255; px[b++] = 255 }
        const oc = document.createElement('canvas'); oc.width = ow; oc.height = oh; oc.getContext('2d').putImageData(new ImageData(px, ow, oh), 0, 0);
        o.drawImage(oc, (x - x0) * sc, (y - y0) * sc, w * sc, h * sc, x * sc, y * sc, w * sc, h * sc);
      } else { fixed++; o.drawImage(src, x, y, w, h, x * sc, y * sc, w * sc, h * sc) }
      n++; cb(n / tot, n >= 3 ? (performance.now() - t0) / 1000 / n * (tot - n) : null);
    }
    if (fixed) console.warn('AI: ชิ้นที่ผลลัพธ์ผิดปกติและใช้การขยายปกติแทน', fixed, '/', tot);
    return out;
  }
  /* ใช้ Web Worker เป็นหลัก (ไม่ทำให้หน้าเว็บค้าง) ถ้าเบราว์เซอร์ไม่รองรับหรือ worker ใช้ไม่ได้ จะถอยไปรันในหน้าหลักแบบเดิม */
  let worker = null, wOK = typeof Worker === 'function' && typeof OffscreenCanvas === 'function', mode = '', seq = 0; const pend = new Map();
  const abs = u => new URL(u, location.href).href;
  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/ai.worker.js?v=23');
    worker.onmessage = e => {
      const m = e.data, p = pend.get(m.id); if (!p) return;
      if (m.type === 'p') { p.cb && p.cb(m.p, m.t, m.eta) } else { pend.delete(m.id); m.type === 'err' ? p.no(new Error(m.msg)) : p.ok(m) }
    };
    worker.onerror = e => {
      const er = new Error(e.message || 'worker error'); pend.forEach(p => p.no(er)); pend.clear();
      try { worker.terminate() } catch { } worker = null; wOK = false; mode = ''
    };
    return worker;
  }
  const call = (msg, cb, tr) => new Promise((ok, no) => { const id = ++seq; pend.set(id, { ok, no, cb }); getWorker().postMessage({ ...msg, id }, tr || []) });
  const cfg = sc => ({
    tf: TF.map(abs),
    wasm: [{ js: abs(WASM[0]), dir: abs('lib/') }, { js: WASM[1], dir: CDN + '@tensorflow/tfjs-backend-wasm@4.22.0/dist/' }],
    model: MODEL(sc).map(abs)
  });
  async function prepare(sc, cb) {
    if (wOK) {
      try { await call({ type: 'prepare', sc, cfg: cfg(sc) }, (p, t) => cb(p, t)); mode = 'worker'; return }
      catch (e) { console.warn('worker ใช้ไม่ได้ ถอยไปใช้หน้าหลัก', e); wOK = false; try { worker && worker.terminate() } catch { } worker = null }
    }
    mode = 'inline'; return prepareInline(sc, cb);
  }
  async function upscale(src, sc, cb) {
    if (mode !== 'worker') return upscaleInline(src, sc, cb);
    const id = src.getContext('2d').getImageData(0, 0, src.width, src.height);
    const m = await call({ type: 'upscale', sc, w: src.width, h: src.height, buf: id.data.buffer }, (p, t, eta) => cb(p, eta), [id.data.buffer]);
    const c = document.createElement('canvas'); c.width = m.bmp.width; c.height = m.bmp.height;
    c.getContext('2d').drawImage(m.bmp, 0, 0); m.bmp.close();
    if (m.fixed) console.warn('AI: ชิ้นที่ผลลัพธ์ผิดปกติและใช้การขยายปกติแทน', m.fixed);
    return c;
  }
  return { supported, prepare, upscale };
})();
