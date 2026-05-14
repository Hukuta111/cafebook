// ═══════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════
let _scheduleData = [];
let _scheduleMode = 'main';      // 'main' (общий) | 'personal' (мой/чужой черновик)
let _schedulePersonalOwner = ''; // '' = свой; admin может выбрать чужой user_id
let _scheduleCompareUser = '';   // user_id чей черновик показать ПОД основным графиком (admin only)

function isSchedulePersonalOnly() {
  // Админу всегда доступны оба режима
  if (_userRole === 'admin') return false;
  return !!(_userPermissions && _userPermissions.schedule && _userPermissions.schedule.personalOnly);
}

function setScheduleMode(mode) {
  // если стоит флаг «только личный» — main недоступен
  if (isSchedulePersonalOnly()) mode = 'personal';
  _scheduleMode = mode === 'personal' ? 'personal' : 'main';
  document.querySelectorAll('.sched-mode-btn').forEach(b => {
    b.classList.toggle('btn-primary', b.dataset.schedMode === _scheduleMode);
  });
  // Если только личный — спрятать кнопку «Общий график»
  const mainBtn = document.querySelector('.sched-mode-btn[data-sched-mode="main"]');
  if (mainBtn) mainBtn.style.display = isSchedulePersonalOnly() ? 'none' : '';
  const ownerSel = document.getElementById('schedPersonalOwner');
  const hint = document.getElementById('schedPersonalHint');
  const isPersonal = _scheduleMode === 'personal';
  // Подсказку показываем только когда у пользователя есть выбор между Общий/Мой
  if (hint) hint.style.display = (isPersonal && !isSchedulePersonalOnly()) ? '' : 'none';
  // селектор владельца виден только админу в режиме personal
  if (ownerSel) ownerSel.style.display = (isPersonal && _userRole === 'admin') ? '' : 'none';
  // в режиме personal сбрасываем выбор владельца на «себя»
  if (!isPersonal) _schedulePersonalOwner = '';
  // Кнопка «Сформировать выплаты» не для личного графика
  const genBtn = document.getElementById('schedGenTxBtn');
  if (genBtn && isPersonal) genBtn.style.display = 'none';
  // Кнопка «+ Смена» в режиме personal доступна всем (свой график) и админу (любой)
  refreshScheduleEditUI();
  if (typeof renderSchedule === 'function') renderSchedule();
}

// Обновляет visual-режим (cursor/+/btn) исходя из текущего режима графика
function refreshScheduleEditUI() {
  let canEditNow;
  if (_scheduleMode === 'main') {
    canEditNow = canEdit('schedule');
  } else {
    // personal: свой = всегда; чужой = только админ
    canEditNow = !_schedulePersonalOwner || _userRole === 'admin';
  }
  document.body.classList.toggle('no-schedule-edit', !canEditNow);
  const addBtn = document.querySelector('#page-schedule [onclick="openSchedModal()"]');
  if (addBtn) addBtn.style.display = canEditNow ? '' : 'none';
}

async function loadPersonalScheduleOwners(month) {
  if (_userRole !== 'admin') return;
  const ownerSel = document.getElementById('schedPersonalOwner');
  if (!ownerSel) return;
  try {
    const users = await API.get('/personal-schedule/users?month=' + encodeURIComponent(month)) || [];
    const me = sessionStorage.getItem('cb_user') || '';
    // Всегда есть «Мой» сверху
    let html = `<option value="">${t('schedMode.myOwn') || '👤 Мой'}</option>`;
    users.forEach(u => {
      if (u.username === me) return; // свой уже есть
      const label = (u.displayName || u.username) + ' (' + u.username + ')';
      html += `<option value="${u.id}">${label.replace(/"/g,'&quot;')}</option>`;
    });
    ownerSel.innerHTML = html;
    if (_schedulePersonalOwner) ownerSel.value = _schedulePersonalOwner;
  } catch {}
}

function onPersonalOwnerChange() {
  const ownerSel = document.getElementById('schedPersonalOwner');
  _schedulePersonalOwner = ownerSel?.value || '';
  refreshScheduleEditUI();
  if (typeof renderSchedule === 'function') renderSchedule();
}

function onScheduleCompareChange() {
  const sel = document.getElementById('schedCompareUser');
  _scheduleCompareUser = sel?.value || '';
  if (typeof renderSchedule === 'function') renderSchedule();
}

