#!/bin/bash
# Start U-HPCMS Backend + Frontend servers
cd /Users/user/Desktop/systems/HospitalManagement-master

echo "=== Stopping old backend ==="
lsof -ti tcp:3000 | xargs kill 2>/dev/null
sleep 1

echo "=== Starting backend on port 3000 ==="
cd backend
nohup node server.js > /tmp/uhpcms-backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"
sleep 3

echo "=== Backend health check ==="
curl -s http://localhost:3000/api/health
echo ""
tail -3 /tmp/uhpcms-backend.log

echo ""
echo "=== Starting frontend on port 5173 ==="
cd ../frontend
npx vite --host &
sleep 3

echo ""
echo "Both servers started!"
echo "  Backend:  http://localhost:3000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Test login branding: open http://localhost:5173/login"
