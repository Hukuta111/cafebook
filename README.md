# CaféBook — Система учёта кафе

## Технологии
- **Backend**: Node.js + Express
- **База данных**: SQLite (файл `data/cafebook.db` на сервере)
- **Аутентификация**: JWT токены + bcrypt (пароли хешируются)
- **Frontend**: Чистый HTML/CSS/JS (без фреймворков)

---

## Быстрый старт

### 1. Установка зависимостей (один раз)
```bash
npm install
```

### 2. Запуск

**Linux / Mac:**
```bash
chmod +x start.sh
./start.sh
```

**Windows:**
```
Двойной клик на start.bat
```

**Или напрямую:**
```bash
node server.js
```

Открывай в браузере: **http://localhost:3000**

---

## Развёртывание на медиа-сервере / NAS

### Вариант A — Запуск напрямую (рекомендуется)
```bash
# На сервере:
cd /путь/к/cafebook
npm install
node server.js

# Открывай с любого устройства в сети:
# http://192.168.1.ВАШ_IP:3000
```

### Вариант B — PM2 (автозапуск при перезагрузке сервера)
```bash
npm install -g pm2
pm2 start server.js --name cafebook
pm2 save
pm2 startup   # следовать инструкции в консоли
```

### Вариант C — Systemd (Linux-сервер)
Создай файл `/etc/systemd/system/cafebook.service`:
```ini
[Unit]
Description=CaféBook
After=network.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/path/to/cafebook
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```
```bash
systemctl enable cafebook
systemctl start cafebook
```

### Вариант D — Synology NAS
1. Установи Node.js через Package Center
2. Скопируй папку cafebook на NAS
3. В Task Scheduler создай задачу: `node /path/to/cafebook/server.js`
4. Открывай: `http://IP_NAS:3000`

### Вариант E — Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```
```bash
docker build -t cafebook .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data --name cafebook cafebook
```

---

## Порт

По умолчанию: **3000**

Изменить порт:
```bash
PORT=8080 node server.js
```

---

## Безопасность

| Что защищено | Как |
|---|---|
| Все API-маршруты | JWT Bearer токен (12ч TTL) |
| Пароль в файле | bcrypt hash (не хранится открыто) |
| Прямой доступ к файлам | Невозможен — всё через API |
| Данные | SQLite файл на сервере, браузер не имеет доступа |

**Смени пароль сразу после первого входа** в разделе Настройки → Безопасность.

Логин по умолчанию: `admin` / `admin123`

---

## Структура файлов

```
cafebook/
├── server.js          ← сервер (Node.js + Express)
├── package.json
├── start.sh           ← запуск Linux/Mac
├── start.bat          ← запуск Windows
├── public/
│   └── index.html     ← фронтенд
└── data/              ← создаётся автоматически
    ├── cafebook.db    ← база данных SQLite
    └── config.json    ← конфиг пользователей
```

---

## Резервное копирование

База данных: файл `data/cafebook.db`

Достаточно скопировать этот файл — все данные в нём.

Также можно использовать **Экспорт JSON** в разделе Настройки.
