// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════
async function renderSettings() {
  const s = await API.get('/settings') || {};
  document.getElementById('settingCafeName').value = s.cafeName||'';
  document.getElementById('settingCurrency').value = s.currency||'₴';
  document.getElementById('settingRevenueThreshold').value = s.revenueThreshold||'';
  document.getElementById('settingScheduleTx').checked = s.scheduleTx === 'true';
  document.getElementById('settingHideSchedSum').checked = s.hideSchedSum === 'true';
  await loadSalTypes();
  renderSalTypesList();
  await loadTxCats();
  renderTxCatTabs();
  renderTxCatsList();
  await loadMasterPasswordCard();
}

// Применяет/снимает класс body.hide-sched-sum по сохранённому setting
function applyHideSchedSum(value) {
  document.body.classList.toggle('hide-sched-sum', value === 'true' || value === true);
}

// ═══════════════════════════════════════════
// SALARY TYPES (stored in settings as JSON)
// ═══════════════════════════════════════════
const BUILTIN_SAL_TYPES = [
  { id:'salary',  label:'Зарплата', sign:'-', builtin:true },
  { id:'advance', label:'Аванс',    sign:'-', builtin:true },
  { id:'bonus',   label:'Бонус',    sign:'-', builtin:true },
  { id:'fine',    label:'Штраф',    sign:'+', builtin:true },
];
let _salTypes = [];

// Оверрайды для встроенных типов выплат: { id: { label?, sign?, hidden? } }
let _salTypeOverrides = {};

async function loadSalTypes() {
  const s = await API.get('/settings') || {};
  try { _salTypes = JSON.parse(s.salTypes || '[]'); } catch { _salTypes = []; }
  try { _salTypeOverrides = JSON.parse(s.salTypeOverrides || '{}') || {}; } catch { _salTypeOverrides = {}; }
}

async function saveSalTypes() {
  await API.post('/settings', { salTypes: JSON.stringify(_salTypes), salTypeOverrides: JSON.stringify(_salTypeOverrides) });
}

function getAllSalTypes() {
  // применить оверрайды к built-in, отфильтровать скрытые
  const builtins = BUILTIN_SAL_TYPES
    .map(b => {
      const ov = _salTypeOverrides[b.id] || {};
      if (ov.hidden) return null;
      return { ...b, label: ov.label || b.label, sign: ov.sign || b.sign };
    })
    .filter(Boolean);
  return [...builtins, ..._salTypes];
}

function populateSalTypeSelect() {
  const sel = document.getElementById('salType');
  sel.innerHTML = getAllSalTypes().map(t =>
    `<option value="${t.id}">${t.label} (${t.sign === '+' ? '+' : '−'})</option>`
  ).join('');
}

function renderSalTypesList() {
  const list = document.getElementById('salTypesList');
  // покажем ВСЕ встроенные (даже скрытые), чтобы можно было восстановить
  const safeAttr = s => String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const builtinHtml = BUILTIN_SAL_TYPES.map(b => {
    const ov = _salTypeOverrides[b.id] || {};
    const isHidden = !!ov.hidden;
    const label = ov.label || b.label;
    const sign  = ov.sign  || b.sign;
    const isModified = !!(ov.label || ov.sign || ov.hidden);
    const restoreBtn = isModified
      ? `<button class="btn btn-sm" onclick="resetBuiltinSalType('${b.id}')" style="padding:3px 8px;font-size:11px" title="${t('settings.restore')}">↺</button>`
      : '';
    const hiddenStyle = isHidden ? 'opacity:.5;' : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);${hiddenStyle}">
      <input type="text" value="${safeAttr(label)}"
        style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;color:var(--text);font-size:13px;outline:none;"
        onchange="renameBuiltinSalType('${b.id}', this.value)">
      <select onchange="changeBuiltinSalTypeSign('${b.id}', this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 6px;color:var(--text);font-size:11px;outline:none;">
        <option value="-" ${sign!=='+'?'selected':''}>− ${t('settings.expense')}</option>
        <option value="+" ${sign==='+'?'selected':''}>+ ${t('settings.income')}</option>
      </select>
      <span class="badge badge-blue" style="font-size:11px" title="${t('settings.builtin')}">B</span>
      ${restoreBtn}
      <button class="btn btn-sm btn-danger" onclick="hideBuiltinSalType('${b.id}')" style="padding:3px 8px;font-size:11px">✕</button>
    </div>`;
  }).join('');

  const customHtml = _salTypes.map(c => {
    const safeName = safeAttr(c.label);
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
      <input type="text" value="${safeName}"
        style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;color:var(--text);font-size:13px;outline:none;"
        onchange="renameSalType('${c.id}',this.value)">
      <select onchange="changeSalTypeSign('${c.id}',this.value)" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 6px;color:var(--text);font-size:11px;outline:none;">
        <option value="-" ${c.sign!=='+'?'selected':''}>− ${t('settings.expense')}</option>
        <option value="+" ${c.sign==='+'?'selected':''}>+ ${t('settings.income')}</option>
      </select>
      <span class="badge badge-purple" style="font-size:11px" title="${t('settings.custom')}">C</span>
      <button class="btn btn-sm btn-danger" onclick="deleteSalType('${c.id}')" style="padding:3px 8px;font-size:11px">✕</button>
    </div>`;
  }).join('');

  list.innerHTML = builtinHtml + customHtml;
}

