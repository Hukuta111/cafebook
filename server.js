'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const http = require('http');
const initSqlJs = require('sql.js');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

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
  const tables = [
    `CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT,
      type TEXT DEFAULT 'staff', salary REAL DEFAULT 0,
      phone TEXT, start_date TEXT, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, type TEXT NOT NULL,
      cat TEXT, emp_id TEXT, amount REAL NOT NULL, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS schedule (
      id TEXT PRIMARY KEY, emp_id TEXT NOT NULL, work_date TEXT NOT NULL,
      hours REAL NOT NULL, hourly_rate REAL, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS reasons (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
      display_name TEXT, password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user', permissions TEXT,
      session_id TEXT, last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`,
  ];
  tables.forEach(sql => db.run(sql));

  // Миграции
  try { db.run('ALTER TABLE employees ADD COLUMN hourly_rate REAL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE employees ADD COLUMN percent REAL DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE employees ADD COLUMN tab_number TEXT'); } catch(e) {}

  // Миграция пользователей из config.json
  migrateUsersFromConfig();

  saveDb();
}

// Список страниц для прав доступа
const PAGES = ['dashboard','transactions','daily','monthly','positions','employees','salary','salary-report','schedule','settings'];

function defaultPermissions() {
  const p = {};
  PAGES.forEach(page => { p[page] = { view: true, edit: false }; });
  return p;
}

