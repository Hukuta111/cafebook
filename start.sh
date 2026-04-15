#!/bin/bash
echo "🚀 Запуск CaféBook..."

# Find local IP
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null || echo "unknown")

PORT=${PORT:-3000}

cd "$(dirname "$0")"

node server.js &
SERVER_PID=$!

echo ""
echo "✅ CaféBook запущен!"
echo "   Локально:   http://localhost:$PORT"
echo "   В сети:     http://$LOCAL_IP:$PORT"
echo ""


trap "kill $SERVER_PID 2>/dev/null; echo 'Сервер остановлен'" EXIT
wait $SERVER_PID
