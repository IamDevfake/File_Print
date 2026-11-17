/* รันโมเดล AI ใน Web Worker เพื่อให้หน้าเว็บไม่ค้างตอนโหลดไลบรารี โหลดโมเดล และประมวลผล */
/* tf.min.js มีโค้ดสำรอง Function("regeneratorRuntime = r") ซึ่ง CSP (ไม่มี unsafe-eval) บล็อก ประกาศตัวแปรไว้ก่อนเพื่อไม่ให้ไปถึงโค้ดนั้น */
if(!('regeneratorRuntime' in self))self.regeneratorRuntime=undefined;
let backend = ''; const models = {};
const post = (m, t) => self.postMessage(m, t || []);
const MISS = 'ไม่พบไฟล์ในเว็บ กำลังดาวน์โหลดอัตโนมัติ';

function loadScripts(urls, label, id, p0) {
  let last;
  for (const [i, u] of urls.entries()) {
    try { post({ id, type: 'p', p: p0, t: (i ? MISS : 'โหลด') + label }); importScripts(u); return i } catch (e) { last = e }
  }
  throw last;
}
async function pickBackend(cfg, id) {
  try { if (await tf.setBackend('webgl')) return 'webgl' } catch (e) { console.warn('webgl ใน worker ไม่พร้อม', e) }
  try {
    post({ id, type: 'p', p: .5, t: 'WebGL ใช้ไม่ได้ ลองโหมด WASM' });
    const i = loadScripts(cfg.wasm.map(w => w.js), 'ตัวช่วย WASM', id, .5);
    tf.wasm.setWasmPaths(cfg.wasm[i].dir);
    if (await tf.setBackend('wasm')) return 'wasm';
  } catch (e) { console.warn('wasm ไม่พร้อม', e) }
  if (await tf.setBackend('cpu')) return 'cpu';
  throw new Error('ไม่มี backend ที่ใช้ได้');
}
async function prepare(id, sc, cfg) {
  if (!self.tf) { loadScripts(cfg.tf, 'ไลบรารี AI', id, .05) }
  if (!models[sc]) {
    post({ id, type: 'p', p: .3, t: 'เตรียมตัวประมวลผล' });
    if (!backend) backend = await pickBackend(cfg, id);
    await tf.ready();
    for (const [i, url] of cfg.model.entries()) {
      try { models[sc] = await tf.loadLayersModel(url, { onProgress: p => post({ id, type: 'p', p: .6 + p * .4, t: (i ? MISS : 'โหลด') + 'โมเดล AI' }) }); break }
      catch (e) { if (i === cfg.model.length - 1) throw e }
    }
    // วอร์มอัปเล็ก ๆ ให้ shader คอมไพล์ตอนนี้ ไม่ใช่ตอนติ่งแรกของงานจริง
    tf.tidy(() => { models[sc].predict(tf.zeros([1, 16, 16, 3])).dataSync() });
  }
  post({ id, type: 'p', p: 1, t: 'พร้อมแล้ว (' + ({ webgl: 'การ์ดจอ', wasm: 'WASM', cpu: 'CPU ช้า' })[backend] + ')' });
  post({ id, type: 'done' });
}
async function upscale(id, sc, W, H, buf) {
  const m = models[sc], T = 96, P = 8;
  const src = new OffscreenCanvas(W, H), sx = src.getContext('2d', { willReadFrequently: true });
  sx.putImageData(new ImageData(new Uint8ClampedArray(buf), W, H), 0, 0);
  const out = new OffscreenCanvas(W * sc, H * sc), o = out.getContext('2d'), oc = new OffscreenCanvas(1, 1), ox = oc.getContext('2d');
  const nx = Math.ceil(W / T), ny = Math.ceil(H / T), tot = nx * ny, t0 = performance.now(); let n = 0;
  for (let ty = 0; ty < ny; ty++)for (let tx = 0; tx < nx; tx++) {
    const x = tx * T, y = ty * T, w = Math.min(T, W - x), h = Math.min(T, H - y);
    const x0 = Math.max(0, x - P), y0 = Math.max(0, y - P), x1 = Math.min(W, x + w + P), y1 = Math.min(H, y + h + P);
    const idata = sx.getImageData(x0, y0, x1 - x0, y1 - y0);
    const t = tf.tidy(() => m.predict(tf.browser.fromPixels(idata).toFloat().div(255).expandDims(0)).squeeze().clipByValue(0, 1));
    const [oh, ow] = t.shape, d = await t.data(); t.dispose();
    const px = new Uint8ClampedArray(ow * oh * 4);
    for (let i = 0, a = 0, b = 0; i < ow * oh; i++) { px[b++] = d[a++] * 255; px[b++] = d[a++] * 255; px[b++] = d[a++] * 255; px[b++] = 255 }
    oc.width = ow; oc.height = oh; ox.putImageData(new ImageData(px, ow, oh), 0, 0);
    o.drawImage(oc, (x - x0) * sc, (y - y0) * sc, w * sc, h * sc, x * sc, y * sc, w * sc, h * sc);
    n++; post({ id, type: 'p', p: n / tot, eta: n >= 3 ? (performance.now() - t0) / 1000 / n * (tot - n) : null });
  }
  const bmp = await createImageBitmap(out);
  post({ id, type: 'done', bmp }, [bmp]);
}
self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'prepare') await prepare(m.id, m.sc, m.cfg);
    else if (m.type === 'upscale') await upscale(m.id, m.sc, m.w, m.h, m.buf);
  } catch (err) { post({ id: m.id, type: 'err', msg: String(err && err.message || err) }) }
};
