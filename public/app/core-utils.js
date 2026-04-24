// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
let _currency = '₴';
let _employees = [];
let _userRole = 'user';
let _userPermissions = {};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function fmt(n) { return (n||0).toLocaleString('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function today() { return new Date().toISOString().slice(0,10); }
function monthOf(d) { return d ? d.slice(0,7) : ''; }
function dateLabel(d) {
  const dt = new Date(d + 'T00:00:00');
  return dt.getDate() + ' ' + t('mon.short.' + dt.getMonth()).toLowerCase();
}
function monthLabel(m) {
  if (!m) return '';
  const [y,mo] = m.split('-');
  return t('mon.full.' + (+mo-1)) + ' ' + y;
}
function showToast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}
function showLoader(v) { document.getElementById('loader').classList.toggle('show', v); }
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ─── красивый confirm-диалог ─────────────────────────────────
// confirmDialog({ text, hint, title, okText, danger })
function confirmDialog(opts) {
  if (typeof opts === 'string') opts = { text: opts };
  opts = opts || {};
  return new Promise(resolve => {
    const m = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const textEl  = document.getElementById('confirmText');
    const hintEl  = document.getElementById('confirmHint');
    const okBtn   = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');

    titleEl.textContent = opts.title || t('confirm.title');
    textEl.textContent  = opts.text  || t('confirm.text');
    hintEl.textContent  = opts.hint  || t('confirm.hint');
    hintEl.style.display = hintEl.textContent ? 'block' : 'none';
    okBtn.textContent   = opts.okText || t('common.delete');
    cancelBtn.textContent = opts.cancelText || t('common.cancel');
    okBtn.classList.toggle('btn-danger', opts.danger !== false);
    okBtn.classList.toggle('btn-primary', opts.danger === false);

    const cleanup = (val) => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      m.onclick = null;
      document.removeEventListener('keydown', onKey);
      m.classList.remove('open');
      resolve(val);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
      else if (e.key === 'Enter') cleanup(true);
    };
    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    m.onclick = (e) => { if (e.target === m) cleanup(false); };
    document.addEventListener('keydown', onKey);
    m.classList.add('open');
    setTimeout(() => okBtn.focus(), 50);
  });
}
