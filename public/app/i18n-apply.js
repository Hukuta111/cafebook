function applyLanguage(lang) {
  if (!I18N[lang]) lang = 'ru';
  _lang = lang;
  localStorage.setItem('cb_lang', lang);
  document.documentElement.setAttribute('lang', lang);
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.lang === lang));
  // обновить все month picker'ы (метки и сетки месяцев)
  if (typeof _monthPickers === 'object') {
    Object.keys(_monthPickers).forEach(id => {
      const p = _monthPickers[id];
      const lbl = document.getElementById(id + '_label');
      if (lbl) lbl.textContent = monthLabel(p.value);
      try { mpRenderGrid(id); } catch {}
    });
  }
  // обновить все date range picker'ы (если они хранятся)
  if (typeof _dateRangePickers === 'object') {
    Object.keys(_dateRangePickers).forEach(id => {
      try { drpUpdateLabel(id); } catch {}
    });
  }
  // перерендерить активную страницу — обновятся динамические тексты
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const id = activePage.id.replace('page-', '');
    try {
      if (id === 'dashboard' && typeof renderDashboard === 'function') renderDashboard();
      else if (id === 'transactions' && typeof renderTransactions === 'function') renderTransactions();
      else if (id === 'daily' && typeof renderDaily === 'function') renderDaily();
      else if (id === 'monthly' && typeof renderMonthly === 'function') renderMonthly();
      else if (id === 'positions' && typeof renderPositions === 'function') renderPositions();
      else if (id === 'employees' && typeof renderEmployees === 'function') renderEmployees();
      else if (id === 'salary' && typeof renderSalary === 'function') renderSalary();
      else if (id === 'salary-report' && typeof renderSalaryReport === 'function') renderSalaryReport();
      else if (id === 'schedule' && typeof renderSchedule === 'function') renderSchedule();
      else if (id === 'banquets' && typeof renderBanquets === 'function') renderBanquets();
      else if (id === 'users' && typeof renderUsers === 'function') renderUsers();
    } catch {}
  }
}

function toggleSidebarCollapse() {
  wrapNavLabels();
  const collapsed = document.body.classList.toggle('sidebar-collapsed');
  localStorage.setItem('cb_sidebar_collapsed', collapsed ? '1' : '0');
}

// применить сохранённые настройки сразу при загрузке
(function() {
  const theme = localStorage.getItem('cb_theme') || 'dark';
  const font = localStorage.getItem('cb_font') || 'medium';
  if (theme !== 'dark') document.body.classList.add('theme-' + theme);
  document.body.classList.add('font-' + font);
  if (localStorage.getItem('cb_sidebar_collapsed') === '1') {
    document.body.classList.add('sidebar-collapsed');
  }
  // язык
  _lang = localStorage.getItem('cb_lang') || 'ru';
  document.documentElement.setAttribute('lang', _lang);
  // обернуть тексты пунктов меню для нормальной работы свёрнутого режима
  setTimeout(() => { wrapNavLabels(); applyLanguage(_lang); }, 0);
  // обновить состояние кнопок когда DOM готов
  setTimeout(() => {
    document.querySelectorAll('.theme-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.theme === theme));
    document.querySelectorAll('.font-btn').forEach(b => b.classList.toggle('btn-primary', b.dataset.font === font));
  }, 0);
})();
