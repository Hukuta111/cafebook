// ═══════════════════════════════════════════
// SALARY REPORT
// ═══════════════════════════════════════════
let _monthlySalaryCandidates = [];
let _salReportPeriod = 'full'; // 'full' | 'advance' | 'salary'

function setSalReportPeriod(p) {
  _salReportPeriod = (p === 'advance' || p === 'salary') ? p : 'full';
  document.querySelectorAll('#salReportPeriodCtrl button').forEach(b => {
    b.classList.toggle('active', b.dataset.period === _salReportPeriod);
  });
  renderSalaryReport();
}

// ═══════════════════════════════════════════
// PRINT SALARY REPORT (выбор кого печатать)
// ═══════════════════════════════════════════
let _salReportPrintList = []; // [{key, name, selected}]

function openSalReportPrintModal() {
  const cards = document.querySelectorAll('#salaryReportCards .salary-card');
  if (!cards.length) { showToast('Нет данных для печати', true); return; }
  _salReportPrintList = [...cards].map(c => ({
    key: c.dataset.groupKey,
    name: c.dataset.empName,
    selected: true,
  }));
  renderSalReportPrintList();
  openModal('salReportPrintModal');
}

function renderSalReportPrintList() {
  const list = document.getElementById('salReportPrintList');
  list.innerHTML = _salReportPrintList.map((c, i) => `
    <label class="toggle-row" style="cursor:pointer;">
      <div class="toggle-text">
        <span class="toggle-label">${c.name}</span>
      </div>
      <input type="checkbox" ${c.selected?'checked':''} onchange="_salReportPrintList[${i}].selected=this.checked;srpUpdateSummary()">
      <span class="toggle-sw"></span>
    </label>
  `).join('') + '<div id="srpSummary" style="margin-top:10px;padding:8px 12px;background:var(--surface2);border-radius:var(--radius-sm);font-size:12px;color:var(--text3);"></div>';
  srpUpdateSummary();
}

function srpUpdateSummary() {
  const sel = _salReportPrintList.filter(c => c.selected);
  const separate = document.getElementById('srpSeparatePages')?.checked !== false;
  const compact  = document.getElementById('srpCompact')?.checked === true;
  // строка «Компактный макет» нужна только в режиме «подряд»
  const compactRow = document.getElementById('srpCompactRow');
  if (compactRow) compactRow.style.display = separate ? 'none' : 'flex';
  const el = document.getElementById('srpSummary');
  if (el) {
    if (separate) {
      el.textContent = `Будет напечатано ${sel.length} листов (по одному на сотрудника)`;
    } else if (compact) {
      el.textContent = `Выбрано ${sel.length} сотрудник(ов) — компактно, подряд (вмещаются на 1–2 листа)`;
    } else {
      el.textContent = `Выбрано ${sel.length} сотрудник(ов) — будут напечатаны подряд без разрывов страниц`;
    }
  }
}

function srpOnSeparateChange() {
  // при переключении «отдельный лист» сбрасываем «компактный», чтобы избежать путаницы
  const sep = document.getElementById('srpSeparatePages')?.checked !== false;
  if (sep) {
    const c = document.getElementById('srpCompact');
    if (c) c.checked = false;
  }
  srpUpdateSummary();
}

function srpToggleAll(value) {
  _salReportPrintList.forEach(c => c.selected = value);
  renderSalReportPrintList();
}

function doPrintSalReport() {
  const selected = new Set(_salReportPrintList.filter(c => c.selected).map(c => c.key));
  if (!selected.size) { showToast('Никто не выбран', true); return; }
  const separate = document.getElementById('srpSeparatePages')?.checked !== false;
  const compact  = !separate && document.getElementById('srpCompact')?.checked === true;

  // пометить карточки
  document.querySelectorAll('#salaryReportCards .salary-card').forEach(card => {
    if (selected.has(card.dataset.groupKey)) card.classList.add('print-selected');
    else card.classList.remove('print-selected');
  });
  document.body.classList.add('print-payslips-mode');
  document.body.classList.toggle('print-payslips-separate', separate);
  document.body.classList.toggle('print-payslips-compact',  compact);
  closeModal('salReportPrintModal');

  // дать браузеру время на перерисовку
  setTimeout(() => {
    window.print();
    // очистка после печати
    setTimeout(() => {
      document.body.classList.remove('print-payslips-mode');
      document.body.classList.remove('print-payslips-separate');
      document.body.classList.remove('print-payslips-compact');
      document.querySelectorAll('#salaryReportCards .salary-card.print-selected').forEach(c => c.classList.remove('print-selected'));
    }, 500);
  }, 100);
}

