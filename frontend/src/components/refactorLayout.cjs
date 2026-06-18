const fs = require('fs');

try {
    let code = fs.readFileSync('LiveTracker.tsx', 'utf8');

    function getSectionContentByRegex(regex) {
        const match = code.match(regex);
        if (!match) return null;
        return match[1].trim(); // capturing group 1 is the whole section
    }

    const sec1Content = getSectionContentByRegex(/(<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*<div className="mb-2 flex items-start justify-between gap-2">\s*<h3 className="text-lg font-semibold text-slate-100">Ulanish holati<\/h3>[\s\S]*?<\/section>)/);
    const sec2Content = getSectionContentByRegex(/(<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*<div className="mb-2 flex items-start justify-between gap-2">\s*<h3 className="text-lg font-semibold text-slate-100">Harakat holati<\/h3>[\s\S]*?<\/section>)/);
    const sec3Content = getSectionContentByRegex(/(<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*<h3 className="mb-2 text-lg font-semibold text-slate-100">Top obyektlar probegi<\/h3>[\s\S]*?<\/section>)/);
    const sec4Content = getSectionContentByRegex(/(<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*<div className="mb-2 flex flex-wrap items-center justify-between gap-2">\s*<h3 className="text-lg font-semibold text-slate-100">Probeg, km<\/h3>[\s\S]*?<\/section>)/);
    const sec5Content = getSectionContentByRegex(/(<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*<h3 className="mb-2 text-lg font-semibold text-slate-100">Zapravka \/ Sliv<\/h3>[\s\S]*?<\/section>)/);

    console.log("sec1", !!sec1Content);
    console.log("sec2", !!sec2Content);
    console.log("sec3", !!sec3Content);
    console.log("sec4", !!sec4Content);
    console.log("sec5", !!sec5Content);

    if (!sec1Content || !sec2Content || !sec3Content || !sec4Content || !sec5Content) {
        console.error("Failed to extract sections");
        process.exit(1);
    }

    function stripSectionTags(content) {
        let stripped = content.replace(/<section className="glass-panel rounded-xl border border-slate-700\/50 p-4">\s*/, '');
        stripped = stripped.replace(/\s*<\/section>$/, '');
        return stripped;
    }

    const sec1Inner = stripSectionTags(sec1Content);
    const sec2Inner = stripSectionTags(sec2Content);
    const sec5Inner = stripSectionTags(sec5Content);

    const insertionPoint = code.indexOf('    const tileConfig = {');
    if (insertionPoint === -1) {
        console.error("Failed to find insertion point");
        process.exit(1);
    }

    const gridStart = code.indexOf('<div className="grid grid-cols-1 gap-3 xl:grid-cols-3">', insertionPoint);
    const gridEndStr = '<section className="glass-panel rounded-xl border border-slate-700/50 p-4">\n                            <h3 className="mb-2 text-lg font-semibold text-slate-100">Zapravka / Sliv</h3>';
    let gridEnd = code.indexOf(gridEndStr, gridStart);
    
    const replacementStart = gridStart;
    const replacementEnd = code.indexOf('</div>', code.indexOf('</section>', gridEnd) + 10);
    
    if (replacementEnd === -1) {
        console.error("Failed to find replacement end");
        process.exit(1);
    }

    const newLayout = `
                    {dashboardOnly ? (
                        <div className="space-y-4">
                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                <h3 className="mb-4 text-xl font-bold text-slate-100">Harakat monitoringi</h3>
                                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:divide-x lg:divide-slate-700/50">
                                    <div className="lg:pr-4">
                                        ${sec1Inner}
                                    </div>
                                    <div className="lg:px-4">
                                        ${sec2Inner}
                                    </div>
                                    <div className="lg:pl-4">
                                        ${sec5Inner}
                                    </div>
                                </div>
                            </section>

                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_2fr]">
                                ${sec3Content}
                                ${sec4Content}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                                ${sec1Content}
                                ${sec2Content}
                                ${sec3Content}
                            </div>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">
                                ${sec4Content}
                                ${sec5Content}
                            </div>
                        </div>
                    )}
`;

    // ADD 6 to cover `</div>`
    code = code.slice(0, replacementStart) + newLayout + code.slice(replacementEnd + 6);

    // DATE FILTER REMOVAL (the one that DOES NOT have !dashboardOnly && ( ... ) wrapper)
    // Wait, let's search for the actual date filter
    const dateFilterStart = code.indexOf('<div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-3 sm:p-4">');
    const syncMessageIndex = code.indexOf('{syncMessage || dashboardError || dashboardData?.reportError ? (');
    
    // BUT what if there is `{!dashboardOnly && (` right before it?
    // Let's check 30 chars before dateFilterStart
    const beforeDateFilter = code.slice(dateFilterStart - 30, dateFilterStart);
    if (beforeDateFilter.includes('{!dashboardOnly && (')) {
        const actualStart = code.indexOf('{!dashboardOnly && (', dateFilterStart - 30);
        code = code.slice(0, actualStart) + code.slice(syncMessageIndex);
    } else {
        // Just slice from dateFilterStart to syncMessageIndex
        code = code.slice(0, dateFilterStart) + code.slice(syncMessageIndex);
    }

    // REMOVE DASHBOARD LOADING MESSAGE
    code = code.replace(/\{dashboardLoading \? \([\s\S]*?\) : null\}/, '');

    fs.writeFileSync('LiveTracker.tsx', code, 'utf8');
    console.log("Successfully refactored LiveTracker.tsx");

} catch (err) {
    console.error(err);
}
