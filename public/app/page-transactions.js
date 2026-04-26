// ═══════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════
function updateTxCats() {
  const type = document.getElementById('txType').value;
  const cats = TX_CATS[type]||[];
  document.getElementById('txCat').innerHTML = cats.map(c=>`<option>${c}</option>`).join('');
}

function openTxModal(tx) {
  if (!canEdit('transactions')) return;
  populateEmpSelects();
  document.getElementById('txEditId').value = tx ? tx.id : '';
  document.getElementById('txDate').value = tx ? tx.date : today();
  document.getElementById('txType').value = tx ? tx.type : 'income';
  updateTxCats();
  if (tx && tx.cat) document.getElementById('txCat').value = tx.cat;
  document.getElementById('txEmployee').value = tx ? tx.emp_id||'' : '';
  document.getElementById('txAmount').value = tx ? tx.amount : '';
  document.getElementById('txNote').value = tx ? tx.note||'' : '';
  document.getElementById('txDeleteBtn').style.display = tx ? '' : 'none';
  document.querySelector('#txModal .modal-title').textContent = tx ? t('tx.edit') : t('tx.modalTitle');
  openModal('txModal');
}

async function saveTx() {
  const editId = document.getElementById('txEditId').value;
  const date = document.getElementById('txDate').value;
  const type = document.getElementById('txType').value;
  const cat = document.getElementById('txCat').value;
  const empId = document.getElementById('txEmployee').value;
  const amount = parseFloat(document.getElementById('txAmount').value);
  const note = document.getElementById('txNote').value;
  if (!date || !amount || amount <= 0) { showToast('Заполните дату и сумму', true); return; }
  const res = editId
    ? await API.put('/transactions/' + editId, { date, type, cat, empId: empId||null, amount, note })
    : await API.post('/transactions', { id: uid(), date, type, cat, empId: empId||null, amount, note });
  if (res && res.ok) { closeModal('txModal'); renderTransactions(); showToast(editId ? 'Транзакция обновлена ✓' : 'Транзакция сохранена ✓'); }
}

async function deleteTx(id) {
  if (!await confirmDialog({ text: t('confirm.delTx'), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/transactions/' + id);
  if (res && res.ok) { renderTransactions(); showToast('Удалено'); }
}

async function deleteTxFromModal() {
  const id = document.getElementById('txEditId').value;
  if (!id) return;
  if (!await confirmDialog({ text: t('confirm.delTx'), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/transactions/' + id);
  if (res && res.ok) { closeModal('txModal'); renderTransactions(); showToast('Удалено'); }
}

async function renderTransactions() {
  if (!_monthPickers['txMonthPicker']) createMonthPicker('txMonthPicker', () => renderTransactions());
  _employees = await API.get('/employees') || [];
  populateEmpSelects();
  const month = _monthPickers['txMonthPicker']?.value || '';
  const type = document.getElementById('txFilterType').value;
  const empId = document.getElementById('txFilterEmployee').value;
  let url = '/transactions?';
  if (month) url += 'month=' + month + '&';
  if (type) url += 'type=' + type + '&';
  if (empId) url += 'empId=' + empId;
  if (!_dateRangePickers['txDateRange']) createDateRangePicker('txDateRange', () => renderTransactions());
  let txs = await API.get(url) || [];
  const txDrp = _dateRangePickers['txDateRange'];
  const txFrom = txDrp?.from || '';
  const txTo = txDrp?.to || '';
  if (txFrom) txs = txs.filter(t => t.date >= txFrom);
  if (txTo) txs = txs.filter(t => t.date <= txTo);
  const txSort = document.getElementById('txSortOrder').value;
  txs.sort((a,b) => txSort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  document.getElementById('txCount').textContent = `${t('page.transactions')} (${txs.length})`;
  const tbody = document.getElementById('txTable');
  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon">📭</div><p>Нет транзакций</p></div></td></tr>`;
    updateTxBulkBar();
    return;
  }
  const editable = canEdit('transactions');
  tbody.innerHTML = txs.map(tx => {
    const col = ['income','fine'].includes(tx.type)?'var(--green)':'var(--red)';
    const sign = ['income','fine'].includes(tx.type)?'+':'-';
    const cbCell = editable
      ? `<td style="text-align:center;"><input type="checkbox" class="tx-select-cb" data-tx-id="${tx.id}" onchange="onTxSelectChange()"></td>`
      : `<td></td>`;
    return `<tr>
      ${cbCell}
      <td>${dateLabel(tx.date)}</td>
      <td><span class="badge ${TYPE_BADGES[tx.type]}">${TYPE_LABELS[tx.type]}</span></td>
      <td>${tx.cat||'—'}</td>
      <td>${empName(tx.emp_id)}</td>
      <td style="font-weight:600;color:${col};white-space:nowrap">${sign}${fmt(tx.amount)} ${_currency}</td>
      <td style="color:var(--text3)">${tx.note||'—'}</td>
      <td style="display:flex;gap:4px;">${editable ? `<button class="btn btn-sm" onclick="openTxModal(${JSON.stringify(tx).replace(/"/g,'&quot;')})">✎</button><button class="btn btn-sm btn-danger" onclick="deleteTx('${tx.id}')">✕</button>` : ''}</td>
    </tr>`;
  }).join('');
  // сбрасываем "выбрать все" чекбокс и обновляем bulk-bar
  const selAll = document.getElementById('txSelectAll');
  if (selAll) selAll.checked = false;
  updateTxBulkBar();
}

// Снять/проставить все галочки
function toggleSelectAllTx(checked) {
  document.querySelectorAll('.tx-select-cb').forEach(cb => { cb.checked = !!checked; });
  updateTxBulkBar();
}

// Обработчик клика по строковому чекбоксу
function onTxSelectChange() {
  // если все выбраны — поставить selectAll, иначе снять
  const all = document.querySelectorAll('.tx-select-cb');
  const checked = document.querySelectorAll('.tx-select-cb:checked');
  const selAll = document.getElementById('txSelectAll');
  if (selAll) selAll.checked = all.length > 0 && all.length === checked.length;
  updateTxBulkBar();
}

// Показать/скрыть bulk-bar и обновить счётчик
function updateTxBulkBar() {
  const checked = document.querySelectorAll('.tx-select-cb:checked');
  const bar = document.getElementById('txBulkBar');
  const cnt = document.getElementById('txSelectedCount');
  if (!bar) return;
  if (checked.length > 0 && canEdit('transactions')) {
    bar.style.display = 'flex';
    if (cnt) cnt.textContent = (t('tx.selected') || 'Выбрано') + ': ' + checked.length;
  } else {
    bar.style.display = 'none';
  }
}

// Массовое удаление выбранных
async function bulkDeleteSelectedTx() {
  const ids = [...document.querySelectorAll('.tx-select-cb:checked')].map(cb => cb.dataset.txId);
  if (!ids.length) return;
  const text = (t('confirm.delTxBulk') || 'Удалить выбранные транзакции?').replace('{n}', ids.length);
  if (!await confirmDialog({ text, hint: t('confirm.irreversible') })) return;
  showLoader(true);
  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      const res = await API.del('/transactions/' + id);
      if (res && res.ok) ok++; else fail++;
    } catch { fail++; }
  }
  showLoader(false);
  await renderTransactions();
  let msg = '✓ ' + (t('tx.bulkDeleted') || 'Удалено') + ': ' + ok;
  if (fail) msg += ' · ✕ ' + (t('common.errors') || 'ошибок') + ': ' + fail;
  showToast(msg, !!fail);
}