async function calcMonthlySalary() {
  const cur = today().slice(0,7);
  const month = _monthPickers['salReportMonthPicker']?.value || cur;
  const candidates = await API.get('/monthly-salary-candidates') || [];
  if (!candidates.length) { showToast('Нет активных сотрудников с окладом', true); return; }

  _monthlySalaryCandidates = candidates.map(e => ({
    id: e.id,
    name: e.name,
    role: e.role || EMP_TYPE_LABELS[e.type] || '',
    tab_number: e.tab_number || '',
    salary: +e.salary || 0,
    amount: +e.salary || 0,
    selected: true,
  }));
  document.getElementById('monthlySalaryMonth').textContent = '· ' + monthLabel(month);
  renderMonthlySalaryList();
  openModal('monthlySalaryModal');
}

function renderMonthlySalaryList() {
  const list = document.getElementById('monthlySalaryList');
  list.innerHTML = _monthlySalaryCandidates.map((c, i) => {
    const tab = c.tab_number ? ' <span style="color:var(--accent);font-family:monospace;font-size:11px;">№'+c.tab_number+'</span>' : '';
    return `<div style="display:grid;grid-template-columns:32px 1fr 140px 40px;gap:8px;align-items:center;padding:8px 10px;background:var(--surface2);border-radius:var(--radius-sm);${!c.selected ? 'opacity:.5;' : ''}">
      <label class="toggle-mini" style="justify-self:start">
        <input type="checkbox" ${c.selected?'checked':''} onchange="msToggleOne(${i},this.checked)">
        <span class="toggle-sw"></span>
      </label>
      <div>
        <div style="font-weight:600;font-size:13px;">${c.name}${tab}</div>
        <div style="color:var(--text3);font-size:11px;">${c.role || '—'} · оклад в профиле ${fmt(c.salary)} ${_currency}</div>
      </div>
      <input type="number" value="${c.amount}" min="0" step="0.01" ${!c.selected?'disabled':''}
        oninput="_monthlySalaryCandidates[${i}].amount=+this.value||0;msUpdateTotal()"
        style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:6px 10px;color:var(--text);font-size:12.5px;outline:none;text-align:right;">
      <span style="color:var(--text3);font-size:11px;text-align:center;">${_currency}</span>
    </div>`;
  }).join('');
  msUpdateTotal();
}

function msUpdateTotal() {
  const sel = _monthlySalaryCandidates.filter(c => c.selected);
  const total = sel.reduce((s,c) => s + (+c.amount || 0), 0);
  document.getElementById('monthlySalaryTotal').innerHTML =
    `Выбрано сотрудников: <b style="color:var(--text)">${sel.length}</b> · Итого к начислению: <b style="color:var(--green)">${fmt(total)} ${_currency}</b>`;
}

function msToggleOne(i, checked) {
  _monthlySalaryCandidates[i].selected = checked;
  renderMonthlySalaryList();
}

function msToggleAll(checked) {
  _monthlySalaryCandidates.forEach(c => { c.selected = checked; });
  renderMonthlySalaryList();
}

function msResetAmounts() {
  _monthlySalaryCandidates.forEach(c => { c.amount = c.salary; });
  renderMonthlySalaryList();
}

