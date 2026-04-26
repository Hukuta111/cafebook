// ═══════════════════════════════════════════
// EXCEL IMPORT (для транзакций)
// ═══════════════════════════════════════════
let _excelRows = [];        // массив объектов первого листа
let _excelHeaders = [];     // ключи (заголовки колонок) первой строки
let _excelMapping = {};     // { date: 'A', type: 'B', cat: '...', amount: '...', note: '...', employee: '...' }

// Поля приложения, которые можно мапить из Excel.
// fixedFrom — функция, возвращающая список вариантов "зафиксировать значение" для всех строк.
const EXCEL_FIELDS = [
  { key: 'date',     labelKey: 'col.date',     defaultLabel: 'Дата',        required: true },
  { key: 'type',     labelKey: 'col.type',     defaultLabel: 'Тип',         required: true,  fixedFrom: () => excelFixedTypeOptions() },
  { key: 'amount',   labelKey: 'col.amount',   defaultLabel: 'Сумма',       required: true },
  { key: 'cat',      labelKey: 'col.category', defaultLabel: 'Категория',   required: false, fixedFrom: () => excelFixedCategoryOptions() },
  { key: 'employee', labelKey: 'col.employee', defaultLabel: 'Сотрудник',   required: false, fixedFrom: () => excelFixedEmployeeOptions() },
  { key: 'note',     labelKey: 'col.note',     defaultLabel: 'Комментарий', required: false, multi: true },
];

// Возвращает список фиксированных опций для типа транзакции
function excelFixedTypeOptions() {
  return ['income','expense','salary','advance','bonus','fine'].map(id => ({
    value: id,
    label: t('tx.' + id) || id,
  }));
}

// Возвращает уникальные имена категорий (из всех типов, без дубликатов)
function excelFixedCategoryOptions() {
  const all = new Set();
  ['income','expense','salary','advance','bonus','fine'].forEach(type => {
    const cats = (typeof getCategoriesForType === 'function') ? getCategoriesForType(type) : [];
    cats.forEach(c => all.add(c));
  });
  return [...all].sort().map(name => ({ value: name, label: name }));
}

// Возвращает список активных сотрудников
function excelFixedEmployeeOptions() {
  return (_employees || [])
    .filter(e => e.status === 'active')
    .map(e => ({ value: e.id, label: e.name + (e.tab_number ? ' (№' + e.tab_number + ')' : '') }));
}

// Возможные русско-укр-англ названия колонок для авто-определения
const HEADER_HINTS = {
  date:     ['дата', 'date', 'день'],
  type:     ['тип', 'type', 'операция', 'операція'],
  amount:   ['сумма', 'сума', 'amount', 'amt', 'total', 'итого', 'разом'],
  cat:      ['категория', 'категорія', 'category', 'cat', 'статья', 'стаття'],
  employee: ['сотрудник', 'співробітник', 'employee', 'emp', 'имя', "ім'я", 'имя сотрудника'],
  note:     ['комментарий', 'коментар', 'note', 'примечание', 'примітка', 'комм', 'description', 'опис'],
};

// Строки → значения типа транзакции
const TYPE_VALUES = {
  income:  ['доход', 'дохід', 'income', '+'],
  expense: ['расход', 'витрата', 'expense', '-', '−'],
  salary:  ['зарплата', 'salary', 'оклад', 'з/п', 'зп'],
  advance: ['аванс', 'advance'],
  bonus:   ['бонус', 'bonus', 'премия', 'премія'],
  fine:    ['штраф', 'fine', 'penalty'],
};

function onExcelFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    showToast('Библиотека XLSX не загружена. Проверьте интернет.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      // raw rows as array of arrays — потом первая строка = заголовки
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      if (!rows.length) { showToast('Файл пустой', true); return; }
      _excelHeaders = rows[0].map((h, i) => String(h || '').trim() || ('Колонка ' + (i+1)));
      _excelRows = rows.slice(1).map(r => {
        const obj = {};
        _excelHeaders.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ''; });
        return obj;
      }).filter(r => Object.values(r).some(v => v));
      autoDetectMapping();
      // Сбросить заголовок и показать кнопку "Импортировать" при новом импорте
      const titleEl = document.querySelector('#excelImportModal .modal-title');
      if (titleEl) titleEl.textContent = (t('excelImport.title') || '📊 Импорт транзакций из Excel');
      const confirmBtn = document.getElementById('excelImportConfirmBtn');
      if (confirmBtn) confirmBtn.style.display = '';
      _excelLastResults = [];
      _excelResultsTab = 'all';
      renderExcelImportModal();
      openModal('excelImportModal');
    } catch (err) {
      console.error(err);
      showToast('Ошибка чтения файла: ' + err.message, true);
    }
  };
  reader.readAsArrayBuffer(file);
  // сбросить input чтобы можно было выбрать тот же файл повторно
  e.target.value = '';
}

function isMappingSet(m) {
  if (Array.isArray(m)) return m.length > 0;
  return !!m;
}

function autoDetectMapping() {
  _excelMapping = {};
  _excelHeaders.forEach(h => {
    const low = h.toLowerCase();
    for (const field of EXCEL_FIELDS) {
      if (isMappingSet(_excelMapping[field.key])) continue; // уже сопоставлено
      const hints = HEADER_HINTS[field.key] || [];
      if (hints.some(hint => low.includes(hint))) {
        _excelMapping[field.key] = field.multi ? [h] : h;
        break;
      }
    }
  });
}

