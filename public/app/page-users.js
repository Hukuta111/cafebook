// ═══════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════
function openUserModal(user) {
  document.getElementById('userModalTitle').textContent = user ? t('user.edit') : t('user.new');
  document.getElementById('uEditId').value = user ? user.id : '';
  document.getElementById('uUsername').value = user ? user.username : '';
  document.getElementById('uUsername').disabled = !!user;
  document.getElementById('uDisplayName').value = user ? (user.displayName || user.username) : '';
  document.getElementById('uRole').value = user ? user.role : 'user';
  document.getElementById('uPassword').value = '';
  document.getElementById('uPassword2').value = '';
  document.getElementById('uMasterPassword').value = '';
  document.getElementById('uMasterRow').style.display = 'none';
  document.getElementById('uPassLabel').textContent = user
    ? t('user.passwordEdit')
    : t('user.password');

  renderPermissionsUI(user ? (user.permissions || defaultPermissions()) : defaultPermissions());
  toggleUserPermsUI();
  // подгрузим статус мастер-пароля для подсказки
  refreshMasterPasswordStatus();
  openModal('userModal');
}

const PAGE_LABELS = {
  'dashboard':'Дашборд','transactions':'Транзакции','daily':'Дневные отчёты',
  'monthly':'Месячные отчёты','positions':'Должности','employees':'Сотрудники',
  'salary':'Зарплата и выплаты','salary-report':'Отчёт по зарплате',
  'schedule':'График работы','banquets':'Банкеты','settings':'Настройки'
};
const PAGES_LIST = Object.keys(PAGE_LABELS);

function defaultPermissions() {
  const p = {};
  PAGES_LIST.forEach(page => { p[page] = { view: true, edit: false }; });
  return p;
}

function renderPermissionsUI(perms) {
  const list = document.getElementById('uPermsList');
  // глобальные кнопки сверху + table-like layout с обычными чекбоксами
  list.innerHTML = `
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border);">
      <button type="button" class="perm-preset" onclick="setAllPerms('none')">${t('user.permNone')}</button>
      <button type="button" class="perm-preset" onclick="setAllPerms('view')">${t('user.permView')}</button>
      <button type="button" class="perm-preset" onclick="setAllPerms('edit')">${t('user.permEdit')}</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 56px 56px;gap:10px;padding:6px 0 8px;border-bottom:1px solid var(--border);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;">
      <span data-i18n="col.page">Страница</span>
      <span style="text-align:center" data-i18n="user.permViewCol">👁 Просмотр</span>
      <span style="text-align:center" data-i18n="user.permEditCol">✎ Редактирование</span>
    </div>
  ` + PAGES_LIST.map(page => {
    const p = perms[page] || { view:false, edit:false };
    return `<div style="display:grid;grid-template-columns:1fr 56px 56px;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);align-items:center;">
      <span style="font-size:13px">${PAGE_LABELS[page]}</span>
      <label class="perm-cb" style="justify-self:center" title="${t('user.permView')}">
        <input type="checkbox" data-perm-view="${page}" ${p.view ? 'checked' : ''} onchange="onPermViewChange('${page}')">
        <span class="perm-cb-box"></span>
      </label>
      <label class="perm-cb" style="justify-self:center" title="${t('user.permEdit')}">
        <input type="checkbox" data-perm-edit="${page}" ${p.edit ? 'checked' : ''} onchange="onPermEditChange('${page}')">
        <span class="perm-cb-box"></span>
      </label>
    </div>`;
  }).join('');
}

// Включить «Редактирование» → автоматически включается «Просмотр»
function onPermEditChange(page) {
  const editCb = document.querySelector(`[data-perm-edit="${page}"]`);
  const viewCb = document.querySelector(`[data-perm-view="${page}"]`);
  if (editCb && editCb.checked && viewCb && !viewCb.checked) viewCb.checked = true;
}
// Выключить «Просмотр» → автоматически выключается «Редактирование»
function onPermViewChange(page) {
  const editCb = document.querySelector(`[data-perm-edit="${page}"]`);
  const viewCb = document.querySelector(`[data-perm-view="${page}"]`);
  if (viewCb && !viewCb.checked && editCb && editCb.checked) editCb.checked = false;
}
// Кнопки массовой настройки: всем страницам разом
function setAllPerms(level) {
  PAGES_LIST.forEach(page => {
    const viewCb = document.querySelector(`[data-perm-view="${page}"]`);
    const editCb = document.querySelector(`[data-perm-edit="${page}"]`);
    if (!viewCb || !editCb) return;
    viewCb.checked = level === 'view' || level === 'edit';
    editCb.checked = level === 'edit';
  });
}

