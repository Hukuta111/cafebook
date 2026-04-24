// ═══════════════════════════════════════════
// DATE RANGE PICKER
// ═══════════════════════════════════════════
const _dateRangePickers = {};
const DRP_MONTHS = new Proxy([], { get: (_, i) => i === 'length' ? 12 : t('mon.full.' + i) });
const DRP_WEEKDAYS = ['1','2','3','4','5','6','0'].map(i => null); // используется только для итерации
Object.defineProperty(DRP_WEEKDAYS, 'map', { value: function(fn) {
  const order = [1,2,3,4,5,6,0]; return order.map((dow, i) => fn(t('wd.' + dow), i, this));
}});

function createDateRangePicker(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const now = new Date();
  const drp = { from: '', to: '', tempFrom: '', tempTo: '', viewYear: now.getFullYear(), viewMonth: now.getMonth(), onChange, containerId };

  container.innerHTML = `
    <div class="drp-trigger" id="${containerId}_trigger">📅 <span id="${containerId}_label">${t('filter.allDates')}</span></div>
    <div class="drp-popup" id="${containerId}_popup">
      <div class="drp-header">
        <button onclick="drpNav('${containerId}',-1)">◀</button>
        <span class="drp-title" id="${containerId}_title"></span>
        <button onclick="drpNav('${containerId}',1)">▶</button>
      </div>
      <div class="drp-weekdays">${DRP_WEEKDAYS.map(d=>'<span>'+d+'</span>').join('')}</div>
      <div class="drp-grid" id="${containerId}_grid"></div>
      <div class="drp-actions">
        <button onclick="drpClear('${containerId}')">${t('drp.clear')}</button>
        <button class="drp-apply" onclick="drpApply('${containerId}')">${t('drp.apply')}</button>
      </div>
    </div>`;

  container.querySelector('.drp-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    // close others
    Object.keys(_dateRangePickers).forEach(k => { if (k !== containerId) document.getElementById(k+'_popup')?.classList.remove('open'); });
    Object.keys(_monthPickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
    const popup = document.getElementById(containerId+'_popup');
    popup.classList.toggle('open');
    if (popup.classList.contains('open')) {
      drp.tempFrom = drp.from;
      drp.tempTo = drp.to;
      drpRender(containerId);
    }
  });

  container.querySelector('.drp-popup').addEventListener('click', e => e.stopPropagation());

  _dateRangePickers[containerId] = drp;
  drpRender(containerId);
  return drp;
}

function drpNav(id, delta) {
  const d = _dateRangePickers[id];
  d.viewMonth += delta;
  if (d.viewMonth > 11) { d.viewMonth = 0; d.viewYear++; }
  if (d.viewMonth < 0) { d.viewMonth = 11; d.viewYear--; }
  drpRender(id);
}

function drpRender(id) {
  const d = _dateRangePickers[id];
  document.getElementById(id+'_title').textContent = DRP_MONTHS[d.viewMonth] + ' ' + d.viewYear;

  const firstDay = new Date(d.viewYear, d.viewMonth, 1);
  let startDow = firstDay.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1; // convert to Mon=0
  const daysInMo = new Date(d.viewYear, d.viewMonth + 1, 0).getDate();
  const todayStr = today();

  let html = '';
  // prev month padding
  const prevDays = new Date(d.viewYear, d.viewMonth, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevDays - i;
    const dt = new Date(d.viewYear, d.viewMonth - 1, day);
    const ds = dt.toISOString().slice(0,10);
    html += `<button class="other-month ${drpDayClass(d,ds)}" onclick="drpClick('${id}','${ds}')">${day}</button>`;
  }
  // current month
  for (let day = 1; day <= daysInMo; day++) {
    const ds = d.viewYear + '-' + String(d.viewMonth+1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    const cls = drpDayClass(d, ds) + (ds === todayStr ? ' today' : '');
    html += `<button class="${cls}" onclick="drpClick('${id}','${ds}')">${day}</button>`;
  }
  // next month padding
  const totalCells = startDow + daysInMo;
  const remaining = (7 - totalCells % 7) % 7;
  for (let day = 1; day <= remaining; day++) {
    const dt = new Date(d.viewYear, d.viewMonth + 1, day);
    const ds = dt.toISOString().slice(0,10);
    html += `<button class="other-month ${drpDayClass(d,ds)}" onclick="drpClick('${id}','${ds}')">${day}</button>`;
  }

  document.getElementById(id+'_grid').innerHTML = html;
}

function drpDayClass(d, ds) {
  const f = d.tempFrom, t = d.tempTo;
  if (!f) return '';
  if (ds === f && ds === t) return 'range-start range-end';
  if (ds === f) return 'range-start';
  if (ds === t) return 'range-end';
  if (f && t && ds > f && ds < t) return 'in-range';
  if (f && !t && ds === f) return 'range-start';
  return '';
}

function drpClick(id, ds) {
  const d = _dateRangePickers[id];
  if (!d.tempFrom || d.tempTo || ds < d.tempFrom) {
    d.tempFrom = ds;
    d.tempTo = '';
  } else {
    d.tempTo = ds;
  }
  drpRender(id);
}

function drpApply(id) {
  const d = _dateRangePickers[id];
  d.from = d.tempFrom;
  d.to = d.tempTo || d.tempFrom;
  drpUpdateLabel(id);
  document.getElementById(id+'_popup').classList.remove('open');
  if (d.onChange) d.onChange(d.from, d.to);
}

function drpClear(id) {
  const d = _dateRangePickers[id];
  d.from = ''; d.to = ''; d.tempFrom = ''; d.tempTo = '';
  drpUpdateLabel(id);
  document.getElementById(id+'_popup').classList.remove('open');
  if (d.onChange) d.onChange('', '');
}

function drpUpdateLabel(id) {
  const d = _dateRangePickers[id];
  const label = document.getElementById(id+'_label');
  if (!d.from) { label.textContent = t('filter.allDates'); label.className = ''; return; }
  const f = dateLabel(d.from);
  const t = d.to && d.to !== d.from ? ' — ' + dateLabel(d.to) : '';
  label.innerHTML = '<span class="drp-dates">' + f + t + '</span>';
}

// close all popups on outside click
document.addEventListener('click', () => {
  Object.keys(_monthPickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
  Object.keys(_dateRangePickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
  Object.keys(_dayPickers).forEach(k => { document.getElementById(k+'_popup')?.classList.remove('open'); });
});
