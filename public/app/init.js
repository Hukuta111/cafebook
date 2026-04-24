// ═══════════════════════════════════════════
// INITIAL DATA LOAD
// ═══════════════════════════════════════════
async function loadInitialData() {
  try {
    const [settings, emps, positions] = await Promise.all([
      API.get('/settings'),
      API.get('/employees'),
      API.get('/positions'),
    ]);
    _currency = (settings && settings.currency) || '₴';
    _employees = emps || [];
    _positions = positions || [];
    try { _salTypes = JSON.parse((settings && settings.salTypes) || '[]'); } catch { _salTypes = []; }
    try {
      const parsed = JSON.parse((settings && settings.txCategories) || '{}');
      _txCats = { income:[], expense:[], salary:[], advance:[], bonus:[], fine:[] };
      Object.keys(_txCats).forEach(k => { if (Array.isArray(parsed[k])) _txCats[k] = parsed[k].filter(c=>c&&c.label); });
    } catch { _txCats = { income:[], expense:[], salary:[], advance:[], bonus:[], fine:[] }; }
    try { _txCatOverrides = JSON.parse((settings && settings.txCatOverrides) || '{}') || {}; } catch { _txCatOverrides = {}; }
    if (settings && settings.cafeName) {
      const sub = document.getElementById('cafeNameSub');
      sub.textContent = settings.cafeName;
      sub.removeAttribute('data-i18n');
      document.title = settings.cafeName + ' — CaféBook';
    }
  } catch(e) {
    console.error('loadInitialData error:', e);
  }
  showLoader(false);
  // открыть первую доступную страницу
  if (canView('dashboard')) {
    await renderDashboard();
  } else {
    const firstAllowed = PAGES_LIST.find(p => canView(p));
    if (firstAllowed) {
      const navEl = document.querySelector(`.nav-item[data-page="${firstAllowed}"]`);
      if (navEl) nav(navEl);
    }
  }
}