function collectPermissionsFromUI() {
  const p = {};
  PAGES_LIST.forEach(page => {
    const view = document.querySelector(`[data-perm-view="${page}"]`)?.checked === true;
    const edit = document.querySelector(`[data-perm-edit="${page}"]`)?.checked === true;
    p[page] = { view: view || edit, edit };
  });
  return p;
}

function toggleUserPermsUI() {
  const role = document.getElementById('uRole').value;
  document.getElementById('uPermsBlock').style.display = role === 'admin' ? 'none' : '';
}

// показать/скрыть поле мастер-пароля в модалке: только если редактируем
// чужого пользователя, ввели пароль и мастер-пароль настроен на сервере
let _masterPasswordIsSet = false;
function updateMasterPassRow() {
  const editId = document.getElementById('uEditId').value;
  const password = document.getElementById('uPassword').value;
  const myUsername = sessionStorage.getItem('cb_user') || '';
  const editingUsername = document.getElementById('uUsername').value;
  const isEditingOther = !!editId && editingUsername && editingUsername !== myUsername;
  const need = isEditingOther && !!password && _masterPasswordIsSet;
  document.getElementById('uMasterRow').style.display = need ? '' : 'none';
  if (!need) document.getElementById('uMasterPassword').value = '';
}

async function refreshMasterPasswordStatus() {
  if (_userRole !== 'admin') return;
  try {
    const r = await API.get('/master-password/status');
    _masterPasswordIsSet = !!(r && r.isSet);
  } catch { _masterPasswordIsSet = false; }
}

async function saveUser() {
  const editId = document.getElementById('uEditId').value;
  const username = document.getElementById('uUsername').value.trim();
  const displayName = document.getElementById('uDisplayName').value.trim();
  const role = document.getElementById('uRole').value;
  const password = document.getElementById('uPassword').value;
  const password2 = document.getElementById('uPassword2').value;
  const masterPassword = document.getElementById('uMasterPassword').value;
  const permissions = role === 'admin' ? null : collectPermissionsFromUI();

  if (!editId && !username) { showToast('Введите логин', true); return; }
  if (!editId && !password) { showToast('Введите пароль', true); return; }
  if (password && password !== password2) { showToast('Пароли не совпадают', true); return; }

  // если поле мастер-пароля видно — оно обязательно
  const masterRowVisible = document.getElementById('uMasterRow').style.display !== 'none';
  if (masterRowVisible && !masterPassword) {
    showToast(t('mp.required'), true);
    return;
  }

  let res;
  if (editId) {
    const body = { displayName, role, permissions };
    if (password) body.newPassword = password;
    if (masterPassword) body.masterPassword = masterPassword;
    res = await API.put('/users/' + editId, body);
  } else {
    res = await API.post('/users', { username, displayName, password, role, permissions });
  }

  if (res && res.ok) {
    closeModal('userModal');
    renderUsers();
    showToast(editId ? 'Пользователь обновлён ✓' : 'Пользователь создан ✓');
  } else if (res) {
    if (res.needMaster) {
      // сервер сказал что нужен/неверен мастер-пароль — обновим статус и покажем поле
      _masterPasswordIsSet = true;
      updateMasterPassRow();
    }
    showToast(res.error || 'Ошибка', true);
  }
}

// настройка мастер-пароля
async function loadMasterPasswordCard() {
  if (_userRole !== 'admin') {
    document.getElementById('masterPasswordCard').style.display = 'none';
    return;
  }
  document.getElementById('masterPasswordCard').style.display = '';
  await refreshMasterPasswordStatus();
  const status = document.getElementById('mpStatus');
  document.getElementById('mpCurrentRow').style.display = _masterPasswordIsSet ? '' : 'none';
  if (_masterPasswordIsSet) {
    status.innerHTML = '<span style="color:var(--green)">● ' + t('mp.statusSet') + '</span>';
  } else {
    status.innerHTML = '<span style="color:var(--text3)">○ ' + t('mp.statusNotSet') + '</span>';
  }
}