function renderExcelImportModal() {
  const body = document.getElementById('excelImportBody');
  if (!_excelRows.length) {
    body.innerHTML = '<div style="color:var(--text3);padding:20px;text-align:center;">Нет данных в файле</div>';
    return;
  }

  // Селекты/чекбоксы для маппинга колонок
  const safe = s => String(s).replace(/"/g, '&quot;');
  const mappingHtml = EXCEL_FIELDS.map(f => {
    const fieldLabel = (f.labelKey && t(f.labelKey)) || f.defaultLabel;
    const reqMark = f.required ? ' <span style="color:var(--red)">*</span>' : '';

    // === Multi-mode (например для note) ===
    // Несколько колонок объединяются разделителем " · "
    if (f.multi) {
      const cur = Array.isArray(_excelMapping[f.key]) ? _excelMapping[f.key] : [];
      const cbs = _excelHeaders.map(h => {
        const checked = cur.includes(h) ? ' checked' : '';
        return `<label style="display:inline-flex;align-items:center;gap:5px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;user-select:none;">
          <input type="checkbox"${checked} onchange="onExcelMapMultiChange('${f.key}', '${safe(h)}', this.checked)" style="margin:0;">
          <span>${h}</span>
        </label>`;
      }).join('');
      const summary = cur.length ? `<span style="color:var(--text3);font-size:11px;margin-left:8px;">→ ${cur.join(' · ')}</span>` : '';
      return `<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:start;padding:6px 0;">
        <span style="font-size:13px;padding-top:4px;">${fieldLabel}${reqMark}</span>
        <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
          ${cbs || `<span style="color:var(--text3);font-size:12px;">${t('excelImport.noColumns') || 'Нет колонок'}</span>`}
          ${summary}
        </div>
      </div>`;
    }

    // === Single-select mode (для всех остальных полей) ===
    const cur = _excelMapping[f.key] || '';

    // 1) "Не использовать"
    let opts = `<option value=""${cur === '' ? ' selected' : ''}>— ${t('excelImport.skip') || 'не использовать'} —</option>`;

    // 2) Колонки из файла
    if (_excelHeaders.length) {
      opts += `<optgroup label="${t('excelImport.fromFile') || 'Из файла'}">`;
      _excelHeaders.forEach(h => {
        const sel = cur === h ? ' selected' : '';
        opts += `<option value="${safe(h)}"${sel}>${h}</option>`;
      });
      opts += '</optgroup>';
    }

    // 3) Фиксированное значение для всех строк
    if (typeof f.fixedFrom === 'function') {
      const fixedOpts = f.fixedFrom();
      if (fixedOpts.length) {
        opts += `<optgroup label="${t('excelImport.fixed') || 'Зафиксировать для всех строк'}">`;
        fixedOpts.forEach(o => {
          const v = 'fixed:' + o.value;
          const sel = cur === v ? ' selected' : '';
          opts += `<option value="${safe(v)}"${sel}>${o.label}</option>`;
        });
        opts += '</optgroup>';
      }
    }

    return `<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:6px 0;">
      <span style="font-size:13px;">${fieldLabel}${reqMark}</span>
      <select onchange="onExcelMapChange('${f.key}', this.value)"
        style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:6px 10px;color:var(--text);font-size:12.5px;outline:none;">
        ${opts}
      </select>
    </div>`;
  }).join('');

  // Превью первых 5 строк
  const previewRows = _excelRows.slice(0, 5);
  const previewHtml = `<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px;">
    <thead><tr>${_excelHeaders.map(h => `<th style="padding:4px 6px;background:var(--surface2);border:1px solid var(--border);text-align:left;">${h}</th>`).join('')}</tr></thead>
    <tbody>${previewRows.map(r => `<tr>${_excelHeaders.map(h => `<td style="padding:4px 6px;border:1px solid var(--border);">${(r[h] || '').toString().slice(0, 50)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;

  body.innerHTML = `
    <div style="font-size:12px;color:var(--text3);margin-bottom:12px;">
      ${t('excelImport.foundRows') || 'Найдено строк'}: <b style="color:var(--text);">${_excelRows.length}</b>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:14px 16px;margin-bottom:14px;">
      <div style="font-size:11px;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:8px;">${t('excelImport.mapping') || 'Сопоставление колонок'}</div>
      ${mappingHtml}
    </div>
    <div style="font-size:11px;text-transform:uppercase;color:var(--text3);letter-spacing:.5px;margin-bottom:6px;">${t('excelImport.preview') || 'Превью первых 5 строк'}</div>
    <div style="overflow-x:auto;">${previewHtml}</div>
    <div id="excelImportSummary" style="margin-top:14px;font-size:12px;color:var(--text3);"></div>
  `;
  updateExcelImportSummary();
}

function onExcelMapChange(key, header) {
  if (header) _excelMapping[key] = header;
  else delete _excelMapping[key];
  updateExcelImportSummary();
  renderExcelImportModal();
}

// Обработчик для multi-полей (note): добавить/убрать колонку
function onExcelMapMultiChange(key, header, checked) {
  if (!Array.isArray(_excelMapping[key])) _excelMapping[key] = [];
  const arr = _excelMapping[key];
  const idx = arr.indexOf(header);
  if (checked && idx < 0) arr.push(header);
  if (!checked && idx >= 0) arr.splice(idx, 1);
  if (!arr.length) delete _excelMapping[key];
  renderExcelImportModal();
  updateExcelImportSummary();
}

function updateExcelImportSummary() {
  const required = EXCEL_FIELDS.filter(f => f.required).map(f => f.key);
  const missing = required.filter(k => !isMappingSet(_excelMapping[k]));
  const btn = document.getElementById('excelImportConfirmBtn');
  const summary = document.getElementById('excelImportSummary');
  if (missing.length) {
    if (summary) summary.innerHTML = `<span style="color:var(--red);">⚠ ${t('excelImport.missingRequired') || 'Не указаны обязательные поля'}: ${missing.map(k => EXCEL_FIELDS.find(f => f.key === k).label).join(', ')}</span>`;
    if (btn) btn.disabled = true;
  } else {
    if (summary) summary.innerHTML = `<span style="color:var(--green);">✓ ${t('excelImport.readyTo') || 'Готово к импорту'}: ${_excelRows.length} ${t('excelImport.rows') || 'строк'}</span>`;
    if (btn) btn.disabled = false;
  }
}

// нормализация даты: '2026-04-15', '15.04.2026', Excel serial, ISO datetime → YYYY-MM-DD
function parseExcelDate(v) {
  if (!v) return null;
  v = String(v).trim();
  // ISO: 2026-04-15 или 2026-04-15T...
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  // DD.MM.YYYY или DD/MM/YYYY
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) {
    return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  }
  // DD.MM.YY
  m = v.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (m) {
    const yr = +m[3] < 70 ? '20' + m[3] : '19' + m[3];
    return yr + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
  }
  return null;
}

function parseExcelType(v) {
  if (!v) return null;
  const low = String(v).toLowerCase().trim();
  for (const [type, hints] of Object.entries(TYPE_VALUES)) {
    if (hints.some(h => low.includes(h))) return type;
  }
  return null;
}

function parseExcelAmount(v) {
  if (v == null || v === '') return null;
  // удалить пробелы, заменить запятую на точку, убрать валюту
  let s = String(v).replace(/\s+/g,'').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return Math.abs(n); // храним сумму положительной, знак выводим из типа
}

function findEmployeeByName(name) {
  if (!name) return null;
  const low = String(name).toLowerCase().trim();
  return (_employees || []).find(e => (e.name || '').toLowerCase().includes(low) || low.includes((e.name || '').toLowerCase()));
}

// Получает значение поля для строки: либо из колонки Excel, либо фиксированное,
// либо объединённое значение из нескольких колонок (multi-mode).
// Возвращает { value, isFixed } — вызывающий код не парсит повторно фикс. значение.
function getMappedValue(mapping, row) {
  if (!mapping) return { value: '', isFixed: false };
  // Несколько колонок — объединяем значения через ' · '
  if (Array.isArray(mapping)) {
    const parts = mapping
      .map(h => row[h])
      .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
      .map(v => String(v).trim());
    return { value: parts.join(' · '), isFixed: false };
  }
  if (typeof mapping === 'string' && mapping.startsWith('fixed:')) {
    return { value: mapping.slice(6), isFixed: true };
  }
  return { value: row[mapping] !== undefined ? row[mapping] : '', isFixed: false };
}

async function confirmExcelImport() {
  const required = EXCEL_FIELDS.filter(f => f.required).map(f => f.key);
  if (required.some(k => !isMappingSet(_excelMapping[k]))) {
    showToast('Не все обязательные поля заданы', true);
    return;
  }
  showLoader(true);
  // results: { rowNum, status: 'ok'|'error', message?, parsed?, raw }
  const results = [];

  for (let i = 0; i < _excelRows.length; i++) {
    const row = _excelRows[i];
    const rowNum = i + 2; // +1 — заголовок, +1 — index→row number

    const dateMv = getMappedValue(_excelMapping.date, row);
    const date = parseExcelDate(dateMv.value);

    const typeMv = getMappedValue(_excelMapping.type, row);
    const type = typeMv.isFixed ? typeMv.value : parseExcelType(typeMv.value);

    const amountMv = getMappedValue(_excelMapping.amount, row);
    const amount = parseExcelAmount(amountMv.value);

    const catMv = getMappedValue(_excelMapping.cat, row);
    const cat = String(catMv.value || '');

    const empMv = getMappedValue(_excelMapping.employee, row);
    let empId = null, empNameStr = '';
    if (empMv.isFixed) {
      empId = empMv.value || null;
      const emp = (_employees || []).find(e => e.id === empId);
      empNameStr = emp ? emp.name : '';
    } else if (empMv.value) {
      const emp = findEmployeeByName(empMv.value);
      empId = emp ? emp.id : null;
      empNameStr = emp ? emp.name : String(empMv.value);
    }

    const noteMv = getMappedValue(_excelMapping.note, row);
    const note = String(noteMv.value || '');

    const parsed = { date, type, cat, empName: empNameStr, amount, note };

    if (!date) { results.push({ rowNum, status:'error', message: 'Неверная дата: "' + dateMv.value + '"', parsed, raw: row }); continue; }
    if (!type) { results.push({ rowNum, status:'error', message: 'Неизвестный тип: "' + typeMv.value + '"', parsed, raw: row }); continue; }
    if (!amount || amount <= 0) { results.push({ rowNum, status:'error', message: 'Неверная сумма: "' + amountMv.value + '"', parsed, raw: row }); continue; }

    const body = { id: uid(), date, type, cat: cat || '', empId, amount, note: note || '' };
    try {
      const res = await API.post('/transactions', body);
      if (res && res.ok) results.push({ rowNum, status:'ok', parsed, raw: row });
      else results.push({ rowNum, status:'error', message: (res && res.error) || 'Ошибка сервера', parsed, raw: row });
    } catch (e) {
      results.push({ rowNum, status:'error', message: e.message || String(e), parsed, raw: row });
    }
  }

  showLoader(false);
  // показать отчёт об импорте в той же модалке
  renderExcelImportResults(results);
}

// ─── РЕЗУЛЬТАТ ИМПОРТА ──────────────────────────────────────
let _excelResultsTab = 'all'; // 'all' | 'ok' | 'error'
let _excelLastResults = [];

function renderExcelImportResults(results) {
  _excelLastResults = results;
  const okCount = results.filter(r => r.status === 'ok').length;
  const failCount = results.length - okCount;

  // меняем заголовок и футер
  document.querySelector('#excelImportModal .modal-title').textContent = (t('excelImport.resultTitle') || '📊 Результат импорта');
  // прячем кнопку "Импортировать", показываем только "Закрыть"
  const confirmBtn = document.getElementById('excelImportConfirmBtn');
  if (confirmBtn) confirmBtn.style.display = 'none';

  drawExcelResults();
}

function setExcelResultsTab(tab) {
  _excelResultsTab = tab;
  drawExcelResults();
}

function drawExcelResults() {
  const results = _excelLastResults;
  const okCount = results.filter(r => r.status === 'ok').length;
  const failCount = results.length - okCount;

  let filtered = results;
  if (_excelResultsTab === 'ok')    filtered = results.filter(r => r.status === 'ok');
  if (_excelResultsTab === 'error') filtered = results.filter(r => r.status === 'error');

  const tabBtn = (key, label, count, color) => {
    const active = _excelResultsTab === key;
    return `<button onclick="setExcelResultsTab('${key}')" style="padding:6px 12px;border:1px solid ${active ? 'var(--accent)' : 'var(--border)'};background:${active ? 'var(--accent)' : 'transparent'};color:${active ? '#1a1714' : color};border-radius:var(--radius-sm);font-size:12px;cursor:pointer;font-weight:${active ? '600' : '400'};">${label} (${count})</button>`;
  };

  const safe = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

  // карточки итогов
  const summary = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;">
      <div style="font-size:10px;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">${t('excelImport.totalRows') || 'Всего строк'}</div>
      <div style="font-size:18px;font-weight:600;">${results.length}</div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;border-left:3px solid var(--green);">
      <div style="font-size:10px;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">✓ ${t('excelImport.imported') || 'Импортировано'}</div>
      <div style="font-size:18px;font-weight:600;color:var(--green);">${okCount}</div>
    </div>
    <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:12px 14px;border-left:3px solid var(--red);">
      <div style="font-size:10px;text-transform:uppercase;color:var(--text3);margin-bottom:4px;">✕ ${t('excelImport.errors') || 'Ошибки'}</div>
      <div style="font-size:18px;font-weight:600;color:var(--red);">${failCount}</div>
    </div>
  </div>`;

  // разбивка по месяцам (только успешно импортированные)
  const byMonth = {};
  results.filter(r => r.status === 'ok').forEach(r => {
    const m = (r.parsed && r.parsed.date || '').slice(0, 7);
    if (!m) return;
    byMonth[m] = (byMonth[m] || 0) + 1;
  });
  const monthsHtml = Object.entries(byMonth).sort().map(([m, n]) => {
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;font-size:11.5px;">
      <b>${monthLabel(m)}</b><span style="color:var(--text3);">${n}</span>
    </span>`;
  }).join('');
  const breakdownHtml = monthsHtml ? `
    <div style="background:rgba(231,158,72,0.06);border:1px solid rgba(231,158,72,0.25);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">${t('excelImport.byMonth') || '📅 По месяцам'}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${monthsHtml}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px;">
        ${t('excelImport.byMonthHint') || 'Если на странице Транзакции выбран только один месяц — там видны только записи за этот месяц.'}
      </div>
    </div>
  ` : '';

  // таблица результатов
  const rowsHtml = filtered.length
    ? filtered.map(r => {
        const isOk = r.status === 'ok';
        const statusBadge = isOk
          ? '<span style="color:var(--green);font-size:11px;">✓</span>'
          : '<span style="color:var(--red);font-size:11px;">✕</span>';
        const p = r.parsed || {};
        const typeLbl = p.type ? (TYPE_LABELS[p.type] || p.type) : '—';
        const amount = p.amount ? fmt(p.amount) + ' ' + _currency : '—';
        const errCell = isOk
          ? `<span style="color:var(--text3);font-size:11px;">—</span>`
          : `<span style="color:var(--red);font-size:12px;">${safe(r.message)}</span>`;
        return `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:6px 8px;width:40px;text-align:center;color:var(--text3);font-size:11px;">${r.rowNum}</td>
          <td style="padding:6px 8px;width:32px;text-align:center;">${statusBadge}</td>
          <td style="padding:6px 8px;font-size:12px;white-space:nowrap;">${safe(p.date) || '—'}</td>
          <td style="padding:6px 8px;font-size:12px;">${safe(typeLbl)}</td>
          <td style="padding:6px 8px;font-size:12px;color:var(--text2);">${safe(p.cat) || '—'}</td>
          <td style="padding:6px 8px;font-size:12px;color:var(--text2);">${safe(p.empName) || '—'}</td>
          <td style="padding:6px 8px;font-size:12px;font-weight:600;text-align:right;white-space:nowrap;">${amount}</td>
          <td style="padding:6px 8px;">${errCell}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">${t('detail.noData') || 'Нет данных'}</td></tr>`;

  const body = document.getElementById('excelImportBody');
  body.innerHTML = `
    ${summary}
    ${breakdownHtml}
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
      ${tabBtn('all',   t('excelImport.allRows')  || 'Все',           results.length, 'var(--text)')}
      ${tabBtn('ok',    '✓ ' + (t('excelImport.tabOk') || 'Успешные'), okCount,        'var(--green)')}
      ${tabBtn('error', '✕ ' + (t('excelImport.tabErrors') || 'Ошибки'), failCount,    'var(--red)')}
    </div>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:var(--surface2);">
            <th style="padding:6px 8px;text-align:center;font-size:10px;color:var(--text3);text-transform:uppercase;">#</th>
            <th style="padding:6px 8px;text-align:center;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('excelImport.status') || 'Статус'}</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('col.date') || 'Дата'}</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('col.type') || 'Тип'}</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('col.category') || 'Категория'}</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('col.employee') || 'Сотрудник'}</th>
            <th style="padding:6px 8px;text-align:right;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('col.amount') || 'Сумма'}</th>
            <th style="padding:6px 8px;text-align:left;font-size:10px;color:var(--text3);text-transform:uppercase;">${t('excelImport.errorOrNote') || 'Ошибка'}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}
