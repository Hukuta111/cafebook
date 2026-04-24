// ═══════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════

function canView(page) {
  if (_userRole === 'admin') return true;
  return !!(_userPermissions[page] && _userPermissions[page].view);
}
function canEdit(page) {
  if (_userRole === 'admin') return true;
  return !!(_userPermissions[page] && _userPermissions[page].edit);
}

function applyPermissions() {
  const isAdmin = _userRole === 'admin';
  // управление пользователями — только admin (перебиваем CSS .admin-only { display:none; })
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? 'flex' : 'none';
  });
  // показать/скрыть пункты сайдбара по view
  document.querySelectorAll('.nav-item[data-page]').forEach(el => {
    const page = el.dataset.page;
    if (page === 'users') return; // уже обработали .admin-only
    el.style.display = canView(page) ? 'flex' : 'none';
  });
  // скрыть/показать редактирующие кнопки по edit
  applyEditRestrictions();

  // если активная страница теперь недоступна — переключиться на разрешённую
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pageId = activePage.id.replace('page-', '');
    const allowed = pageId === 'users' ? isAdmin : canView(pageId);
    if (!allowed) {
      const firstAllowed = isAdmin ? 'dashboard' : PAGES_LIST.find(p => canView(p));
      if (firstAllowed) {
        const navEl = document.querySelector(`.nav-item[data-page="${firstAllowed}"]`);
        if (navEl) nav(navEl);
      } else {
        // нет доступа никуда — разлогинить
        showToast('У вас больше нет доступа', true);
        setTimeout(doLogout, 1500);
      }
    }
  }
}

function applyEditRestrictions() {
  // на каждой странице кнопки с data-edit-page → скрыть если нет edit
  document.querySelectorAll('[data-edit-page]').forEach(el => {
    const page = el.dataset.editPage;
    el.style.display = canEdit(page) ? '' : 'none';
  });
}

function applyRoleUI(role) { _userRole = role; applyPermissions(); }

function nav(el) {
  const page = el.dataset.page;
  // проверка прав
  if (page !== 'users' && !canView(page)) {
    showToast('Нет доступа к странице', true);
    return;
  }
  if (page === 'users' && _userRole !== 'admin') {
    showToast('Только для администратора', true);
    return;
  }
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  closeSidebar();
  applyEditRestrictions();
  const today_month = today().slice(0,7);
  if (page === 'dashboard') renderDashboard();
  if (page === 'transactions') { mpSetValue('txMonthPicker', today_month); renderTransactions(); }
  if (page === 'daily') { mpSetValue('dailyMonthPicker', today_month); renderDaily(); }
  if (page === 'monthly') renderMonthly();
  if (page === 'positions') renderPositions();
  if (page === 'employees') renderEmployees();
  if (page === 'salary') { mpSetValue('salMonthPicker', today_month); renderSalary(); }
  if (page === 'salary-report') renderSalaryReport();
  if (page === 'schedule') renderSchedule();
  if (page === 'banquets') renderBanquets();
  if (page === 'users') renderUsers();
  if (page === 'settings') renderSettings();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebarOverlay').classList.toggle('open'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('open'); }
