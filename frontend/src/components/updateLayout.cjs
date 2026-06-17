const fs = require('fs');

try {
    let code = fs.readFileSync('LiveTracker.tsx', 'utf8');

    // 1. Extract Connection Block
    const connStartStr = '<h3 className="text-lg font-semibold text-slate-100">Ulanish holati</h3>';
    const connStart = code.lastIndexOf('<div className="mb-2 flex items-start justify-between gap-2">', code.indexOf(connStartStr));
    const connEndStr = '</section>';
    let connSectionEnd = code.indexOf(connEndStr, connStart);
    let connectionBlock = code.substring(connStart, code.lastIndexOf('</div>', connSectionEnd) + '</div>'.length);

    // 2. Extract Movement Block
    const moveStartStr = '<h3 className="text-lg font-semibold text-slate-100">Harakat holati</h3>';
    const moveStart = code.lastIndexOf('<div className="mb-2 flex items-start justify-between gap-2">', code.indexOf(moveStartStr));
    let moveSectionEnd = code.indexOf(connEndStr, moveStart);
    let movementBlock = code.substring(moveStart, code.lastIndexOf('</div>', moveSectionEnd) + '</div>'.length);

    // 3. Extract Zapravka Block
    const zapravkaStart = code.indexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">\n                            <h3 className="mb-2 text-lg font-semibold text-slate-100">Zapravka / Sliv</h3>');
    const zapravkaEnd = code.indexOf('</section>', zapravkaStart);
    let zapravkaBlock = code.substring(zapravkaStart + '<section className="glass-panel rounded-xl border border-slate-700/50 p-4">'.length, zapravkaEnd);

    // Extract Top Obyektlar Block
    const topObyektlarStartStr = '<h3 className="mb-2 text-lg font-semibold text-slate-100">Top obyektlar probegi</h3>';
    const topObyektlarStartIdx = code.indexOf(topObyektlarStartStr);
    const topObyektlarSectionStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', topObyektlarStartIdx);
    const topObyektlarSectionEnd = code.indexOf('</section>', topObyektlarStartIdx) + '</section>'.length;
    const topObyektlarBlock = code.substring(topObyektlarSectionStart + '<section className="glass-panel rounded-xl border border-slate-700/50 p-4">'.length, topObyektlarSectionEnd - '</section>'.length);

    // Extract Probeg Block
    const probegStartStr = '<h3 className="text-lg font-semibold text-slate-100">Probeg, km</h3>';
    const probegStartIdx = code.indexOf(probegStartStr);
    const probegSectionStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', probegStartIdx);
    const probegSectionEnd = code.indexOf('</section>', probegStartIdx) + '</section>'.length;
    const probegBlock = code.substring(probegSectionStart + '<section className="glass-panel rounded-xl border border-slate-700/50 p-4">'.length, probegSectionEnd - '</section>'.length);

    // Add Inner functions just before `return (`
    const newDefsStr = `
    const renderConnectionInner = () => (
        <>
            \${connectionBlock.trim()}
        </>
    );

    const renderMovementInner = () => (
        <>
            \${movementBlock.trim()}
        </>
    );

    const renderZapravkaSlivInner = () => (
        <>
            \${zapravkaBlock.trim()}
        </>
    );

    const renderTopObyektlarInner = () => (
        <>
            \${topObyektlarBlock.trim()}
        </>
    );

    const renderProbegInner = () => (
        <>
            \${probegBlock.trim()}
        </>
    );
`;
    const returnIdx = code.indexOf('    return (\n        <div className="min-w-0 space-y-4">');
    code = code.substring(0, returnIdx) + newDefsStr + '\n' + code.substring(returnIdx);

    // Wrap the second grid conditionally.
    const secondGridStart = code.indexOf('<div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">');
    if (secondGridStart !== -1) {
        const trackingNavTabEnd = code.indexOf(') : trackingNavTab === \'monitoring\' ? (', secondGridStart);
        const secondGridEnd = code.lastIndexOf('</div>', trackingNavTabEnd - 1) + '</div>'.length;
        
        code = code.substring(0, secondGridStart) + '{!dashboardOnly && (\n                        ' + code.substring(secondGridStart, secondGridEnd) + '\n                    )}' + code.substring(secondGridEnd);
    }

    // Rewrite the first grid.
    const grid1Start = code.indexOf('<div className="grid grid-cols-1 gap-3 xl:grid-cols-3">');
    // We already found topObyektlarSectionStart. But its position shifted!
    // Let's recalculate it dynamically.
    const newTopObyektlarStartIdx = code.indexOf(topObyektlarStartStr, grid1Start);
    const newTopObyektlarSectionStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', newTopObyektlarStartIdx);
    const newTopObyektlarSectionEnd = code.indexOf('</section>', newTopObyektlarStartIdx) + '</section>'.length;
    const grid1End = code.indexOf('</div>', newTopObyektlarSectionEnd) + '</div>'.length;

    // the replacement Grid:
    const newGridStr = `                    {dashboardOnly ? (
                        <>
                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                <div className="grid grid-cols-1 gap-6 divide-y divide-slate-700/50 md:grid-cols-3 md:divide-x md:divide-y-0">
                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">
                                        {renderConnectionInner()}
                                    </div>
                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">
                                        {renderMovementInner()}
                                    </div>
                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">
                                        {renderZapravkaSlivInner()}
                                    </div>
                                </div>
                            </section>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                    {renderTopObyektlarInner()}
                                </section>
                                <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                    {renderProbegInner()}
                                </section>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                {renderConnectionInner()}
                            </section>
                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">
                                {renderMovementInner()}
                            </section>
                            \${code.substring(newTopObyektlarSectionStart, grid1End)}
                    )}`;

    code = code.substring(0, grid1Start) + newGridStr + code.substring(grid1End);

    fs.writeFileSync('LiveTracker.tsx', code);
    console.log("Success!");

} catch (err) {
    console.error(err);
    process.exit(1);
}