function migrateUsersFromConfig() {
  // если уже есть пользователи — пропустить
  const countRows = db.exec('SELECT COUNT(*) FROM users');
  const count = countRows[0] ? countRows[0].values[0][0] : 0;
  if (count > 0) return;

  let sourceUsers = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      sourceUsers = cfg.users || null;
    } catch {}
  }

  if (!sourceUsers || !sourceUsers.length) {
    // создаём дефолтного админа
    sourceUsers = [{
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      username: 'admin',
      displayName: 'Администратор',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
    }];
  }

  sourceUsers.forEach(u => {
    const perms = u.role === 'admin' ? null : JSON.stringify(defaultPermissions());
    db.run(
      `INSERT OR IGNORE INTO users (id,username,display_name,password_hash,role,permissions,session_id,last_login_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        u.id || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
        u.username, u.displayName || u.username, u.passwordHash,
        u.role || 'user', perms,
        u.sessionId || null, u.lastLoginAt || null,
        u.createdAt || new Date().toISOString(),
      ]
    );
  });

  // переименовать старый config.json
  if (fs.existsSync(CONFIG_PATH)) {
    try { fs.renameSync(CONFIG_PATH, CONFIG_PATH + '.migrated'); } catch {}
  }
}

// ─── USER DB HELPERS ──────────────────────────────────────
function dbGetUsers() {
  const rows = db.exec('SELECT * FROM users ORDER BY username');
  return rows[0] ? rowsToObjects(rows[0]) : [];
}

function dbGetUserByUsername(username) {
  const rows = db.exec('SELECT * FROM users WHERE username = ?', [username]);
  return rows[0] ? rowsToObjects(rows[0])[0] : null;
}

function dbGetUserById(id) {
  const rows = db.exec('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] ? rowsToObjects(rows[0])[0] : null;
}

function dbUpdateUser(id, patch) {
  const fields = Object.keys(patch);
  if (!fields.length) return;
  const sql = 'UPDATE users SET ' + fields.map(f => f + '=?').join(',') + ' WHERE id=?';
  db.run(sql, [...fields.map(f => patch[f]), id]);
}

function parsePermissions(permsStr) {
  if (!permsStr) return null;
  try { return JSON.parse(permsStr); } catch { return null; }
}


function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}
setInterval(saveDb, 30000);

// ─── AUTH MIDDLEWARE ────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', reason: 'no_token' });
  }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = dbGetUserByUsername(payload.username);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден', reason: 'user_not_found' });
    }
    if (user.session_id !== payload.sessionId) {
      return res.status(401).json({
        error: 'Сессия завершена: выполнен вход с другого устройства',
        reason: 'session_replaced'
      });
    }
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: parsePermissions(user.permissions),
      sessionId: user.session_id,
    };
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

function checkPermission(page, action) {
  return (req, res, next) => {
    if (req.user?.role === 'admin') return next();
    const perms = req.user?.permissions || {};
    const p = perms[page];
    if (!p || !p[action]) {
      return res.status(403).json({ error: `Нет прав: ${action} на странице «${page}»` });
    }
    next();
  };
}

// ─── AUTH ROUTES ───────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Введите логин и пароль' });
  }
  const normalizedUsername = username.trim().toLowerCase();
  const user = dbGetUserByUsername(normalizedUsername);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const newSessionId = uid();
  const oldSessionId = user.session_id;
  dbUpdateUser(user.id, {
    session_id: newSessionId,
    last_login_at: new Date().toISOString(),
  });
  saveDb();

  // старая сессия — выбить через WS
  if (oldSessionId) {
    wsBroadcastToSession(oldSessionId, { type: 'session_replaced' });
  }
  // все админы — обновить список пользователей
  wsBroadcast({ type: 'users_changed' });

  const token = jwt.sign(
    { username: user.username, role: user.role, sessionId: newSessionId },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role,
    permissions: parsePermissions(user.permissions) || defaultPermissions(),
  });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  dbUpdateUser(req.user.id, { session_id: null });
  saveDb();
  wsBroadcast({ type: 'users_changed' });
  res.json({ ok: true });
});

app.post('/api/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: 'Пароль слишком короткий (мин. 4 символа)' });
  }
  const user = dbGetUserById(req.user.id);
  if (!user || !bcrypt.compareSync(oldPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  dbUpdateUser(user.id, {
    password_hash: bcrypt.hashSync(newPassword, 10),
    session_id: null,
  });
  saveDb();
  res.json({ ok: true, message: 'Пароль изменён. Войдите снова.' });
});

// ─── USER MANAGEMENT (только admin) ───────────────────────

app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const users = dbGetUsers();
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role,
    permissions: parsePermissions(u.permissions) || defaultPermissions(),
    isOnline: !!u.session_id,
    lastLoginAt: u.last_login_at || null,
    createdAt: u.created_at || null,
  })));
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, displayName, password, role, permissions } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Логин и пароль обязательны' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Пароль слишком короткий (мин. 4 символа)' });
  }
  const normalizedUsername = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(normalizedUsername)) {
    return res.status(400).json({ error: 'Логин: только a-z, 0-9, _ , от 2 до 32 символов' });
  }
  if (dbGetUserByUsername(normalizedUsername)) {
    return res.status(409).json({ error: `Пользователь "${normalizedUsername}" уже существует` });
  }
  const finalRole = role === 'admin' ? 'admin' : 'user';
  const perms = finalRole === 'admin' ? null : JSON.stringify(permissions || defaultPermissions());
  const id = uid();
  db.run(
    `INSERT INTO users (id,username,display_name,password_hash,role,permissions,session_id,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, normalizedUsername, displayName?.trim() || username.trim(),
     bcrypt.hashSync(password, 10), finalRole, perms, null, new Date().toISOString()]
  );
  saveDb();
  wsBroadcast({ type: 'users_changed' });
  res.json({ ok: true, id });
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const { displayName, role, newPassword, permissions } = req.body;
  const user = dbGetUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  if (role && role !== 'admin' && user.role === 'admin') {
    const admins = dbGetUsers().filter(u => u.role === 'admin');
    if (admins.length <= 1) {
      return res.status(400).json({ error: 'Нельзя убрать роль у единственного администратора' });
    }
  }
  const patch = {};
  if (displayName !== undefined) patch.display_name = displayName.trim();
  if (role !== undefined) patch.role = role === 'admin' ? 'admin' : 'user';
  if (permissions !== undefined && (patch.role || user.role) !== 'admin') {
    patch.permissions = JSON.stringify(permissions);
  }
  if (patch.role === 'admin') patch.permissions = null;
  if (newPassword) {
    if (newPassword.length < 4) return res.status(400).json({ error: 'Пароль слишком короткий' });
    patch.password_hash = bcrypt.hashSync(newPassword, 10);
    patch.session_id = null;
  }
  dbUpdateUser(user.id, patch);
  saveDb();
  // если сменили пароль/права — кикнуть старую сессию
  if (patch.session_id === null && user.session_id) {
    wsBroadcastToSession(user.session_id, { type: 'kicked' });
  } else if (patch.permissions !== undefined || patch.role !== undefined) {
    // права изменились — попросить клиент перезагрузить /me
    if (user.session_id) wsBroadcastToSession(user.session_id, { type: 'perms_changed' });
  }
  wsBroadcast({ type: 'users_changed' });
  res.json({ ok: true });
});

