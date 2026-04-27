// ═══════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════
async function renderDashboard() {
  if (!_monthPickers['dashMonthPicker']) createMonthPicker('dashMonthPicker', () => renderDashboard());
  const cur = today().slice(0,7);
  const month = _monthPickers['dashMonthPicker']?.value || cur;
  document.getElementById('dashDate').textContent = monthLabel(month);
  const allTx = await API.get('/transactions') || [];

  const txs = allTx.filter(t => t.date && t.date.startsWith(month));
  let income=0, expense=0, salary=0, advance=0, bonus=0, fine=0;
  txs.forEach(t => {
    if (t.type==='income') income+=t.amount;
    else if (t.type==='expense') expense+=t.amount;
    else if (t.type==='salary') salary+=t.amount;
    else if (t.type==='advance') advance+=t.amount;
    else if (t.type==='bonus') bonus+=t.amount;
    else if (t.type==='fine') fine+=t.amount;
  });
  const profit = income - expense - salary - advance - bonus + fine;

  document.getElementById('dashCards').innerHTML = `
    <div class="stat-card green"><div class="stat-label">${t('dash.income')}</div><div class="stat-value green">${fmt(income)} ${_currency}</div><div class="stat-sub">${t('dash.forMonth')}</div></div>
    <div class="stat-card red"><div class="stat-label">${t('dash.expense')}</div><div class="stat-value red">${fmt(expense)} ${_currency}</div><div class="stat-sub">${t('dash.operational')}</div></div>
    <div class="stat-card yellow"><div class="stat-label">${t('dash.salaryPaid')}</div><div class="stat-value yellow">${fmt(salary+advance)} ${_currency}</div><div class="stat-sub">${t('dash.salaryAdvance')}</div></div>
    <div class="stat-card purple"><div class="stat-label">${t('dash.bonusFine')}</div><div class="stat-value purple">${fmt(bonus)} / <span style="color:var(--red)">${fmt(fine)}</span></div></div>
    <div class="stat-card ${profit>=0?'green':'red'}"><div class="stat-label">${t('dash.profit')}</div><div class="stat-value ${profit>=0?'green':'red'}">${profit>=0?'+':''}${fmt(profit)} ${_currency}</div></div>
  `;

  // bar chart — все дни выбранного месяца (до сегодняшнего включительно)
  const byDay = {};
  txs.forEach(t => {
    if (!byDay[t.date]) byDay[t.date] = { income:0, expense:0 };
    // Те же правила знаков, что и в карточках/последних транзакциях:
    // income/fine — «плюс» (зелёная колонка), всё остальное — «минус» (красная)
    if (t.type === 'income' || t.type === 'fine') byDay[t.date].income += +t.amount;
    else byDay[t.date].expense += +t.amount;
  });
  // Сгенерировать все дни месяца: month имеет формат YYYY-MM
  const [yStr, mStr] = month.split('-');
  const yNum = parseInt(yStr, 10);
  const mNum = parseInt(mStr, 10); // 1..12
  const daysInMonth = new Date(yNum, mNum, 0).getDate();
  const todayStr = today();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`;
    if (ds > todayStr) break; // не показываем будущие даты
    days.push(ds);
    if (!byDay[ds]) byDay[ds] = { income: 0, expense: 0 };
  }
  const maxV = Math.max(...days.map(d=>Math.max(byDay[d].income,byDay[d].expense)),1);
  const safeAttr = s => String(s).replace(/"/g, '&quot;');
  document.getElementById('barChart').innerHTML = days.length
    ? days.map(d=>{
        const inc = byDay[d].income, exp = byDay[d].expense;
        const dateLbl = dateLabel(d);
        const incTip = `${dateLbl} · ${t('dash.income')}: ${fmt(inc)} ${_currency}`;
        const expTip = `${dateLbl} · ${t('dash.expense')}: ${fmt(exp)} ${_currency}`;
        const clickAttr = `onclick="navigateToDay('${d}')"`;
        const incH = inc > 0 ? Math.max(4, inc/maxV*110) : 0;
        const expH = exp > 0 ? Math.max(4, exp/maxV*110) : 0;
        const dayNum = d.slice(8, 10);
        return `<div class="bar-wrap" ${clickAttr} style="cursor:pointer;" data-tip="${safeAttr(dateLbl)}">
        <div style="display:flex;gap:2px;align-items:flex-end;height:110px;">
          <div class="bar" data-tip="${safeAttr(incTip)}" style="background:var(--green);height:${incH}px;width:10px;opacity:.85;"></div>
          <div class="bar" data-tip="${safeAttr(expTip)}" style="background:var(--red);height:${expH}px;width:10px;opacity:.85;"></div>
        </div>
        <div class="bar-label">${dayNum}</div>
      </div>`;
      }).join('')
    : `<div style="color:var(--text3);font-size:13px;padding:40px">${t('detail.noData') || 'Нет данных'}</div>`;

  // expense breakdown
  const catTotals = {};
  txs.filter(t=>t.type==='expense').forEach(t=>{ catTotals[t.cat]=(catTotals[t.cat]||0)+ +t.amount; });
  const cats = Object.entries(catTotals).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const totE = cats.reduce((s,[,v])=>s+v,0)||1;
  const colors = ['var(--red)','var(--accent)','var(--blue)','var(--purple)','var(--green)'];
  document.getElementById('expenseBreakdown').innerHTML = cats.length
    ? cats.map(([cat,val],i)=>`<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
          <span style="color:var(--text2)">${cat}</span>
          <span style="color:${colors[i]}">${fmt(val)} (${Math.round(val/totE*100)}%)</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;">
          <div style="height:100%;width:${Math.round(val/totE*100)}%;background:${colors[i]};border-radius:3px;transition:width .5s"></div>
        </div></div>`).join('')
    : `<div style="color:var(--text3);font-size:13px;padding:20px 0">${t('dash.noExpense')}</div>`;

  // recent txs
  const recent = allTx.slice(0,8);
  document.getElementById('recentTx').innerHTML = recent.length
    ? recent.map(t=>{
        const col = ['income','fine'].includes(t.type)?'var(--green)':'var(--red)';
        const sign = ['income','fine'].includes(t.type)?'+':'-';
        return `<tr>
          <td>${dateLabel(t.date)}</td>
          <td><span class="badge ${TYPE_BADGES[t.type]}">${TYPE_LABELS[t.type]}</span></td>
          <td>${t.cat||'—'}</td>
          <td>${empName(t.emp_id)}</td>
          <td style="font-weight:600;color:${col};white-space:nowrap">${sign}${fmt(t.amount)} ${_currency}</td>
          <td style="color:var(--text3)">${t.note||'—'}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6"><div class="empty-state"><div class="icon">📭</div><p>Нет транзакций</p></div></td></tr>`;
}

