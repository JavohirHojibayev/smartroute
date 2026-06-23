const fs = require('fs');
let txt = fs.readFileSync('c:/Users/User/Desktop/smartroute/backend/.env', 'utf8');
txt = `SQLITE_DB_PATH=database.sqlite
HOST=0.0.0.0
ESMO_ENABLED=true
ESMO_BASE_URL=https://192.168.8.10/cab/
ESMO_USER=admin
ESMO_PASS=QW1665gety
ESMO_SYNC_MAX_PAGES=2
ESMO_RECENT_BACKFILL_PAGES=2
HIKVISION_ENABLED=false
` + txt;
fs.writeFileSync('c:/Users/User/Desktop/smartroute/backend/.env', txt);
