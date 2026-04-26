// ═══════════════════════════════════════════
// EXCEL IMPORT (для транзакций)
// ═══════════════════════════════════════════
let _excelRows = [];        // массив объектов первого листа
let _excelHeaders = [];     // ключи (заголовки колонок) первой строки
let _excelMapping = {};     // { date: 'A', type: 'B', cat: '...', amount: '...', note: '...', employee: '...' }

// Поля приложения, которые можно мапить из Excel
const EXCEL_FIELDS = [
  { key: 'date',     label: 'Дата',         required: true },
  { key: 'type',     label: 'Тип',          required: true },
  { key: 'amount',   label: 'Сумма',        required: true },
  { key: 'cat',      label: 'Категория',    required: false },
  { key: 'employee', label: 'Сотрудник',    required: false },
  { key: 'note',     label: 'Комментарий',  required: false },
];

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

function autoDetectMapping() {
  _excelMapping = {};
  _excelHeaders.forEach(h => {
    const low = h.toLowerCase();
    for (const field of EXCEL_FIELDS) {
      if (_excelMapping[field.key]) continue; // уже сопоставлено
      const hints = HEADER_HINTS[field.key] || [];
      if (hints.some(hint => low.includes(hint))) {
        _excelMapping[field.key] = h;
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

  // Селект для маппинга колонок
  const mappingHtml = EXCEL_FIELDS.map(f => {
    const opts = [`<option value="">${t('excelImport.skip') || '— не использовать —'}</option>`]
      .concat(_excelHeaders.map(h => {
        const sel = _excelMapping[f.key] === h ? ' selected' : '';
        return `<option value="${h.replace(/"/g,'&quot;')}"${sel}>${h}</option>`;
      }))
      .join('');
    const reqMark = f.required ? ' <span style="color:var(--red)">*</span>' : '';
    return `<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center;padding:6px 0;">
      <span style="font-size:13px;">${f.label}${reqMark}</span>
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
}

function updateExcelImportSummary() {
  const required = EXCEL_FIELDS.filter(f => f.required).map(f => f.key);
  const missing = required.filter(k => !_excelMapping[k]);
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

async function confirmExcelImport() {
  const required = EXCEL_FIELDS.filter(f => f.required).map(f => f.key);
  if (required.some(k => !_excelMapping[k])) {
    showToast('Не все обязательные поля заданы', true);
    return;
  }
  showLoader(true);
  let okCount = 0, failCount = 0;
  const errors = [];

  for (let i = 0; i < _excelRows.length; i++) {
    const row = _excelRows[i];
    const dateRaw = row[_excelMapping.date];
    const typeRaw = row[_excelMapping.type];
    const amountRaw = row[_excelMapping.amount];
    const catRaw = _excelMapping.cat ? row[_excelMapping.cat] : '';
    const empRaw = _excelMapping.employee ? row[_excelMapping.employee] : '';
    const noteRaw = _excelMapping.note ? row[_excelMapping.note] : '';

    const date = parseExcelDate(dateRaw);
    const type = parseExcelType(typeRaw);
    const amount = parseExcelAmount(amountRaw);

    if (!date) { failCount++; errors.push('Строка ' + (i+2) + ': неверная дата "' + dateRaw + '"'); continue; }
    if (!type) { failCount++; errors.push('Строка ' + (i+2) + ': неизвестный тип "' + typeRaw + '"'); continue; }
    if (!amount || amount <= 0) { failCount++; errors.push('Строка ' + (i+2) + ': неверная сумма "' + amountRaw + '"'); continue; }

    const emp = findEmployeeByName(empRaw);

    const body = {
      id: uid(),
      date,
      type,
      cat: catRaw || '',
      empId: emp ? emp.id : null,
      amount,
      note: noteRaw || '',
    };
    try {
      const res = await API.post('/transactions', body);
      if (res && res.ok) okCount++;
      else { failCount++; errors.push('Строка ' + (i+2) + ': ' + ((res && res.error) || 'ошибка сервера')); }
    } catch (e) {
      failCount++; errors.push('Строка ' + (i+2) + ': ' + e.message);
    }
  }

  showLoader(false);
  closeModal('excelImportModal');

  let msg = `✓ Импортировано: ${okCount}`;
  if (failCount) msg += ` · ✕ Ошибок: ${failCount}`;
  showToast(msg, !!failCount);
  if (errors.length) console.warn('Excel import errors:', errors);
}