async function loadScheduleCompareUsers(month) {
  if (_userRole !== 'admin') return;
  const sel = document.getElementById('schedCompareUser');
  if (!sel) return;
  try {
    const users = await API.get('/personal-schedule/users?month=' + encodeURIComponent(month)) || [];
    let html = `<option value="">— ${t('schedMode.compareNone') || 'нет'} —</option>`;
    users.forEach(u => {
      const label = (u.displayName || u.username) + ' (' + u.username + ')';
      html += `<option value="${u.id}">${label.replace(/"/g,'&quot;')}</option>`;
    });
    sel.innerHTML = html;
    if (_scheduleCompareUser) sel.value = _scheduleCompareUser;
  } catch {}
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function dayOfWeek(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, day).getDay(); // 0=Sun
}

const SHORT_DAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

async function renderSchedule() {
  // Если у пользователя стоит флаг «только личный график» — форсим personal-режим
  if (isSchedulePersonalOnly() && _scheduleMode !== 'personal') {
    _scheduleMode = 'personal';
    document.querySelectorAll('.sched-mode-btn').forEach(b => {
      b.classList.toggle('btn-primary', b.dataset.schedMode === 'personal');
    });
  }
  // Если у юзера personalOnly — скрываем весь mode bar (кнопки и подсказку):
  // выбора нет, и кнопка «Мой график» показывать одну единственную опцию бессмысленно
  const modeBar = document.getElementById('scheduleModeBar');
  if (modeBar) modeBar.style.display = isSchedulePersonalOnly() ? 'none' : '';
  // Compare bar — только для админа в main-режиме
  const compareBar = document.getElementById('schedCompareBar');
  if (compareBar) {
    compareBar.style.display = (_userRole === 'admin' && _scheduleMode === 'main' && !isSchedulePersonalOnly())
      ? 'flex' : 'none';
  }

  _employees = await API.get('/employees') || [];
  _positions = await API.get('/positions') || [];
  // названия должностей, которые скрыты в графике
  const hiddenRoles = new Set(_positions.filter(p => +p.hidden_in_schedule).map(p => p.name));
  let active = _employees.filter(e =>
    e.status === 'active' &&
    !+e.hidden_in_schedule &&
    !hiddenRoles.has(e.role || '')
  );
  // применить сохранённый порядок из localStorage
  try {
    const saved = JSON.parse(localStorage.getItem('cb_sched_order') || '[]');
    if (Array.isArray(saved) && saved.length) {
      const byId = new Map(active.map(e => [e.id, e]));
      const ordered = [];
      saved.forEach(id => { if (byId.has(id)) { ordered.push(byId.get(id)); byId.delete(id); } });
      // новые сотрудники, которых нет в сохранённом порядке — в конце
      byId.forEach(e => ordered.push(e));
      active = ordered;
    }
  } catch {}

  // показать/скрыть кнопку формирования выплат:
  // только в режиме main И если включено в настройках И есть edit-право
  const settings = await API.get('/settings') || {};
  const genBtn = document.getElementById('schedGenTxBtn');
  if (genBtn) {
    const allowed = _scheduleMode === 'main' && settings.scheduleTx === 'true' && canEdit('schedule');
    genBtn.style.display = allowed ? '' : 'none';
  }

  if (!_monthPickers['schedMonthPicker']) createMonthPicker('schedMonthPicker', () => renderSchedule());
  const cur = today().slice(0,7);
  const month = _monthPickers['schedMonthPicker']?.value || cur;
  const numDays = daysInMonth(month);
  // обновим visibility кнопок/курсоров под текущий режим
  refreshScheduleEditUI();

  // выбор источника данных по режиму
  if (_scheduleMode === 'personal') {
    let url = '/personal-schedule?month=' + month;
    if (_schedulePersonalOwner) url += '&userId=' + encodeURIComponent(_schedulePersonalOwner);
    _scheduleData = await API.get(url) || [];
    // подгрузим список владельцев черновиков (для админа)
    loadPersonalScheduleOwners(month);
  } else {
    _scheduleData = await API.get('/schedule?month=' + month) || [];
  }

  // build lookup: key = empId_day -> entry
  const lookup = {};
  _scheduleData.forEach(s => {
    const day = parseInt(s.work_date.slice(8, 10));
    lookup[s.emp_id + '_' + day] = s;
  });

  const table = document.getElementById('scheduleTable');

  if (!active.length) {
    table.innerHTML = '<tr><td colspan="3"><div class="empty-state"><div class="icon">🗓</div><p>Нет активных сотрудников</p></div></td></tr>';
    return;
  }

  // colgroup: Сотрудник(auto) | days(equal) | Часы | Сумма(wider)
  let cols = '<colgroup><col style="width:100px">';
  for (let d = 1; d <= numDays; d++) cols += '<col>';
  cols += '<col style="width:40px"><col class="sum-col" style="width:75px"></colgroup>';

  // header
  let hdr = `<thead><tr><th class="emp-name-cell" style="text-align:left">${t('col.employee')}</th>`;
  for (let d = 1; d <= numDays; d++) {
    const dow = dayOfWeek(month, d);
    const isWeekend = dow === 0 || dow === 6;
    hdr += `<th style="${isWeekend ? 'color:var(--red);' : ''}">${d}<br>${t('wd.' + dow)}</th>`;
  }
  hdr += `<th>${t('sch.hours')}</th><th class="sum-col">${t('col.sum')}</th></tr></thead>`;

  // body
  let body = '<tbody>';
  const dayTotals = new Array(numDays).fill(0);
  let grandHours = 0, grandSum = 0;

  active.forEach(emp => {
    const empRate = emp.hourly_rate || 0;
    let totalHours = 0, totalSum = 0;

    const roleLabel = emp.role || EMP_TYPE_LABELS[emp.type] || '';
    const tabLabel = emp.tab_number ? ' <span style="color:var(--accent);font-family:monospace;font-size:10px;">№'+emp.tab_number+'</span>' : '';
    const nameCell = `<div style="display:flex;align-items:center;gap:6px;"><span class="drag-handle no-print" style="cursor:grab;color:var(--text3);font-size:14px;user-select:none;" title="Перетащите для изменения порядка">⋮⋮</span><div style="flex:1;"><div style="font-weight:600;line-height:1.1;">${emp.name}${tabLabel}</div>${roleLabel ? '<div style="color:var(--text3);font-size:10px;margin-top:2px;">'+roleLabel+'</div>' : ''}</div></div>`;
    body += `<tr draggable="true" data-emp-id="${emp.id}"><td class="emp-name-cell">${nameCell}</td>`;
    for (let d = 1; d <= numDays; d++) {
      const entry = lookup[emp.id + '_' + d];
      const dow = dayOfWeek(month, d);
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = month + '-' + String(d).padStart(2, '0');

      if (entry) {
        const rate = entry.hourly_rate != null ? entry.hourly_rate : empRate;
        const sum = entry.hours * rate;
        totalHours += entry.hours;
        totalSum += sum;
        dayTotals[d - 1] += entry.hours;
        body += `<td class="has-hours" onclick="openSchedModal(${JSON.stringify(entry).replace(/"/g,'&quot;')})" title="${entry.hours}ч × ${fmt(rate)} = ${fmt(sum)} ${_currency}${entry.note ? '\n' + entry.note : ''}">${entry.hours}</td>`;
      } else {
        body += `<td style="${isWeekend ? 'background:rgba(224,85,85,.05);' : ''}" onclick="openSchedModal(null,'${dateStr}','${emp.id}')"></td>`;
      }
    }
    grandHours += totalHours;
    grandSum += totalSum;
    body += `<td class="total-cell">${totalHours || ''}</td>`;
    body += `<td class="total-cell sum-col" style="color:var(--green)">${totalSum ? fmt(totalSum) : ''}</td>`;
    body += '</tr>';
  });

  // totals row
  body += `<tr class="totals-row"><td class="emp-name-cell">${t('sch.totalRow')}</td>`;
  for (let d = 0; d < numDays; d++) {
    body += `<td>${dayTotals[d] || ''}</td>`;
  }
  body += `<td>${grandHours || ''}</td><td class="sum-col"></td></tr>`;
  body += '</tbody>';

  table.innerHTML = `<div class="sched-print-title">${t('page.schedule')} — ${monthLabel(month)}</div>` + cols + hdr + body;

  // итог под таблицей
  let grandEl = document.getElementById('schedGrandTotal');
  if (!grandEl) {
    grandEl = document.createElement('div');
    grandEl.id = 'schedGrandTotal';
    grandEl.className = 'sched-grand-total';
    document.getElementById('scheduleWrap').after(grandEl);
  }
  grandEl.innerHTML = grandSum ? `${t('sch.totalHours')}: <b>${grandHours}</b><span class="sum-col"> &nbsp;|&nbsp; ${t('sch.totalSum')}: <b style="color:var(--green)">${fmt(grandSum)} ${_currency}</b></span>` : '';
  grandEl.style.display = grandSum ? 'block' : 'none';

  // drag & drop строк
  attachScheduleRowDnD(table);

  // Сравнение с черновиком другого пользователя (только админу в main-режиме)
  if (_userRole === 'admin' && _scheduleMode === 'main') {
    loadScheduleCompareUsers(month);
    await renderScheduleCompareTable(active, month, numDays);
  } else {
    // убрать compare-таблицу если она была
    const w = document.getElementById('scheduleCompareWrap');
    if (w) w.remove();
  }
}

