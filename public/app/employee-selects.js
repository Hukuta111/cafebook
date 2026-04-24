// ═══════════════════════════════════════════
// POPULATE EMPLOYEE SELECTS
// ═══════════════════════════════════════════
function populateEmpSelects() {
  const active = _employees.filter(e => e.status === 'active');

  // группируем по tab_number: если у нескольких одинаковый — совмещение
  const byTab = {};
  const single = [];
  active.forEach(e => {
    const tab = e.tab_number ? String(e.tab_number).trim() : '';
    if (tab) {
      if (!byTab[tab]) byTab[tab] = [];
      byTab[tab].push(e);
    } else {
      single.push(e);
    }
  });

  // детальные опции (с должностью для совмещений)
  let detailedOpts = '';
  // сначала сотрудники с одной должностью или без таб. номера
  single.forEach(e => {
    detailedOpts += `<option value="${e.id}">${e.name}${e.role ? ' ('+e.role+')' : ''}</option>`;
  });
  // потом группы совмещений
  Object.entries(byTab).forEach(([tab, list]) => {
    if (list.length === 1) {
      const e = list[0];
      detailedOpts += `<option value="${e.id}">${e.name}${e.role ? ' ('+e.role+')' : ''} №${tab}</option>`;
    } else {
      detailedOpts += `<optgroup label="${list[0].name} №${tab}">`;
      list.forEach(e => {
        detailedOpts += `<option value="${e.id}">${e.role || EMP_TYPE_LABELS[e.type] || '—'}</option>`;
      });
      detailedOpts += '</optgroup>';
    }
  });

  // простые опции для фильтров (без дублей)
  const simpleOpts = active.map(e => `<option value="${e.id}">${e.name}${e.role ? ' ('+e.role+')' : ''}</option>`).join('');
  const allSimple = `<option value="">${t('filter.allEmployees')}</option>` + simpleOpts;

  const txFilter = document.getElementById('txFilterEmployee');
  const salFilter = document.getElementById('salFilterEmployee');
  const prevTx = txFilter.value;
  const prevSal = salFilter.value;

  document.getElementById('txEmployee').innerHTML = `<option value="">— не указан —</option>` + detailedOpts;
  txFilter.innerHTML = allSimple;
  document.getElementById('salEmployee').innerHTML = detailedOpts || '<option value="">— нет сотрудников —</option>';
  salFilter.innerHTML = allSimple;

  txFilter.value = prevTx;
  salFilter.value = prevSal;
}

function empName(id) {
  const e = _employees.find(e => e.id === id);
  return e ? e.name : '—';
}
