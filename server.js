'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ─── CONFIG ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cafebook-jwt-' + crypto.randomBytes(32).toString('hex');
const DB_PATH = path.join(__dirname, 'data', 'cafebook.db');
const CONFIG_PATH = path.join(__dirname, 'data', 'config.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// ─── SQL.JS SETUP ──────────────────────────────────────────
let db;

async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT,
      type TEXT DEFAULT 'staff', salary REAL DEFAULT 0,
      phone TEXT, start_date TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL,
      cat TEXT, emp_id TEXT, amount REAL NOT NULL, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  `);
  saveDb();
}

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}
setInterval(saveDb, 30000);

// ─── CONFIG HELPERS ────────────────────────────────────────
function getConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  }
  const cfg = {
    users: [{
      id: uid(),
      username: 'admin',
      displayName: 'Администратор',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      sessionId: null,
      createdAt: new Date().toISOString(),
    }]
  };
  saveConfig(cfg);
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── AUTH MIDDLEWARE ────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'no_token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const cfg = getConfig();
    const user = cfg.users.find(u => u.username === payload.username);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден', reason: 'user_not_found' });
    }
    // Ключевая проверка: sessionId в токене должен совпадать с актуальным
    if (user.sessionId !== payload.sessionId) {
      return res.status(401).json({
        error: 'Сессия завершена: выполнен вход с другого устройства',
        reason: 'session_replaced'
      });
    }
    req.user = { ...payload, role: user.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Токен недействителен или истёк', reason: 'token_invalid' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ запрещён. Требуются права администратора.' });
  }
  next();
}

// ─── AUTH ROUTES ───────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const cfg = getConfig();
  const user = cfg.users.find(u => u.username === username.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  // Новый sessionId — старые токены этого пользователя становятся невалидными
  const newSessionId = uid();
  user.sessionId = newSessionId;
  user.lastLoginAt = new Date().toISOString();
  saveConfig(cfg);

  const token = jwt.sign(
    { username: user.username, role: user.role, sessionId: newSessionId },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    username: user.username,
    displayName: user.displayName || user.username,
    role: user.role,
  });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  const cfg = getConfig();
  const user = cfg.users.find(u => u.username === req.user.username);
  if (user) { user.sessionId = null; saveConfig(cfg); }
  res.json({ ok: true });
});

app.post('/api/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Пароль слишком короткий (мин. 4 символа)' });
  }
  const cfg = getConfig();
  const user = cfg.users.find(u => u.username === req.user.username);
  if (!user || !bcrypt.compareSync(oldPassword, user.passwordHash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  user.sessionId = null; // выбить все сессии после смены пароля
  saveConfig(cfg);
  res.json({ ok: true, message: 'Пароль изменён. Войдите снова.' });
});

// ─── USER MANAGEMENT (только admin) ───────────────────────

app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const cfg = getConfig();
  res.json(cfg.users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    role: u.role,
    isOnline: !!u.sessionId,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt || null,
  })));
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, displayName, password, role } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль слишком короткий (мин. 4 символа)' });
  }
  const cfg = getConfig();
  const normalizedUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Логин: только a-z, 0-9, _ , от 2 до 32 символов' });
  }
  if (cfg.users.find(u => u.username === normalizedUsername)) {
    return res.status(409).json({ error: `Пользователь "${normalizedUsername}" уже существует` });
  }
  const newUser = {
    id: uid(),
    username: normalizedUsername,
    displayName: displayName?.trim() || username.trim(),
    passwordHash: bcrypt.hashSync(password, 10),
    role: role === 'admin' ? 'admin' : 'user',
    sessionId: null,
    createdAt: new Date().toISOString(),
  };
  cfg.users.push(newUser);
  saveConfig(cfg);
  res.json({ ok: true, id: newUser.id });
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const { displayName, role, newPassword } = req.body;
  const cfg = getConfig();
  const user = cfg.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (role && role !== 'admin' && user.role === 'admin') {
    const adminCount = cfg.users.filter(u => u.role === 'admin').length;
    if (adminCount <= 1) {
      return res.status(400).json({ error: 'Нельзя убрать роль у единственного администратора' });
    }
  }
  if (displayName !== undefined) user.displayName = displayName.trim();
  if (role !== undefined) user.role = role === 'admin' ? 'admin' : 'user';
  if (newPassword) {
    if (newPassword.length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    user.sessionId = null;
  }
  saveConfig(cfg);
  res.json({ ok: true });
});

app.post('/api/users/:id/kick', authMiddleware, adminOnly, (req, res) => {
  const cfg = getConfig();
  const user = cfg.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  user.sessionId = null;
  saveConfig(cfg);
  res.json({ ok: true });
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const cfg = getConfig();
  const user = cfg.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.username === req.user.username) {
    return res.status(400).json({ error: 'Нельзя удалить собственный аккаунт' });
  }
  if (user.role === 'admin' && cfg.users.filter(u => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Нельзя удалить единственного администратора' });
  }
  cfg.users = cfg.users.filter(u => u.id !== req.params.id);
  saveConfig(cfg);
  res.json({ ok: true });
});

// ─── POSITIONS ────────────────────────────────────────────
app.get('/api/positions', authMiddleware, (req, res) => {
  const rows = db.exec('SELECT * FROM positions ORDER BY name');
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.post('/api/positions', authMiddleware, (req, res) => {
  const { id, name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
  try {
    db.run('INSERT INTO positions (id, name) VALUES (?, ?)', [id, name.trim()]);
    saveDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Такая должность уже существует' });
  }
});
app.put('/api/positions/:id', authMiddleware, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
  try {
    db.run('UPDATE positions SET name=? WHERE id=?', [name.trim(), req.params.id]);
    saveDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Такая должность уже существует' });
  }
});
app.delete('/api/positions/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM positions WHERE id=?', [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// ─── EMPLOYEES ─────────────────────────────────────────────
app.get('/api/employees', authMiddleware, (req, res) => {
  const rows = db.exec('SELECT * FROM employees ORDER BY name');
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.post('/api/employees', authMiddleware, (req, res) => {
  const { id, name, role, type, salary, phone, start_date, status } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });
  db.run(
    `INSERT INTO employees (id,name,role,type,salary,phone,start_date,status) VALUES (?,?,?,?,?,?,?,?)`,
    [id, name, role||'', type||'staff', salary||0, phone||'', start_date||'', status||'active']
  );
  saveDb();
  res.json({ ok: true });
});
app.put('/api/employees/:id', authMiddleware, (req, res) => {
  const { name, role, type, salary, phone, start_date, status } = req.body;
  db.run(
    `UPDATE employees SET name=?,role=?,type=?,salary=?,phone=?,start_date=?,status=? WHERE id=?`,
    [name, role||'', type||'staff', salary||0, phone||'', start_date||'', status||'active', req.params.id]
  );
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/employees/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM employees WHERE id=?', [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// ─── TRANSACTIONS ──────────────────────────────────────────
app.get('/api/transactions', authMiddleware, (req, res) => {
  const { month, type, empId } = req.query;
  let sql = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];
  if (month) { sql += ' AND strftime("%Y-%m", date) = ?'; params.push(month); }
  if (type) { sql += ' AND type = ?'; params.push(type); }
  if (empId) { sql += ' AND emp_id = ?'; params.push(empId); }
  sql += ' ORDER BY date DESC, created_at DESC';
  const rows = db.exec(sql, params);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.post('/api/transactions', authMiddleware, (req, res) => {
  const { id, date, type, cat, empId, amount, note } = req.body;
  if (!date || !type || !amount) return res.status(400).json({ error: 'Заполните все поля' });
  db.run(
    `INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)`,
    [id, date, type, cat||'', empId||null, parseFloat(amount), note||'']
  );
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/transactions/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM transactions WHERE id=?', [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// ─── SETTINGS ──────────────────────────────────────────────
app.get('/api/settings', authMiddleware, (req, res) => {
  const rows = db.exec('SELECT key, value FROM settings');
  const obj = {};
  if (rows[0]) rows[0].values.forEach(([k, v]) => { obj[k] = v; });
  res.json(obj);
});
app.post('/api/settings', authMiddleware, (req, res) => {
  const { cafeName, currency } = req.body;
  db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('cafeName',?)`, [cafeName||'']);
  db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('currency',?)`, [currency||'₴']);
  saveDb();
  res.json({ ok: true });
});

// ─── REPORTS ───────────────────────────────────────────────
app.get('/api/reports/monthly', authMiddleware, (req, res) => {
  const rows = db.exec(`
    SELECT strftime('%Y-%m', date) as month,
      SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
      SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense,
      SUM(CASE WHEN type='salary' THEN amount ELSE 0 END) as salary,
      SUM(CASE WHEN type='advance' THEN amount ELSE 0 END) as advance,
      SUM(CASE WHEN type='bonus' THEN amount ELSE 0 END) as bonus,
      SUM(CASE WHEN type='fine' THEN amount ELSE 0 END) as fine
    FROM transactions GROUP BY month ORDER BY month DESC
  `);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.get('/api/reports/daily', authMiddleware, (req, res) => {
  const { month } = req.query;
  let sql = `SELECT date,
    SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
    SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense,
    SUM(CASE WHEN type='salary' THEN amount ELSE 0 END) as salary,
    SUM(CASE WHEN type='advance' THEN amount ELSE 0 END) as advance,
    SUM(CASE WHEN type='bonus' THEN amount ELSE 0 END) as bonus,
    SUM(CASE WHEN type='fine' THEN amount ELSE 0 END) as fine
    FROM transactions`;
  const params = [];
  if (month) { sql += ` WHERE strftime('%Y-%m', date) = ?`; params.push(month); }
  sql += ' GROUP BY date ORDER BY date DESC';
  const rows = db.exec(sql, params);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.get('/api/reports/salary', authMiddleware, (req, res) => {
  const { month } = req.query;
  let sql = `SELECT emp_id,
    SUM(CASE WHEN type='salary' THEN amount ELSE 0 END) as salary,
    SUM(CASE WHEN type='advance' THEN amount ELSE 0 END) as advance,
    SUM(CASE WHEN type='bonus' THEN amount ELSE 0 END) as bonus,
    SUM(CASE WHEN type='fine' THEN amount ELSE 0 END) as fine
    FROM transactions WHERE type IN ('salary','advance','bonus','fine')`;
  const params = [];
  if (month) { sql += ` AND strftime('%Y-%m', date) = ?`; params.push(month); }
  sql += ' GROUP BY emp_id';
  const rows = db.exec(sql, params);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});

// ─── EXPORT / IMPORT ───────────────────────────────────────
app.get('/api/export', authMiddleware, (req, res) => {
  const txRows = db.exec('SELECT * FROM transactions ORDER BY date DESC');
  const empRows = db.exec('SELECT * FROM employees ORDER BY name');
  const setRows = db.exec('SELECT key,value FROM settings');
  const settingsObj = {};
  if (setRows[0]) setRows[0].values.forEach(([k,v]) => { settingsObj[k]=v; });
  res.json({
    transactions: txRows[0] ? rowsToObjects(txRows[0]) : [],
    employees: empRows[0] ? rowsToObjects(empRows[0]) : [],
    settings: settingsObj,
    exportedAt: new Date().toISOString(),
  });
});
app.post('/api/import', authMiddleware, adminOnly, (req, res) => {
  const { transactions, employees, settings } = req.body;
  if (employees) {
    db.run('DELETE FROM employees');
    employees.forEach(e => db.run(
      `INSERT OR REPLACE INTO employees (id,name,role,type,salary,phone,start_date,status) VALUES (?,?,?,?,?,?,?,?)`,
      [e.id||uid(), e.name, e.role||'', e.type||'staff', e.salary||0, e.phone||'', e.start_date||e.start||'', e.status||'active']
    ));
  }
  if (transactions) {
    db.run('DELETE FROM transactions');
    transactions.forEach(t => db.run(
      `INSERT OR REPLACE INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)`,
      [t.id||uid(), t.date, t.type, t.cat||'', t.empId||t.emp_id||null, parseFloat(t.amount), t.note||'']
    ));
  }
  if (settings) {
    Object.entries(settings).forEach(([k,v]) => db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`, [k, v]));
  }
  saveDb();
  res.json({ ok: true });
});

// ─── STATIC ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── HELPERS ───────────────────────────────────────────────
function rowsToObjects(result) {
  return result.values.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ─── START ─────────────────────────────────────────────────
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅  CaféBook запущен: http://localhost:${PORT}`);
    console.log(`🌐  В сети:           http://<ВАШ_IP>:${PORT}`);
    console.log(`🔑  Логин по умолчанию: admin / admin123\n`);
  });
});