// Read-only HTML таблицы графика без onclick/drag — для compare и similar usecases
function buildPlainScheduleTableHTML(active, lookup, numDays, month) {
  // colgroup (без sum-col — в личном графике ставки нет)
  let cols = '<colgroup><col style="width:100px">';
  for (let d = 1; d <= numDays; d++) cols += '<col>';
  cols += '<col style="width:40px"></colgroup>';

  let hdr = `<thead><tr><th class="emp-name-cell" style="text-align:left">${t('col.employee')}</th>`;
  for (let d = 1; d <= numDays; d++) {
    const dow = dayOfWeek(month, d);
    const isWeekend = dow === 0 || dow === 6;
    hdr += `<th style="${isWeekend ? 'color:var(--red);' : ''}">${d}<br>${t('wd.' + dow)}</th>`;
  }
  hdr += `<th>${t('sch.hours')}</th></tr></thead>`;

  let body = '<tbody>';
  const dayTotals = new Array(numDays).fill(0);
  let grandHours = 0;
  active.forEach(emp => {
    const roleLabel = emp.role || EMP_TYPE_LABELS[emp.type] || '';
    const tabLabel = emp.tab_number ? ' <span style="color:var(--accent);font-family:monospace;font-size:10px;">№'+emp.tab_number+'</span>' : '';
    const nameCell = `<div style="display:flex;align-items:center;gap:6px;"><div style="flex:1;"><div style="font-weight:600;line-height:1.1;">${emp.name}${tabLabel}</div>${roleLabel ? '<div style="color:var(--text3);font-size:10px;margin-top:2px;">'+roleLabel+'</div>' : ''}</div></div>`;
    body += `<tr><td class="emp-name-cell">${nameCell}</td>`;
    let totalHours = 0;
    for (let d = 1; d <= numDays; d++) {
      const entry = lookup[emp.id + '_' + d];
      const dow = dayOfWeek(month, d);
      const isWeekend = dow === 0 || dow === 6;
      if (entry) {
        totalHours += +entry.hours;
        dayTotals[d - 1] += +entry.hours;
        body += `<td class="has-hours" title="${entry.hours}ч${entry.note ? ' · ' + entry.note.replace(/"/g,'&quot;') : ''}">${entry.hours}</td>`;
      } else {
        body += `<td style="${isWeekend ? 'background:rgba(224,85,85,.05);' : ''}"></td>`;
      }
    }
    grandHours += totalHours;
    body += `<td class="total-cell">${totalHours || ''}</td></tr>`;
  });
  // итоговая строка
  body += `<tr class="totals-row"><td class="emp-name-cell">${t('sch.totalRow')}</td>`;
  for (let d = 0; d < numDays; d++) body += `<td>${dayTotals[d] || ''}</td>`;
  body += `<td>${grandHours || ''}</td></tr></tbody>`;

  return cols + hdr + body;
}

