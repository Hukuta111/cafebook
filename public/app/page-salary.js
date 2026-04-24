// ═══════════════════════════════════════════
// SALARY
// ═══════════════════════════════════════════
function openSalModal(tx) {
  populateEmpSelects();
  populateSalTypeSelect();
  document.getElementById('salEditId').value = tx ? tx.id : '';
  document.getElementById('salDate').value = tx ? tx.date : today();
  if (tx) document.getElementById('salEmployee').value = tx.emp_id || '';
  document.getElementById('salType').value = tx ? tx.type : 'salary';
  document.getElementById('salAmount').value = tx ? tx.amount : '';
  document.getElementById('salNote').value = tx ? tx.note||'' : '';
  document.getElementById('salDeleteBtn').style.display = tx ? '' : 'none';
  document.querySelector('#salModal .modal-title').textContent = tx ? t('sal.edit') : t('sal.new');
  openModal('salModal');
}

async function saveSalaryEntry() {
  const editId = document.getElementById('salEditId').value;
  const date = document.getElementById('salDate').value;
  const empId = document.getElementById('salEmployee').value;
  const typeVal = document.getElementById('salType').value;
  const amount = parseFloat(document.getElementById('salAmount').value);
  const note = document.getElementById('salNote').value;
  if (!date || !empId || !amount || amount <= 0) { showToast('Заполните все поля', true); return; }
  const emp = _employees.find(e => e.id === empId);

  // определяем тип и категорию
  const allTypes = getAllSalTypes();
  const salTypeObj = allTypes.find(t => t.id === typeVal);
  let type, cat;
  if (salTypeObj && salTypeObj.builtin) {
    type = typeVal;
    cat = salTypeObj.label;
  } else if (salTypeObj) {
    type = salTypeObj.sign === '+' ? 'income' : 'salary';
    cat = salTypeObj.label;
  } else {
    type = 'salary';
    cat = typeVal;
  }

  const res = editId
    ? await API.put('/transactions/' + editId, { date, type, cat, empId, amount, note: note||(emp?emp.name:'') })
    : await API.post('/transactions', { id: uid(), date, type, cat, empId, amount, note: note||(emp?emp.name:'') });
  if (res && res.ok) { closeModal('salModal'); renderSalary(); showToast(editId ? 'Выплата обновлена ✓' : 'Выплата записана ✓'); }
}

async function deleteSalFromModal() {
  const id = document.getElementById('salEditId').value;
  if (!id) return;
  if (!await confirmDialog({ text: t('confirm.delSal'), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/transactions/' + id);
  if (res && res.ok) { closeModal('salModal'); renderSalary(); showToast('Удалено'); }
}

async function renderSalary() {
  if (!_monthPickers['salMonthPicker']) createMonthPicker('salMonthPicker', () => renderSalary());
  _employees = await API.get('/employees') || [];
  populateEmpSelects();
  const month = _monthPickers['salMonthPicker']?.value || '';
  const empId = document.getElementById('salFilterEmployee').value;
  let url = '/transactions?';
  const types = ['salary','advance','bonus','fine'];
  if (month) url += 'month=' + month + '&';
  if (empId) url += 'empId=' + empId;
  if (!_dateRangePickers['salDateRange']) createDateRangePicker('salDateRange', () => renderSalary());
  let txs = (await API.get(url) || []).filter(t => types.includes(t.type));
  const salDrp = _dateRangePickers['salDateRange'];
  const salFrom = salDrp?.from || '';
  const salTo = salDrp?.to || '';
  if (salFrom) txs = txs.filter(t => t.date >= salFrom);
  if (salTo) txs = txs.filter(t => t.date <= salTo);
  const salSort = document.getElementById('salSortOrder').value;
  txs.sort((a,b) => salSort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
  const tbody = document.getElementById('salTable');
  if (!txs.length) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="icon">💰</div><p>Нет данных</p></div></td></tr>`; return; }
  tbody.innerHTML = txs.map(t => {
    const col = t.type==='bonus'?'var(--purple)':t.type==='fine'?'var(--red)':t.type==='advance'?'var(--blue)':'var(--accent)';
    return `<tr>
      <td>${dateLabel(t.date)}</td>
      <td><b>${empName(t.emp_id)}</b></td>
      <td><span class="badge ${TYPE_BADGES[t.type]}">${TYPE_LABELS[t.type]}</span></td>
      <td style="font-weight:600;color:${col}">${fmt(t.amount)} ${_currency}</td>
      <td style="color:var(--text3)">${t.note||'—'}</td>
      <td style="display:flex;gap:4px;">${canEdit('salary') ? `<button class="btn btn-sm" onclick="openSalModal(${JSON.stringify(t).replace(/"/g,'&quot;')})">✎</button><button class="btn btn-sm btn-danger" onclick="deleteSalTx('${t.id}')">✕</button>` : ''}</td>
    </tr>`;
  }).join('');
}

async function deleteSalTx(id) {
  if (!await confirmDialog({ text: t('confirm.delSal'), hint: t('confirm.irreversible') })) return;
  const res = await API.del('/transactions/' + id);
  if (res && res.ok) { renderSalary(); showToast('Удалено'); }
}
