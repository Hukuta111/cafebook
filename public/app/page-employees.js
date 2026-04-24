// ═══════════════════════════════════════════
// EMPLOYEES
// ═══════════════════════════════════════════
function openEmpModal(emp) {
  populatePositionSelects();
  document.getElementById('empModalTitle').textContent = emp ? t('emp.edit') : t('emp.new');
  document.getElementById('empEditId').value = emp ? emp.id : '';
  document.getElementById('empName').value = emp ? emp.name : '';
  document.getElementById('empRole').value = emp ? emp.role||'' : '';
  document.getElementById('empType').value = emp ? emp.type||'staff' : 'staff';
  document.getElementById('empSalary').value = emp ? emp.salary||'' : '';
  document.getElementById('empHourlyRate').value = emp ? emp.hourly_rate||'' : '';
  document.getElementById('empTabNumber').value = emp ? emp.tab_number||'' : '';
  document.getElementById('empPercent').value = emp ? emp.percent||'' : '';
  document.getElementById('empPhone').value = emp ? emp.phone||'' : '';
  document.getElementById('empStart').value = emp ? emp.start_date||'' : '';
  document.getElementById('empStatus').value = emp ? emp.status||'active' : 'active';
  document.getElementById('empHiddenInSchedule').checked = !!(emp && emp.hidden_in_schedule);
  document.getElementById('empHiddenInMonthly').checked = !!(emp && emp.hidden_in_monthly);
  openModal('empModal');
}

async function saveEmployee() {
  const id = document.getElementById('empEditId').value || uid();
  const data = {
    name: document.getElementById('empName').value,
    role: document.getElementById('empRole').value,
    type: document.getElementById('empType').value,
    salary: parseFloat(document.getElementById('empSalary').value)||0,
    hourly_rate: parseFloat(document.getElementById('empHourlyRate').value)||0,
    tab_number: document.getElementById('empTabNumber').value.trim() || null,
    percent: parseFloat(document.getElementById('empPercent').value)||0,
    phone: document.getElementById('empPhone').value,
    start_date: document.getElementById('empStart').value,
    status: document.getElementById('empStatus').value,
    hidden_in_schedule: document.getElementById('empHiddenInSchedule').checked ? 1 : 0,
    hidden_in_monthly: document.getElementById('empHiddenInMonthly').checked ? 1 : 0,
  };
  if (!data.name) { showToast('Введите имя', true); return; }
  const isEdit = !!document.getElementById('empEditId').value;
  const res = isEdit ? await API.put('/employees/' + id, data) : await API.post('/employees', { id, ...data });
  if (res && res.ok) {
    closeModal('empModal');
    _employees = await API.get('/employees') || [];
    renderEmployees();
    showToast('Сотрудник сохранён ✓');
  }
}

async function deleteEmployee(id) {
  if (!await confirmDialog({ text: t('confirm.delEmployee'), hint: t('confirm.delEmployeeHint') })) return;
  const res = await API.del('/employees/' + id);
  if (res && res.ok) { _employees = await API.get('/employees') || []; renderEmployees(); showToast('Удалено'); }
}

function renderEmployees() {
  const tbody = document.getElementById('empTable');

  // заполнить список должностей в фильтре (без дублей)
  const posFilter = document.getElementById('empFilterPosition');
  if (posFilter) {
    const prev = posFilter.value;
    const uniqueRoles = [...new Set(_employees.map(e => e.role).filter(Boolean))].sort();
    posFilter.innerHTML = '<option value="">Все должности</option>' + uniqueRoles.map(r => `<option value="${r}">${r}</option>`).join('');
    posFilter.value = prev;
  }

  // применение фильтров
  const search = (document.getElementById('empFilterSearch')?.value || '').trim().toLowerCase();
  const filterPosition = document.getElementById('empFilterPosition')?.value || '';
  const filterType = document.getElementById('empFilterType')?.value || '';
  const filterStatus = document.getElementById('empFilterStatus')?.value || '';

  const list = _employees.filter(e => {
    if (search) {
      const matchName = e.name && e.name.toLowerCase().includes(search);
      const matchTab = e.tab_number && String(e.tab_number).toLowerCase().includes(search);
      if (!matchName && !matchTab) return false;
    }
    if (filterPosition && e.role !== filterPosition) return false;
    if (filterType && e.type !== filterType) return false;
    if (filterStatus && e.status !== filterStatus) return false;
    return true;
  });

  // сортировка
  const sortBy = document.getElementById('empSortBy')?.value || 'name';
  const sortOrder = document.getElementById('empSortOrder')?.value || 'asc';
  const sortKeyMap = { name:'name', tab:'tab_number', role:'role', salary:'salary', hourly_rate:'hourly_rate', start_date:'start_date' };
  const key = sortKeyMap[sortBy];
  list.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'salary' || key === 'hourly_rate') { av = +av||0; bv = +bv||0; return sortOrder==='asc' ? av-bv : bv-av; }
    av = (av || '').toString().toLowerCase();
    bv = (bv || '').toString().toLowerCase();
    return sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="icon">👥</div><p>${_employees.length ? 'Нет сотрудников по заданным фильтрам' : 'Нет сотрудников'}</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(e => `<tr>
    <td style="font-family:monospace;color:var(--accent)">${e.tab_number || '—'}</td>
    <td><b>${e.name}</b></td>
    <td>${e.role||'—'}</td>
    <td><span class="badge badge-blue">${EMP_TYPE_LABELS[e.type]||e.type}</span></td>
    <td>${fmt(e.salary||0)} ${_currency}</td>
    <td>${e.hourly_rate ? fmt(e.hourly_rate)+' '+_currency : '—'}</td>
    <td>${e.percent ? e.percent+'%' : '—'}</td>
    <td>${e.phone||'—'}</td>
    <td><span class="badge ${e.status==='active'?'badge-green':'badge-red'}">${e.status==='active'?t('status.active'):t('status.inactive')}</span></td>
    <td style="display:flex;gap:6px;">
      ${canEdit('employees') ? `<button class="btn btn-sm" onclick="openEmpModal(${JSON.stringify(e).replace(/"/g,"&quot;")})">✎</button>
      <button class="btn btn-sm btn-danger" onclick="deleteEmployee('${e.id}')">✕</button>` : ''}
    </td>
  </tr>`).join('');
}
