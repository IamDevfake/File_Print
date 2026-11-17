window.fmtT = s => s < 60 ? `${Math.max(1, Math.ceil(s))} วินาที` : `${Math.floor(s / 60)} นาที ${Math.ceil(s % 60)} วินาที`;
const Popup = (() => {
  const root = document.getElementById('popup-root');
  function open({ icon = 'info', tone = '', title, body = '', actions = [{ label: 'ตกลง', primary: true, value: true }], dismiss = true }) {
    let close;
    const pr = new Promise(res => {
      const last = document.activeElement, o = document.createElement('div'); o.className = 'ov';
      o.innerHTML = `<div class="dlg ${tone}" role="dialog" aria-modal="true" aria-labelledby="dt" tabindex="-1"><div class="dh"><span class="di">${ic(icon, 22)}</span><h2 id="dt">${title}</h2></div><div class="db"></div><div class="da"></div></div>`;
      const db = o.querySelector('.db'), da = o.querySelector('.da');
      typeof body === 'string' ? db.innerHTML = body : db.append(body);
      const key = e => { if (e.key === 'Escape' && dismiss) close(false) };
      close = v => { o.remove(); document.removeEventListener('keydown', key); last && last.focus && last.focus(); res(v) };
      actions.forEach(a => { const b = document.createElement('button'); b.className = 'btn' + (a.primary ? ' pri' : '') + (a.danger ? ' dng' : ''); b.textContent = a.label; b.onclick = () => close(typeof a.value === 'function' ? a.value() : a.value); da.append(b) });
      document.addEventListener('keydown', key);
      if (dismiss) o.addEventListener('mousedown', e => { if (e.target === o) close(false) });
      root.append(o); (da.querySelector('.pri') || o.firstChild).focus();
    });
    pr.close = v => close(v); return pr;
  }
  function progress(title) {
    const el = document.createElement('div'); el.innerHTML = '<div class="bar"><i></i></div><p class="pt" aria-live="polite"></p>';
    const bar = el.querySelector('i'), txt = el.querySelector('.pt'), pr = open({ icon: 'info', title, body: el, actions: [], dismiss: false });
    return { set(p, t, eta) { bar.style.width = p + '%'; txt.textContent = `${t} · ${Math.round(p)}%` + (eta != null ? ` · เหลือประมาณ ${fmtT(eta)}` : '') }, close: () => pr.close(true) };
  }
  return { open, progress };
})();
