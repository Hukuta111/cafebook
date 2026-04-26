// ═══════════════════════════════════════════
// WEBSOCKET (live updates)
// ═══════════════════════════════════════════
let _ws = null;
let _wsReconnectTimer = null;
let _wsPingTimer = null;

function startWebSocket() {
  stopWebSocket();
  if (!API.token) return;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = proto + '//' + location.host + '/ws';
  try {
    _ws = new WebSocket(url);
    _ws.addEventListener('open', () => {
      _ws.send(JSON.stringify({ type: 'auth', token: API.token }));
      // application-level ping каждые 25 сек, чтобы прокси не закрывал idle
      _wsPingTimer = setInterval(() => {
        if (_ws && _ws.readyState === 1) {
          try { _ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        }
      }, 25000);
    });
    _ws.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleWsMessage(msg);
      } catch {}
    });
    _ws.addEventListener('close', () => {
      if (_wsPingTimer) { clearInterval(_wsPingTimer); _wsPingTimer = null; }
      if (API.token) {
        // переподключение через 3 сек
        _wsReconnectTimer = setTimeout(startWebSocket, 3000);
      }
    });
    _ws.addEventListener('error', () => { try { _ws.close(); } catch {} });
  } catch(e) {
    console.warn('WS error:', e);
  }
}

function stopWebSocket() {
  if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
  if (_wsPingTimer) { clearInterval(_wsPingTimer); _wsPingTimer = null; }
  if (_ws) {
    try { _ws.close(); } catch {}
    _ws = null;
  }
}

// при закрытии вкладки/окна — попытаться корректно закрыть WS
window.addEventListener('beforeunload', () => {
  try { if (_ws) _ws.close(1000, 'page_unload'); } catch {}
});

async function handleWsMessage(msg) {
  if (msg.type === 'kicked' || msg.type === 'session_replaced') {
    stopWebSocket();
    stopSessionPoll();
    document.getElementById('sessionBanner').classList.add('show');
    return;
  }
  if (msg.type === 'perms_changed') {
    // права изменились — перезагрузить /me и применить
    try {
      const me = await API.get('/me');
      if (me && me.username) {
        _userRole = me.role;
        _userPermissions = me.permissions || {};
        sessionStorage.setItem('cb_role', me.role);
        sessionStorage.setItem('cb_perms', JSON.stringify(me.permissions || {}));
        applyPermissions();
        showToast('Ваши права доступа обновлены');
      }
    } catch {}
    return;
  }
  if (msg.type === 'users_changed') {
    // если открыта страница пользователей — обновить список
    const usersPage = document.getElementById('page-users');
    if (usersPage && usersPage.classList.contains('active') && _userRole === 'admin') {
      renderUsers();
    }
    return;
  }
  if (msg.type === 'data_changed') {
    handleDataChanged(msg.entity);
    return;
  }
}

// Маппинг: что нужно перерисовывать при изменении конкретной сущности.
// Если сейчас открыта страница из списка — она перерисовывается.
const _DATA_REFRESH_MAP = {
  transactions: ['dashboard','transactions','daily','monthly','salary','salary-report'],
  schedule:     ['schedule','salary-report'],
  banquets:     ['banquets','dashboard','daily','monthly','transactions','salary','salary-report'],
  employees:    ['employees','dashboard','transactions','daily','monthly','salary','salary-report','schedule','banquets'],
  positions:    ['positions','employees'],
  settings:     ['settings','dashboard','transactions','daily','monthly','salary','salary-report','schedule','banquets'],
  reasons:      ['transactions','salary'],
};

function handleDataChanged(entity) {
  const activePage = document.querySelector('.page.active');
  if (!activePage) return;
  const pageId = activePage.id.replace('page-','');
  const pages = _DATA_REFRESH_MAP[entity] || [];
  if (!pages.includes(pageId)) return;
  // Не дёргаем перерисовку пока пользователь редактирует что-то в модалке —
  // populateEmpSelects и т.п. сбросили бы введённые значения. Пометим pending
  // и перерисуем как только модалка закроется.
  if (document.querySelector('.modal-overlay.open')) {
    _pendingRerenderPage = pageId;
    return;
  }
  rerenderPageById(pageId);
}

let _pendingRerenderPage = null;

function rerenderPageById(pageId) {
  try {
    if (pageId === 'dashboard'      && typeof renderDashboard === 'function')     renderDashboard();
    else if (pageId === 'transactions'   && typeof renderTransactions === 'function')  renderTransactions();
    else if (pageId === 'daily'          && typeof renderDaily === 'function')         renderDaily();
    else if (pageId === 'monthly'        && typeof renderMonthly === 'function')       renderMonthly();
    else if (pageId === 'positions'      && typeof renderPositions === 'function')     renderPositions();
    else if (pageId === 'employees'      && typeof renderEmployees === 'function')     renderEmployees();
    else if (pageId === 'salary'         && typeof renderSalary === 'function')        renderSalary();
    else if (pageId === 'salary-report'  && typeof renderSalaryReport === 'function')  renderSalaryReport();
    else if (pageId === 'schedule'       && typeof renderSchedule === 'function')      renderSchedule();
    else if (pageId === 'banquets'       && typeof renderBanquets === 'function')      renderBanquets();
    else if (pageId === 'settings'       && typeof renderSettings === 'function')      renderSettings();
  } catch {}
}

// Обёртка над closeModal — после закрытия применяет отложенный rerender.
// Хук на оригинальную closeModal (определена в core-utils.js).
(function patchCloseModal() {
  if (typeof window === 'undefined') return;
  const original = window.closeModal;
  if (typeof original !== 'function' || original.__patched) return;
  window.closeModal = function(id) {
    original(id);
    if (_pendingRerenderPage) {
      const pageId = _pendingRerenderPage;
      _pendingRerenderPage = null;
      // даём короткий тик чтобы модалка успела закрыться визуально
      setTimeout(() => rerenderPageById(pageId), 50);
    }
  };
  window.closeModal.__patched = true;
})();