async function renderScheduleCompareTable(active, month, numDays) {
  // удалить предыдущий wrap чтобы не дублировался
  const existing = document.getElementById('scheduleCompareWrap');
  if (existing) existing.remove();
  if (!_scheduleCompareUser) return;

  let data = [];
  try {
    data = await API.get('/personal-schedule?month=' + month + '&userId=' + encodeURIComponent(_scheduleCompareUser)) || [];
  } catch { return; }

  const lookup = {};
  data.forEach(s => {
    const day = parseInt(s.work_date.slice(8, 10));
    lookup[s.emp_id + '_' + day] = s;
  });

  const sel = document.getElementById('schedCompareUser');
  const userLabel = (sel && sel.options[sel.selectedIndex]) ? sel.options[sel.selectedIndex].textContent : '';

  const wrap = document.createElement('div');
  wrap.id = 'scheduleCompareWrap';
  wrap.className = 'table-wrap no-print'; // не уходит в печать
  wrap.style.cssText = 'overflow-x:auto;margin-top:24px;';
  wrap.innerHTML = `
    <div style="padding:10px 14px;color:var(--text3);font-size:12px;background:var(--surface2);border-bottom:1px solid var(--border);">
      📝 ${t('schedMode.compareLabel') || 'Сравнить с черновиком:'} <b style="color:var(--text)">${userLabel.replace(/</g,'&lt;')}</b>
    </div>
    <table id="scheduleCompareTable">${buildPlainScheduleTableHTML(active, lookup, numDays, month)}</table>
  `;
  // вставляем после schedGrandTotal или scheduleWrap
  const after = document.getElementById('schedGrandTotal') || document.getElementById('scheduleWrap');
  after.after(wrap);
}

