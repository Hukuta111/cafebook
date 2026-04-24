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
}