app.post('/api/users/:id/kick', authMiddleware, adminOnly, (req, res) => {
  const user = dbGetUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  const oldSessionId = user.session_id;
  dbUpdateUser(user.id, { session_id: null });
  saveDb();
  // выбить сессию мгновенно через WS
  if (oldSessionId) {
    wsBroadcastToSession(oldSessionId, { type: 'kicked' });
  }
  wsBroadcast({ type: 'users_changed' });
  res.json({ ok: true });
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const user = dbGetUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.username === req.user.username) {
    return res.status(400).json({ error: 'Нельзя удалить собственный аккаунт' });
  }
  if (user.role === 'admin') {
    const admins = dbGetUsers().filter(u => u.role === 'admin');
    if (admins.length <= 1) {
      return res.status(400).json({ error: 'Нельзя удалить единственного администратора' });
    }
  }
  if (user.session_id) wsBroadcastToSession(user.session_id, { type: 'kicked' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
  saveDb();
  wsBroadcast({ type: 'users_changed' });
  res.json({ ok: true });
});

// Эндпоинт для клиента — получить свои права (при autologin)
app.get('/api/me', authMiddleware, (req, res) => {
  const user = dbGetUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Не найден' });
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role,
    permissions: parsePermissions(user.permissions) || defaultPermissions(),
  });
});

// ─── REASONS (bonus/fine categories) ──────────────────────
app.get('/api/reasons', authMiddleware, (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM reasons';
  const params = [];
  if (type) { sql += ' WHERE type = ?'; params.push(type); }
  sql += ' ORDER BY type, name';
  const rows = db.exec(sql, params);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.post('/api/reasons', authMiddleware, (req, res) => {
  const { id, type, name } = req.body;
  if (!name || !name.trim() || !type) return res.status(400).json({ error: 'Заполните все поля' });
  db.run('INSERT INTO reasons (id, type, name) VALUES (?, ?, ?)', [id, type, name.trim()]);
  saveDb();
  res.json({ ok: true });
});
app.put('/api/reasons/:id', authMiddleware, (req, res) => {
  const { type, name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
  db.run('UPDATE reasons SET type=?, name=? WHERE id=?', [type, name.trim(), req.params.id]);
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/reasons/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM reasons WHERE id=?', [req.params.id]);
  saveDb();
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
  const { id, name, role, type, salary, hourly_rate, percent, phone, start_date, status, tab_number } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });
  db.run(
    `INSERT INTO employees (id,name,role,type,salary,hourly_rate,percent,phone,start_date,status,tab_number) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, role||'', type||'staff', salary||0, hourly_rate||0, percent||0, phone||'', start_date||'', status||'active', tab_number||null]
  );
  saveDb();
  res.json({ ok: true });
});
app.put('/api/employees/:id', authMiddleware, (req, res) => {
  const { name, role, type, salary, hourly_rate, percent, phone, start_date, status, tab_number } = req.body;
  db.run(
    `UPDATE employees SET name=?,role=?,type=?,salary=?,hourly_rate=?,percent=?,phone=?,start_date=?,status=?,tab_number=? WHERE id=?`,
    [name, role||'', type||'staff', salary||0, hourly_rate||0, percent||0, phone||'', start_date||'', status||'active', tab_number||null, req.params.id]
  );
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/employees/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM employees WHERE id=?', [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// ─── SCHEDULE ─────────────────────────────────────────────
app.get('/api/schedule', authMiddleware, (req, res) => {
  const { month, empId } = req.query;
  let sql = 'SELECT * FROM schedule WHERE 1=1';
  const params = [];
  if (month) { sql += ' AND strftime("%Y-%m", work_date) = ?'; params.push(month); }
  if (empId) { sql += ' AND emp_id = ?'; params.push(empId); }
  sql += ' ORDER BY work_date, emp_id';
  const rows = db.exec(sql, params);
  res.json(rows[0] ? rowsToObjects(rows[0]) : []);
});
app.post('/api/schedule', authMiddleware, (req, res) => {
  const { id, emp_id, work_date, hours, hourly_rate, note } = req.body;
  if (!emp_id || !work_date || !hours) return res.status(400).json({ error: 'Заполните все поля' });
  db.run(
    'INSERT INTO schedule (id,emp_id,work_date,hours,hourly_rate,note) VALUES (?,?,?,?,?,?)',
    [id, emp_id, work_date, parseFloat(hours), hourly_rate != null ? parseFloat(hourly_rate) : null, note||'']
  );
  saveDb();
  res.json({ ok: true });
});
app.put('/api/schedule/:id', authMiddleware, (req, res) => {
  const { emp_id, work_date, hours, hourly_rate, note } = req.body;
  db.run(
    'UPDATE schedule SET emp_id=?,work_date=?,hours=?,hourly_rate=?,note=? WHERE id=?',
    [emp_id, work_date, parseFloat(hours), hourly_rate != null ? parseFloat(hourly_rate) : null, note||'', req.params.id]
  );
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/schedule/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM schedule WHERE id=?', [req.params.id]);
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
app.put('/api/transactions/:id', authMiddleware, (req, res) => {
  const { date, type, cat, empId, amount, note } = req.body;
  db.run(
    'UPDATE transactions SET date=?,type=?,cat=?,emp_id=?,amount=?,note=? WHERE id=?',
    [date, type, cat||'', empId||null, parseFloat(amount), note||'', req.params.id]
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
  const body = req.body;
  Object.entries(body).forEach(([key, value]) => {
    db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`, [key, value ?? '']);
  });
  saveDb();
  res.json({ ok: true });
});