function attachScheduleRowDnD(table) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;
  let dragRow = null;
  tbody.querySelectorAll('tr[draggable="true"]').forEach(tr => {
    tr.addEventListener('dragstart', (e) => {
      dragRow = tr;
      tr.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    tr.addEventListener('dragend', () => {
      if (dragRow) dragRow.style.opacity = '';
      dragRow = null;
      tbody.querySelectorAll('tr').forEach(x => x.style.borderTop = '');
    });
    tr.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragRow || dragRow === tr) return;
      tbody.querySelectorAll('tr').forEach(x => x.style.borderTop = '');
      tr.style.borderTop = '2px solid var(--accent)';
    });
    tr.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragRow || dragRow === tr) return;
      tbody.insertBefore(dragRow, tr);
      // сохранить порядок
      const order = [...tbody.querySelectorAll('tr[draggable="true"]')].map(x => x.dataset.empId);
      localStorage.setItem('cb_sched_order', JSON.stringify(order));
    });
  });
}

function openSchedModal(entry, dateStr, empId) {
  // В режиме main — нужны edit-права на расписание.
  // В режиме personal: свой график можно редактировать всегда; чужой — только админ.
  if (_scheduleMode === 'main') {
    if (!canEdit('schedule')) return;
  } else {
    // personal: чужой = только админ
    if (_schedulePersonalOwner && _userRole !== 'admin') return;
  }
  populateEmpSelects();
  const empSel = document.getElementById('schedEmployee');
  // группируем по табельному номеру для совмещений (как в transaction/salary modal)
  const active = _employees.filter(e => e.status === 'active');
  const byTab = {}; const single = [];
  active.forEach(e => {
    const tab = e.tab_number ? String(e.tab_number).trim() : '';
    if (tab) { if (!byTab[tab]) byTab[tab] = []; byTab[tab].push(e); }
    else single.push(e);
  });
  let opts = '';
  single.forEach(e => {
    opts += `<option value="${e.id}">${e.name}${e.role ? ' ('+e.role+')' : ''}</option>`;
  });
  Object.entries(byTab).forEach(([tab, list]) => {
    if (list.length === 1) {
      const e = list[0];
      opts += `<option value="${e.id}">${e.name}${e.role ? ' ('+e.role+')' : ''} №${tab}</option>`;
    } else {
      opts += `<optgroup label="${list[0].name} №${tab}">`;
      list.forEach(e => {
        opts += `<option value="${e.id}">${e.role || EMP_TYPE_LABELS[e.type] || '—'}</option>`;
      });
      opts += '</optgroup>';
    }
  });
  empSel.innerHTML = opts;

  document.getElementById('schedModalTitle').textContent = entry ? t('sch.edit') : t('sch.new');
  document.getElementById('schedEditId').value = entry ? entry.id : '';
  document.getElementById('schedDate').value = entry ? entry.work_date : (dateStr || today());
  empSel.value = entry ? entry.emp_id : (empId || '');
  document.getElementById('schedHours').value = entry ? entry.hours : '';
  document.getElementById('schedRate').value = (entry && entry.hourly_rate != null) ? entry.hourly_rate : '';
  document.getElementById('schedNote').value = entry ? entry.note || '' : '';
  document.getElementById('schedDeleteBtn').style.display = entry ? '' : 'none';
  // В личном графике ставка не показывается — это просто черновик для сверки
  const rateRow = document.getElementById('schedRateRow');
  if (rateRow) rateRow.style.display = _scheduleMode === 'personal' ? 'none' : '';

  openModal('schedModal');
}

function _schedApiPath(path) {
  // в режиме personal все CRUD-вызовы летят на /personal-schedule/...
  return _scheduleMode === 'personal' ? path.replace(/^\/schedule/, '/personal-schedule') : path;
}