async function renameBuiltinSalType(id, newName) {
  newName = (newName || '').trim();
  if (!newName) { showToast(t('settings.txCatEmpty'), true); renderSalTypesList(); return; }
  const orig = BUILTIN_SAL_TYPES.find(x => x.id === id);
  if (!orig) return;
  if (!_salTypeOverrides[id]) _salTypeOverrides[id] = {};
  if (newName === orig.label) {
    delete _salTypeOverrides[id].label;
    if (!_salTypeOverrides[id].sign && !_salTypeOverrides[id].hidden) delete _salTypeOverrides[id];
  } else {
    _salTypeOverrides[id].label = newName;
  }
  await saveSalTypes();
  renderSalTypesList();
  showToast(t('settings.saved'));
}

async function changeBuiltinSalTypeSign(id, sign) {
  const orig = BUILTIN_SAL_TYPES.find(x => x.id === id);
  if (!orig) return;
  if (!_salTypeOverrides[id]) _salTypeOverrides[id] = {};
  if (sign === orig.sign) {
    delete _salTypeOverrides[id].sign;
    if (!_salTypeOverrides[id].label && !_salTypeOverrides[id].hidden) delete _salTypeOverrides[id];
  } else {
    _salTypeOverrides[id].sign = sign;
  }
  await saveSalTypes();
  renderSalTypesList();
  showToast(t('settings.saved'));
}

async function hideBuiltinSalType(id) {
  if (!await confirmDialog({ text: t('confirm.hidePayType') })) return;
  if (!_salTypeOverrides[id]) _salTypeOverrides[id] = {};
  _salTypeOverrides[id].hidden = true;
  await saveSalTypes();
  renderSalTypesList();
  showToast(t('settings.hidden'));
}

async function resetBuiltinSalType(id) {
  delete _salTypeOverrides[id];
  await saveSalTypes();
  renderSalTypesList();
  showToast(t('settings.restored'));
}

async function addSalType() {
  const input = document.getElementById('newSalTypeName');
  const name = input.value.trim();
  const sign = document.getElementById('newSalTypeSign').value;
  if (!name) { showToast('Введите название', true); return; }
  _salTypes.push({ id: uid(), label: name, sign: sign });
  await saveSalTypes();
  input.value = '';
  renderSalTypesList();
  showToast('Тип добавлен ✓');
}

async function renameSalType(id, newName) {
  newName = newName.trim();
  if (!newName) { showToast('Название не может быть пустым', true); return; }
  const t = _salTypes.find(t => t.id === id);
  if (t) { t.label = newName; await saveSalTypes(); showToast('Сохранено ✓'); }
}

async function changeSalTypeSign(id, sign) {
  const t = _salTypes.find(t => t.id === id);
  if (t) { t.sign = sign; await saveSalTypes(); renderSalTypesList(); showToast('Сохранено ✓'); }
}

async function deleteSalType(id) {
  if (!await confirmDialog({ text: t('confirm.delPayType') })) return;
  _salTypes = _salTypes.filter(x => x.id !== id);
  await saveSalTypes();
  renderSalTypesList();
  showToast('Удалено');
}

