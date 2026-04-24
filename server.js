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
    `CREATE TABLE IF NOT EXISTS banquets (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, total REAL NOT NULL,
      percent REAL DEFAULT 10, note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS banquet_shares (
      id TEXT PRIMARY KEY, banquet_id TEXT NOT NULL, emp_id TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS banquet_items (
      id TEXT PRIMARY KEY, banquet_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'income',
      name TEXT NOT NULL, qty REAL DEFAULT 1, price REAL DEFAULT 0,
      amount REAL NOT NULL DEFAULT 0
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
  try { db.run('ALTER TABLE employees ADD COLUMN hidden_in_schedule INTEGER DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE positions ADD COLUMN hidden_in_schedule INTEGER DEFAULT 0'); } catch(e) {}
  try { db.run('ALTER TABLE employees ADD COLUMN hidden_in_monthly INTEGER DEFAULT 0'); } catch(e) {}

  // Миграция пользователей из config.json
  migrateUsersFromConfig();

  saveDb();
}

// Список страниц для прав доступа
const PAGES = ['dashboard','transactions','daily','monthly','positions','employees','salary','salary-report','schedule','banquets','settings'];

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
  const onlineIds = new Set();
  wsClients.forEach(info => { if (info && info.userId) onlineIds.add(info.userId); });
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name || u.username,
    role: u.role,
    permissions: parsePermissions(u.permissions) || defaultPermissions(),
    isOnline: onlineIds.has(u.id),
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
  const { displayName, role, newPassword, permissions, masterPassword } = req.body;
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
    // защита: если меняем пароль ЧУЖОМУ — требуем мастер-пароль (если он настроен)
    const isOtherUser = String(user.id) !== String(req.user.id);
    if (isOtherUser && getMasterPasswordHash()) {
      if (!verifyMasterPassword(masterPassword)) {
        return res.status(403).json({ error: 'Неверный мастер-пароль', needMaster: true });
      }
    }
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
  const { id, name, hidden_in_schedule } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
  try {
    db.run('INSERT INTO positions (id, name, hidden_in_schedule) VALUES (?, ?, ?)', [id, name.trim(), hidden_in_schedule ? 1 : 0]);
    saveDb();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Такая должность уже существует' });
  }
});
app.put('/api/positions/:id', authMiddleware, (req, res) => {
  const { name, hidden_in_schedule } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Название обязательно' });
  try {
    db.run('UPDATE positions SET name=?, hidden_in_schedule=? WHERE id=?', [name.trim(), hidden_in_schedule ? 1 : 0, req.params.id]);
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
  const { id, name, role, type, salary, hourly_rate, percent, phone, start_date, status, tab_number, hidden_in_schedule, hidden_in_monthly } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя обязательно' });
  db.run(
    `INSERT INTO employees (id,name,role,type,salary,hourly_rate,percent,phone,start_date,status,tab_number,hidden_in_schedule,hidden_in_monthly) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, name, role||'', type||'staff', salary||0, hourly_rate||0, percent||0, phone||'', start_date||'', status||'active', tab_number||null, hidden_in_schedule ? 1 : 0, hidden_in_monthly ? 1 : 0]
  );
  saveDb();
  res.json({ ok: true });
});
app.put('/api/employees/:id', authMiddleware, (req, res) => {
  const { name, role, type, salary, hourly_rate, percent, phone, start_date, status, tab_number, hidden_in_schedule, hidden_in_monthly } = req.body;
  db.run(
    `UPDATE employees SET name=?,role=?,type=?,salary=?,hourly_rate=?,percent=?,phone=?,start_date=?,status=?,tab_number=?,hidden_in_schedule=?,hidden_in_monthly=? WHERE id=?`,
    [name, role||'', type||'staff', salary||0, hourly_rate||0, percent||0, phone||'', start_date||'', status||'active', tab_number||null, hidden_in_schedule ? 1 : 0, hidden_in_monthly ? 1 : 0, req.params.id]
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
// настройки которые НЕ должны попадать в клиент
const PROTECTED_SETTING_KEYS = new Set(['masterPasswordHash']);

app.get('/api/settings', authMiddleware, (req, res) => {
  const rows = db.exec('SELECT key, value FROM settings');
  const obj = {};
  if (rows[0]) rows[0].values.forEach(([k, v]) => {
    if (!PROTECTED_SETTING_KEYS.has(k)) obj[k] = v;
  });
  res.json(obj);
});
app.post('/api/settings', authMiddleware, (req, res) => {
  const body = req.body;
  Object.entries(body).forEach(([key, value]) => {
    if (PROTECTED_SETTING_KEYS.has(key)) return; // не позволяем перезаписать через общий endpoint
    db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`, [key, value ?? '']);
  });
  saveDb();
  res.json({ ok: true });
});

// ─── MASTER PASSWORD ───────────────────────────────────────
function getMasterPasswordHash() {
  const r = db.exec('SELECT value FROM settings WHERE key=?', ['masterPasswordHash']);
  return (r[0] && r[0].values[0] && r[0].values[0][0]) || '';
}

function verifyMasterPassword(plain) {
  const hash = getMasterPasswordHash();
  if (!hash) return false;
  try { return bcrypt.compareSync(String(plain || ''), hash); } catch { return false; }
}

// статус: установлен ли мастер-пароль (для UI)
app.get('/api/master-password/status', authMiddleware, adminOnly, (req, res) => {
  res.json({ isSet: !!getMasterPasswordHash() });
});

// установить или сменить мастер-пароль
// если уже установлен — нужен currentMaster
// также требуется текущий пароль самого админа (adminPassword) — защита от чужого устройства
app.post('/api/master-password/set', authMiddleware, adminOnly, (req, res) => {
  const { currentMaster, newMaster, adminPassword } = req.body || {};
  if (!newMaster || String(newMaster).length < 4) {
    return res.status(400).json({ error: 'Мастер-пароль должен быть не короче 4 символов' });
  }
  // подтверждение паролем самого админа
  const me = dbGetUserById(req.user.id);
  if (!me) return res.status(401).json({ error: 'Сессия недействительна' });
  if (!adminPassword || !bcrypt.compareSync(String(adminPassword), me.password_hash)) {
    return res.status(403).json({ error: 'Неверный пароль администратора' });
  }
  // если уже установлен — проверить старый
  if (getMasterPasswordHash()) {
    if (!verifyMasterPassword(currentMaster)) {
      return res.status(403).json({ error: 'Неверный текущий мастер-пароль' });
    }
  }
  db.run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
    ['masterPasswordHash', bcrypt.hashSync(String(newMaster), 10)]);
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
  // ВАЖНО: явное приведение к числу (из SQLite может прийти строка)
  const qualifyingDays = dailyIncome.filter(d => +d.total > +threshold);
  const qualifyingRevenue = qualifyingDays.reduce((s, d) => s + (+d.total), 0);
  const qualifyingDayList = qualifyingDays.map(d => d.date).join(', ');

  if (qualifyingRevenue <= 0) return res.json({ ok: true, created: 0, message: 'Нет дней с выручкой выше порога ' + threshold });

  // удалить старые авто-бонусы за этот месяц
  db.run(
    `DELETE FROM transactions WHERE type='bonus' AND cat='Процент кассы' AND strftime('%Y-%m', date)=?`,
    [month]
  );

  // создать новые транзакции
  let created = 0;
  const lastDay = month + '-' + new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate().toString().padStart(2, '0');
  employees.forEach(emp => {
    const bonus = qualifyingRevenue * ((+emp.percent) / 100);
    if (bonus > 0) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      const note = `Процент кассы ${emp.percent}% от ${Math.round(qualifyingRevenue)} (дней: ${qualifyingDays.length}${qualifyingDayList ? ' — '+qualifyingDayList : ''}, порог ${threshold})`;
      db.run(
        'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
        [id, lastDay, 'bonus', 'Процент кассы', emp.id, Math.round(bonus * 100) / 100, note]
      );
      created++;
    }
  });

  saveDb();
  res.json({ ok: true, created, qualifyingRevenue: Math.round(qualifyingRevenue), qualifyingDaysCount: qualifyingDays.length });
});

// ─── БАНКЕТЫ ──────────────────────────────────────────────
app.get('/api/banquets', authMiddleware, (req, res) => {
  const { month } = req.query;
  let sql = 'SELECT * FROM banquets';
  const params = [];
  if (month) { sql += ' WHERE strftime("%Y-%m", date) = ?'; params.push(month); }
  sql += ' ORDER BY date DESC';
  const rows = db.exec(sql, params);
  const banquets = rows[0] ? rowsToObjects(rows[0]) : [];
  banquets.forEach(b => {
    const sh = db.exec('SELECT * FROM banquet_shares WHERE banquet_id = ?', [b.id]);
    b.shares = sh[0] ? rowsToObjects(sh[0]) : [];
    const it = db.exec('SELECT * FROM banquet_items WHERE banquet_id = ?', [b.id]);
    b.items = it[0] ? rowsToObjects(it[0]) : [];
  });
  res.json(banquets);
});

// чистая сумма банкета = total + доходы − расходы
function banquetNetTotal(banquetId, fallbackTotal) {
  const it = db.exec('SELECT type, amount FROM banquet_items WHERE banquet_id = ?', [banquetId]);
  let delta = 0;
  if (it[0]) {
    it[0].values.forEach(([type, amount]) => {
      if (type === 'income') delta += +amount;
      else delta -= +amount;
    });
  }
  return fallbackTotal + delta;
}

function recalcShares(banquetId, total, percent) {
  db.run('DELETE FROM banquet_shares WHERE banquet_id = ?', [banquetId]);
  const bRows = db.exec('SELECT date FROM banquets WHERE id = ?', [banquetId]);
  if (!bRows[0]) return [];
  const date = bRows[0].values[0][0];
  const schedRows = db.exec(
    'SELECT DISTINCT emp_id FROM schedule WHERE work_date = ?',
    [date]
  );
  const empIds = schedRows[0] ? schedRows[0].values.map(v => v[0]) : [];
  if (!empIds.length) return [];
  // Бонус считается только от первоначальной суммы банкета, без учёта доп. статей
  const bonus = Math.max(0, (+total) * (percent / 100));
  const share = bonus / empIds.length;
  const shares = [];
  empIds.forEach(empId => {
    const id = uid();
    const amount = Math.round(share * 100) / 100;
    db.run('INSERT INTO banquet_shares (id, banquet_id, emp_id, amount) VALUES (?,?,?,?)',
      [id, banquetId, empId, amount]);
    shares.push({ id, banquet_id: banquetId, emp_id: empId, amount });
  });
  return shares;
}

app.post('/api/banquets', authMiddleware, (req, res) => {
  const { id, date, total, percent, note } = req.body;
  if (!date || !total) return res.status(400).json({ error: 'Укажите дату и сумму' });
  const bId = id || uid();
  db.run('INSERT INTO banquets (id, date, total, percent, note) VALUES (?,?,?,?,?)',
    [bId, date, parseFloat(total), parseFloat(percent) || 10, note || '']);
  recalcShares(bId, parseFloat(total), parseFloat(percent) || 10);
  saveDb();
  res.json({ ok: true, id: bId });
});

app.put('/api/banquets/:id', authMiddleware, (req, res) => {
  const { date, total, percent, note, shares, items, recalc } = req.body;
  db.run('UPDATE banquets SET date=?, total=?, percent=?, note=? WHERE id=?',
    [date, parseFloat(total), parseFloat(percent) || 10, note || '', req.params.id]);
  // статьи (всегда перезаписываются полностью если переданы)
  if (Array.isArray(items)) {
    db.run('DELETE FROM banquet_items WHERE banquet_id = ?', [req.params.id]);
    items.forEach(it => {
      const qty = parseFloat(it.qty) || 1;
      const price = parseFloat(it.price) || 0;
      const amount = +it.amount != null && !isNaN(+it.amount) && +it.amount !== 0 ? parseFloat(it.amount) : qty * price;
      db.run(
        'INSERT INTO banquet_items (id, banquet_id, type, name, qty, price, amount) VALUES (?,?,?,?,?,?,?)',
        [it.id || uid(), req.params.id, it.type === 'expense' ? 'expense' : 'income', it.name || '', qty, price, amount]
      );
    });
  }
  if (recalc) {
    recalcShares(req.params.id, parseFloat(total), parseFloat(percent) || 10);
  } else if (Array.isArray(shares)) {
    shares.forEach(s => {
      if (s.id) {
        db.run('UPDATE banquet_shares SET amount=? WHERE id=?', [parseFloat(s.amount) || 0, s.id]);
      }
    });
  }
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/banquets/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM banquet_shares WHERE banquet_id = ?', [req.params.id]);
  db.run('DELETE FROM banquet_items WHERE banquet_id = ?', [req.params.id]);
  db.run('DELETE FROM banquets WHERE id = ?', [req.params.id]);
  // удалить связанные авто-транзакции
  db.run(
    `DELETE FROM transactions WHERE type='bonus' AND note LIKE ?`,
    ['Банкет ' + req.params.id + '%']
  );
  saveDb();
  res.json({ ok: true });
});

// применить: создать bonus-транзакции
app.post('/api/banquets/:id/apply', authMiddleware, (req, res) => {
  const bRows = db.exec('SELECT * FROM banquets WHERE id = ?', [req.params.id]);
  if (!bRows[0]) return res.status(404).json({ error: 'Банкет не найден' });
  const banquet = rowsToObjects(bRows[0])[0];
  const sRows = db.exec('SELECT * FROM banquet_shares WHERE banquet_id = ?', [req.params.id]);
  const shares = sRows[0] ? rowsToObjects(sRows[0]) : [];

  // удалить старые авто-транзакции этого банкета
  db.run(
    `DELETE FROM transactions WHERE type='bonus' AND note LIKE ?`,
    ['Банкет ' + req.params.id + '%']
  );

  let created = 0;
  shares.forEach(s => {
    if (+s.amount <= 0) return;
    const tid = uid();
    db.run(
      'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
      [tid, banquet.date, 'bonus', 'Банкет', s.emp_id, +s.amount,
       'Банкет ' + banquet.id + (banquet.note ? ' — ' + banquet.note : '')]
    );
    created++;
  });
  saveDb();
  res.json({ ok: true, created });
});

// ─── НАЧИСЛЕНИЕ ОКЛАДОВ ───────────────────────────────────
// Возвращает список активных сотрудников с окладом > 0 (для UI выбора)
app.get('/api/monthly-salary-candidates', authMiddleware, (req, res) => {
  const empRows = db.exec("SELECT * FROM employees WHERE salary > 0 AND status = 'active' ORDER BY name");
  const employees = empRows[0] ? rowsToObjects(empRows[0]) : [];
  res.json(employees);
});

app.post('/api/calc-monthly-salary', authMiddleware, (req, res) => {
  const { month, assignments } = req.body;
  if (!month) return res.status(400).json({ error: 'Укажите месяц' });

  const empRows = db.exec("SELECT * FROM employees WHERE salary > 0 AND status = 'active'");
  const employees = empRows[0] ? rowsToObjects(empRows[0]) : [];
  if (!employees.length) return res.json({ ok: true, created: 0, message: 'Нет активных сотрудников с окладом' });

  // удалить старые авто-транзакции оклада за этот месяц
  db.run(
    `DELETE FROM transactions WHERE type='salary' AND cat='Месячный оклад' AND strftime('%Y-%m', date)=?`,
    [month]
  );

  const lastDay = month + '-' + new Date(+month.split('-')[0], +month.split('-')[1], 0).getDate().toString().padStart(2, '0');

  // Если клиент прислал assignments — начисляем только указанным с указанными суммами
  // Иначе — всем активным с их окладами из профиля
  let targets = [];
  if (Array.isArray(assignments) && assignments.length) {
    assignments.forEach(a => {
      if (!a.emp_id || +a.amount <= 0) return;
      const emp = employees.find(e => e.id === a.emp_id);
      if (emp) targets.push({ emp, amount: +a.amount });
    });
  } else {
    targets = employees.filter(e => +e.salary > 0).map(e => ({ emp: e, amount: +e.salary }));
  }

  let created = 0;
  targets.forEach(({ emp, amount }) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    db.run(
      'INSERT INTO transactions (id,date,type,cat,emp_id,amount,note) VALUES (?,?,?,?,?,?,?)',
      [id, lastDay, 'salary', 'Месячный оклад', emp.id, amount,
       `Оклад ${emp.name}${amount !== +emp.salary ? ' (частично)' : ''}`]
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
// Универсальный экспорт: выгружает все строки всех таблиц с колонками
function exportTable(name) {
  try {
    const rows = db.exec('SELECT * FROM ' + name);
    return rows[0] ? rowsToObjects(rows[0]) : [];
  } catch { return []; }
}

app.get('/api/export', authMiddleware, (req, res) => {
  const setRows = db.exec('SELECT key,value FROM settings');
  const settingsObj = {};
  if (setRows[0]) setRows[0].values.forEach(([k,v]) => { settingsObj[k]=v; });
  res.json({
    version: 2,
    exportedAt: new Date().toISOString(),
    employees: exportTable('employees'),
    transactions: exportTable('transactions'),
    positions: exportTable('positions'),
    schedule: exportTable('schedule'),
    banquets: exportTable('banquets'),
    banquet_items: exportTable('banquet_items'),
    banquet_shares: exportTable('banquet_shares'),
    reasons: exportTable('reasons'),
    settings: settingsObj,
  });
});

// Универсальный импорт: вставляет все колонки которые есть в таблице и в данных
function importRows(table, rows) {
  if (!Array.isArray(rows) || !rows.length) return;
  // реальные колонки таблицы
  const info = db.exec(`PRAGMA table_info(${table})`);
  if (!info[0]) return;
  const tableColumns = info[0].values.map(v => v[1]); // name
  db.run('DELETE FROM ' + table);
  rows.forEach(r => {
    // если id пусто — генерим
    if (tableColumns.includes('id') && !r.id) r.id = uid();
    // маппинг старых полей на новые
    if (r.start && !r.start_date) r.start_date = r.start;
    if (r.empId && !r.emp_id) r.emp_id = r.empId;
    // собираем пары колонка = значение
    const cols = [];
    const vals = [];
    tableColumns.forEach(col => {
      if (r[col] !== undefined) { cols.push(col); vals.push(r[col]); }
    });
    if (!cols.length) return;
    const placeholders = cols.map(() => '?').join(',');
    db.run(
      `INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`,
      vals
    );
  });
}

app.post('/api/import', authMiddleware, adminOnly, (req, res) => {
  const b = req.body || {};
  importRows('employees', b.employees);
  importRows('transactions', b.transactions);
  importRows('positions', b.positions);
  importRows('schedule', b.schedule);
  importRows('banquets', b.banquets);
  importRows('banquet_items', b.banquet_items);
  importRows('banquet_shares', b.banquet_shares);
  importRows('reasons', b.reasons);
  if (b.settings) {
    Object.entries(b.settings).forEach(([k,v]) =>
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)`, [k, v ?? ''])
    );
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
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
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
            // оповестить всех о новом онлайн-пользователе
            wsBroadcast({ type: 'users_changed' });
          } catch {
            ws.send(JSON.stringify({ type: 'auth_failed' }));
            ws.close();
          }
        } else if (msg.type === 'ping') {
          // клиентский heartbeat
          ws.isAlive = true;
          try { ws.send(JSON.stringify({ type: 'pong' })); } catch {}
        }
      } catch {}
    });
    const cleanup = () => {
      const had = wsClients.has(ws);
      wsClients.delete(ws);
      if (had) {
        // оповестить всех что кто-то отвалился
        wsBroadcast({ type: 'users_changed' });
      }
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  // server-side heartbeat: каждые 15 сек проверяем что клиент отвечает на ping
  // если пропустил два пинга (≈30 сек) — закрываем соединение и снимаем «онлайн»
  const interval = setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) {
        try { ws.terminate(); } catch {}
        return;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    });
  }, 15000);
  wss.on('close', () => clearInterval(interval));
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
