function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export type XlsSection = {
    title?: string;
    headers: string[];
    rows: Array<Array<string | number>>;
};

export function downloadXls(headers: string[], rows: Array<Array<string | number>>, filename: string): void {
    const thead = `<tr>${headers.map((h) => `<th>${escapeHtml(String(h))}</th>`).join("")}</tr>`;
    const tbody = rows
        .map(
            (row) =>
                `<tr>${row
                    .map((cell) => `<td>${escapeHtml(cell == null ? "" : String(cell))}</td>`)
                    .join("")}</tr>`,
        )
        .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; white-space: nowrap; }
    th { background: #e2e8f0; font-weight: 600; }
  </style>
</head>
<body>
  <table>
    <thead>${thead}</thead>
    <tbody>${tbody}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
    link.click();
    URL.revokeObjectURL(url);
}

export function downloadXlsSections(sections: XlsSection[], filename: string): void {
    const sectionsHtml = sections
        .map((section) => {
            const colCount = Math.max(section.headers.length, ...section.rows.map((row) => row.length), 1);
            const normalizedHeaders = [...section.headers, ...Array(Math.max(colCount - section.headers.length, 0)).fill('')];
            const thead = `<tr>${normalizedHeaders.map((h) => `<th>${escapeHtml(String(h))}</th>`).join('')}</tr>`;
            const tbody = section.rows
                .map((row) => {
                    const normalizedRow = [...row, ...Array(Math.max(colCount - row.length, 0)).fill('')];
                    return `<tr>${normalizedRow.map((cell) => `<td>${escapeHtml(cell == null ? '' : String(cell))}</td>`).join('')}</tr>`;
                })
                .join('');

            return `
    <section class="sheet-section">
      ${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ''}
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </section>`;
        })
        .join('');

    const html = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; }
    .sheet-section { margin-bottom: 18px; }
    .sheet-section h3 { margin: 0 0 6px; font-size: 16px; font-weight: 700; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; white-space: nowrap; }
    th { background: #e2e8f0; font-weight: 600; }
  </style>
</head>
<body>
  ${sectionsHtml}
</body>
</html>`;

    const blob = new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
    link.click();
    URL.revokeObjectURL(url);
}
