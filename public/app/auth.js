// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  document.getElementById('loginError').textContent = '';
  showLoader(true);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    showLoader(false);
    if (!res.ok) { document.getElementById('loginError').textContent = data.error || 'Ошибка'; return; }
    API.token = data.token;
    sessionStorage.setItem('cb_token', data.token);
    sessionStorage.setItem('cb_user', data.username);
    sessionStorage.setItem('cb_role', data.role);
    sessionStorage.setItem('cb_perms', JSON.stringify(data.permissions || {}));
    _userRole = data.role;
    _userPermissions = data.permissions || {};
    document.getElementById('userNameDisplay').textContent = data.displayName || data.username;
    document.getElementById('loginScreen').classList.remove('show');
    document.getElementById('mainContent').style.display = '';
    // Предложить браузеру сохранить логин/пароль (Credential Management API).
    // Это даёт менеджеру паролей надёжный сигнал поверх submit-события формы.
    if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
      try {
        const cred = new window.PasswordCredential({
          id: username,
          password: password,
          name: data.displayName || username,
        });
        navigator.credentials.store(cred).catch(() => {});
      } catch {}
    }
    applyPermissions();
    startSessionPoll();
    startWebSocket();
    await loadInitialData();
  } catch(e) {
    showLoader(false);
    document.getElementById('loginError').textContent = 'Ошибка подключения к серверу';
  }
}

async function doLogout() {
  stopSessionPoll();
  stopWebSocket();
  if (API.token) {
    try { await fetch('/api/logout', { method:'POST', headers: API.headers() }); } catch {}
  }
  API.token = null;
  sessionStorage.removeItem('cb_token');
  sessionStorage.removeItem('cb_user');
  sessionStorage.removeItem('cb_role');
  sessionStorage.removeItem('cb_perms');
  _userRole = 'user';
  _userPermissions = {};
  document.getElementById('loginScreen').classList.add('show');
  document.getElementById('mainContent').style.display = 'none';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginUser').value = '';
}

async function tryAutoLogin() {
  const token = sessionStorage.getItem('cb_token');
  const user = sessionStorage.getItem('cb_user');
  if (!token) return;
  API.token = token;
  // verify token is valid
  showLoader(true);
  try {
    const meRes = await fetch('/api/me', { headers: API.headers() });
    if (meRes.status === 401) { doLogout(); return; }
    const me = await meRes.json().catch(() => null);
    if (!me || !me.username) { doLogout(); return; }
    API.token = token;
    _userRole = me.role;
    _userPermissions = me.permissions || {};
    sessionStorage.setItem('cb_role', me.role);
    sessionStorage.setItem('cb_perms', JSON.stringify(me.permissions || {}));
    document.getElementById('userNameDisplay').textContent = me.displayName || me.username;
    document.getElementById('loginScreen').classList.remove('show');
    document.getElementById('mainContent').style.display = '';
    applyPermissions();
    startSessionPoll();
    startWebSocket();
    await loadInitialData();
  } catch { doLogout(); } finally { showLoader(false); }
}

async function changePassword() {
  const oldPass = document.getElementById('oldPass').value;
  const newPass = document.getElementById('newPass').value;
  const newPass2 = document.getElementById('newPass2').value;
  if (!oldPass || !newPass) { showToast('Заполните все поля', true); return; }
  if (newPass !== newPass2) { showToast('Пароли не совпадают', true); return; }
  const res = await API.post('/change-password', { oldPassword: oldPass, newPassword: newPass });
  if (res && res.ok) {
    showToast('Пароль успешно изменён ✓');
    document.getElementById('oldPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('newPass2').value = '';
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

// ───────────────────────────────────────────
// Принудительная латиница в полях логина/пароля.
// Если у пользователя активна русская/украинская раскладка, вводимые
// кириллические буквы автоматически заменяются на латинские по позиции
// клавиши на QWERTY. Работает и для вставки из буфера обмена.
// ───────────────────────────────────────────
const _CYR_TO_LAT = {
  // Верхний ряд QWERTY
  'й':'q','ц':'w','у':'e','к':'r','е':'t','н':'y','г':'u','ш':'i','щ':'o','з':'p','х':'[','ъ':']','ї':']',
  'Й':'Q','Ц':'W','У':'E','К':'R','Е':'T','Н':'Y','Г':'U','Ш':'I','Щ':'O','З':'P','Х':'{','Ъ':'}','Ї':'}',
  // Средний ряд
  'ф':'a','ы':'s','і':'s','в':'d','а':'f','п':'g','р':'h','о':'j','л':'k','д':'l','ж':';','э':"'",'є':"'",
  'Ф':'A','Ы':'S','І':'S','В':'D','А':'F','П':'G','Р':'H','О':'J','Л':'K','Д':'L','Ж':':','Э':'"','Є':'"',
  // Нижний ряд
  'я':'z','ч':'x','с':'c','м':'v','и':'b','т':'n','ь':'m','б':',','ю':'.',
  'Я':'Z','Ч':'X','С':'C','М':'V','И':'B','Т':'N','Ь':'M','Б':'<','Ю':'>',
  // Прочие
  'ё':'`','Ё':'~','ґ':'`','Ґ':'~',
};
function _cyrToLat(s) {
  if (!s) return s;
  return s.replace(/[\u0400-\u04FF]/g, ch => _CYR_TO_LAT[ch] !== undefined ? _CYR_TO_LAT[ch] : ch);
}
function _attachLatinFix(el) {
  if (!el || el.dataset.latinFixed) return;
  el.dataset.latinFixed = '1';
  el.addEventListener('input', () => {
    const before = el.value;
    const after = _cyrToLat(before);
    if (before === after) return;
    let pos = null;
    try { pos = el.selectionStart; } catch {}
    el.value = after;
    if (pos !== null) { try { el.setSelectionRange(pos, pos); } catch {} }
  });
}
function setupLoginLatinFix() {
  // 1) Все поля с явной пометкой data-latin-only
  document.querySelectorAll('[data-latin-only]').forEach(_attachLatinFix);
  // 2) На всякий случай добавляем фикс на основные поля логина — они нужны
  //    до полной загрузки разметки.
  ['loginUser', 'loginPass'].forEach(id => _attachLatinFix(document.getElementById(id)));
}

// Переключение видимости пароля. Кнопка вызывает togglePassVisibility(this).
function togglePassVisibility(btn) {
  if (!btn) return;
  const input = btn.parentElement && btn.parentElement.querySelector('input');
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  btn.textContent = showing ? '👁' : '🙈';
  btn.setAttribute('aria-label', showing ? 'Показать пароль' : 'Скрыть пароль');
  btn.title = showing ? 'Показать пароль' : 'Скрыть пароль';
}
