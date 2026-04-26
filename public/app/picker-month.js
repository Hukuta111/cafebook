// ═══════════════════════════════════════════
// MONTH PICKER
// ═══════════════════════════════════════════
function MONTH_NAMES_SHORT_ARR() {
  const a = []; for (let i=0;i<12;i++) a.push(t('mon.short.' + i)); return a;
}
const MONTH_NAMES_SHORT = new Proxy([], {
  get(_, k) {
    if (k === 'length') return 12;
    if (k === 'map' || k === 'forEach' || k === 'filter') {
      const a = MONTH_NAMES_SHORT_ARR();
      return a[k].bind(a);
    }
    const idx = +k;
    if (Number.isFinite(idx)) return t('mon.short.' + idx);
    return undefined;
  }
});
const _monthPickers = {};

function createMonthPicker(containerId, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const cur = today().slice(0,7);
  const picker = { value: cur, year: +cur.split('-')[0], onChange, containerId };

  container.innerHTML = `
    <div class="mp-trigger" id="${containerId}_trigger">📅 <span id="${containerId}_label">${monthLabel(cur)}</span></div>
    <div class="mp-popup" id="${containerId}_popup">
      <div class="mp-header">
        <button onclick="mpChangeYear('${containerId}',-1)">◀</button>
        <span class="mp-year" id="${containerId}_year">${picker.year}</span>
        <button onclick="mpChangeYear('${containerId}',1)">▶</button>
      </div>
      <div class="mp-grid" id="${containerId}_grid"></div>
    </div>`;

  container.querySelector('.mp-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    // close all other pickers
    Object.keys(_monthPickers).forEach(k => {
      if (k !== containerId) document.getElementById(k + '_popup')?.classList.remove('open');
    });
    document.getElementById(containerId + '_popup').classList.toggle('open');
  });

  _monthPickers[containerId] = picker;
  mpRenderGrid(containerId);
  return picker;
}

function mpChangeYear(id, delta) {
  const p = _monthPickers[id];
  const curYear = +today().slice(0,4);
  if (delta > 0 && p.year >= curYear) return; // нельзя вперёд за текущий год
  p.year += delta;
  document.getElementById(id + '_year').textContent = p.year;
  mpRenderGrid(id);
}

function mpRenderGrid(id) {
  const p = _monthPickers[id];
  const curMonth = today().slice(0,7);
  const grid = document.getElementById(id + '_grid');
  grid.innerHTML = MONTH_NAMES_SHORT.map((name, i) => {
    const val = p.year + '-' + String(i+1).padStart(2,'0');
    const isFuture = val > curMonth;
    const isActive = val === p.value ? ' active' : '';
    const isToday = val === curMonth ? ' today' : '';
    const disabledAttr = isFuture ? ' disabled style="opacity:.35;cursor:not-allowed;"' : '';
    const onClickAttr = isFuture ? '' : ` onclick="mpSelect('${id}','${val}')"`;
    return `<button class="${isActive}${isToday}"${disabledAttr}${onClickAttr}>${name}</button>`;
  }).join('');
}

function mpSelect(id, val) {
  const p = _monthPickers[id];
  // Защита от выбора будущего месяца (если как-то пришло)
  if (val > today().slice(0,7)) return;
  p.value = val;
  document.getElementById(id + '_label').textContent = monthLabel(val);
  document.getElementById(id + '_popup').classList.remove('open');
  mpRenderGrid(id);
  if (p.onChange) p.onChange(val);
}

function mpSetValue(id, val) {
  const p = _monthPickers[id];
  if (!p) return;
  p.value = val;
  p.year = +val.split('-')[0];
  document.getElementById(id + '_label').textContent = monthLabel(val);
  document.getElementById(id + '_year').textContent = p.year;
  mpRenderGrid(id);
}
