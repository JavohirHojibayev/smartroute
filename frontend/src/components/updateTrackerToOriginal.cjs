const fs = require('fs');

try {
    let code = fs.readFileSync('LiveTracker.tsx', 'utf8');

    // Find the start of the grids in LiveTracker.tsx
    const dashboardOnlyStartStr = '{dashboardOnly ? (\\n                        <>\\n                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">';
    const startIdx = code.indexOf('{dashboardOnly ? (\n                        <>');
    if (startIdx === -1) {
        console.error("Could not find {dashboardOnly ? ( ...");
        process.exit(1);
    }

    const endIdx = code.indexOf('                    {dashboardLoading ? (', startIdx);
    
    // We already have the blocks inside the 'else' branch of dashboardOnly.
    // Let's just find the else branch and use it!
    const elseBranchStart = code.indexOf(') : (\n                        <>\n                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">', startIdx);
    
    if (elseBranchStart !== -1) {
        const elseContentStart = elseBranchStart + ') : (\n'.length;
        const elseContentEnd = code.lastIndexOf('                        </>\n                    )}', endIdx);
        
        const originalLayout = code.substring(elseContentStart, elseContentEnd);
        code = code.substring(0, startIdx) + originalLayout + '\n' + code.substring(endIdx);
        fs.writeFileSync('LiveTracker.tsx', code);
        console.log("Success!");
    } else {
        console.error("Could not find the else branch!");
    }

} catch (err) {
    console.error(err);
    process.exit(1);
}