async function saveMasterPassword() {
  const currentMaster = document.getElementById('mpCurrent').value;
  const newMaster = document.getElementById('mpNew').value;
  const newMaster2 = document.getElementById('mpNew2').value;
  const adminPassword = document.getElementById('mpAdminPass').value;
  if (!newMaster || newMaster.length < 4) { showToast(t('mp.tooShort'), true); return; }
  if (newMaster !== newMaster2) { showToast(t('mp.mismatch'), true); return; }
  if (!adminPassword) { showToast(t('mp.adminPassRequired'), true); return; }
  const res = await API.post('/master-password/set', { currentMaster, newMaster, adminPassword });
  if (res && res.ok) {
    document.getElementById('mpCurrent').value = '';
    document.getElementById('mpNew').value = '';
    document.getElementById('mpNew2').value = '';
    document.getElementById('mpAdminPass').value = '';
    await loadMasterPasswordCard();
    showToast(t('mp.saved'));
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function kickUser(id, name) {
  const res = await API.post('/users/' + id + '/kick', {});
  if (res && res.ok) { renderUsers(); showToast(name + ' выведен из системы'); }
}

async function deleteUser(id, name) {
  if (!await confirmDialog({ text: t('confirm.delUser').replace('{name}', name), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/users/' + id);
  if (res && res.ok) { renderUsers(); showToast('Пользователь удалён'); }
  else if (res) showToast(res.error || 'Ошибка', true);
}

async function renderUsers() {
  const users = await API.get('/users');
  if (!users) return;
  const tbody = document.getElementById('usersTable');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state"><div class="icon">🔐</div><p>Нет пользователей</p></div></td></tr>';
    return;
  }
  const myUsername = sessionStorage.getItem('cb_user');
  tbody.innerHTML = users.map(u => {
    const isMe = u.username === myUsername;
    const onlineBadge = u.isOnline
      ? `<span class="badge badge-online">${t('status.online')}</span>`
      : `<span class="badge badge-offline">${t('status.offline')}</span>`;
    const roleBadge = u.role === 'admin'
      ? `<span class="badge badge-yellow">${t('emp.admin')}</span>`
      : `<span class="badge badge-blue">${t('emp.staff')}</span>`;
    const lastLogin = u.lastLoginAt
      ? new Date(u.lastLoginAt).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
      : '—';
    const escapedName = (u.displayName||u.username).replace(/"/g, '&quot;');
    const safeUser = JSON.stringify(u).replace(/"/g, '&quot;');
    const actions = isMe
      ? `<span style="color:var(--text3);font-size:12px">${t('status.it_is_you')}</span>`
      : '<div style="display:flex;gap:6px;">'
        + (u.isOnline ? '<button class="btn btn-sm btn-danger" onclick="kickUser(&quot;' + u.id + '&quot;,&quot;' + escapedName + '&quot;)" title="Выбить из системы">⏏ Выбить</button>' : '')
        + '<button class="btn btn-sm" onclick="openUserModal(' + safeUser + ')">✎</button>'
        + '<button class="btn btn-sm btn-danger" onclick="deleteUser(&quot;' + u.id + '&quot;,&quot;' + escapedName + '&quot;)">✕</button>'
        + '</div>';
    return '<tr>'
      + '<td><b>' + (u.displayName||u.username) + '</b>' + (isMe ? ' <span style="color:var(--text3);font-size:11px">(вы)</span>' : '') + '</td>'
      + '<td style="color:var(--text3);font-family:monospace">' + u.username + '</td>'
      + '<td>' + roleBadge + '</td>'
      + '<td>' + onlineBadge + '</td>'
      + '<td style="color:var(--text3)">' + lastLogin + '</td>'
      + '<td>' + actions + '</td>'
      + '</tr>';
  }).join('');
}
