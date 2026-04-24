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

  // bar chart
  const byDay = {};
  txs.forEach(t => {
    if (!byDay[t.date]) byDay[t.date] = { income:0, expense:0 };
    if (t.type==='income') byDay[t.date].income += +t.amount;
    else byDay[t.date].expense += +t.amount;
  });
  const days = Object.keys(byDay).sort().slice(-14);
  const maxV = Math.max(...days.map(d=>Math.max(byDay[d].income,byDay[d].expense)),1);
  document.getElementById('barChart').innerHTML = days.length
    ? days.map(d=>`<div class="bar-wrap">
        <div style="display:flex;gap:2px;align-items:flex-end;height:110px;">
          <div class="bar" style="background:var(--green);height:${Math.max(4,byDay[d].income/maxV*110)}px;width:12px;opacity:.85"></div>
          <div class="bar" style="background:var(--red);height:${Math.max(4,byDay[d].expense/maxV*110)}px;width:12px;opacity:.85"></div>
        </div>
        <div class="bar-label">${dateLabel(d).split(' ')[0]}</div>
      </div>`).join('')
    : `<div style="color:var(--text3);font-size:13px;padding:40px">Нет данных</div>`;

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
