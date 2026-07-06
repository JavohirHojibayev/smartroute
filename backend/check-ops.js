const fs = require('fs');
const ops = JSON.parse(fs.readFileSync('azs_ops_2.json', 'utf8'));

let sumVal = 0;
let sumCounterMode = 0;
let sumDutMode = 0;
let sumHybridMode = 0;

ops.items.forEach(i => {
  const getNum = (v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  
  // Actually, ops.items DOES NOT HAVE payload.
  // It only has 'liters', 'issuedValue', 'value' is missing.
  // Wait, I can just fetch it again from /operations but modify getOperations temporarily to include payload!
});