// ─── TRANSACTION CATEGORIES (settings) ───────────────────────
let _txCatActiveType = 'income';
const TX_CAT_TYPE_ORDER = ['income','expense','salary','advance','bonus','fine'];

function renderTxCatTabs() {
  const cont = document.getElementById('txCatTypeTabs');
  if (!cont) return;
  cont.innerHTML = TX_CAT_TYPE_ORDER.map(type => {
    const isActive = type === _txCatActiveType;
    const cls = 'btn btn-sm' + (isActive ? ' btn-primary' : '');
    return `<button class="${cls}" onclick="selectTxCatType('${type}')">${t('tx.'+type)}</button>`;
  }).join('');
}

function selectTxCatType(type) {
  _txCatActiveType = type;
  renderTxCatTabs();
  renderTxCatsList();
}

function renderTxCatsList() {
  const list = document.getElementById('txCatsList');
  if (!list) return;
  const type = _txCatActiveType;
  const builtin = BUILTIN_TX_CATS[type] || [];
  const overrides = (_txCatOverrides[type] || {});
  const custom  = _txCats[type] || [];

  const safeAttr = s => String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const builtinHtml = builtin.map(orig => {
    const ov = overrides[orig] || {};
    const isHidden = !!ov.hidden;
    const display = ov.newName || orig;
    const isModified = !!ov.newName || isHidden;
    const safeDisplay = safeAttr(display);
    const safeOrig = safeAttr(orig);
    const restoreBtn = isModified
      ? `<button class="btn btn-sm" onclick="resetBuiltinTxCat('${safeOrig}')" style="padding:3px 8px;font-size:11px" title="${t('settings.restore')}">↺</button>`
      : '';
    const hiddenStyle = isHidden ? 'opacity:.5;' : '';
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);${hiddenStyle}">
      <input type="text" value="${safeDisplay}"
        style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;color:var(--text);font-size:13px;outline:none;"
        onchange="renameBuiltinTxCat('${safeOrig}', this.value)">
      <span class="badge badge-blue" style="font-size:11px" title="${t('settings.builtin')}">B</span>
      ${restoreBtn}
      <button class="btn btn-sm btn-danger" onclick="hideBuiltinTxCat('${safeOrig}')" style="padding:3px 8px;font-size:11px">✕</button>
    </div>`;
  }).join('');

  const customHtml = custom.map(c => {
    const safe = safeAttr(c.label);
    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
      <input type="text" value="${safe}"
        style="flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;color:var(--text);font-size:13px;outline:none;"
        onchange="renameTxCat('${c.id}', this.value)">
      <span class="badge badge-purple" style="font-size:11px" title="${t('settings.custom')}">C</span>
      <button class="btn btn-sm btn-danger" onclick="deleteTxCat('${c.id}')" style="padding:3px 8px;font-size:11px">✕</button>
    </div>`;
  }).join('');

  list.innerHTML = (builtinHtml + customHtml) ||
    `<div style="color:var(--text3);font-size:12px;padding:8px 0;">${t('settings.noTxCats')}</div>`;
  const ph = document.getElementById('newTxCatName');
  if (ph) ph.placeholder = t('settings.newTxCat');
}

async function renameBuiltinTxCat(originalName, newName) {
  newName = (newName || '').trim();
  if (!newName) { showToast(t('settings.txCatEmpty'), true); renderTxCatsList(); return; }
  if (!_txCatOverrides[_txCatActiveType]) _txCatOverrides[_txCatActiveType] = {};
  // если новое имя совпадает с оригиналом — снимаем оверрайд
  if (newName === originalName) {
    if (_txCatOverrides[_txCatActiveType][originalName]) {
      delete _txCatOverrides[_txCatActiveType][originalName].newName;
      // если объект пустой — удаляем
      if (!_txCatOverrides[_txCatActiveType][originalName].hidden) {
        delete _txCatOverrides[_txCatActiveType][originalName];
      }
    }
  } else {
    _txCatOverrides[_txCatActiveType][originalName] = {
      ..._txCatOverrides[_txCatActiveType][originalName],
      newName,
    };
  }
  await saveTxCats();
  renderTxCatsList();
  showToast(t('settings.saved'));
}

