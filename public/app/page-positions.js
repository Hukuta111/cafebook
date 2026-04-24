// ═══════════════════════════════════════════
// POSITIONS
// ═══════════════════════════════════════════
let _positions = [];

async function loadPositions() {
  _positions = await API.get('/positions') || [];
}

function populatePositionSelects() {
  const opts = _positions.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  document.getElementById('empRole').innerHTML = '<option value="">— не указана —</option>' + opts;
}

async function renderPositions() {
  await loadPositions();
  const tbody = document.getElementById('posTable');
  if (!_positions.length) {
    tbody.innerHTML = '<tr><td colspan="2"><div class="empty-state"><div class="icon">📌</div><p>Нет должностей</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = _positions.map(p => {
    const safeName = p.name.replace(/"/g, '&quot;');
    const safeP = JSON.stringify(p).replace(/"/g, '&quot;');
    return `<tr>
      <td><b>${p.name}</b>${+p.hidden_in_schedule ? ' <span class="badge badge-purple" style="margin-left:8px;font-size:10px;">Скрыт в графике</span>' : ''}</td>
      <td style="text-align:right;">
        ${canEdit('positions') ? `<button class="btn btn-sm" onclick="openPosModal(${safeP})">✎</button>
        <button class="btn btn-sm btn-danger" onclick="deletePosition('${p.id}','${safeName}')">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

function openPosModal(pos) {
  document.getElementById('posModalTitle').textContent = pos ? t('pos.edit') : t('pos.new');
  document.getElementById('posEditId').value = pos ? pos.id : '';
  document.getElementById('posName').value = pos ? pos.name : '';
  document.getElementById('posHiddenInSchedule').checked = !!(pos && pos.hidden_in_schedule);
  openModal('posModal');
}

async function savePosition() {
  const id = document.getElementById('posEditId').value || uid();
  const name = document.getElementById('posName').value.trim();
  const hidden_in_schedule = document.getElementById('posHiddenInSchedule').checked ? 1 : 0;
  if (!name) { showToast('Введите название', true); return; }
  const isEdit = !!document.getElementById('posEditId').value;
  const res = isEdit
    ? await API.put('/positions/' + id, { name, hidden_in_schedule })
    : await API.post('/positions', { id, name, hidden_in_schedule });
  if (res && res.ok) {
    closeModal('posModal');
    await loadPositions();
    renderPositions();
    showToast('Должность сохранена ✓');
  } else if (res) {
    showToast(res.error || 'Ошибка', true);
  }
}

async function deletePosition(id, name) {
  if (!await confirmDialog({ text: t('confirm.delPosition').replace('{name}', name) })) return;
  const res = await API.del('/positions/' + id);
  if (res && res.ok) { renderPositions(); showToast('Удалено'); }
}
