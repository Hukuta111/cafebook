// ═══════════════════════════════════════════
// SCHEDULE
// ═══════════════════════════════════════════
let _scheduleData = [];

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

  // показать/скрыть кнопку формирования выплат
  const settings = await API.get('/settings') || {};
  const genBtn = document.getElementById('schedGenTxBtn');
  if (genBtn) genBtn.style.display = settings.scheduleTx === 'true' ? '' : 'none';

  if (!_monthPickers['schedMonthPicker']) createMonthPicker('schedMonthPicker', () => renderSchedule());
  const cur = today().slice(0,7);
  const month = _monthPickers['schedMonthPicker']?.value || cur;
  const numDays = daysInMonth(month);

  _scheduleData = await API.get('/schedule?month=' + month) || [];

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
  cols += '<col style="width:40px"><col style="width:75px"></colgroup>';

  // header
  let hdr = `<thead><tr><th class="emp-name-cell" style="text-align:left">${t('col.employee')}</th>`;
  for (let d = 1; d <= numDays; d++) {
    const dow = dayOfWeek(month, d);
    const isWeekend = dow === 0 || dow === 6;
    hdr += `<th style="${isWeekend ? 'color:var(--red);' : ''}">${d}<br>${t('wd.' + dow)}</th>`;
  }
  hdr += `<th>${t('sch.hours')}</th><th>${t('col.sum')}</th></tr></thead>`;

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
    body += `<td class="total-cell" style="color:var(--green)">${totalSum ? fmt(totalSum) : ''}</td>`;
    body += '</tr>';
  });

  // totals row
  body += `<tr class="totals-row"><td class="emp-name-cell">${t('sch.totalRow')}</td>`;
  for (let d = 0; d < numDays; d++) {
    body += `<td>${dayTotals[d] || ''}</td>`;
  }
  body += `<td>${grandHours || ''}</td><td></td></tr>`;
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
  grandEl.innerHTML = grandSum ? `${t('sch.totalHours')}: <b>${grandHours}</b> &nbsp;|&nbsp; ${t('sch.totalSum')}: <b style="color:var(--green)">${fmt(grandSum)} ${_currency}</b>` : '';
  grandEl.style.display = grandSum ? 'block' : 'none';

  // drag & drop строк
  attachScheduleRowDnD(table);
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

  openModal('schedModal');
}

async function deleteScheduleFromModal() {
  const id = document.getElementById('schedEditId').value;
  if (!id) return;
  if (!await confirmDialog({ text: t('confirm.delShift') })) return;
  const res = await API.del('/schedule/' + id);
  if (res && res.ok) { closeModal('schedModal'); renderSchedule(); showToast('Смена удалена'); }
}

async function saveScheduleEntry() {
  const id = document.getElementById('schedEditId').value || uid();
  const emp_id = document.getElementById('schedEmployee').value;
  const work_date = document.getElementById('schedDate').value;
  const hours = parseFloat(document.getElementById('schedHours').value);
  const rateVal = document.getElementById('schedRate').value;
  const hourly_rate = rateVal !== '' ? parseFloat(rateVal) : null;
  const note = document.getElementById('schedNote').value;

  if (!emp_id || !work_date || !hours || hours <= 0) { showToast('Заполните сотрудника, дату и часы', true); return; }

  const isEdit = !!document.getElementById('schedEditId').value;
  const data = { emp_id, work_date, hours, hourly_rate, note };
  const res = isEdit
    ? await API.put('/schedule/' + id, data)
    : await API.post('/schedule', { id, ...data });

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
  const res = await API.del('/schedule/' + id);
  if (res && res.ok) { renderSchedule(); showToast('Удалено'); }
}

async function generateScheduleTx() {
  const cur = today().slice(0,7);
  const month = _monthPickers['schedMonthPicker']?.value || cur;
  const res = await API.post('/calc-schedule-tx', { month });
  if (res && res.ok) {
    if (res.created > 0) {
      showToast(`Создано ${res.created} транзакция(й) за ${monthLabel(month)} ✓`);
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
  // динамически добавить @page правило для landscape — без этого мобильные
  // браузеры не уважают именованную @page и печатают в текущей ориентации
  injectPrintLandscapeStyle();
  window.print();
  setTimeout(() => {
    document.getElementById('page-schedule').classList.remove('print-target');
    document.documentElement.classList.remove('print-schedule-mode');
    document.body.classList.remove('print-schedule-mode');
    removePrintLandscapeStyle();
  }, 700);
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