async function hideBuiltinTxCat(originalName) {
  if (!await confirmDialog({ text: t('confirm.hideTxCat') })) return;
  if (!_txCatOverrides[_txCatActiveType]) _txCatOverrides[_txCatActiveType] = {};
  _txCatOverrides[_txCatActiveType][originalName] = {
    ..._txCatOverrides[_txCatActiveType][originalName],
    hidden: true,
  };
  await saveTxCats();
  renderTxCatsList();
  showToast(t('settings.hidden'));
}

async function resetBuiltinTxCat(originalName) {
  if (_txCatOverrides[_txCatActiveType]) {
    delete _txCatOverrides[_txCatActiveType][originalName];
  }
  await saveTxCats();
  renderTxCatsList();
  showToast(t('settings.restored'));
}

async function addTxCat() {
  const input = document.getElementById('newTxCatName');
  const name = (input.value || '').trim();
  if (!name) { showToast(t('settings.txCatEmpty'), true); return; }
  // запрет на дубликат с built-in или существующим custom
  const existing = getCategoriesForType(_txCatActiveType);
  if (existing.some(x => x.toLowerCase() === name.toLowerCase())) {
    showToast(t('settings.txCatDup'), true); return;
  }
  if (!_txCats[_txCatActiveType]) _txCats[_txCatActiveType] = [];
  _txCats[_txCatActiveType].push({ id: uid(), label: name });
  await saveTxCats();
  input.value = '';
  renderTxCatsList();
  showToast(t('settings.txCatAdded'));
}

async function renameTxCat(id, newName) {
  newName = (newName || '').trim();
  if (!newName) { showToast(t('settings.txCatEmpty'), true); renderTxCatsList(); return; }
  // не разрешаем превратить кастомную в дубликат built-in
  const builtin = BUILTIN_TX_CATS[_txCatActiveType] || [];
  if (builtin.some(b => b.toLowerCase() === newName.toLowerCase())) {
    showToast(t('settings.txCatDup'), true); renderTxCatsList(); return;
  }
  const cat = (_txCats[_txCatActiveType] || []).find(c => c.id === id);
  if (!cat) return;
  cat.label = newName;
  await saveTxCats();
  showToast(t('settings.saved'));
}

async function deleteTxCat(id) {
  if (!await confirmDialog({ text: t('confirm.delTxCat') })) return;
  _txCats[_txCatActiveType] = (_txCats[_txCatActiveType] || []).filter(c => c.id !== id);
  await saveTxCats();
  renderTxCatsList();
  showToast(t('settings.deleted'));
}

async function saveSettings() {
  const cafeName = document.getElementById('settingCafeName').value;
  const currency = document.getElementById('settingCurrency').value;
  const revenueThreshold = document.getElementById('settingRevenueThreshold').value;
  const scheduleTx = document.getElementById('settingScheduleTx').checked ? 'true' : 'false';
  const hideSchedSum = document.getElementById('settingHideSchedSum').checked ? 'true' : 'false';
  const res = await API.post('/settings', { cafeName, currency, revenueThreshold, scheduleTx, hideSchedSum });
  if (res && res.ok) {
    _currency = currency;
    const sub = document.getElementById('cafeNameSub');
    if (cafeName) { sub.textContent = cafeName; sub.removeAttribute('data-i18n'); }
    else { sub.setAttribute('data-i18n', 'login.title'); sub.textContent = t('login.title'); }
    if (cafeName) document.title = cafeName + ' — CaféBook';
    applyHideSchedSum(hideSchedSum);
    showToast('Настройки сохранены ✓');
  }
}

async function exportData() {
  showLoader(true);
  const res = await fetch('/api/export', { headers: API.headers() });
  const data = await res.json();
  showLoader(false);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cafebook-backup-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Экспорт выполнен ✓');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    const res = await API.post('/import', data);
    if (res && res.ok) {
      showToast('Данные импортированы ✓');
      _employees = await API.get('/employees') || [];
      renderDashboard();
    }
  } catch { showToast('Ошибка чтения файла', true); }
  event.target.value = '';
}
