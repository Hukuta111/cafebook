// ═══════════════════════════════════════════
// DAY PICKER (один день)
// ═══════════════════════════════════════════
const _dayPickers = {};

function createDayPicker(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const now = new Date();
  const todayStr = today();
  const dp = { value: todayStr, viewYear: now.getFullYear(), viewMonth: now.getMonth(), onChange, containerId };

  container.innerHTML = `
    <div class="drp-trigger" id="${containerId}_trigger">📅 <span id="${containerId}_label"></span></div>
    <div class="drp-popup" id="${containerId}_popup">
      <div class="drp-header">
        <button onclick="dpNav('${containerId}',-1)">◀</button>
        <span class="drp-title" id="${containerId}_title"></span>
        <button onclick="dpNav('${containerId}',1)">▶</button>
      </div>
      <div class="drp-weekdays">${DRP_WEEKDAYS.map(d=>'<span>'+d+'</span>').join('')}</div>
      <div class="drp-grid" id="${containerId}_grid"></div>
    </div>`;

  container.querySelector('.drp-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    Object.keys(_dayPickers).forEach(k => { if (k !== containerId) document.getElementById(k+'_popup')?.classList.remove('open'); });
    Object.keys(_dateRangePickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
    Object.keys(_monthPickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
    document.getElementById(containerId+'_popup').classList.toggle('open');
  });
  container.querySelector('.drp-popup').addEventListener('click', e => e.stopPropagation());

  _dayPickers[containerId] = dp;
  dpRender(containerId);
  dpUpdateLabel(containerId);
  return dp;
}

function dpNav(id, delta) {
  const d = _dayPickers[id];
  d.viewMonth += delta;
  if (d.viewMonth > 11) { d.viewMonth = 0; d.viewYear++; }
  if (d.viewMonth < 0) { d.viewMonth = 11; d.viewYear--; }
  dpRender(id);
}

function dpRender(id) {
  const d = _dayPickers[id];
  document.getElementById(id+'_title').textContent = DRP_MONTHS[d.viewMonth] + ' ' + d.viewYear;
  const firstDay = new Date(d.viewYear, d.viewMonth, 1);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const daysInMo = new Date(d.viewYear, d.viewMonth + 1, 0).getDate();
  const todayStr = today();

  let html = '';
  const prevDays = new Date(d.viewYear, d.viewMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevDays - i;
    const dt = new Date(d.viewYear, d.viewMonth - 1, day);
    const ds = dt.toISOString().slice(0,10);
    const cls = 'other-month' + (ds === d.value ? ' range-start range-end' : '');
    html += `<button class="${cls}" onclick="dpSelect('${id}','${ds}')">${day}</button>`;
  }
  for (let day = 1; day <= daysInMo; day++) {
    const ds = d.viewYear + '-' + String(d.viewMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const cls = (ds === d.value ? 'range-start range-end ' : '') + (ds === todayStr ? 'today' : '');
    html += `<button class="${cls.trim()}" onclick="dpSelect('${id}','${ds}')">${day}</button>`;
  }
  const totalCells = startDow + daysInMo;
  const remaining = (7 - totalCells % 7) % 7;
  for (let day = 1; day <= remaining; day++) {
    const dt = new Date(d.viewYear, d.viewMonth + 1, day);
    const ds = dt.toISOString().slice(0,10);
    const cls = 'other-month' + (ds === d.value ? ' range-start range-end' : '');
    html += `<button class="${cls}" onclick="dpSelect('${id}','${ds}')">${day}</button>`;
  }
  document.getElementById(id+'_grid').innerHTML = html;
}

function dpSelect(id, ds) {
  const d = _dayPickers[id];
  d.value = ds;
  const [y, m] = ds.split('-').map(Number);
  d.viewYear = y; d.viewMonth = m - 1;
  dpUpdateLabel(id);
  dpRender(id);
  document.getElementById(id+'_popup').classList.remove('open');
  if (d.onChange) d.onChange(ds);
}

function dpSetValue(id, ds) {
  const d = _dayPickers[id];
  if (!d || !ds) return;
  d.value = ds;
  const [y, m] = ds.split('-').map(Number);
  d.viewYear = y; d.viewMonth = m - 1;
  dpUpdateLabel(id);
  dpRender(id);
}

function dpGetValue(id) {
  return _dayPickers[id]?.value || '';
}

function dpUpdateLabel(id) {
  const d = _dayPickers[id];
  const lbl = document.getElementById(id+'_label');
  if (!lbl) return;
  if (!d.value) { lbl.textContent = 'Выбрать дату'; return; }
  lbl.innerHTML = '<span class="drp-dates">' + dateLabel(d.value) + ' ' + d.value.slice(0,4) + '</span>';
}