// ─── PERCENT BONUS CALC ───────────────────────────────────
app.post('/api/calc-percent-bonus', authMiddleware, (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'Укажите месяц' });

  // получить порог
  const setRows = db.exec('SELECT value FROM settings WHERE key=?', ['revenueThreshold']);
  const threshold = parseFloat((setRows[0] && setRows[0].values[0][0]) || 0);
  if (threshold <= 0) return res.status(400).json({ error: 'Порог выручки не задан в настройках' });

  // сотрудники с процентом
  const empRows = db.exec('SELECT * FROM employees WHERE percent > 0 AND status = ?', ['active']);
  const employees = empRows[0] ? rowsToObjects(empRows[0]) : [];
  if (!employees.length) return res.status(400).json({ error: 'Нет сотрудников с процентом' });

  // выручка по дням за месяц
  const txRows = db.exec(
    `SELECT date, SUM(amount) as total FROM transactions WHERE type='income' AND strftime('%Y-%m', date)=? GROUP BY date`,
    [month]
  );
  const dailyIncome = txRows[0] ? rowsToObjects(txRows[0]) : [];
  const qualifyingRevenue = dailyIncome.filter(d => d.total > threshold).reduce((s, d) => s + d.total, 0);

  if (qualifyingRevenue <= 0) return res.json({ ok: true, created: 0, message: 'Нет дней с выручкой выше порога' });

  // удалить старые авто-бонусы за этот месяц
  db.run(
    `DELETE FROM transactions WHERE type='bonus' AND cat='Процент кассы' AND strftime('%Y-%m', date)=?`,
    [month]
  );

  // создать новые транзакции
  let created = 0;
  const lastDay = month + '-' + new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate().toString().padStart(2, '0');
  employees.forEach(emp => {
    const bonus = qualifyingRevenue * (emp.percent / 100);
    if (bonus > 0) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      db.run(
        'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
        [id, lastDay, 'bonus', 'Процент кассы', emp.id, Math.round(bonus * 100) / 100, `Процент кассы ${emp.percent}% от ${Math.round(qualifyingRevenue)} (порог ${threshold})`]
      );
      created++;
    }
  });

  saveDb();
  res.json({ ok: true, created, qualifyingRevenue: Math.round(qualifyingRevenue) });
});

// ─── НАЧИСЛЕНИЕ ОКЛАДОВ ───────────────────────────────────
app.post('/api/calc-monthly-salary', authMiddleware, (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'Укажите месяц' });

  const empRows = db.exec("SELECT * FROM employees WHERE salary > 0 AND status = 'active'");
  const employees = empRows[0] ? rowsToObjects(empRows[0]) : [];
  if (!employees.length) return res.json({ ok: true, created: 0, message: 'Нет активных сотрудников с окладом' });

  // удалить старые авто-транзакции оклада за этот месяц
  db.run(
    `DELETE FROM transactions WHERE type='salary' AND cat='Месячный оклад' AND strftime('%Y-%m', date)=?`,
    [month]
  );

  // последний день месяца
  const lastDay = month + '-' + new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate().toString().padStart(2, '0');

  let created = 0;
  employees.forEach(emp => {
    if (+emp.salary <= 0) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    db.run(
      'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
      [id, lastDay, 'salary', 'Месячный оклад', emp.id, +emp.salary, `Оклад ${emp.name}`]
    );
    created++;
  });

  saveDb();
  res.json({ ok: true, created });
});

