// ═══════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════
function updateTxCats() {
  const type = document.getElementById('txType').value;
  const cats = TX_CATS[type]||[];
  document.getElementById('txCat').innerHTML = cats.map(c=>`<option>${c}</option>`).join('');
}

function openTxModal(tx) {
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
  if (!txs.length) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="icon">📭</div><p>Нет транзакций</p></div></td></tr>`; return; }
  tbody.innerHTML = txs.map(t => {
    const col = ['income','fine'].includes(t.type)?'var(--green)':'var(--red)';
    const sign = ['income','fine'].includes(t.type)?'+':'-';
    return `<tr>
      <td>${dateLabel(t.date)}</td>
      <td><span class="badge ${TYPE_BADGES[t.type]}">${TYPE_LABELS[t.type]}</span></td>
      <td>${t.cat||'—'}</td>
      <td>${empName(t.emp_id)}</td>
      <td style="font-weight:600;color:${col};white-space:nowrap">${sign}${fmt(t.amount)} ${_currency}</td>
      <td style="color:var(--text3)">${t.note||'—'}</td>
      <td style="display:flex;gap:4px;">${canEdit('transactions') ? `<button class="btn btn-sm" onclick="openTxModal(${JSON.stringify(t).replace(/"/g,'&quot;')})">✎</button><button class="btn btn-sm btn-danger" onclick="deleteTx('${t.id}')">✕</button>` : ''}</td>
    </tr>`;
  }).join('');
}
