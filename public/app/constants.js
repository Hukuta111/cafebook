// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const BUILTIN_TX_CATS = {
  income: ['Выручка кассы','Доставка','Кейтеринг','Прочий доход'],
  expense: ['Продукты','Напитки','Аренда','Коммунальные','Упаковка','Реклама','Оборудование','Прочий расход'],
  salary: ['Основная з/п'],
  advance: ['Аванс'],
  bonus: ['Бонус за план','Праздничный бонус','Прочий бонус'],
  fine: ['Нарушение','Недостача','Опоздание','Прочее'],
};
// Кастомные пользовательские категории (грузятся из settings.txCategories)
let _txCats = { income:[], expense:[], salary:[], advance:[], bonus:[], fine:[] };
// Оверрайды для встроенных: { type: { originalName: { newName?, hidden? } } }
let _txCatOverrides = {};

// Полный список названий категорий для типа (built-in с оверрайдами + кастомные, без скрытых)
function getCategoriesForType(type) {
  const builtin = BUILTIN_TX_CATS[type] || [];
  const overrides = (_txCatOverrides && _txCatOverrides[type]) || {};
  const custom = (_txCats[type] || []).map(c => c.label);
  const out = [];
  const seen = new Set();
  builtin.forEach(orig => {
    const ov = overrides[orig];
    if (ov && ov.hidden) return;
    const name = (ov && ov.newName) ? ov.newName : orig;
    if (!seen.has(name)) { seen.add(name); out.push(name); }
  });
  custom.forEach(name => { if (!seen.has(name)) { seen.add(name); out.push(name); } });
  return out;
}

async function loadTxCats() {
  const s = await API.get('/settings') || {};
  let parsed = {};
  try { parsed = JSON.parse(s.txCategories || '{}'); } catch { parsed = {}; }
  _txCats = { income:[], expense:[], salary:[], advance:[], bonus:[], fine:[] };
  Object.keys(_txCats).forEach(k => {
    if (Array.isArray(parsed[k])) _txCats[k] = parsed[k].filter(c => c && c.label);
  });
  try { _txCatOverrides = JSON.parse(s.txCatOverrides || '{}') || {}; } catch { _txCatOverrides = {}; }
}

async function saveTxCats() {
  await API.post('/settings', { txCategories: JSON.stringify(_txCats), txCatOverrides: JSON.stringify(_txCatOverrides) });
}

// удобный геттер для совместимости со старым кодом
const TX_CATS = new Proxy({}, { get: (_, k) => getCategoriesForType(k) });
// Динамические лейблы — обращаются к словарю
const TYPE_BADGES = { income:'badge-green', expense:'badge-red', salary:'badge-yellow', advance:'badge-blue', bonus:'badge-purple', fine:'badge-red' };
const TYPE_LABELS = new Proxy({}, { get: (_, k) => t('tx.' + k) });
const EMP_TYPE_LABELS = new Proxy({}, { get: (_, k) => t('emp.' + k) });

