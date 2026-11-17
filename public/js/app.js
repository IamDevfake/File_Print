(() => {
  const $ = s => document.querySelector(s), S = { bmp: null, name: '', a: 0, result: null };
  const RES = { orig: 0, hd: 1920, '2k': 2560, '4k': 3840 }, MAX = 16384;
  /* อุปกรณ์จอสัมผัส (มือถือ/แท็บเล็ต) แรมและขีดจำกัด canvas น้อยกว่า จึงตั้งเพดานต่ำลง */
  const COARSE = matchMedia('(pointer:coarse)').matches, MAXPX = COARSE ? 48e6 : 150e6, AIMAX = COARSE ? 1.5e6 : 4e6, WARPMAX = COARSE ? 4096 : 6000;
  const sleep = () => new Promise(r => setTimeout(r));
  const err = (t, b) => Popup.open({ icon: 'alert', tone: 'err', title: t, body: b });
  const cv = $('#view');

  /* ตรวจมุมเอียง: หามุมที่เส้นขอบขนานกันมากที่สุด */
  function detect(b) {
    const k = Math.min(1, 480 / Math.max(b.width, b.height)), w = Math.round(b.width * k), h = Math.round(b.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++)g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2];
    const gy = new Float32Array(w * h), gx = new Float32Array(w * h); let sy = 0, qy = 0, sx = 0, qx = 0, n = 0;
    for (let y = 1; y < h - 1; y++)for (let X = 1; X < w - 1; X++) { const i = y * w + X, a = Math.abs(g[i + w] - g[i - w]), e = Math.abs(g[i + 1] - g[i - 1]); gy[i] = a; gx[i] = e; sy += a; qy += a * a; sx += e; qx += e * e; n++ }
    const ty = sy / n + 2 * Math.sqrt(Math.max(0, qy / n - (sy / n) ** 2)), tx = sx / n + 2 * Math.sqrt(Math.max(0, qx / n - (sx / n) ** 2));
    const H = [], V = [];
    for (let y = 1; y < h - 1; y++)for (let X = 1; X < w - 1; X++) { const i = y * w + X; if (gy[i] > ty) H.push(X, y); if (gx[i] > tx) V.push(X, y) }
    if (H.length + V.length < 200) return 0;
    const cap = p => { const st = Math.max(1, Math.floor(p.length / 2 / 12000)) * 2, o = []; for (let i = 0; i < p.length; i += st)o.push(p[i], p[i + 1]); return o };
    const sets = [[cap(H), 1], [cap(V), 0]]; let best = 0, bs = -1, s0 = 0;
    for (let a = -20; a <= 20; a += .25) {
      const r = a * Math.PI / 180, s = Math.sin(r), co = Math.cos(r); let sc = 0;
      for (const [P, row] of sets) {
        const bins = new Float32Array(2 * (w + h) + 4);
        for (let i = 0; i < P.length; i += 2) { const X = P[i], y = P[i + 1]; bins[((row ? y * co - X * s : X * co + y * s) + w) | 0]++ }
        for (const v of bins) sc += v * v
      }
      if (a === 0) s0 = sc; if (sc > bs) { bs = sc; best = a }
    }
    return bs < s0 * 1.05 ? 0 : -best;
  }

  /* หมุนแล้วครอปให้ไม่เหลือมุมดำ */
  function geom(a) {
    const r = Math.abs(a) * Math.PI / 180, s = Math.sin(r), c = Math.cos(r), w = S.bmp.width, h = S.bmp.height;
    const k = Math.min(1, w / (w * c + h * s), h / (w * s + h * c)); return { cw: w * k, ch: h * k };
  }
  function dims() {
    const g = geom(S.a), long = Math.max(g.cw, g.ch), v = $('#res').value;
    const L = v === 'custom' ? +$('#cw').value || long : RES[v] || long, s = L / long;
    return { g, s, ow: Math.round(g.cw * s), oh: Math.round(g.ch * s) };
  }
  function paint(c, ow, oh, a) {
    c.width = ow; c.height = oh; const x = c.getContext('2d'), g = geom(a);
    x.imageSmoothingQuality = 'high'; x.translate(ow / 2, oh / 2); x.rotate(a * Math.PI / 180);
    const k = ow / g.cw; x.scale(k, k); x.drawImage(S.bmp, -S.bmp.width / 2, -S.bmp.height / 2);
  }
  let raf = 0;
  function update() { S.result = null; render() }
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!S.bmp || $('#stage').hidden) return;
      const g = geom(S.a), dpr = Math.min(2, devicePixelRatio || 1), avail = Math.max(160, $('#stage').clientWidth - 26);
      const k = Math.min(1, avail * dpr / g.cw, innerHeight * .7 * dpr / g.ch, 2400 / Math.max(g.cw, g.ch));
      paint(cv, Math.max(1, Math.round(g.cw * k)), Math.max(1, Math.round(g.ch * k)), S.a);
      const T = toneLUT(S.tone, +$('#enh').value); if (T) { const px = cv.getContext('2d'), im = px.getImageData(0, 0, cv.width, cv.height); toneData(im.data, T); px.putImageData(im, 0, 0) }
      cv.style.width = cv.width / dpr + 'px'; cv.style.height = cv.height / dpr + 'px';
      const d = dims();
      $('#info').textContent = `ผลลัพธ์ ${d.ow}×${d.oh} px · ใช้หน่วยความจำประมาณ ${Math.round(d.ow * d.oh * 4 / 1e6)} MB` + (d.s > 1.001 ? ` · ขยาย ${d.s.toFixed(2)} เท่า` : '');
      $('#engnote').textContent = aiPlan(d.s, d.g).msg;
      $('#angv').textContent = S.a.toFixed(1) + '°';
    });
  }

  const scaled = (c, w, h) => { const n = document.createElement('canvas'); n.width = w; n.height = h; const x = n.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, w, h); return n };
  function fit(c, ow, oh) { while (c.width * 2 < ow) c = scaled(c, c.width * 2, c.height * 2); return c.width === ow && c.height === oh ? c : scaled(c, ow, oh) }
  /* ผู้ใช้เลือกวิธีปรับคุณภาพที่แผงด้านข้าง: ปกติ (canvas + ปรับความคม) หรือ AI ในเครื่อง */
  function aiPlan(s, g) {
    if (document.querySelector('input[name=eng]:checked').value !== 'ai') return { use: false, msg: '' };
    if (!AI.supported()) return { use: false, msg: 'เครื่องนี้ไม่รองรับ AI จึงใช้แบบปกติแทน' };
    if (s <= 1.05) return { use: false, msg: 'รูปนี้ไม่ต้องขยาย AI จึงยังไม่ทำงาน ใช้แบบปกติแทน' };
    if (g.cw * g.ch > AIMAX) return { use: false, msg: `รูปต้นฉบับใหญ่เกิน ${AIMAX / 1e6} ล้านพิกเซล ใช้แบบปกติแทนเพื่อไม่ให้ช้าหรือแรมไม่พอ` };
    return { use: true, msg: `จะใช้ AI ขยาย ${s.toFixed(1)} เท่าตอนบันทึกหรือพิมพ์ (ใช้เวลานานกว่าแบบปกติ จะแสดงเวลาที่เหลือ)` };
  }

  /* ลดสัญญาณรบกวนแบบรักษาขอบ (bilateral) ก่อนขยาย กันเม็ดสีและบล็อก JPEG ของเว็บแคมถูกขยายจนเป็นปื้น */
  async function denoise(c, lvl, cb) {
    const sig = [0, 14, 24, 38][lvl]; if (!sig) return;
    const w = c.width, h = c.height, x = c.getContext('2d', { willReadFrequently: true }), s = x.getImageData(0, 0, w, h).data, out = new ImageData(w, h), o = out.data; o.set(s);
    const R = 2, lut = new Float32Array(766); for (let i = 0; i < 766; i++)lut[i] = Math.exp(-((i / 3) ** 2) / (2 * sig * sig));
    const sp = []; for (let dy = -R; dy <= R; dy++)for (let dx = -R; dx <= R; dx++)sp.push(dx, dy, Math.exp(-(dx * dx + dy * dy) / 4.5));
    const step = Math.max(4, Math.floor(3e5 / w));
    for (let y0 = 0; y0 < h; y0 += step) {
      const y1 = Math.min(h, y0 + step);
      for (let y = y0; y < y1; y++)for (let X = 0; X < w; X++) {
        const i = (y * w + X) * 4, r = s[i], g = s[i + 1], b = s[i + 2]; let ar = 0, ag = 0, ab = 0, aw = 0;
        for (let k = 0; k < sp.length; k += 3) {
          const xx = X + sp[k], yy = y + sp[k + 1]; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4, d = Math.abs(s[j] - r) + Math.abs(s[j + 1] - g) + Math.abs(s[j + 2] - b), wt = sp[k + 2] * lut[d];
          ar += s[j] * wt; ag += s[j + 1] * wt; ab += s[j + 2] * wt; aw += wt
        }
        o[i] = ar / aw; o[i + 1] = ag / aw; o[i + 2] = ab / aw
      }
      cb(y1 / h); await sleep();
    }
    x.putImageData(out, 0, 0);
  }

  /* ปรับแสง สี คอนทราสต์อัตโนมัติ: วิเคราะห์จากภาพย่อครั้งเดียว แล้วใช้ตาราง LUT ต่อช่องสี (เร็วพอใช้กับพรีวิวสด) */
  function analyze(b) {
    const k = Math.min(1, 256 / Math.max(b.width, b.height)), w = Math.max(1, Math.round(b.width * k)), h = Math.max(1, Math.round(b.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(b, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, H = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)], m = [0, 0, 0], n = w * h;
    for (let i = 0; i < n; i++)for (let ch = 0; ch < 3; ch++) { const v = d[i * 4 + ch]; H[ch][v]++; m[ch] += v }
    const pct = (hh, p) => { let a = 0; const t = p * n; for (let v = 0; v < 256; v++) { a += hh[v]; if (a >= t) return v } return 255 };
    return { lo: H.map(hh => pct(hh, .005)), hi: H.map(hh => pct(hh, .995)), m: m.map(v => v / n) };
  }
  function toneLUT(st, lvl) {
    if (!st || !lvl) return null;
    const str = [0, .4, .7, 1][lvl], cl = (v, a, b) => Math.max(a, Math.min(b, v)), avg = (st.m[0] + st.m[1] + st.m[2]) / 3;
    const gain = st.m.map(v => 1 + (cl(avg / Math.max(v, 1), .8, 1.25) - 1) * str * .7);
    const lo = [], hi = []; let ml = 0;
    for (let c = 0; c < 3; c++) {
      let l = st.lo[c] * gain[c] / 255 * str, u = 1 - (1 - Math.min(1, st.hi[c] * gain[c] / 255)) * str;
      if (u - l < .5) { const mid = (u + l) / 2; l = mid - .25; u = mid + .25 }
      lo.push(l); hi.push(u); ml += cl((st.m[c] * gain[c] / 255 - l) / (u - l), .02, .98) / 3;
    }
    const gm = 1 + (cl(Math.log(.46) / Math.log(ml), .6, 1.3) - 1) * str * .8, ct = .3 * str, sat = 1 + .2 * str;
    const lut = [0, 1, 2].map(c => {
      const t = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) { let v = cl((i / 255 * gain[c] - lo[c]) / (hi[c] - lo[c]), 0, 1); v = Math.pow(v, gm); v = v * (1 - ct) + ct * v * v * (3 - 2 * v); t[i] = v * 255 }
      return t
    });
    return { lut, sat };
  }
  function toneData(d, T, i0 = 0, i1 = d.length) {
    const [r, g, b] = T.lut, s = T.sat;
    for (let i = i0; i < i1; i += 4) { const R = r[d[i]], G = g[d[i + 1]], B = b[d[i + 2]], l = .299 * R + .587 * G + .114 * B; d[i] = l + (R - l) * s; d[i + 1] = l + (G - l) * s; d[i + 2] = l + (B - l) * s }
  }
  async function toneApply(c, lvl, cb) {
    const T = toneLUT(S.tone, lvl); if (!T) return;
    const x = c.getContext('2d', { willReadFrequently: true }), w = c.width, h = c.height, im = x.getImageData(0, 0, w, h), step = Math.max(16, Math.floor(4e6 / w));
    for (let y0 = 0; y0 < h; y0 += step) { const y1 = Math.min(h, y0 + step); toneData(im.data, T, y0 * w * 4, y1 * w * 4); cb && cb(y1 / h); await sleep() }
    x.putImageData(im, 0, 0);
  }

  async function ensure() {
    if (S.result) return S.result;
    const { g, s, ow, oh } = dims();
    if (Math.max(ow, oh) > MAX || ow * oh > MAXPX) { await err('ขนาดใหญ่เกินไป', 'ความละเอียดนี้เกินที่เบราว์เซอร์รองรับ ลองเลือกขนาดที่เล็กลง'); return null }
    const esc = t => String(t).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
    const useAI = aiPlan(s, g).use, enh = +$('#enh').value, lvl = +$('#dn').value, str = +$('#ais').value / 100; let stage = '';
    const pg = Popup.progress('กำลังประมวลผล'); let c = null, note = '';
    try {
      /* ขยายรูป: ทำรูปขนาดเดิมที่หมุนแล้ว ลดสัญญาณรบกวน แล้วค่อยขยาย (ลดสัญญาณรบกวนหลังขยายไม่ได้ผลเท่านี้) */
      let base = null;
      if (s > 1.05) {
        pg.set(2, 'เตรียมรูป'); await sleep();
        base = document.createElement('canvas'); paint(base, Math.round(g.cw), Math.round(g.ch), S.a);
        if (lvl && base.width * base.height <= 8e6) await denoise(base, lvl, p => pg.set(2 + p * 13, 'ลดสัญญาณรบกวน'));
      }
      if (useAI && base) {
        try {
          const sc = s <= 2 ? 2 : 4;
          stage = 'โหลดไลบรารีหรือโมเดล'; await AI.prepare(sc, (p, t) => pg.set(15 + p * 10, t));
          stage = 'ประมวลผลภาพ'; const ai = fit(await AI.upscale(base, sc, (p, eta) => pg.set(25 + p * 60, 'AI ขยายภาพ', eta)), ow, oh);
          stage = 'ผสมผลลัพธ์'; pg.set(88, 'ผสมผลลัพธ์กับการขยายแบบปกติ'); await sleep();
          if (str >= .999) c = ai;
          else { /* ผสม AI กับการขยายแบบนุ่ม ลดปื้นสีที่ AI แต่งขึ้นเอง */
            c = fit(base, ow, oh); if (c === base || c === ai) { const t = document.createElement('canvas'); t.width = ow; t.height = oh; t.getContext('2d').drawImage(c, 0, 0); c = t }
            const x = c.getContext('2d'); x.globalAlpha = str; x.drawImage(ai, 0, 0, ow, oh); x.globalAlpha = 1;
          }
          await toneApply(c, enh, p => pg.set(89 + p * 5, 'ปรับแสงและสี')); await sleep();
        } catch (e) { console.error(e); c = null; note = `ขยายด้วย AI ไม่สำเร็จ จึงขยายแบบธรรมดาแทน<br><small>ขั้นตอน: ${stage} · สาเหตุ: ${esc(e && e.message || e)}</small>` }
      }
      if (!c) {
        pg.set(16, 'ปรับขนาด'); await sleep();
        if (base) c = fit(base, ow, oh); else { c = document.createElement('canvas'); paint(c, ow, oh, S.a) }
        await toneApply(c, enh, p => pg.set(17 + p * 8, 'ปรับแสงและสี'));
      }
      S.result = c; pg.close();
    } catch (e) { console.error(e); pg.close(); await err('ประมวลผลไม่สำเร็จ', 'หน่วยความจำอาจไม่พอ ลองเลือกความละเอียดที่ต่ำลง'); return null }
    if (note) await err('ใช้ AI ไม่สำเร็จ', note);
    return c;
  }

  /* createImageBitmap(file) ใช้ไม่ได้ในเบราว์เซอร์รุ่นเก่า ให้ถอยไปใช้ <img> แล้ววาดลง canvas แทน */
  async function decode(file) {
    try { return await createImageBitmap(file) } catch (e) {
      const u = URL.createObjectURL(file);
      try {
        const im = new Image(); im.src = u; await im.decode();
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
        c.close = () => { }; return c;
      } finally { URL.revokeObjectURL(u) }
    }
  }
  function show(w) { $('#src').hidden = w !== 'src'; $('#crop').hidden = w !== 'crop'; $('#stage').hidden = w !== 'stage' }
  function freeBmps(keep = []) { new Set([S.bmp, S.orig]).forEach(x => x && !keep.includes(x) && x.close()) }
  /* o = รูปต้นฉบับ, b = รูปหลังตัดและปรับมุมแล้ว (อาจเป็นรูปเดียวกัน) */
  function commit(o, b, q, name) {
    freeBmps([o, b]); S.orig = o; S.bmp = b; S.quad = q || null; if (name) S.name = name;
    show('stage'); $('#ctl').disabled = false; S.a = detect(b); S.tone = analyze(b); $('#ang').value = S.a; update();
  }
  async function load(file, opt = {}) {
    if (!file || !file.type.startsWith('image/')) { await err('ไฟล์ไม่รองรับ', 'เลือกไฟล์รูปภาพ เช่น JPG, PNG หรือ WebP'); return false }
    let b; try { b = await decode(file) } catch { await err('เปิดรูปไม่ได้', 'ไฟล์อาจเสียหรือเบราว์เซอร์ไม่รองรับรูปแบบนี้'); return false }
    const name = file.name.replace(/\.[^.]+$/, '');
    stopCam();
    if (opt.crop) enterCrop(b, opt.from, name); else commit(b, b, null, name);
    return true;
  }
  function reset() {
    freeBmps(); S.bmp = S.orig = null; S.quad = null; S.result = null; S.a = 0; $('#ang').value = 0; $('#file').value = '';
    $('#stage').hidden = true; $('#ctl').disabled = true; showSrc('file');
  }

  async function save() {
    const fmt = $('#fmt').value, mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[fmt];
    let name = `${S.name}-${$('#res').value}.${fmt}`;
    let handle = null;
    if (window.showSaveFilePicker) { // ต้องเรียกก่อนประมวลผล เพราะต้องมาจากการกดปุ่มโดยตรง
      try { handle = await showSaveFilePicker({ suggestedName: name, types: [{ description: 'รูปภาพ', accept: { [mime]: ['.' + fmt] } }] }) }
      catch (e) { if (e.name === 'AbortError') return }
    }
    const c = await ensure(); if (!c) return;
    const pg = Popup.progress('กำลังเตรียมไฟล์'); pg.set(50, 'เข้ารหัส ' + fmt.toUpperCase());
    const blob = await new Promise(r => c.toBlob(r, mime, $('#q').value / 100)); pg.close();
    if (blob && !handle) { const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type]; if (ext) name = name.replace(/\.\w+$/, '.' + ext) }
    if (!blob) return err('สร้างไฟล์ไม่ได้', 'ลองเปลี่ยนรูปแบบไฟล์หรือลดความละเอียด');
    try {
      if (handle) { const w = await handle.createWritable(); await w.write(blob); await w.close() }
      else { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 6e4) }
    } catch (e) { return err('บันทึกไม่สำเร็จ', 'เขียนไฟล์ไม่ได้ ลองเลือกโฟลเดอร์อื่น') }
    const clear = await Popup.open({
      icon: 'check', tone: 'ok', title: 'บันทึกไฟล์แล้ว',
      body: `ขนาดไฟล์ ${(blob.size / 1e6).toFixed(1)} MB<br>เว็บลบไฟล์ต้นฉบับในเครื่องให้ไม่ได้ หากต้องการลบ ให้ลบจากโฟลเดอร์เดิมเอง ส่วนรูปในแอปล้างออกได้ตอนนี้`,
      actions: [{ label: 'เก็บไว้บนเว็บ', value: false }, ...shareAct(blob, name), { label: 'ล้างรูปออกจากเว็บ', primary: true, value: true }]
    });
    if (clear) reset();
  }

  /* มือถือ: ปุ่มแชร์เปิดเมนูของระบบ เลือกบันทึกลงอัลบั้มหรือส่งต่อแอปอื่นได้ (ต้องกดจากปุ่มโดยตรง) */
  function shareAct(blob, name) {
    const f = new File([blob], name, { type: blob.type });
    return COARSE && navigator.canShare && navigator.canShare({ files: [f] })
      ? [{ label: 'แชร์ / บันทึกลงอัลบั้ม', value: () => { navigator.share({ files: [f] }).catch(() => { }); return false } }] : [];
  }
  const PAPER = { A4: [210, 297], A5: [148, 210], Letter: [216, 279], '4x6': [102, 152] };
  async function print() {
    const c = await ensure(); if (!c) return;
    const land = c.width > c.height, box = document.createElement('div');
    box.className = 'pf';
    box.innerHTML = `<label for="pp">กระดาษ</label><select id="pp"><option>A4</option><option>A5</option><option>Letter</option><option value="4x6">4×6 นิ้ว</option></select>
  <label for="pfit">การวางรูป</label><select id="pfit"><option value="contain">เห็นทั้งรูป</option><option value="cover">เต็มหน้ากระดาษ (ตัดขอบ)</option></select>
  <label for="pm">ขอบกระดาษ</label><select id="pm"><option value="0">ไม่มี</option><option value="5" selected>5 มม.</option><option value="10">10 มม.</option></select>
  <div class="pv"><div id="pbox"><img id="pimg" alt="ตัวอย่างการพิมพ์"></div></div>
  <p style="grid-column:1/-1;margin:0;font-size:.875rem;color:var(--mu)">เลือกเครื่องพิมพ์ จำนวนสำเนา และตั้งค่าอื่น ๆ ได้ในหน้าต่างพิมพ์ของระบบที่จะเปิดต่อจากนี้</p>`;
    const prev = document.createElement('canvas'); prev.width = 400; prev.height = Math.round(400 * c.height / c.width);
    prev.getContext('2d').drawImage(c, 0, 0, prev.width, prev.height);
    box.querySelector('#pimg').src = prev.toDataURL('image/jpeg', .8);
    const refresh = () => {
      const [w, h] = PAPER[box.querySelector('#pp').value], b = box.querySelector('#pbox'), i = box.querySelector('#pimg');
      b.style.aspectRatio = land ? `${h}/${w}` : `${w}/${h}`; b.style.padding = box.querySelector('#pm').value * .8 + 'px';
      i.style.objectFit = box.querySelector('#pfit').value
    };
    box.addEventListener('change', refresh); setTimeout(refresh);
    const o = await Popup.open({
      icon: 'printer', title: 'พิมพ์รูป', body: box, actions: [
        { label: 'ยกเลิก', value: false },
        { label: 'เปิดหน้าต่างพิมพ์', primary: true, value: () => ({ p: box.querySelector('#pp').value, fit: box.querySelector('#pfit').value, m: box.querySelector('#pm').value }) }]
    });
    if (!o) return;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .95)), url = URL.createObjectURL(blob), [w, h] = PAPER[o.p];
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0'; document.body.append(f);
    const d = f.contentDocument; d.open();
    d.write(`<style>@page{size:${land ? h + 'mm ' + w + 'mm' : w + 'mm ' + h + 'mm'};margin:${o.m}mm}html,body{margin:0;height:100%}img{display:block;width:100%;height:100%;object-fit:${o.fit}}</style><img src="${url}">`); d.close();
    d.querySelector('img').onload = () => { f.contentWindow.focus(); f.contentWindow.print() };
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url) }, 12e4);
  }

  /* ---------- ขั้นปรับกรอบ: ตรวจมุมอัตโนมัติ ลากปรับ แว่นขยาย แล้วดึงภาพให้ตรง ---------- */
  const C = { b: null, q: [], s: 1, dpr: 1, view: null, drag: -1, from: '', name: '', fresh: false, cw: 0, ch: 0 };
  const cc = $('#cc'), lp = $('#loupe');
  const rectQ = (w, h, m = 0) => [[w * m, h * m], [w * (1 - m), h * m], [w * (1 - m), h * (1 - m)], [w * m, h * (1 - m)]];

  /* หาพื้นที่รูปจากพื้นหลัง: Otsu แยกสว่าง/มืด เอากลุ่มก้อนใหญ่สุด แล้วหาจุดมุมสุดทั้ง 4 ทิศ */
  function autoQuad(b) {
    const k = Math.min(1, 320 / Math.max(b.width, b.height)), w = Math.round(b.width * k), h = Math.round(b.height * k), n = w * h;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true }); x.filter = 'blur(1.5px)'; x.drawImage(b, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(n), hist = new Float64Array(256);
    for (let i = 0; i < n; i++) { g[i] = .299 * d[i * 4] + .587 * d[i * 4 + 1] + .114 * d[i * 4 + 2]; hist[g[i]]++ }
    let sum = 0; for (let t = 0; t < 256; t++)sum += t * hist[t];
    let wB = 0, sB = 0, best = -1, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += t * hist[t];
      const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t }
    }
    let bw = 0, bc = 0; const bp = i => { bc++; if (g[i] > th) bw++ };
    for (let X = 0; X < w; X++) { bp(X); bp((h - 1) * w + X) } for (let y = 1; y < h - 1; y++) { bp(y * w); bp(y * w + w - 1) }
    const inv = bw / bc > .5, m = new Uint8Array(n);
    for (let i = 0; i < n; i++)m[i] = (g[i] > th) !== inv ? 1 : 0;
    const lab = new Int32Array(n), st = new Int32Array(n); let L = 0, bl = 0, ba = 0;
    for (let i = 0; i < n; i++) {
      if (!m[i] || lab[i]) continue; L++; let sp = 0, ar = 0; st[sp++] = i; lab[i] = L;
      while (sp) {
        const p = st[--sp]; ar++; const px = p % w, py = (p - px) / w;
        if (px > 0 && m[p - 1] && !lab[p - 1]) { lab[p - 1] = L; st[sp++] = p - 1 }
        if (px < w - 1 && m[p + 1] && !lab[p + 1]) { lab[p + 1] = L; st[sp++] = p + 1 }
        if (py > 0 && m[p - w] && !lab[p - w]) { lab[p - w] = L; st[sp++] = p - w }
        if (py < h - 1 && m[p + w] && !lab[p + w]) { lab[p + w] = L; st[sp++] = p + w }
      }
      if (ar > ba) { ba = ar; bl = L }
    }
    if (ba / n > .97) return rectQ(b.width, b.height);
    if (ba / n < .08) return rectQ(b.width, b.height, .06);
    const e = [[1e9, 0, 0], [-1e9, 0, 0], [-1e9, 0, 0], [1e9, 0, 0]];   // TL(min x+y) BR(max x+y) TR(max x-y) BL(min x-y)
    for (let i = 0; i < n; i++) {
      if (lab[i] !== bl) continue; const X = i % w, y = (i - X) / w, s = X + y, t = X - y;
      if (s < e[0][0]) e[0] = [s, X, y]; if (s > e[1][0]) e[1] = [s, X, y]; if (t > e[2][0]) e[2] = [t, X, y]; if (t < e[3][0]) e[3] = [t, X, y]
    }
    const q = [e[0], e[2], e[1], e[3]].map(p => [Math.min(b.width, Math.max(0, (p[1] + .5) / k)), Math.min(b.height, Math.max(0, (p[2] + .5) / k))]);
    return convex(q) ? q : rectQ(b.width, b.height, .06);
  }
  function convex(q) {
    let sg = 0; for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4], z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (Math.abs(z) < 1e-6) return false; if (!sg) sg = Math.sign(z); else if (Math.sign(z) !== sg) return false
    }
    return true;
  }

  /* ดึงภาพสี่เหลี่ยมเบี้ยวให้เป็นสี่เหลี่ยมตรง (perspective) */
  async function warp(b, q, cb) {
    const d = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    let W = (d(q[0], q[1]) + d(q[3], q[2])) / 2, H = (d(q[0], q[3]) + d(q[1], q[2])) / 2;
    const k = Math.min(1, WARPMAX / Math.max(W, H)); W = Math.max(2, Math.round(W * k)); H = Math.max(2, Math.round(H * k));
    const sc = document.createElement('canvas'); sc.width = b.width; sc.height = b.height;
    const sx = sc.getContext('2d', { willReadFrequently: true }); sx.drawImage(b, 0, 0);
    const sw = b.width, sh = b.height, sd = sx.getImageData(0, 0, sw, sh).data;
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q, dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    let g = 0, hh = 0; const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(dx3) > 1e-9 || Math.abs(dy3) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den }
    const A = x1 - x0 + g * x1, B = x3 - x0 + hh * x3, Cx = x0, D = y1 - y0 + g * y1, E = y3 - y0 + hh * y3, F = y0;
    const out = new ImageData(W, H), o = out.data, step = Math.max(8, Math.floor(1.5e6 / W));
    for (let ys = 0; ys < H; ys += step) {
      const ye = Math.min(H, ys + step);
      for (let y = ys; y < ye; y++) {
        const v = (y + .5) / H;
        for (let X = 0; X < W; X++) {
          const u = (X + .5) / W, w = g * u + hh * v + 1;
          let sX = (A * u + B * v + Cx) / w - .5, sY = (D * u + E * v + F) / w - .5;
          sX = Math.min(Math.max(sX, 0), sw - 1.001); sY = Math.min(Math.max(sY, 0), sh - 1.001);
          const ix = sX | 0, iy = sY | 0, fx = sX - ix, fy = sY - iy, i = (iy * sw + ix) * 4, j = i + sw * 4, p = (y * W + X) * 4;
          for (let c = 0; c < 3; c++)o[p + c] = (sd[i + c] * (1 - fx) + sd[i + 4 + c] * fx) * (1 - fy) + (sd[j + c] * (1 - fx) + sd[j + 4 + c] * fx) * fy;
          o[p + 3] = 255
        }
      }
      cb(ye / H); await sleep();
    }
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(out, 0, 0);
    return createImageBitmap(c);
  }

  function enterCrop(b, from, name, q) {
    C.b = b; C.from = from || ''; C.name = name; C.fresh = b !== S.orig; C.q = (q || autoQuad(b)).map(p => p.slice());
    $('#ccancel').textContent = C.from === 'cam' ? 'ถ่ายใหม่' : 'ยกเลิก';
    show('crop'); $('#ctl').disabled = true; layoutCrop(); drawCrop();
  }
  function layoutCrop() {
    const b = C.b; if (!b) return;
    const avail = Math.max(200, $('#crop').clientWidth - 26);
    C.s = Math.min(1, avail / b.width, innerHeight * .66 / b.height); C.dpr = Math.min(2, devicePixelRatio || 1);
    C.cw = Math.round(b.width * C.s); C.ch = Math.round(b.height * C.s);
    cc.style.width = C.cw + 'px'; cc.style.height = C.ch + 'px'; cc.width = Math.round(C.cw * C.dpr); cc.height = Math.round(C.ch * C.dpr);
    C.view = document.createElement('canvas'); C.view.width = cc.width; C.view.height = cc.height;
    const x = C.view.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(b, 0, 0, cc.width, cc.height);
  }
  const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || '#1f5fd1';
  function drawCrop() {
    if (!C.b) return;
    const x = cc.getContext('2d'), s = C.s, P = C.q.map(p => [p[0] * s, p[1] * s]), ac = accent();
    x.setTransform(C.dpr, 0, 0, C.dpr, 0, 0); x.clearRect(0, 0, C.cw, C.ch); x.drawImage(C.view, 0, 0, C.cw, C.ch);
    x.beginPath(); x.rect(0, 0, C.cw, C.ch); P.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath();
    x.fillStyle = 'rgba(0,0,0,.5)'; x.fill('evenodd');
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    x.save(); x.setLineDash([5, 5]); x.lineWidth = 1; x.strokeStyle = 'rgba(255,255,255,.7)'; x.beginPath();
    for (const t of [1 / 3, 2 / 3]) {
      let a = lerp(P[0], P[1], t), b = lerp(P[3], P[2], t); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]);
      a = lerp(P[0], P[3], t); b = lerp(P[1], P[2], t); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1])
    }
    x.stroke(); x.restore();
    x.beginPath(); P.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.lineWidth = 2; x.strokeStyle = ac; x.stroke();
    P.forEach((p, i) => { x.beginPath(); x.arc(p[0], p[1], (i === C.drag ? 13 : 10) + (COARSE ? 4 : 0), 0, 7); x.fillStyle = '#fff'; x.fill(); x.lineWidth = 3; x.strokeStyle = ac; x.stroke() });
  }
  function drawLoupe(i) {
    lp.hidden = false; const Z = 4, S2 = lp.offsetWidth || 160, R = S2 / (C.s * Z), [px, py] = C.q[i], x = lp.getContext('2d');
    x.setTransform(lp.width / S2, 0, 0, lp.width / S2, 0, 0); x.fillStyle = '#000'; x.fillRect(0, 0, S2, S2); x.imageSmoothingQuality = 'high';
    x.drawImage(C.b, px - R / 2, py - R / 2, R, R, 0, 0, S2, S2);
    const f = p => [(p[0] - (px - R / 2)) * S2 / R, (p[1] - (py - R / 2)) * S2 / R];
    x.beginPath(); C.q.forEach((p, k) => { const t = f(p); k ? x.lineTo(t[0], t[1]) : x.moveTo(t[0], t[1]) }); x.closePath();
    x.lineWidth = 1.5; x.strokeStyle = accent(); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1; x.beginPath();
    x.moveTo(S2 / 2 - 8, S2 / 2); x.lineTo(S2 / 2 + 8, S2 / 2); x.moveTo(S2 / 2, S2 / 2 - 8); x.lineTo(S2 / 2, S2 / 2 + 8); x.stroke();
    const hx = px * C.s, hy = py * C.s, gap = COARSE ? 64 : 48; let top = hy - S2 - gap; if (top < 0) top = hy + gap;
    lp.style.left = Math.min(Math.max(0, hx - S2 / 2), Math.max(0, C.cw - S2)) + 'px'; lp.style.top = top + 'px';
  }
  const cpos = e => { const r = cc.getBoundingClientRect(); return [(e.clientX - r.left) / C.s, (e.clientY - r.top) / C.s] };
  cc.onpointerdown = e => {
    if (!C.b) return; const [x, y] = cpos(e); let bi = -1, bd = (COARSE ? 48 : 34) / C.s;
    C.q.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; bi = i } });
    if (bi < 0) return; C.drag = bi; cc.setPointerCapture(e.pointerId); e.preventDefault(); drawCrop(); drawLoupe(bi);
  };
  cc.onpointermove = e => {
    if (C.drag < 0) return; const [x, y] = cpos(e);
    C.q[C.drag] = [Math.min(C.b.width, Math.max(0, x)), Math.min(C.b.height, Math.max(0, y))]; drawCrop(); drawLoupe(C.drag);
  };
  const endDrag = () => { if (C.drag < 0) return; C.drag = -1; lp.hidden = true; drawCrop() };
  cc.onpointerup = endDrag; cc.onpointercancel = endDrag;
  let rz = 0;
  const relayout = () => {
    cancelAnimationFrame(rz); rz = requestAnimationFrame(() => {
      if (!$('#crop').hidden && C.b) { layoutCrop(); drawCrop() }
      if (!$('#stage').hidden) render()
    })
  };
  addEventListener('resize', relayout); addEventListener('orientationchange', relayout);
  if (window.ResizeObserver) { const ro = new ResizeObserver(relayout); ro.observe($('#crop')); ro.observe($('#stage')) }

  async function cropNext() {
    const b = C.b, q = C.q, w = b.width, h = b.height;
    if (!convex(q)) return err('กรอบไม่ถูกต้อง', 'จุดมุมไขว้กันอยู่ ลองลากให้เรียงเป็นสี่เหลี่ยม');
    const full = rectQ(w, h).every((p, i) => Math.hypot(p[0] - q[i][0], p[1] - q[i][1]) < 2);
    let out = b;
    if (!full) {
      const pg = Popup.progress('กำลังตัดและปรับมุมภาพ');
      try { out = await warp(b, q, p => pg.set(p * 100, 'ดึงภาพให้ตรง')) }
      catch (e) { console.error(e); pg.close(); return err('ปรับมุมไม่สำเร็จ', 'หน่วยความจำอาจไม่พอ ลองถ่ายหรือใช้รูปที่เล็กลง') }
      pg.close();
    }
    C.b = null; commit(b, out, q.map(p => p.slice()), C.name);
  }
  function cropCancel() {
    if (C.fresh && C.b) C.b.close();
    C.b = null; $('#ctl').disabled = !S.bmp;
    if (C.from === 'cam') showSrc('cam'); else if (S.bmp) show('stage'); else showSrc('file');
  }
  $('#cnext').onclick = cropNext; $('#ccancel').onclick = cropCancel;
  $('#cauto').onclick = () => { C.q = autoQuad(C.b); drawCrop() };
  $('#cfull').onclick = () => { C.q = rectQ(C.b.width, C.b.height); drawCrop() };
  $('#recrop').onclick = () => { if (S.orig) enterCrop(S.orig, '', S.name, S.quad) };

  /* ---------- นำเข้ารูป: ไฟล์ / กล้อง ---------- */
  let stream = null, facing = 'user', mir = false;
  function setMir(v) { mir = v; vid.classList.toggle('mir', v); $('#mirror').textContent = v ? 'ขวา' : 'ซ้าย'; $('#mirror').setAttribute('aria-label', 'ทิศทางภาพ ตอนนี้ ' + (v ? 'ขวาไปซ้าย (กลับด้าน)' : 'ซ้ายไปขวา (ปกติ)') + ' กดเพื่อสลับ'); $('#mirror').setAttribute('aria-pressed', v) }
  const vid = $('#vid');
  setMir(true);   /* กลับซ้าย-ขวาเป็นค่าเริ่มต้น (เหมือนกระจก) ปิดได้ด้วยปุ่ม */
  function stopCam() { stream && stream.getTracks().forEach(t => t.stop()); stream = null; vid.srcObject = null }
  function setTab(m) { const c = m === 'cam'; $('#drop').hidden = c; $('#cam').hidden = !c; c ? startCam() : stopCam() }
  function showSrc(m) { show('src'); $('#back').hidden = !S.bmp; setTab(m) }
  async function camFail(why) {
    setTab('file');
    const v = await Popup.open({
      icon: 'alert', tone: 'err', title: 'เปิดกล้องไม่ได้', body: why,
      actions: [{ label: 'ปิด', value: false }, { label: 'ใช้แอปกล้องของเครื่อง', primary: true, value: true }]
    });
    if (v) $('#shot').click();
  }
  const SIDE = { user: 'กล้องหน้า', environment: 'กล้องหลัง' }, OTHER = { user: 'environment', environment: 'user' };
  function paintFlip() { $('#flip').textContent = SIDE[facing]; $('#flip').setAttribute('aria-label', `กล้องที่ใช้ตอนนี้ ${SIDE[facing]} กดเพื่อสลับเป็น${SIDE[OTHER[facing]]}`) }
  /* ปุ่มแสดงกล้องที่ผู้ใช้เลือก (หน้า/หลัง) ถ้าเครื่องไม่มีกล้องฝั่งนั้น จะมีข้อความใต้ภาพบอกว่าใช้อีกฝั่งแทน */
  function setFacingUI(actual) {
    const n = $('#camnote'), base = n.textContent.split(' · ')[0], miss = (actual === 'user' || actual === 'environment') && actual !== facing;
    n.textContent = miss ? `${base} · อุปกรณ์นี้ไม่มี${SIDE[facing]} จึงใช้${SIDE[actual]}แทน` : base;
    paintFlip();
  }
  async function startCam() {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
      return camFail('เบราว์เซอร์นี้เปิดกล้องผ่านหน้าเว็บไม่ได้ หรือหน้าเว็บไม่ได้เปิดแบบ HTTPS คุณยังถ่ายด้วยแอปกล้องของเครื่องแล้วนำรูปเข้ามาได้');
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 4096 }, height: { ideal: 2160 } } });
      if ($('#cam').hidden) { st.getTracks().forEach(t => t.stop()); return }   // ผู้ใช้สลับแท็บไปแล้วระหว่างรออนุญาต
      stream = st; vid.srcObject = st; await vid.play().catch(() => { });
      try { /* ให้กล้องปรับโฟกัส แสง และสีขาวต่อเนื่อง ถ้ากล้องรองรับ */
        const tr = st.getVideoTracks()[0], cap = tr.getCapabilities ? tr.getCapabilities() : {}, adv = {};
        for (const k of ['focusMode', 'exposureMode', 'whiteBalanceMode']) if (cap[k] && cap[k].includes('continuous')) adv[k] = 'continuous';
        if (Object.keys(adv).length) tr.applyConstraints({ advanced: [adv] }).catch(() => { });
      } catch { }
      const t = st.getVideoTracks()[0].getSettings();   // เว็บแคมคอมไม่ระบุทิศ ถือเป็นกล้องหน้า
      $('#camnote').textContent = t.width ? `ความละเอียดกล้อง ${t.width}×${t.height} px` : '';
      setFacingUI(t.facingMode);
    } catch (e) {
      const m = {
        NotAllowedError: 'ไม่ได้รับอนุญาตให้ใช้กล้อง กดไอคอนข้างช่องที่อยู่เว็บเพื่ออนุญาต แล้วลองใหม่',
        NotFoundError: 'ไม่พบกล้องในเครื่องนี้', NotReadableError: 'กล้องถูกโปรแกรมอื่นใช้งานอยู่ ปิดโปรแกรมนั้นแล้วลองใหม่'
      }[e.name];
      camFail(m || 'เปิดกล้องไม่สำเร็จ (' + esc2(e && e.message || e) + ')');
    }
  }
  const esc2 = t => String(t).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  async function shoot() {
    if (!stream || !vid.videoWidth) return;
    let blob = null;
    /* ภาพนิ่งจากกล้องโดยตรง (ImageCapture) คมและไม่มีบล็อกบีบอัดวิดีโอ ถ้าไม่รองรับจึงจับเฟรมจากวิดีโอ */
    if (window.ImageCapture) {
      const ic = new ImageCapture(stream.getVideoTracks()[0]);
      try { const cp = await ic.getPhotoCapabilities(); blob = await ic.takePhoto(cp && cp.imageWidth && cp.imageHeight ? { imageWidth: cp.imageWidth.max, imageHeight: cp.imageHeight.max } : undefined) }
      catch { try { blob = await ic.takePhoto() } catch { blob = null } }
    }
    if (!blob) {
      const c = document.createElement('canvas'); c.width = vid.videoWidth; c.height = vid.videoHeight;
      c.getContext('2d').drawImage(vid, 0, 0);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .95));
    }
    if (!blob) return err('ถ่ายรูปไม่สำเร็จ', 'ลองถ่ายใหม่อีกครั้ง');
    if (mir) { /* ให้รูปที่บันทึกตรงกับที่เห็นบนจอ (กลับซ้าย-ขวา) */
      try {
        const bm = await createImageBitmap(blob), fc = document.createElement('canvas'); fc.width = bm.width; fc.height = bm.height;
        const fx = fc.getContext('2d'); fx.translate(bm.width, 0); fx.scale(-1, 1); fx.drawImage(bm, 0, 0); bm.close();
        blob = await new Promise(r => fc.toBlob(r, 'image/jpeg', .95)) || blob;
      } catch (e) { console.warn(e) }
    }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const f = new File([blob], `camera-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`, { type: blob.type || 'image/jpeg' });
    stopCam();
    if (!(await load(f, { crop: true, from: 'cam' }))) startCam();   // เปิดรูปไม่ได้ ให้กลับไปที่กล้องต่อ
  }

  $('#file').onchange = e => load(e.target.files[0]);
  $('#open').onclick = () => $('#file').click();
  $('#openCam').onclick = () => showSrc('cam');
  $('#camback').onclick = () => setTab('file'); $('#dFile').onclick = () => $('#file').click(); $('#dCam').onclick = () => showSrc('cam');
  $('#back').onclick = () => { stopCam(); show('stage') };
  $('#shoot').onclick = shoot;
  $('#mirror').onclick = () => setMir(!mir);
  $('#flip').onclick = () => { facing = OTHER[facing]; startCam() };
  $('#native').onclick = () => $('#shot').click();
  $('#shot').onchange = e => { load(e.target.files[0]); e.target.value = '' };
  addEventListener('pagehide', stopCam);
  const syncAI = () => { $('#aistr').hidden = document.querySelector('input[name=eng]:checked').value !== 'ai' };
  document.querySelectorAll('input[name=eng]').forEach(r => r.onchange = () => { syncAI(); update() });
  $('#dn').onchange = update; $('#enh').onchange = update; $('#ais').oninput = e => { $('#aisv').textContent = e.target.value + '%'; update() }; syncAI();
  if (!AI.supported()) { $('#engai').disabled = true; $('#engnote').textContent = 'เครื่องนี้ไม่รองรับ AI ในเครื่อง' }
  addEventListener('dragover', e => { e.preventDefault(); $('#drop').classList.add('on') });
  addEventListener('dragleave', () => $('#drop').classList.remove('on'));
  addEventListener('drop', e => { e.preventDefault(); $('#drop').classList.remove('on'); load(e.dataTransfer.files[0]) });
  $('#ang').oninput = e => { S.a = +e.target.value; update() };
  $('#auto').onclick = () => { S.a = detect(S.bmp); $('#ang').value = S.a; update() };
  $('#zero').onclick = () => { S.a = 0; $('#ang').value = 0; update() };
  $('#res').onchange = e => { $('#cw').hidden = e.target.value !== 'custom'; update() };
  $('#cw').oninput = update;
  $('#q').oninput = e => $('#qv').textContent = e.target.value;
  $('#fmt').onchange = e => { $('#q').hidden = $('#ql').hidden = e.target.value === 'png' };
  $('#save').onclick = save; $('#print').onclick = print;
  $('#clear').onclick = async () => { if (await Popup.open({ icon: 'trash', tone: 'err', title: 'ล้างรูปออกจากเว็บ?', body: 'รูปและผลลัพธ์ที่ยังไม่บันทึกจะหายไป ไฟล์ต้นฉบับในเครื่องไม่ถูกลบ', actions: [{ label: 'ยกเลิก', value: false }, { label: 'ล้างรูป', danger: true, primary: true, value: true }] })) reset() };
})();
