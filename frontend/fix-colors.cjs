const fs = require('fs');
let c = fs.readFileSync('src/components/FuelManager.tsx', 'utf8');

c = c.split('className={`font-semibold ${devicesOffline > 0 ? \'text-red-400\' : \'text-slate-500\'}`}').join('className="font-semibold text-white"');
c = c.split('className="font-semibold text-emerald-400"').join('className="font-semibold text-white"');
c = c.split('className="font-semibold text-red-400"').join('className="font-semibold text-white"');
c = c.split('className="font-semibold text-amber-400"').join('className="font-semibold text-white"');
// Wait, the cardsUnsynced uses text-slate-500
c = c.split('className="font-semibold text-slate-500"').join('className="font-semibold text-white"');

fs.writeFileSync('src/components/FuelManager.tsx', c);