async function deleteScheduleFromModal() {
  const id = document.getElementById('schedEditId').value;
  if (!id) return;
  if (!await confirmDialog({ text: t('confirm.delShift') })) return;
  const res = await API.del(_schedApiPath('/schedule/' + id));
  if (res && res.ok) { closeModal('schedModal'); renderSchedule(); showToast('Смена удалена'); }
}

async function saveScheduleEntry() {
  const id = document.getElementById('schedEditId').value || uid();
  const emp_id = document.getElementById('schedEmployee').value;
  const work_date = document.getElementById('schedDate').value;
  const hours = parseFloat(document.getElementById('schedHours').value);
  const rateVal = document.getElementById('schedRate').value;
  // В личном графике ставка всегда null — он только для сверки часов
  const hourly_rate = (_scheduleMode === 'personal') ? null : (rateVal !== '' ? parseFloat(rateVal) : null);
  const note = document.getElementById('schedNote').value;

  if (!emp_id || !work_date || !hours || hours <= 0) { showToast('Заполните сотрудника, дату и часы', true); return; }

  const isEdit = !!document.getElementById('schedEditId').value;
  const data = { emp_id, work_date, hours, hourly_rate, note };
  // Если админ редактирует чужой личный график — указываем владельца
  if (_scheduleMode === 'personal' && _schedulePersonalOwner && _userRole === 'admin') {
    data.ownerUserId = _schedulePersonalOwner;
  }
  const res = isEdit
    ? await API.put(_schedApiPath('/schedule/' + id), data)
    : await API.post(_schedApiPath('/schedule'), { id, ...data });

  if (res && res.ok) {
    closeModal('schedModal');
    renderSchedule();
    showToast('Смена сохранена ✓');
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function deleteScheduleEntry(id) {
  if (!await confirmDialog({ text: t('confirm.delShift') })) return;
  const res = await API.del(_schedApiPath('/schedule/' + id));
  if (res && res.ok) { renderSchedule(); showToast('Удалено'); }
}

async function generateScheduleTx() {
  const cur = today().slice(0,7);
  const month = _monthPickers['schedMonthPicker']?.value || cur;
  const res = await API.post('/calc-schedule-tx', { month });
  if (res && res.ok) {
    if (res.created > 0) {
      const adv = res.advances || 0;
      const sal = res.salaries || 0;
      const parts = [];
      if (adv) parts.push(`аванс — ${adv}`);
      if (sal) parts.push(`зарплата — ${sal}`);
      showToast(`${monthLabel(month)}: ${parts.join(', ')} ✓`);
      // обновить график (ставки могли быть «заморожены» в сменах)
      renderSchedule();
    } else {
      showToast(res.message || 'Нет данных для формирования');
    }
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

function printSchedule() {
  // mark schedule page as print target
  document.querySelectorAll('.page').forEach(p => p.classList.remove('print-target'));
  document.getElementById('page-schedule').classList.add('print-target');
  document.documentElement.classList.add('print-schedule-mode');
  document.body.classList.add('print-schedule-mode');
  // мобильные браузеры (iOS Safari) не уважают @page size — для них принудительно
  // фиксируем ширину 287mm. На десктопе Chrome/Firefox это не нужно — у них @page работает,
  // и фикс 287mm только мешает (margin по умолчанию 12.7mm → реальная ширина другая)
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 900;
  if (isMobile) document.body.classList.add('print-schedule-mobile');
  injectPrintLandscapeStyle();

  // afterprint надёжнее setTimeout — снимаем классы сразу после закрытия диалога
  const cleanup = () => {
    document.getElementById('page-schedule').classList.remove('print-target');
    document.documentElement.classList.remove('print-schedule-mode');
    document.body.classList.remove('print-schedule-mode');
    document.body.classList.remove('print-schedule-mobile');
    removePrintLandscapeStyle();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // запасной fallback на случай если afterprint не сработает
  setTimeout(cleanup, 30000);

  window.print();
}

function injectPrintLandscapeStyle() {
  if (document.getElementById('printLandscapeStyle')) return;
  const style = document.createElement('style');
  style.id = 'printLandscapeStyle';
  style.textContent = '@media print { @page { size: A4 landscape; margin: 5mm; } }';
  document.head.appendChild(style);
}

function removePrintLandscapeStyle() {
  const s = document.getElementById('printLandscapeStyle');
  if (s) s.remove();
}

// ═══════════════════════════════════════════
// ПЕЧАТЬ ПУСТОГО ГРАФИКА (любой месяц, выбор сотрудников)
// ═══════════════════════════════════════════
let _sblnkList = []; // [{ id, name, tab_number, role, type, selected }]

async function openBlankSchedulePrintModal() {
  // Создаём пикер месяца с allowFuture при первом открытии
  if (!_monthPickers['schedBlankMonthPicker']) {
    createMonthPicker('schedBlankMonthPicker', null, { allowFuture: true });
    // По умолчанию — следующий месяц (типичный сценарий: распечатать на наступающий)
    const cur = today().slice(0, 7);
    const [y, m] = cur.split('-').map(Number);
    const nextDate = new Date(y, m, 1); // m уже след. месяц т.к. Date() 0-индексный
    const nextMonth = nextDate.getFullYear() + '-' + String(nextDate.getMonth() + 1).padStart(2, '0');
    mpSetValue('schedBlankMonthPicker', nextMonth);
  }
  // Подгружаем актуальный список сотрудников и должностей
  _employees = await API.get('/employees') || _employees || [];
  _positions = await API.get('/positions') || _positions || [];
  const hiddenRoles = new Set(_positions.filter(p => +p.hidden_in_schedule).map(p => p.name));
  const active = _employees.filter(e =>
    e.status === 'active' && !+e.hidden_in_schedule && !hiddenRoles.has(e.role || '')
  );
  _sblnkList = active.map(e => ({
    id: e.id,
    name: e.name,
    tab_number: e.tab_number,
    role: e.role || '',
    type: e.type || 'staff',
    selected: true,
  }));
  renderSblnkList();
  openModal('schedBlankModal');
}

function renderSblnkList() {
  // Группируем по должности (role); если пусто — «— не указана —»
  const groups = {};
  _sblnkList.forEach((item, idx) => {
    const key = item.role || '— ' + (t('emp.notSpecified') || 'не указана') + ' —';
    if (!groups[key]) groups[key] = [];
    groups[key].push({ item, idx });
  });
  const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ru'));
  const escAttr = (s) => String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const escJs = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const html = sortedKeys.map(role => {
    const items = groups[role];
    const allSel = items.every(({ item }) => item.selected);
    const selCount = items.filter(({ item }) => item.selected).length;
    const rows = items.map(({ item, idx }) => {
      const tab = item.tab_number ? ` <span style="color:var(--accent);font-family:monospace;font-size:11px;">№${item.tab_number}</span>` : '';
      return `<label class="toggle-row" style="cursor:pointer;background:var(--surface);">
        <div class="toggle-text">
          <span class="toggle-label">${item.name}${tab}</span>
        </div>
        <input type="checkbox" ${item.selected ? 'checked' : ''} onchange="_sblnkList[${idx}].selected=this.checked;renderSblnkList()">
        <span class="toggle-sw"></span>
      </label>`;
    }).join('');
    return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);flex-shrink:0;">
      <label style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border);user-select:none;">
        <input type="checkbox" ${allSel ? 'checked' : ''} onchange="sblnkToggleRole('${escJs(role)}', this.checked)">
        <span style="flex:1;font-weight:600;font-size:13px;">${role}</span>
        <span style="color:var(--text3);font-size:11px;font-family:monospace;">${selCount}/${items.length}</span>
      </label>
      <div style="padding:6px;display:flex;flex-direction:column;gap:4px;">${rows}</div>
    </div>`;
  }).join('');

  document.getElementById('schedBlankList').innerHTML = html;
  sblnkUpdateSummary();
}

function sblnkToggleAll(value) {
  _sblnkList.forEach(item => { item.selected = !!value; });
  renderSblnkList();
}

function sblnkToggleRole(role, value) {
  const noRoleKey = '— ' + (t('emp.notSpecified') || 'не указана') + ' —';
  _sblnkList.forEach(item => {
    const key = item.role || noRoleKey;
    if (key === role) item.selected = !!value;
  });
  renderSblnkList();
}

function sblnkUpdateSummary() {
  const sel = _sblnkList.filter(i => i.selected);
  const month = _monthPickers['schedBlankMonthPicker']?.value || today().slice(0, 7);
  const el = document.getElementById('schedBlankSummary');
  if (el) el.textContent = `Месяц: ${monthLabel(month)} · Выбрано сотрудников: ${sel.length}`;
}

// HTML пустой таблицы графика для печати
function buildBlankScheduleTableHTML(employees, monthValue) {
  const [y, m] = monthValue.split('-').map(Number);
  const numDays = new Date(y, m, 0).getDate();

  let cols = '<colgroup><col style="width:120px">';
  for (let d = 1; d <= numDays; d++) cols += '<col>';
  cols += '<col style="width:50px"></colgroup>';

  let hdr = `<thead><tr><th class="emp-name-cell" style="text-align:left">${t('col.employee')}</th>`;
  for (let d = 1; d <= numDays; d++) {
    const dow = dayOfWeek(monthValue, d);
    const isWeekend = dow === 0 || dow === 6;
    hdr += `<th style="${isWeekend ? 'color:var(--red);' : ''}">${d}<br>${t('wd.' + dow)}</th>`;
  }
  hdr += `<th>${t('sch.hours')}</th></tr></thead>`;

  let body = '<tbody>';
  employees.forEach(emp => {
    const role = emp.role || EMP_TYPE_LABELS[emp.type] || '';
    const tab = emp.tab_number ? ` <span style="color:var(--accent);font-family:monospace;font-size:10px;">№${emp.tab_number}</span>` : '';
    const nameCell = `<div style="font-weight:600;line-height:1.1;">${emp.name}${tab}</div>${role ? '<div style="color:var(--text3);font-size:10px;margin-top:2px;">' + role + '</div>' : ''}`;
    body += `<tr><td class="emp-name-cell">${nameCell}</td>`;
    for (let d = 1; d <= numDays; d++) {
      const dow = dayOfWeek(monthValue, d);
      const isWeekend = dow === 0 || dow === 6;
      body += `<td style="${isWeekend ? 'background:rgba(224,85,85,.05);' : ''}">&nbsp;</td>`;
    }
    body += '<td>&nbsp;</td></tr>';
  });
  // Итоговая строка — пустая, для подсчёта вручную
  body += `<tr class="totals-row"><td class="emp-name-cell">${t('sch.totalRow')}</td>`;
  for (let d = 0; d < numDays; d++) body += '<td>&nbsp;</td>';
  body += '<td>&nbsp;</td></tr>';
  body += '</tbody>';

  return cols + hdr + body;
}

async function doPrintBlankSchedule() {
  const month = _monthPickers['schedBlankMonthPicker']?.value;
  if (!month) { showToast('Не выбран месяц', true); return; }
  const selectedIds = new Set(_sblnkList.filter(i => i.selected).map(i => i.id));
  if (!selectedIds.size) { showToast('Никто не выбран', true); return; }

  const emps = (_employees || []).filter(e => selectedIds.has(e.id));
  if (!emps.length) { showToast('Никто не выбран', true); return; }

  closeModal('schedBlankModal');

  const table = document.getElementById('scheduleTable');
  const wrap = document.getElementById('scheduleWrap');
  const grandEl = document.getElementById('schedGrandTotal');

  // Сохраняем оригинал, чтобы вернуть после печати
  table.innerHTML = buildBlankScheduleTableHTML(emps, month);
  if (grandEl) grandEl.style.display = 'none';

  // Заголовок над таблицей с указанием месяца (видно и на экране, и в печати)
  let banner = document.getElementById('schedBlankBanner');
  if (banner) banner.remove();
  banner = document.createElement('div');
  banner.id = 'schedBlankBanner';
  banner.style.cssText = 'font-weight:600;font-size:14px;margin:0 0 6px 0;padding:6px 10px;background:var(--surface2);border-radius:var(--radius-sm);';
  banner.textContent = `📋 ${t('sblnk.bannerPrefix') || 'Пустой график'} — ${monthLabel(month)} · ${emps.length} сотр.`;
  wrap.before(banner);

  // Включаем print-режим (как printSchedule) + дополнительный класс для крупных клеток
  document.querySelectorAll('.page').forEach(p => p.classList.remove('print-target'));
  document.getElementById('page-schedule').classList.add('print-target');
  document.documentElement.classList.add('print-schedule-mode');
  document.body.classList.add('print-schedule-mode');
  document.body.classList.add('print-schedule-blank');
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 900;
  if (isMobile) document.body.classList.add('print-schedule-mobile');
  injectPrintLandscapeStyle();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.getElementById('page-schedule').classList.remove('print-target');
    document.documentElement.classList.remove('print-schedule-mode');
    document.body.classList.remove('print-schedule-mode');
    document.body.classList.remove('print-schedule-mobile');
    document.body.classList.remove('print-schedule-blank');
    removePrintLandscapeStyle();
    if (banner) banner.remove();
    // Перерисовываем нормальный график обратно
    if (typeof renderSchedule === 'function') renderSchedule();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(cleanup, 30000); // safety fallback

  setTimeout(() => window.print(), 100);
}
