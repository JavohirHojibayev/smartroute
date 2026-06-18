const fs = require('fs');

try {
    let code = fs.readFileSync('LiveTracker.tsx', 'utf8');

    // 1. DATE FILTER REMOVAL
    // The date filter is enclosed in a div with "rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3 sm:p-4"
    const dateFilterInnerStr = '<div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3 sm:p-4">';
    const dateFilterStart = code.indexOf(dateFilterInnerStr);
    const syncMessageIndex = code.indexOf('{syncMessage || dashboardError || dashboardData?.reportError ? (');
    
    if (dateFilterStart !== -1 && syncMessageIndex !== -1) {
        // Let's check if there is `{!dashboardOnly && (` right before it
        const beforeDateFilter = code.slice(dateFilterStart - 30, dateFilterStart);
        if (beforeDateFilter.includes('{!dashboardOnly && (')) {
            const actualStart = code.indexOf('{!dashboardOnly && (', dateFilterStart - 30);
            code = code.slice(0, actualStart) + code.slice(syncMessageIndex);
        } else {
            code = code.slice(0, dateFilterStart) + code.slice(syncMessageIndex);
        }
    } else {
        console.error("Failed to remove Date Filter");
    }

    // 2. REMOVE DASHBOARD LOADING MESSAGE
    code = code.replace(/\{dashboardLoading \? \([\s\S]*?\) : null\}/, '');

    fs.writeFileSync('LiveTracker.tsx', code, 'utf8');
    console.log("Successfully refactored LiveTracker.tsx");

} catch (err) {
    console.error(err);
}