async function confirmCalcMonthlySalary() {
  const cur = today().slice(0,7);
  const month = _monthPickers['salReportMonthPicker']?.value || cur;
  const assignments = _monthlySalaryCandidates
    .filter(c => c.selected && +c.amount > 0)
    .map(c => ({ emp_id: c.id, amount: +c.amount }));
  if (!assignments.length) { showToast('Никто не выбран', true); return; }
  const res = await API.post('/calc-monthly-salary', { month, assignments });
  if (res && res.ok) {
    closeModal('monthlySalaryModal');
    if (res.created > 0) {
      const adv = +res.advances || 0;
      const sal = +res.salaries || 0;
      const parts = [];
      if (adv) parts.push(`аванс — ${adv}`);
      if (sal) parts.push(`зарплата — ${sal}`);
      showToast(`Создано: ${parts.join(', ') || res.created} ✓`);
      renderSalaryReport();
    } else {
      showToast(res.message || 'Нет сотрудников с окладом');
    }
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function calcPercentBonus() {
  const cur = today().slice(0,7);
  const month = _monthPickers['salReportMonthPicker']?.value || cur;
  const res = await API.post('/calc-percent-bonus', { month });
  if (res && res.ok) {
    if (res.created > 0) {
      showToast(`Создано ${res.created} бонус(ов): ${res.qualifyingDaysCount || 0} дн × (> порога) = ${fmt(res.qualifyingRevenue)} ${_currency} ✓`);
    } else {
      showToast(res.message || 'Нет дней с выручкой выше порога');
    }
    renderSalaryReport();
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function renderSalaryReport() {
  if (!_monthPickers['salReportMonthPicker']) createMonthPicker('salReportMonthPicker', () => renderSalaryReport());
  _employees = await API.get('/employees') || [];
  const cur = today().slice(0,7);
  const month = _monthPickers['salReportMonthPicker']?.value || cur;

  const period = _salReportPeriod || 'full';
  const rows = await API.get('/reports/salary?month=' + month + '&period=' + period) || [];
  const container = document.getElementById('salaryReportCards');

  // фильтр по периоду применяется и к деталям (смены/транзакции).
  // Для сотрудников с pay_schedule='once' в режиме 'salary' детали остаются за весь месяц.
  const empById = {};
  (_employees || []).forEach(e => { empById[e.id] = e; });
  const isPayOnce = (empId) => empById[empId] && empById[empId].pay_schedule === 'once';
  function dateInPeriod(dateStr, empId) {
    if (period === 'full') return true;
    const d = +String(dateStr).slice(8, 10);
    if (period === 'advance') return !isPayOnce(empId) && d <= 15;
    if (period === 'salary')  return isPayOnce(empId) || d >= 16;
    return true;
  }

  // загрузить график и транзакции если включён переключатель
  const showDays = document.getElementById('salReportShowDays')?.checked || false;
  const showHours = document.getElementById('salReportShowHours')?.checked || false;
  let scheduleByEmp = {};
  let txByEmp = {};
  if (showDays || showHours) {
    const [sched, allTx] = await Promise.all([
      API.get('/schedule?month=' + month),
      API.get('/transactions?month=' + month),
    ]);
    (sched || []).filter(s => dateInPeriod(s.work_date, s.emp_id)).forEach(s => {
      if (!scheduleByEmp[s.emp_id]) scheduleByEmp[s.emp_id] = [];
      scheduleByEmp[s.emp_id].push(s);
    });
    // для showDays — все типы, для showHours — только bonus/fine
    const relevantTypes = showDays ? ['salary','advance','bonus','fine'] : ['bonus','fine'];
    (allTx || []).filter(t => t.emp_id && relevantTypes.includes(t.type) && dateInPeriod(t.date, t.emp_id)).forEach(t => {
      if (!txByEmp[t.emp_id]) txByEmp[t.emp_id] = [];
      txByEmp[t.emp_id].push(t);
    });
  }

  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Нет данных за выбранный период</p></div>`;
    return;
  }

  const totals = rows.reduce((acc,r)=>({ salary:acc.salary+ +r.salary, advance:acc.advance+ +r.advance, bonus:acc.bonus+ +r.bonus, fine:acc.fine+ +r.fine }),{salary:0,advance:0,bonus:0,fine:0});
  const totalNet = totals.salary+totals.bonus-totals.advance-totals.fine;

  let html = `<div class="cards-row" style="margin-bottom:28px;">
    <div class="stat-card yellow"><div class="stat-label">${t('srep.salaryAcc')}</div><div class="stat-value yellow">${fmt(totals.salary)} ${_currency}</div></div>
    <div class="stat-card blue"><div class="stat-label">${t('srep.advances')}</div><div class="stat-value blue">${fmt(totals.advance)} ${_currency}</div></div>
    <div class="stat-card purple"><div class="stat-label">${t('srep.bonuses')}</div><div class="stat-value purple">${fmt(totals.bonus)} ${_currency}</div></div>
    <div class="stat-card red"><div class="stat-label">${t('srep.fines')}</div><div class="stat-value red">${fmt(totals.fine)} ${_currency}</div></div>
    <div class="stat-card ${totalNet>=0?'green':'red'}"><div class="stat-label">${t('srep.payoutTotal')}</div><div class="stat-value ${totalNet>=0?'green':'red'}">${fmt(totalNet)} ${_currency}</div></div>
  </div>`;

  // группировка по табельному номеру (если есть)
  const groups = []; // { key, tab_number, items: [{r, emp}] }
  const byTab = {};
  rows.forEach(r => {
    const emp = _employees.find(e => e.id === r.emp_id);
    const tab = emp && emp.tab_number ? String(emp.tab_number).trim() : null;
    if (tab) {
      if (!byTab[tab]) {
        byTab[tab] = { key:'tab_'+tab, tab_number:tab, items:[] };
        groups.push(byTab[tab]);
      }
      byTab[tab].items.push({ r, emp });
    } else {
      groups.push({ key:'id_'+r.emp_id, tab_number:null, items:[{ r, emp }] });
    }
  });

  groups.forEach(g => {
    // суммарно по группе
    const sum = g.items.reduce((a, {r}) => ({
      salary: a.salary + +r.salary, advance: a.advance + +r.advance,
      bonus: a.bonus + +r.bonus, fine: a.fine + +r.fine,
    }), {salary:0, advance:0, bonus:0, fine:0});
    const net = sum.salary + sum.bonus - sum.advance - sum.fine;
    const netCol = net>=0?'var(--green)':'var(--red)';

    // имя: если в группе один — его имя; если несколько — имя первого + «(совмещает)»
    const first = g.items[0].emp;
    const displayName = first ? first.name : 'Удалённый сотрудник';
    const tabBadge = g.tab_number ? ` <span style="color:var(--accent);font-family:monospace;font-size:13px;font-weight:500">№${g.tab_number}</span>` : '';
    const multi = g.items.length > 1;

    // вспомогательная функция: вывод детализации (смены + операции) для одной должности
    function shiftsBlockForEmp(emp) {
      if ((!showDays && !showHours) || !emp) return '';

      // если только часы — показываем таблицу часы × ставка + раздельные блоки авансы/бонусы/штрафы
      if (showHours && !showDays) {
        const shifts = (scheduleByEmp[emp.id] || []).slice().sort((a,b) => a.work_date.localeCompare(b.work_date));
        const empTxs = (txByEmp[emp.id] || []);
        const advanceTxs = empTxs.filter(t => t.type === 'advance');
        const bonusTxs   = empTxs.filter(t => t.type === 'bonus');
        const fineTxs    = empTxs.filter(t => t.type === 'fine');
        const hasAnyTx = advanceTxs.length + bonusTxs.length + fineTxs.length > 0;

        // если совсем ничего нет — пустой блок (никаких текстов)
        if (!shifts.length && !hasAnyTx) return '';

        // Блок смен
        let shiftsHtml = '';
        if (shifts.length) {
          const totalH = shifts.reduce((s,x) => s + +x.hours, 0);
          const totalP = shifts.reduce((s,x) => {
            const rate = x.hourly_rate != null ? +x.hourly_rate : (+emp.hourly_rate || 0);
            return s + +x.hours * rate;
          }, 0);
          shiftsHtml = shifts.map(s => {
            const rate = s.hourly_rate != null ? +s.hourly_rate : (+emp.hourly_rate || 0);
            const pay = +s.hours * rate;
            return `<div style="display:grid;grid-template-columns:80px 60px 80px 1fr;gap:8px;align-items:center;font-size:12.5px;padding:4px 10px;background:var(--surface);border-radius:4px;">
              <span>${dateLabel(s.work_date)}</span>
              <span style="color:var(--text2)">${s.hours}${t('srep.hourSuffix')}</span>
              <span style="color:var(--text3);font-size:11.5px;">× ${fmt(rate)}</span>
              <span style="color:var(--green);font-weight:600;text-align:right;">= ${fmt(pay)} ${_currency}</span>
            </div>`;
          }).join('');
          shiftsHtml += `<div style="display:grid;grid-template-columns:80px 60px 80px 1fr;gap:8px;font-size:11px;color:var(--text3);padding:4px 10px;border-top:1px dashed var(--border);margin-top:2px;">
            <span>${t('srep.shiftsTotal')}</span>
            <span>${totalH}${t('srep.hourSuffix')}</span>
            <span></span>
            <span style="text-align:right">${fmt(totalP)} ${_currency}</span>
          </div>`;
        }

        // helper для блока авансы/бонусы/штрафы
        const renderTxBlock = (txs, icon, header, color, sign) => {
          if (!txs.length) return '';
          const sorted = txs.slice().sort((a,b) => a.date.localeCompare(b.date));
          return '<div style="margin-top:8px;">'
            + `<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);padding:4px 10px;">${icon} ${header}</div>`
            + sorted.map(tx => {
                const baseLabel = header;
                const descr = `${icon} ${baseLabel}${tx.cat && tx.cat !== baseLabel ? ' · '+tx.cat : ''}${tx.note ? ' — '+tx.note : ''}`;
                return `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 10px;background:var(--surface);border-radius:4px;margin-bottom:2px;">
                  <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dateLabel(tx.date)} · ${descr}</span>
                  <span style="color:${color};font-weight:600;white-space:nowrap;">${sign}${fmt(+tx.amount)} ${_currency}</span>
                </div>`;
              }).join('')
            + '</div>';
        };

        const advanceHtml = renderTxBlock(advanceTxs, '💵', t('srep.advances'), 'var(--blue)',   '−');
        const bonusHtml   = renderTxBlock(bonusTxs,   '✨', t('srep.bonuses'),  'var(--purple)', '+');
        const fineHtml    = renderTxBlock(fineTxs,    '⚠️', t('srep.fines'),    'var(--red)',    '−');

        return `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
          ${shiftsHtml}
          ${advanceHtml}
          ${bonusHtml}
          ${fineHtml}
        </div>`;
      }

      // режим "Детализация" (или оба переключателя) — смешиваем смены и транзакции
      const shifts = (scheduleByEmp[emp.id] || []).map(s => {
        const rate = s.hourly_rate != null ? +s.hourly_rate : (+emp.hourly_rate || 0);
        return {
          date: s.work_date,
          kind: 'shift',
          label: `${s.hours}ч × ${fmt(rate)}`,
          amount: +s.hours * rate,
          sign: '+',
          color: 'var(--green)',
        };
      });
      // транзакции — только если showDays
      const txs = showDays ? (txByEmp[emp.id] || []).map(t => {
        const isPositive = t.type === 'salary' || t.type === 'bonus';
        const typeIcon = { salary:'💰', advance:'💵', bonus:'✨', fine:'⚠️' }[t.type] || '•';
        const typeLbl = TYPE_LABELS[t.type] || t.type;
        return {
          date: t.date,
          kind: t.type,
          label: `${typeIcon} ${typeLbl}${t.cat && t.cat !== typeLbl ? ' · '+t.cat : ''}${t.note ? ' — '+t.note : ''}`,
          amount: +t.amount,
          sign: isPositive ? '+' : '−',
          color: isPositive ? (t.type === 'bonus' ? 'var(--purple)' : 'var(--accent)') : (t.type === 'fine' ? 'var(--red)' : 'var(--blue)'),
        };
      }) : [];
      const all = [...shifts, ...txs].sort((a,b) => a.date.localeCompare(b.date));
      if (!all.length) return ''; // ничего не показываем если у сотрудника нет смен/операций

      return `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
        ${all.map(o => `<div style="display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:5px 10px;background:var(--surface);border-radius:4px;">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dateLabel(o.date)} · ${o.label}</span>
          <span style="color:${o.color};font-weight:600;white-space:nowrap;">${o.sign}${fmt(o.amount)} ${_currency}</span>
        </div>`).join('')}
      </div>`;
    }

    // разбивка по должностям (всегда показываем блок если multi ИЛИ если showDays/showHours)
    let rolesBreakdown = '';
    const shouldShowRoles = multi || showDays || showHours;
    if (shouldShowRoles) {
      rolesBreakdown = '<div style="margin:12px 0;display:flex;flex-direction:column;gap:10px;">'
        + g.items.map(({r, emp}) => {
          const itemNet = +r.salary + +r.bonus - +r.advance - +r.fine;
          const role = emp ? (emp.role || EMP_TYPE_LABELS[emp.type] || '—') : '—';
          return `<div style="padding:10px 12px;background:var(--surface2);border-radius:var(--radius-sm);">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <span style="font-weight:600">${role}</span>
                <span style="color:var(--text3);font-size:12px;margin-left:8px">${t('col.salaryShort').toLowerCase()} ${fmt(r.salary)} · ${t('col.advanceShort').toLowerCase()} ${fmt(r.advance)} · ${t('col.bonusShort').toLowerCase()} ${fmt(r.bonus)} · ${t('col.fineShort').toLowerCase()} ${fmt(r.fine)}</span>
              </div>
              <div style="font-weight:700;color:${itemNet>=0?'var(--green)':'var(--red)'}">${fmt(itemNet)} ${_currency}</div>
            </div>
            ${shiftsBlockForEmp(emp)}
          </div>`;
        }).join('') + '</div>';
    }

    const headerRole = multi
      ? `<span style="color:var(--text3)">${t('srep.combo')} ${g.items.length} ${t('srep.positions')}</span>`
      : `${first?(first.role||''):''}${first?' · ':''}<span class="badge badge-blue">${first?(EMP_TYPE_LABELS[first.type]||''):''}</span>${first&&first.percent ? ' · <span style="color:var(--accent)">'+first.percent+'% '+t('srep.ofRevenue')+'</span>' : ''}`;

    html += `<div class="salary-card" data-group-key="${g.key}" data-emp-name="${displayName.replace(/"/g,'&quot;')}">
      <div class="salary-card-header">
        <div>
          <div class="salary-card-name">${displayName}${tabBadge}</div>
          <div class="salary-card-role">${headerRole}</div>
        </div>
        <div style="font-size:22px;font-weight:700;color:${netCol}">${fmt(net)} ${_currency}</div>
      </div>
      ${rolesBreakdown}
      <div class="salary-breakdown">
        <div class="salary-item"><div class="salary-item-label">${t('tx.salary')}</div><div class="salary-item-value" style="color:var(--accent)">${fmt(sum.salary)}</div></div>
        <div class="salary-item"><div class="salary-item-label">${t('srep.advances')}</div><div class="salary-item-value" style="color:var(--blue)">-${fmt(sum.advance)}</div></div>
        <div class="salary-item"><div class="salary-item-label">${t('srep.bonuses')}</div><div class="salary-item-value" style="color:var(--purple)">+${fmt(sum.bonus)}</div></div>
        <div class="salary-item"><div class="salary-item-label">${t('srep.fines')}</div><div class="salary-item-value" style="color:var(--red)">-${fmt(sum.fine)}</div></div>
      </div>
      <div class="employee-signature">
        <div class="sig-line"><span class="sig-label">${t('srep.sigEmployee') || 'Подпись сотрудника'}:</span> <span class="sig-rule"></span></div>
        <div class="sig-date"><span class="sig-label">${t('srep.sigDate') || 'Дата'}:</span> <span class="sig-rule sig-rule-short"></span></div>
      </div>
    </div>`;
  });

  // Подписи Администратора и Бухгалтера — для компактного режима печати,
  // выводим в самом конце (после всех карточек)
  html += `<div class="print-signatures-footer">
    <div class="sig-block">
      <span class="sig-rule"></span>
      <div class="sig-caption">${t('srep.sigAdmin') || 'Администратор'}</div>
    </div>
    <div class="sig-block">
      <span class="sig-rule"></span>
      <div class="sig-caption">${t('srep.sigAccountant') || 'Бухгалтер'}</div>
    </div>
  </div>`;

  container.innerHTML = html;
}
