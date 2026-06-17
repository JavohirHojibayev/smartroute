const fs = require('fs');

try {
    let code = fs.readFileSync('LiveTracker.tsx', 'utf8');

    // 1. Get grids start
    const gridsStart = code.indexOf('<div className="grid grid-cols-1 gap-3 xl:grid-cols-3">');
    const gridsEnd = code.indexOf('{dashboardLoading ? (', gridsStart);

    // 2. Extract sections
    // Ulanish
    const ulanishStartStr = '<h3 className="text-lg font-semibold text-slate-100">Ulanish holati</h3>';
    const ulanishStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', code.indexOf(ulanishStartStr, gridsStart));
    const ulanishEnd = code.indexOf('</section>', ulanishStart) + '</section>'.length;
    const ulanishBlock = code.substring(ulanishStart, ulanishEnd);

    // Harakat
    const harakatStartStr = '<h3 className="text-lg font-semibold text-slate-100">Harakat holati</h3>';
    const harakatStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', code.indexOf(harakatStartStr, gridsStart));
    const harakatEnd = code.indexOf('</section>', harakatStart) + '</section>'.length;
    const harakatBlock = code.substring(harakatStart, harakatEnd);

    // Top obyektlar
    const topStartStr = '<h3 className="mb-2 text-lg font-semibold text-slate-100">Top obyektlar probegi</h3>';
    const topStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', code.indexOf(topStartStr, gridsStart));
    const topEnd = code.indexOf('</section>', topStart) + '</section>'.length;
    const topBlock = code.substring(topStart, topEnd);

    // Probeg (first section in grid 2)
    const grid2Start = code.indexOf('<div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr]">', gridsStart);
    const probegStart = code.indexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', grid2Start);
    const probegEnd = code.indexOf('</section>', probegStart) + '</section>'.length;
    const probegBlock = code.substring(probegStart, probegEnd);

    // Zapravka
    const zapravkaStartStr = '<h3 className="mb-2 text-lg font-semibold text-slate-100">Zapravka / Sliv</h3>';
    const zapravkaStart = code.lastIndexOf('<section className="glass-panel rounded-xl border border-slate-700/50 p-4">', code.indexOf(zapravkaStartStr, gridsStart));
    const zapravkaEnd = code.indexOf('</section>', zapravkaStart) + '</section>'.length;
    const zapravkaBlock = code.substring(zapravkaStart, zapravkaEnd);

    const sectionTag = '<section className="glass-panel rounded-xl border border-slate-700/50 p-4">';
    
    // Create new Layout using string concatenation!
    const newGridsStr = 
        '                    {dashboardOnly ? (\n' +
        '                        <>\n' +
        '                            <section className="glass-panel rounded-xl border border-slate-700/50 p-4">\n' +
        '                                <div className="grid grid-cols-1 gap-6 divide-y divide-slate-700/50 md:grid-cols-3 md:divide-x md:divide-y-0">\n' +
        '                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">\n' +
        '                                        ' + ulanishBlock.replace(sectionTag, '').replace(/<\/section>$/, '') + '\n' +
        '                                    </div>\n' +
        '                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">\n' +
        '                                        ' + harakatBlock.replace(sectionTag, '').replace(/<\/section>$/, '') + '\n' +
        '                                    </div>\n' +
        '                                    <div className="pt-4 first:pt-0 md:px-4 md:pt-0 md:first:px-0 md:last:px-0">\n' +
        '                                        ' + zapravkaBlock.replace(sectionTag, '').replace(/<\/section>$/, '') + '\n' +
        '                                    </div>\n' +
        '                                </div>\n' +
        '                            </section>\n' +
        '                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 mt-3">\n' +
        '                                ' + topBlock + '\n' +
        '                                ' + probegBlock + '\n' +
        '                            </div>\n' +
        '                        </>\n' +
        '                    ) : (\n' +
        '                        <>\n' +
        '                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">\n' +
        '                                ' + ulanishBlock + '\n' +
        '                                ' + harakatBlock + '\n' +
        '                                ' + topBlock + '\n' +
        '                            </div>\n' +
        '                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[2fr_1fr] mt-3">\n' +
        '                                ' + probegBlock + '\n' +
        '                                ' + zapravkaBlock + '\n' +
        '                            </div>\n' +
        '                        </>\n' +
        '                    )}\n';

    code = code.substring(0, gridsStart) + newGridsStr + '                    ' + code.substring(gridsEnd);

    fs.writeFileSync('LiveTracker.tsx', code);
    console.log("Success!");

} catch (err) {
    console.error(err);
    process.exit(1);
}
