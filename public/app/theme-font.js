// ═══════════════════════════════════════════
// THEME & FONT SIZE
// ═══════════════════════════════════════════
function applyTheme(theme) {
  document.body.classList.remove('theme-light','theme-sepia');
  if (theme === 'light') document.body.classList.add('theme-light');
  else if (theme === 'sepia') document.body.classList.add('theme-sepia');
  localStorage.setItem('cb_theme', theme);
  // подсветить активную кнопку
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.theme === theme));
}

function applyFontSize(size) {
  document.body.classList.remove('font-small','font-medium','font-large','font-xlarge');
  document.body.classList.add('font-' + size);
  localStorage.setItem('cb_font', size);
  document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.font === size));
}

// один раз — оборачиваем тексты пунктов меню в span, чтобы можно было их скрывать и переводить
function wrapNavLabels() {
  document.querySelectorAll('.sidebar .nav-item').forEach(el => {
    if (el.querySelector('.nav-label')) return;
    const icon = el.querySelector('.icon');
    if (!icon) return;
    let text = '';
    let n = icon.nextSibling;
    const toRemove = [];
    while (n) { if (n.nodeType === Node.TEXT_NODE) text += n.textContent; toRemove.push(n); n = n.nextSibling; }
    toRemove.forEach(x => x.remove());
    const span = document.createElement('span');
    span.className = 'nav-label';
    if (el.dataset.page) span.setAttribute('data-i18n', 'nav.' + el.dataset.page);
    span.textContent = text.trim();
    el.appendChild(span);
  });
  // group labels — добавим data-i18n
  const groupKeys = ['overview','finance','staff','staff','staff','staff','staff','system'];
  let gi = 0;
  document.querySelectorAll('.sidebar .nav-group-label').forEach((el, idx) => {
    if (el.dataset.i18n) return;
    const txt = (el.textContent || '').trim().toLowerCase();
    const map = {'обзор':'overview','финансы':'finance','персонал':'staff','система':'system'};
    if (map[txt]) el.setAttribute('data-i18n', 'nav.' + map[txt]);
  });
}
