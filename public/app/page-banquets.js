// ═══════════════════════════════════════════
// BANQUETS
// ═══════════════════════════════════════════
let _banquets = [];

async function renderBanquets() {
  if (!_monthPickers['banquetMonthPicker']) createMonthPicker('banquetMonthPicker', () => renderBanquets());
  const cur = today().slice(0,7);
  const month = _monthPickers['banquetMonthPicker']?.value || cur;
  _employees = await API.get('/employees') || [];
  _banquets = await API.get('/banquets?month=' + month) || [];

  const container = document.getElementById('banquetsList');
  if (!_banquets.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🎉</div><p>Нет банкетов за ${monthLabel(month)}</p></div>`;
    return;
  }

  container.innerHTML = _banquets.map(b => {
    const items = Array.isArray(b.items) ? b.items : [];
    const isInBonus  = (it) => it.in_bonus  === 1 || it.in_bonus  === true || it.inBonus  === true;
    const isBonusFull = (it) => it.bonus_full === 1 || it.bonus_full === true || it.bonusFull === true;
    const incomeSum = items.filter(x => x.type === 'income').reduce((s,x) => s + +x.amount, 0);
    const expenseSum = items.filter(x => x.type === 'expense').reduce((s,x) => s + +x.amount, 0);
    const netTotal = +b.total + incomeSum - expenseSum;
    // База для % = total + статьи «В бонус» (со знаком по типу)
    const baseIncome  = items.filter(x => x.type === 'income'  && isInBonus(x)).reduce((s,x) => s + +x.amount, 0);
    const baseExpense = items.filter(x => x.type === 'expense' && isInBonus(x)).reduce((s,x) => s + +x.amount, 0);
    const base = +b.total + baseIncome - baseExpense;
    const baseDiffers = Math.abs(base - +b.total) > 0.001;
    // Прибавки целиком к бонусу (поверх процента)
    const extraIncome  = items.filter(x => x.type === 'income'  && isBonusFull(x)).reduce((s,x) => s + +x.amount, 0);
    const extraExpense = items.filter(x => x.type === 'expense' && isBonusFull(x)).reduce((s,x) => s + +x.amount, 0);
    const percentBonus = base * (+b.percent / 100);
    const extra = extraIncome - extraExpense;
    const bonus = Math.max(0, percentBonus + extra);
    const hasExtra = Math.abs(extra) > 0.001;
    const distributed = (b.shares || []).reduce((s, x) => s + +x.amount, 0);
    const diff = bonus - distributed;
    const itemsHtml = items.length
      ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:4px;">'
        + items.map(it => {
          const color = it.type === 'income' ? 'var(--green)' : 'var(--red)';
          const sign = it.type === 'income' ? '+' : '−';
          const inB = isInBonus(it);
          const bF = isBonusFull(it);
          const badges =
            (inB ? ' <span style="background:var(--accent);color:#fff;font-size:9px;padding:1px 6px;border-radius:8px;letter-spacing:.3px;text-transform:uppercase;font-weight:600;">в бонус</span>' : '') +
            (bF ? ' <span style="background:var(--green);color:#000;font-size:9px;padding:1px 6px;border-radius:8px;letter-spacing:.3px;text-transform:uppercase;font-weight:600;">целиком</span>' : '');
          const label = `${it.name || '(без названия)'}${+it.qty>1 || +it.price>0 ? ' · '+(+it.qty)+'×'+fmt(+it.price) : ''}${badges}`;
          return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:4px 12px;background:var(--surface);border-radius:4px;">
            <span>${label}</span>
            <span style="color:${color};font-weight:600;">${sign}${fmt(+it.amount)} ${_currency}</span>
          </div>`;
        }).join('')
        + '</div>'
      : '';
    const sharesHtml = (b.shares || []).length
      ? '<div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">'
        + b.shares.map(s => {
          const emp = _employees.find(e => e.id === s.emp_id);
          return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:6px 12px;background:var(--surface2);border-radius:var(--radius-sm);">
            <span style="flex:1;">${emp ? emp.name : 'Удалённый'}${emp && emp.role ? ' <span style="color:var(--text3);font-size:11px">— '+emp.role+'</span>' : ''}</span>
            <input type="number" data-share-id="${s.id}" data-banquet-id="${b.id}" value="${+s.amount}" min="0" step="0.01"
              ${canEdit('banquets') ? '' : 'readonly'}
              onchange="updateBanquetShare('${b.id}','${s.id}',this.value)"
              style="width:110px;text-align:right;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);padding:5px 10px;color:var(--text);font-size:13px;outline:none;">
            <span style="color:var(--text3);width:40px;">${_currency}</span>
          </div>`;
        }).join('')
        + `<div style="display:flex;justify-content:space-between;padding:6px 12px;font-size:11px;color:${Math.abs(diff)<0.01?'var(--text3)':'var(--red)'};">
            <span>${Math.abs(diff)<0.01 ? 'Разница с расчётом' : 'Расхождение с бонусом'}</span>
            <span>${diff>=0?'+':''}${fmt(diff)} ${_currency}</span>
          </div>`
        + '</div>'
      : '<div style="color:var(--text3);font-size:12px;margin-top:10px;">Нет сотрудников работавших в этот день — добавьте смены в Графике</div>';

    const editable = canEdit('banquets');
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:14px;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--accent);">${dateLabel(b.date)}${b.note ? ' · <span style="font-family:inherit;font-size:14px;color:var(--text2)">'+b.note+'</span>' : ''}</div>
          <div style="color:var(--text3);font-size:13px;margin-top:4px;">
            Банкет: <b style="color:var(--text)">${fmt(b.total)} ${_currency}</b>${incomeSum ? ' &nbsp;+ <b style="color:var(--green)">'+fmt(incomeSum)+'</b>' : ''}${expenseSum ? ' &nbsp;− <b style="color:var(--red)">'+fmt(expenseSum)+'</b>' : ''}${(incomeSum||expenseSum) ? ' = факт <b style="color:var(--text)">'+fmt(netTotal)+'</b>' : ''} &nbsp;·&nbsp; бонус сотрудникам <b style="color:var(--green)">${b.percent}% от ${fmt(base)} = ${fmt(percentBonus)}</b>${baseDiffers ? ' <span style="color:var(--text3);font-size:11px;">(база = ' + fmt(b.total) + (baseIncome ? ' + '+fmt(baseIncome) : '') + (baseExpense ? ' − '+fmt(baseExpense) : '') + ')</span>' : ''}${hasExtra ? (extraIncome ? ' &nbsp;+ <b style="color:var(--green)">'+fmt(extraIncome)+'</b>' : '') + (extraExpense ? ' &nbsp;− <b style="color:var(--red)">'+fmt(extraExpense)+'</b>' : '') + ' &nbsp;= <b style="color:var(--green)">'+fmt(bonus)+'</b>' : ''}
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          ${editable ? `<button class="btn btn-sm" onclick='openBanquetModal(${JSON.stringify(b).replace(/"/g,"&quot;").replace(/'/g,"\\'")})'>✎ Изменить</button>
          <button class="btn btn-sm" onclick="recalcBanquetShares('${b.id}')" title="Пересчитать доли поровну">⟲ Поровну</button>
          <button class="btn btn-sm btn-primary" onclick="applyBanquet('${b.id}')">💰 Начислить</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBanquet('${b.id}')">✕</button>` : ''}
        </div>
      </div>
      ${itemsHtml}
      ${sharesHtml}
    </div>`;
  }).join('');
}

let _banquetItems = []; // локальный буфер в модалке: [{id?, type, name, qty, price}]

function openBanquetModal(b) {
  if (!canEdit('banquets')) return;
  document.getElementById('banquetModalTitle').textContent = b ? t('banquet.edit') : t('banquet.new');
  document.getElementById('banquetEditId').value = b ? b.id : '';
  if (!_dayPickers['banquetDatePicker']) createDayPicker('banquetDatePicker');
  dpSetValue('banquetDatePicker', b ? b.date : today());
  document.getElementById('banquetTotal').value = b ? b.total : '';
  document.getElementById('banquetPercent').value = b ? b.percent : 10;
  document.getElementById('banquetNote').value = b ? (b.note || '') : '';
  _banquetItems = b && Array.isArray(b.items)
    ? b.items.map(x => ({
        id: x.id, type: x.type, name: x.name,
        qty: +x.qty || 1, price: +x.price || 0,
        inBonus: x.in_bonus === 1 || x.in_bonus === true || x.inBonus === true,
        bonusFull: x.bonus_full === 1 || x.bonus_full === true || x.bonusFull === true,
      }))
    : [];
  renderBanquetItems();
  openModal('banquetModal');
}

function getBanquetItemNameSuggestions() {
  const names = new Set();
  (_banquets || []).forEach(b => (b.items || []).forEach(it => { if (it.name) names.add(it.name); }));
  return [...names].sort();
}

function renderBanquetItems() {
  const list = document.getElementById('banquetItemsList');
  if (!_banquetItems.length) {
    list.innerHTML = `<div style="color:var(--text3);font-size:12px;padding:6px 4px;">${t('banquet.empty')}</div>`;
    updateBanquetSummary();
    return;
  }
  const suggestions = getBanquetItemNameSuggestions();
  const datalist = `<datalist id="banquetItemNames">${suggestions.map(n => `<option value="${n.replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>`;
  const gridCols = '24px minmax(0,1.6fr) 60px 80px 80px 32px 32px 32px';
  const header = `<div style="display:grid;grid-template-columns:${gridCols};gap:6px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;padding:0 6px 4px;">
    <span></span>
    <span>${t('banquet.title')}</span>
    <span style="text-align:center">${t('banquet.qty')}</span>
    <span style="text-align:center">${t('banquet.price')}</span>
    <span style="text-align:right">${t('banquet.itemTotal')}</span>
    <span style="text-align:center" title="${t('banquet.inBonusHint')}">${t('banquet.inBonus')}</span>
    <span style="text-align:center" title="${t('banquet.bonusFullHint')}">${t('banquet.bonusFull')}</span>
    <span></span>
  </div>`;
  list.innerHTML = datalist + header + _banquetItems.map((it, i) => {
    const color = it.type === 'income' ? 'var(--green)' : 'var(--red)';
    const label = it.type === 'income' ? '+' : '−';
    const total = (+it.qty || 0) * (+it.price || 0);
    return `<div data-item-idx="${i}" style="display:grid;grid-template-columns:${gridCols};gap:6px;align-items:center;padding:6px;background:var(--surface2);border-radius:var(--radius-sm);">
      <span style="color:${color};font-size:18px;font-weight:700;text-align:center;">${label}</span>
      <input type="text" list="banquetItemNames" value="${(it.name||'').replace(/"/g,'&quot;')}" placeholder="${t('banquet.title')}" title="${(it.name||'').replace(/"/g,'&quot;')}"
        oninput="_banquetItems[${i}].name=this.value;this.title=this.value"
        style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:12px;outline:none;min-width:0;text-overflow:ellipsis;">
      <input type="number" value="${it.qty}" step="0.01" min="0" oninput="onBanquetItemChange(${i},'qty',this.value)"
        style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:12px;outline:none;text-align:right;">
      <input type="number" value="${it.price}" step="0.01" min="0" oninput="onBanquetItemChange(${i},'price',this.value)"
        style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:5px 8px;color:var(--text);font-size:12px;outline:none;text-align:right;">
      <div data-item-total="${i}" style="text-align:right;color:${color};font-weight:600;font-size:13px;">${label}${fmt(total)}</div>
      <label class="perm-cb" style="justify-self:center" title="${t('banquet.inBonusHint')}">
        <input type="checkbox" ${it.inBonus ? 'checked' : ''} onchange="onBanquetItemBonusToggle(${i}, this.checked)">
        <span class="perm-cb-box"></span>
      </label>
      <label class="perm-cb" style="justify-self:center" title="${t('banquet.bonusFullHint')}">
        <input type="checkbox" ${it.bonusFull ? 'checked' : ''} onchange="onBanquetItemBonusFullToggle(${i}, this.checked)">
        <span class="perm-cb-box"></span>
      </label>
      <button type="button" onclick="removeBanquetItem(${i})" class="btn btn-sm btn-danger" style="padding:2px 7px;font-size:12px;">✕</button>
    </div>`;
  }).join('');
  updateBanquetSummary();
}

function updateBanquetSummary() {
  const total = parseFloat(document.getElementById('banquetTotal').value) || 0;
  const percent = parseFloat(document.getElementById('banquetPercent').value) || 0;
  let income = 0, expense = 0;
  // «В бонус»  — добавляется в БАЗУ для %
  // «Целиком»  — прибавляется к бонусу ПОЛНОСТЬЮ (поверх процента)
  let baseIncome = 0, baseExpense = 0;     // for in_bonus
  let extraIncome = 0, extraExpense = 0;   // for bonus_full
  _banquetItems.forEach(it => {
    const sum = (+it.qty || 0) * (+it.price || 0);
    if (it.type === 'income') income += sum; else expense += sum;
    if (it.inBonus) {
      if (it.type === 'income') baseIncome += sum; else baseExpense += sum;
    }
    if (it.bonusFull) {
      if (it.type === 'income') extraIncome += sum; else extraExpense += sum;
    }
  });
  const net = total + income - expense;
  const base = total + baseIncome - baseExpense;
  const percentBonus = base * percent / 100;
  const extra = extraIncome - extraExpense;
  const bonus = Math.max(0, percentBonus + extra);
  const el = document.getElementById('banquetSummary');
  if (el) {
    const baseChanged = Math.abs(base - total) > 0.001;
    let bonusLine = `${t('banquet.summary.bonus')}: <b style="color:var(--green)">${percent}% ${t('banquet.summary.from')} ${fmt(base)} = ${fmt(percentBonus)}</b>`;
    if (baseChanged) {
      bonusLine += ` <span style="color:var(--text3);font-size:11px;">(база = ${fmt(total)}${baseIncome ? ' + '+fmt(baseIncome) : ''}${baseExpense ? ' − '+fmt(baseExpense) : ''})</span>`;
    }
    if (Math.abs(extra) > 0.001) {
      if (extraIncome) bonusLine += ` &nbsp;+ <b style="color:var(--green)">${fmt(extraIncome)}</b>`;
      if (extraExpense) bonusLine += ` &nbsp;− <b style="color:var(--red)">${fmt(extraExpense)}</b>`;
      bonusLine += ` &nbsp;= <b style="color:var(--green)">${fmt(bonus)}</b>`;
    }
    el.innerHTML = `${t('banquet.summary.main')}: <b style="color:var(--text)">${fmt(total)}</b>`
      + (income ? ` &nbsp;·&nbsp; ${t('banquet.summary.incomes')}: <b style="color:var(--green)">+${fmt(income)}</b>` : '')
      + (expense ? ` &nbsp;·&nbsp; ${t('banquet.summary.expenses')}: <b style="color:var(--red)">−${fmt(expense)}</b>` : '')
      + ((income||expense) ? ` &nbsp;·&nbsp; ${t('banquet.summary.actual')}: <b style="color:var(--text)">${fmt(net)}</b>` : '')
      + `<br>${bonusLine}`;
  }
}

function onBanquetItemBonusToggle(index, checked) {
  if (!_banquetItems[index]) return;
  _banquetItems[index].inBonus = !!checked;
  updateBanquetSummary();
}

function onBanquetItemBonusFullToggle(index, checked) {
  if (!_banquetItems[index]) return;
  _banquetItems[index].bonusFull = !!checked;
  updateBanquetSummary();
}

function onBanquetItemChange(index, field, value) {
  const v = +value || 0;
  _banquetItems[index][field] = v;
  // обновить только total строки
  const it = _banquetItems[index];
  const total = (+it.qty || 0) * (+it.price || 0);
  const label = it.type === 'income' ? '+' : '−';
  const el = document.querySelector('[data-item-total="' + index + '"]');
  if (el) el.textContent = label + fmt(total);
  updateBanquetSummary();
}

function addBanquetItem(type) {
  _banquetItems.push({ id: uid(), type, name: '', qty: 1, price: 0, inBonus: false, bonusFull: false });
  renderBanquetItems();
}

function removeBanquetItem(index) {
  _banquetItems.splice(index, 1);
  renderBanquetItems();
}

async function saveBanquet() {
  const id = document.getElementById('banquetEditId').value;
  const date = dpGetValue('banquetDatePicker');
  const total = parseFloat(document.getElementById('banquetTotal').value);
  const percent = parseFloat(document.getElementById('banquetPercent').value) || 10;
  const note = document.getElementById('banquetNote').value;
  if (!date || !total || total <= 0) { showToast('Укажите дату и сумму банкета', true); return; }
  const items = _banquetItems.map(it => ({
    id: it.id, type: it.type, name: it.name || '',
    qty: +it.qty || 0, price: +it.price || 0,
    amount: (+it.qty || 0) * (+it.price || 0),
    inBonus: !!it.inBonus,
    bonusFull: !!it.bonusFull,
  }));
  const res = id
    ? await API.put('/banquets/' + id, { date, total, percent, note, items, recalc: true })
    : await API.post('/banquets', { id: uid(), date, total, percent, note });
  if (res && res.ok) {
    // если это создание — сразу же обновим items через PUT (POST не принимает items)
    if (!id && items.length) {
      await API.put('/banquets/' + res.id, { date, total, percent, note, items, recalc: true });
    }
    closeModal('banquetModal');
    renderBanquets();
    showToast('Банкет сохранён ✓');
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function updateBanquetShare(banquetId, shareId, newAmount) {
  await API.put('/banquets/' + banquetId, { shares: [{ id: shareId, amount: parseFloat(newAmount)||0 }],
    date: _banquets.find(b => b.id === banquetId)?.date,
    total: _banquets.find(b => b.id === banquetId)?.total,
    percent: _banquets.find(b => b.id === banquetId)?.percent,
    note: _banquets.find(b => b.id === banquetId)?.note || '',
  });
  renderBanquets();
}

async function recalcBanquetShares(id) {
  const b = _banquets.find(x => x.id === id);
  if (!b) return;
  const res = await API.put('/banquets/' + id, { date: b.date, total: b.total, percent: b.percent, note: b.note || '', recalc: true });
  if (res && res.ok) { renderBanquets(); showToast('Доли пересчитаны поровну ✓'); }
}

async function applyBanquet(id) {
  const res = await API.post('/banquets/' + id + '/apply', {});
  if (res && res.ok) { showToast('Начислено ' + res.created + ' бонусов ✓'); }
}

async function deleteBanquet(id) {
  if (!await confirmDialog({ text: t('confirm.delBanquet'), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/banquets/' + id);
  if (res && res.ok) { renderBanquets(); showToast('Банкет удалён'); }
}
