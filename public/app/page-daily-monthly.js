// ═══════════════════════════════════════════
// DAILY / MONTHLY
// ═══════════════════════════════════════════
let _dailyDetailOpen = new Set();

async function renderDaily() {
  if (!_monthPickers['dailyMonthPicker']) createMonthPicker('dailyMonthPicker', () => renderDaily());
  const month = _monthPickers['dailyMonthPicker']?.value || '';
  if (!_dateRangePickers['dailyDateRange']) createDateRangePicker('dailyDateRange', () => renderDaily());
  let rows = await API.get('/reports/daily' + (month ? '?month=' + month : '')) || [];
  const dailyDrp = _dateRangePickers['dailyDateRange'];
  const dailyFrom = dailyDrp?.from || '';
  const dailyTo = dailyDrp?.to || '';
  if (dailyFrom) rows = rows.filter(r => r.date >= dailyFrom);
  if (dailyTo) rows = rows.filter(r => r.date <= dailyTo);
  const dailySort = document.getElementById('dailySortOrder').value;
  rows.sort((a,b) => dailySort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const tbody = document.getElementById('dailyTable');
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📅</div><p>Нет данных</p></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(r => {
    const total = +r.income - +r.expense - +r.salary - +r.advance - +r.bonus + +r.fine;
    const col = total>=0?'var(--green)':'var(--red)';
    const open = _dailyDetailOpen.has(r.date);
    return `<tr style="cursor:pointer;" onclick="toggleDailyDetail('${r.date}')">
      <td style="width:24px;text-align:center;color:var(--text3);font-size:10px;">${open ? '▼' : '▶'}</td>
      <td><b>${dateLabel(r.date)}</b></td>
      <td style="color:var(--green)">+${fmt(r.income)}</td>
      <td style="color:var(--red)">-${fmt(r.expense)}</td>
      <td style="color:var(--accent)">-${fmt(r.salary)}</td>
      <td style="color:var(--red)">-${fmt(r.fine)}</td>
      <td style="color:var(--purple)">+${fmt(r.bonus)}</td>
      <td style="color:var(--blue)">-${fmt(r.advance)}</td>
      <td style="font-weight:700;color:${col}">${total>=0?'+':''}${fmt(total)} ${_currency}</td>
    </tr>
    ${open ? `<tr class="monthly-detail-row"><td colspan="9" style="padding:0;background:var(--surface2);"><div id="daily-detail-${r.date}" style="padding:16px 20px;">Загрузка...</div></td></tr>` : ''}`;
  }).join('');
  _dailyDetailOpen.forEach(date => loadDailyDetail(date));
}

async function toggleDailyDetail(date) {
  if (_dailyDetailOpen.has(date)) _dailyDetailOpen.delete(date);
  else _dailyDetailOpen.add(date);
  renderDaily();
}

async function loadDailyDetail(date) {
  const el = document.getElementById('daily-detail-' + date);
  if (!el) return;

  // все транзакции за день
  const allTxAll = await API.get('/transactions') || [];
  const allTx = allTxAll.filter(t => t.date === date);
  const emps = _employees.length ? _employees : (await API.get('/employees') || []);

  // категории по типам
  const byType = {};
  allTx.forEach(t => {
    if (!byType[t.type]) byType[t.type] = {};
    const cat = t.cat || '—';
    byType[t.type][cat] = (byType[t.type][cat] || 0) + +t.amount;
  });

  function renderCats(type, color) {
    const cats = byType[type] || {};
    const entries = Object.entries(cats).sort((a,b) => b[1] - a[1]);
    if (!entries.length) return '<div style="color:var(--text3);font-size:12px;">—</div>';
    const total = entries.reduce((s,[,v]) => s + v, 0);
    return entries.map(([cat, sum]) => {
      const pct = total ? Math.round(sum / total * 100) : 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;">
        <span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat}</span>
        <span style="color:var(--text3);font-size:11px;">${pct}%</span>
        <span style="color:${color};font-weight:600;font-size:12.5px;min-width:100px;text-align:right;">${fmt(sum)} ${_currency}</span>
      </div>`;
    }).join('');
  }

  // все транзакции списком
  const allOps = allTx.slice().sort((a,b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const opsHtml = allOps.length
    ? allOps.map(t => {
        const isPositive = t.type === 'income' || t.type === 'fine';
        const sign = isPositive ? '+' : '−';
        const color = {
          income:'var(--green)', expense:'var(--red)',
          salary:'var(--accent)', advance:'var(--blue)',
          bonus:'var(--purple)', fine:'var(--green)'
        }[t.type] || 'var(--text)';
        const empName = t.emp_id ? (emps.find(e => e.id === t.emp_id)?.name || 'удалён') : '';
        return `<div style="display:grid;grid-template-columns:90px 1fr 110px;gap:8px;padding:5px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;font-size:12px;">
          <span><span class="badge ${TYPE_BADGES[t.type]}" style="font-size:10px">${TYPE_LABELS[t.type]||t.type}</span></span>
          <span>${t.cat||'—'}${empName?' · <span style="color:var(--text3)">'+empName+'</span>':''}${t.note?' <span style="color:var(--text3);font-size:11px">— '+t.note+'</span>':''}</span>
          <span style="color:${color};font-weight:600;text-align:right;">${sign}${fmt(t.amount)} ${_currency}</span>
        </div>`;
      }).join('')
    : '<div style="color:var(--text3);font-size:12px;">Нет операций</div>';

  // по сотрудникам за день (группировка по табельному)
  const empTx = {};
  allTx.forEach(t => {
    if (!t.emp_id || !['salary','advance','bonus','fine'].includes(t.type)) return;
    if (!empTx[t.emp_id]) empTx[t.emp_id] = { salary:0, advance:0, bonus:0, fine:0 };
    empTx[t.emp_id][t.type] += +t.amount;
  });
  const empEntries = Object.entries(empTx);
  const groups = [];
  const byTab = {};
  empEntries.forEach(([empId, v]) => {
    const emp = emps.find(e => e.id === empId);
    if (emp && +emp.hidden_in_monthly) return;
    const r = { emp_id: empId, ...v };
    const tab = emp && emp.tab_number ? String(emp.tab_number).trim() : null;
    if (tab) {
      if (!byTab[tab]) { byTab[tab] = { tab_number:tab, items:[] }; groups.push(byTab[tab]); }
      byTab[tab].items.push({ r, emp });
    } else {
      groups.push({ tab_number:null, items:[{ r, emp }] });
    }
  });
  const empHtml = groups.length
    ? groups.map(g => {
      const sum = g.items.reduce((a,{r}) => ({
        salary:a.salary+ +r.salary, advance:a.advance+ +r.advance,
        bonus:a.bonus+ +r.bonus, fine:a.fine+ +r.fine,
      }), {salary:0,advance:0,bonus:0,fine:0});
      const net = sum.salary + sum.bonus - sum.advance - sum.fine;
      const col = net>=0?'var(--green)':'var(--red)';
      const first = g.items[0].emp;
      const multi = g.items.length > 1;
      const displayName = first ? first.name : 'Удалённый';
      const tabBadge = g.tab_number ? ' <span style="color:var(--accent);font-family:monospace;font-size:11px;">№'+g.tab_number+'</span>' : '';
      const rolesInfo = multi
        ? ' <span style="color:var(--text3);font-size:11px">— '+g.items.length+' должностей</span>'
        : (first && first.role ? ' <span style="color:var(--text3);font-size:11px">— '+first.role+'</span>' : '');
      return `<div style="display:grid;grid-template-columns:1fr 80px 80px 80px 80px 100px;gap:8px;padding:6px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;font-size:12.5px;">
        <span><b>${displayName}</b>${tabBadge}${rolesInfo}</span>
        <span style="color:var(--accent);text-align:right;">${fmt(sum.salary)}</span>
        <span style="color:var(--blue);text-align:right;">-${fmt(sum.advance)}</span>
        <span style="color:var(--purple);text-align:right;">+${fmt(sum.bonus)}</span>
        <span style="color:var(--red);text-align:right;">-${fmt(sum.fine)}</span>
        <span style="color:${col};text-align:right;font-weight:700;">${fmt(net)} ${_currency}</span>
      </div>`;
    }).join('')
    : '<div style="color:var(--text3);font-size:12px;">Нет начислений по сотрудникам</div>';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">📈 Доходы по категориям</div>
        ${renderCats('income','var(--green)')}

        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;">📉 Расходы по категориям</div>
        ${renderCats('expense','var(--red)')}
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">${t('detail.empAccruals')}</div>
        <div style="display:grid;grid-template-columns:1fr 80px 80px 80px 80px 100px;gap:8px;padding:0 10px 4px;font-size:10px;color:var(--text3);text-transform:uppercase;">
          <span>${t('col.employee')}</span><span style="text-align:right">${t('col.salaryShort')}</span><span style="text-align:right">${t('col.advanceShort')}</span><span style="text-align:right">${t('col.bonusShort')}</span><span style="text-align:right">${t('col.fineShort')}</span><span style="text-align:right">${t('col.payoutShort')}</span>
        </div>
        ${empHtml}

        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;">${t('detail.allOps')}</div>
        ${opsHtml}
      </div>
    </div>`;
}

let _monthlyDetailOpen = new Set();

async function renderMonthly() {
  const rows = await API.get('/reports/monthly') || [];
  const tbody = document.getElementById('monthlyTable');
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="icon">📆</div><p>Нет данных</p></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(r => {
    const profit = +r.income - +r.expense - +r.salary - +r.advance - +r.bonus + +r.fine;
    const col = profit>=0?'var(--green)':'var(--red)';
    const open = _monthlyDetailOpen.has(r.month);
    return `<tr style="cursor:pointer;" onclick="toggleMonthlyDetail('${r.month}')">
      <td style="width:24px;text-align:center;color:var(--text3);font-size:10px;">${open ? '▼' : '▶'}</td>
      <td><b>${monthLabel(r.month)}</b></td>
      <td style="color:var(--green)">${fmt(r.income)}</td>
      <td style="color:var(--red)">${fmt(r.expense)}</td>
      <td style="color:var(--accent)">${fmt(r.salary)}</td>
      <td style="color:var(--blue)">${fmt(r.advance)}</td>
      <td style="color:var(--purple)">${fmt(r.bonus)}</td>
      <td style="color:var(--red)">${fmt(r.fine)}</td>
      <td style="font-weight:700;font-size:15px;color:${col}">${profit>=0?'+':''}${fmt(profit)} ${_currency}</td>
    </tr>
    ${open ? `<tr class="monthly-detail-row"><td colspan="9" style="padding:0;background:var(--surface2);"><div id="monthly-detail-${r.month}" style="padding:16px 20px;">Загрузка...</div></td></tr>` : ''}`;
  }).join('');

  // загрузить детали для открытых месяцев
  _monthlyDetailOpen.forEach(month => loadMonthlyDetail(month));
}

async function toggleMonthlyDetail(month) {
  if (_monthlyDetailOpen.has(month)) _monthlyDetailOpen.delete(month);
  else _monthlyDetailOpen.add(month);
  renderMonthly();
}

async function loadMonthlyDetail(month) {
  const el = document.getElementById('monthly-detail-' + month);
  if (!el) return;

  const [txs, daily, salary, empsRaw] = await Promise.all([
    API.get('/transactions?month=' + month),
    API.get('/reports/daily?month=' + month),
    API.get('/reports/salary?month=' + month),
    API.get('/employees'),
  ]);

  const allTx = txs || [];
  const dailyRows = daily || [];
  const salaryRows = salary || [];
  const emps = empsRaw || [];

  // категории по типам
  const byType = {};
  allTx.forEach(t => {
    if (!byType[t.type]) byType[t.type] = {};
    const cat = t.cat || '—';
    byType[t.type][cat] = (byType[t.type][cat] || 0) + +t.amount;
  });

  function renderCats(type, color) {
    const cats = byType[type] || {};
    const entries = Object.entries(cats).sort((a,b) => b[1] - a[1]);
    if (!entries.length) return '<div style="color:var(--text3);font-size:12px;">—</div>';
    const total = entries.reduce((s,[,v]) => s + v, 0);
    return entries.map(([cat, sum]) => {
      const pct = total ? Math.round(sum / total * 100) : 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;">
        <span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat}</span>
        <span style="color:var(--text3);font-size:11px;">${pct}%</span>
        <span style="color:${color};font-weight:600;font-size:12.5px;min-width:100px;text-align:right;">${fmt(sum)} ${_currency}</span>
      </div>`;
    }).join('');
  }

  // по сотрудникам — группировка по табельному номеру (один физ. человек на нескольких должностях)
  // + фильтр: скрываем сотрудников с hidden_in_monthly
  const groups = [];
  const byTab = {};
  salaryRows.forEach(r => {
    const emp = emps.find(e => e.id === r.emp_id);
    if (emp && +emp.hidden_in_monthly) return; // пропустить скрытых
    const tab = emp && emp.tab_number ? String(emp.tab_number).trim() : null;
    if (tab) {
      if (!byTab[tab]) { byTab[tab] = { tab_number:tab, items:[] }; groups.push(byTab[tab]); }
      byTab[tab].items.push({ r, emp });
    } else {
      groups.push({ tab_number:null, items:[{ r, emp }] });
    }
  });
  const empHtml = groups.length
    ? groups.map(g => {
      const sum = g.items.reduce((a,{r}) => ({
        salary:a.salary+ +r.salary, advance:a.advance+ +r.advance,
        bonus:a.bonus+ +r.bonus, fine:a.fine+ +r.fine,
      }), {salary:0,advance:0,bonus:0,fine:0});
      const net = sum.salary + sum.bonus - sum.advance - sum.fine;
      const col = net>=0?'var(--green)':'var(--red)';
      const first = g.items[0].emp;
      const multi = g.items.length > 1;
      const displayName = first ? first.name : 'Удалённый';
      const tabBadge = g.tab_number ? ' <span style="color:var(--accent);font-family:monospace;font-size:11px;">№'+g.tab_number+'</span>' : '';
      const rolesInfo = multi
        ? ' <span style="color:var(--text3);font-size:11px">— совмещение '+g.items.length+' должностей</span>'
        : (first && first.role ? ' <span style="color:var(--text3);font-size:11px">— '+first.role+'</span>' : '');

      const header = `<div style="display:grid;grid-template-columns:1fr 90px 90px 90px 90px 110px;gap:8px;padding:6px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;font-size:12.5px;">
        <span><b>${displayName}</b>${tabBadge}${rolesInfo}</span>
        <span style="color:var(--accent);text-align:right;">${fmt(sum.salary)}</span>
        <span style="color:var(--blue);text-align:right;">-${fmt(sum.advance)}</span>
        <span style="color:var(--purple);text-align:right;">+${fmt(sum.bonus)}</span>
        <span style="color:var(--red);text-align:right;">-${fmt(sum.fine)}</span>
        <span style="color:${col};text-align:right;font-weight:700;">${fmt(net)} ${_currency}</span>
      </div>`;

      // подстрочки по должностям при совмещении
      const sub = multi
        ? g.items.map(({r, emp}) => {
          const itemNet = +r.salary + +r.bonus - +r.advance - +r.fine;
          const role = emp ? (emp.role || EMP_TYPE_LABELS[emp.type] || '—') : '—';
          return `<div style="display:grid;grid-template-columns:1fr 90px 90px 90px 90px 110px;gap:8px;padding:3px 10px 3px 30px;font-size:11.5px;color:var(--text2);">
            <span>↳ ${role}</span>
            <span style="text-align:right;">${fmt(r.salary)}</span>
            <span style="text-align:right;">-${fmt(r.advance)}</span>
            <span style="text-align:right;">+${fmt(r.bonus)}</span>
            <span style="text-align:right;">-${fmt(r.fine)}</span>
            <span style="text-align:right;color:${itemNet>=0?'var(--green)':'var(--red)'}">${fmt(itemNet)}</span>
          </div>`;
        }).join('')
        : '';

      return header + sub;
    }).join('')
    : '<div style="color:var(--text3);font-size:12px;">Нет начислений</div>';

  // по дням (топ 10)
  const topDays = dailyRows.slice(0, 10).map(d => {
    const total = +d.income - +d.expense - +d.salary - +d.advance - +d.bonus + +d.fine;
    const col = total>=0?'var(--green)':'var(--red)';
    return `<div style="display:grid;grid-template-columns:90px 1fr 1fr 110px;gap:8px;padding:5px 10px;background:var(--surface);border-radius:4px;margin-bottom:3px;font-size:12px;">
      <span><b>${dateLabel(d.date)}</b></span>
      <span style="color:var(--green);text-align:right;">+${fmt(d.income)}</span>
      <span style="color:var(--red);text-align:right;">-${fmt(+d.expense + +d.salary + +d.advance + +d.bonus)}</span>
      <span style="color:${col};text-align:right;font-weight:600;">${total>=0?'+':''}${fmt(total)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">${t('detail.incomeByCat')}</div>
        ${renderCats('income','var(--green)')}

        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;">${t('detail.expenseByCat')}</div>
        ${renderCats('expense','var(--red)')}
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;">${t('detail.byEmployees')}</div>
        <div style="display:grid;grid-template-columns:1fr 90px 90px 90px 90px 110px;gap:8px;padding:0 10px 4px;font-size:10px;color:var(--text3);text-transform:uppercase;">
          <span>${t('col.employee')}</span><span style="text-align:right">${t('col.salaryShort')}</span><span style="text-align:right">${t('col.advanceShort')}</span><span style="text-align:right">${t('col.bonusShort')}</span><span style="text-align:right">${t('col.fineShort')}</span><span style="text-align:right">${t('col.payoutShort')}</span>
        </div>
        ${empHtml}

        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:16px 0 8px;">${t('detail.topDays')}</div>
        ${topDays || `<div style="color:var(--text3);font-size:12px;">${t('detail.noData')}</div>`}
      </div>
    </div>`;
}
