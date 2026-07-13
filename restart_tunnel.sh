#!/bin/zsh

PROJECT_DIR="/Users/thoochinfeng/Desktop/PurityLoop AI/Capstone-Web v2"
BACKEND_PORT=8000
BACKEND_URL="http://localhost:${BACKEND_PORT}/docs"

echo "========================================"
echo " PurityLoop Backend + Cloudflare Tunnel "
echo "========================================"

cd "$PROJECT_DIR" || exit 1

echo "Stopping old backend and tunnel processes..."

pkill -f "uvicorn backend.main:app" 2>/dev/null
pkill -f "cloudflared tunnel --url http://localhost:${BACKEND_PORT}" 2>/dev/null

sleep 3

echo "Starting FastAPI backend..."

source backend/.venv/bin/activate

nohup python -m uvicorn backend.main:app --host 0.0.0.0 --port ${BACKEND_PORT} > backend.log 2>&1 &

sleep 5

echo "Checking backend..."

if curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL" | grep -q "200"; then
  echo "Backend is running on http://localhost:${BACKEND_PORT}"
else
  echo "Backend failed to start. Check backend.log"
  exit 1
fi

echo "Starting Cloudflare quick tunnel..."

nohup cloudflared tunnel --url http://localhost:${BACKEND_PORT} > cloudflare.log 2>&1 &

sleep 8

echo ""
echo "Cloudflare Tunnel started."
echo "Finding public URL..."
echo ""

grep -o "https://[-a-zA-Z0-9.]*trycloudflare.com" cloudflare.log | tail -1

echo ""
echo "Logs:"
echo "Backend log:    $PROJECT_DIR/backend.log"
echo "Cloudflare log: $PROJECT_DIR/cloudflare.log"
echo ""
echo "Keep your laptop awake during demo."