// Открыть модалку с детализацией дня (вместо перехода на страницу дневных отчётов)
async function navigateToDay(date) {
  // Заголовок
  document.getElementById('dayDetailTitle').textContent = '📊 ' + dateLabel(date);
  const body = document.getElementById('dayDetailBody');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3);">Загрузка...</div>';
  openModal('dayDetailModal');

  // Получаем все транзакции этого дня
  let allTx = [];
  try {
    const all = await API.get('/transactions') || [];
    allTx = all.filter(t => t.date === date);
  } catch {}
  const emps = _employees.length ? _employees : (await API.get('/employees') || []);

  // Подсчёт итогов по типам
  const totals = { income:0, expense:0, salary:0, advance:0, bonus:0, fine:0 };
  allTx.forEach(t => { if (totals[t.type] !== undefined) totals[t.type] += +t.amount; });
  const net = totals.income - totals.expense - totals.salary - totals.advance - totals.bonus + totals.fine;

  // Категории по типам
  const byType = {};
  allTx.forEach(t => {
    if (!byType[t.type]) byType[t.type] = {};
    const cat = t.cat || '—';
    byType[t.type][cat] = (byType[t.type][cat] || 0) + +t.amount;
  });

  function renderCats(type, color) {
    const cats = byType[type] || {};
    const entries = Object.entries(cats).sort((a,b) => b[1] - a[1]);
    if (!entries.length) return `<div style="color:var(--text3);font-size:12px;">${t('detail.noData') || '—'}</div>`;
    const tot = entries.reduce((s,[,v]) => s + v, 0);
    return entries.map(([cat, sum]) => {
      const pct = tot ? Math.round(sum / tot * 100) : 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 10px;background:var(--surface2);border-radius:4px;margin-bottom:3px;">
        <span style="font-size:12.5px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat}</span>
        <span style="color:var(--text3);font-size:11px;">${pct}%</span>
        <span style="color:${color};font-weight:600;font-size:12.5px;min-width:90px;text-align:right;">${fmt(sum)} ${_currency}</span>
      </div>`;
    }).join('');
  }

  // Все операции списком
  const ops = allTx.slice().sort((a,b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const opsHtml = ops.length
    ? ops.map(tx => {
        const isPositive = tx.type === 'income' || tx.type === 'fine';
        const sign = isPositive ? '+' : '−';
        const color = ({
          income:'var(--green)', expense:'var(--red)',
          salary:'var(--accent)', advance:'var(--blue)',
          bonus:'var(--purple)', fine:'var(--green)'
        })[tx.type] || 'var(--text)';
        const empName = tx.emp_id ? (emps.find(e => e.id === tx.emp_id)?.name || 'удалён') : '';
        return `<div style="display:grid;grid-template-columns:90px 1fr 110px;gap:8px;padding:5px 10px;background:var(--surface2);border-radius:4px;margin-bottom:3px;font-size:12px;">
          <span><span class="badge ${TYPE_BADGES[tx.type]||''}" style="font-size:10px">${TYPE_LABELS[tx.type]||tx.type}</span></span>
          <span>${tx.cat||'—'}${empName?' · <span style="color:var(--text3)">'+empName+'</span>':''}${tx.note?' <span style="color:var(--text3);font-size:11px">— '+tx.note+'</span>':''}</span>
          <span style="color:${color};font-weight:600;text-align:right;">${sign}${fmt(tx.amount)} ${_currency}</span>
        </div>`;
      }).join('')
    : `<div style="color:var(--text3);font-size:12px;padding:8px 0;">${t('detail.noData') || 'Нет операций'}</div>`;

  // Итоговые карточки
  const card = (label, value, color, sign) => `<div style="background:var(--surface2);padding:10px 12px;border-radius:var(--radius-sm);">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);margin-bottom:4px;">${label}</div>
    <div style="font-size:14px;font-weight:600;color:${color};white-space:nowrap;">${sign||''}${fmt(value)} ${_currency}</div>
  </div>`;

  const netColor = net >= 0 ? 'var(--green)' : 'var(--red)';
  const netSign  = net >= 0 ? '+' : '';

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px;">
      ${card(t('col.income'), totals.income, 'var(--green)', '+')}
      ${card(t('col.expense'), totals.expense, 'var(--red)', '−')}
      ${card(t('col.salary'), totals.salary, 'var(--accent)', '−')}
      ${card(t('col.advance'), totals.advance, 'var(--blue)', '−')}
      ${card(t('col.bonus'), totals.bonus, 'var(--purple)', '+')}
      ${card(t('col.fine'), totals.fine, 'var(--red)', '−')}
    </div>
    <div style="background:var(--surface2);padding:12px 14px;border-radius:var(--radius-sm);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--text3);">${t('col.result')}</span>
      <span style="font-size:18px;font-weight:700;color:${netColor};">${netSign}${fmt(net)} ${_currency}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">${t('detail.incomeByCat') || '📈 Доходы'}</div>
        ${renderCats('income','var(--green)')}
      </div>
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">${t('detail.expenseByCat') || '📉 Расходы'}</div>
        ${renderCats('expense','var(--red)')}
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px;">${t('detail.allOps') || '📋 Все операции дня'}</div>
    ${opsHtml}
  `;
}