// ─── SCHEDULE → TRANSACTIONS ──────────────────────────────
app.post('/api/calc-schedule-tx', authMiddleware, (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'Укажите месяц' });

  // проверить настройку
  const setRows = db.exec('SELECT value FROM settings WHERE key=?', ['scheduleTx']);
  const enabled = setRows[0] && setRows[0].values[0][0] === 'true';
  if (!enabled) return res.status(400).json({ error: 'Функция отключена в настройках' });

  // получить смены за месяц
  const schedRows = db.exec(
    'SELECT * FROM schedule WHERE strftime("%Y-%m", work_date) = ? ORDER BY emp_id, work_date',
    [month]
  );
  const entries = schedRows[0] ? rowsToObjects(schedRows[0]) : [];
  if (!entries.length) return res.json({ ok: true, created: 0, message: 'Нет смен за этот месяц' });

  // получить сотрудников
  const empRows = db.exec('SELECT * FROM employees');
  const employees = empRows[0] ? rowsToObjects(empRows[0]) : [];
  const empMap = {};
  employees.forEach(e => { empMap[e.id] = e; });

  // удалить старые авто-транзакции за месяц
  db.run(
    `DELETE FROM transactions WHERE type='salary' AND cat='График работы' AND strftime('%Y-%m', date)=?`,
    [month]
  );

  // сгруппировать по сотрудникам и посчитать
  const byEmp = {};
  entries.forEach(s => {
    if (!byEmp[s.emp_id]) byEmp[s.emp_id] = { hours: 0, total: 0 };
    const emp = empMap[s.emp_id];
    const rate = s.hourly_rate != null ? s.hourly_rate : (emp ? emp.hourly_rate || 0 : 0);
    byEmp[s.emp_id].hours += s.hours;
    byEmp[s.emp_id].total += s.hours * rate;
  });

  // создать транзакции
  let created = 0;
  const lastDay = month + '-' + new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate().toString().padStart(2, '0');
  Object.entries(byEmp).forEach(([empId, data]) => {
    if (data.total <= 0) return;
    const emp = empMap[empId];
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    db.run(
      'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
      [id, lastDay, 'salary', 'График работы', empId, Math.round(data.total * 100) / 100,
       `${emp?emp.name:empId}: ${data.hours}ч × ставка = ${Math.round(data.total * 100) / 100}`]
    );
    created++;
  });

  saveDb();
  res.json({ ok: true, created });
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
  // Сброс пароля admin при запуске с RESET_ADMIN=1
  if (process.env.RESET_ADMIN === '1') {
    const admin = dbGetUserByUsername('admin');
    if (admin) {
      dbUpdateUser(admin.id, {
        password_hash: bcrypt.hashSync('admin123', 10),
        session_id: null,
      });
      saveDb();
      console.log('\n🔐  Пароль admin сброшен на admin123\n');
    }
  }
  const server = http.createServer(app);
  setupWebSocket(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅  CaféBook запущен: http://localhost:${PORT}`);
    console.log(`🌐  В сети:           http://<ВАШ_IP>:${PORT}`);
    console.log(`🔑  Логин по умолчанию: admin / admin123\n`);
  });
});

// ─── WEBSOCKET ─────────────────────────────────────────────
const wsClients = new Map(); // ws → { userId, username, sessionId }

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && msg.token) {
          try {
            const payload = jwt.verify(msg.token, JWT_SECRET);
            const user = dbGetUserByUsername(payload.username);
            if (!user || user.session_id !== payload.sessionId) {
              ws.send(JSON.stringify({ type: 'auth_failed' }));
              ws.close();
              return;
            }
            wsClients.set(ws, {
              userId: user.id, username: user.username, sessionId: payload.sessionId
            });
            ws.send(JSON.stringify({ type: 'auth_ok' }));
          } catch {
            ws.send(JSON.stringify({ type: 'auth_failed' }));
            ws.close();
          }
        }
      } catch {}
    });
    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
  });
}

function wsBroadcast(msg) {
  const data = JSON.stringify(msg);
  wsClients.forEach((_info, ws) => {
    if (ws.readyState === 1) ws.send(data);
  });
}

function wsBroadcastToUser(userId, msg) {
  const data = JSON.stringify(msg);
  wsClients.forEach((info, ws) => {
    if (info.userId === userId && ws.readyState === 1) ws.send(data);
  });
}

function wsBroadcastToSession(sessionId, msg) {
  const data = JSON.stringify(msg);
  wsClients.forEach((info, ws) => {
    if (info.sessionId === sessionId && ws.readyState === 1) ws.send(data);
  });
}
