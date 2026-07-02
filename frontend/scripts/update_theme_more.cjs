const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'src', 'index.css');
let cssContent = fs.readFileSync(cssPath, 'utf8');

const additions = `
/* Additional Background overrides for tables and charts */
.theme-light [class~="bg-slate-900/90"],
.theme-light [class~="bg-slate-950/50"] {
  background-color: #ffffff !important;
}

.theme-light [class~="bg-slate-950/20"],
.theme-light [class~="bg-slate-950/10"],
.theme-light [class~="bg-slate-900/35"],
.theme-light [class~="bg-slate-900/25"],
.theme-light [class~="bg-slate-900/10"],
.theme-light [class~="bg-slate-800/35"],
.theme-light [class~="bg-slate-800/30"],
.theme-light [class~="bg-slate-800/15"],
.theme-light [class~="bg-slate-800/10"],
.theme-light [class~="bg-slate-700/35"] {
  background-color: transparent !important;
}

/* Recharts Tooltips in Light mode */
.theme-light .fuel-tooltip-pos [class*="bg-slate-"],
.theme-light .mileage-chart-tooltip {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
}
.theme-light .fuel-tooltip-pos [class*="text-slate-100"],
.theme-light .mileage-chart-tooltip [class*="text-slate-100"] {
  color: #1e293b !important;
}
.theme-light .fuel-tooltip-pos [class*="text-slate-300"],
.theme-light .mileage-chart-tooltip [class*="text-slate-300"],
.theme-light .fuel-tooltip-pos [class*="text-slate-400"],
.theme-light .mileage-chart-tooltip [class*="text-slate-400"] {
  color: #64748b !important;
}
.theme-light .fuel-tooltip-pos [class*="text-white"],
.theme-light .mileage-chart-tooltip [class*="text-white"] {
  color: #0f172a !important;
}

/* GPS Monitoring Sidebar Override */
.theme-light .sr-garvex-sidebar {
  background: #ffffff !important;
  border-color: #e2e8f0 !important;
  color: #1e293b !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05) !important;
}

.theme-light .sr-sidebar-tab {
  background: #f8fafc !important;
  border-bottom-color: #e2e8f0 !important;
}

.theme-light .sr-sidebar-tab-button {
  color: #4f46e5 !important;
  border-bottom-color: #4f46e5 !important;
}

.theme-light .sr-sidebar-search {
  background: #ffffff !important;
  border-color: #cbd5e1 !important;
  color: #1e293b !important;
}

.theme-light .sr-sidebar-search input {
  color: #1e293b !important;
}
.theme-light .sr-sidebar-search input::placeholder {
  color: #94a3b8 !important;
}

.theme-light .sr-sidebar-toolbar {
  background: #f1f5f9 !important;
  border-bottom-color: #e2e8f0 !important;
  color: #64748b !important;
}

.theme-light .sr-sidebar-toolbar-left .sr-sort-icon {
  color: #4f46e5 !important;
  background: #e0e7ff !important;
  border-color: #c7d2fe !important;
}

.theme-light .sr-sidebar-group-row {
  background: #f8fafc !important;
  border-bottom-color: #e2e8f0 !important;
  color: #1e293b !important;
}

.theme-light .sr-group-title {
  color: #0f172a !important;
}

.theme-light .sr-group-count {
  background: #e2e8f0 !important;
  color: #475569 !important;
}

.theme-light .sr-group-status-badge {
  background: #f1f5f9 !important;
  color: #64748b !important;
  border-color: #e2e8f0 !important;
}

.theme-light .sr-group-status-badge.is-total.is-active {
  background: #e0e7ff !important;
  border-color: #c7d2fe !important;
  color: #4f46e5 !important;
}
.theme-light .sr-group-status-badge.is-moving.is-active {
  background: #dcfce7 !important;
  border-color: #bbf7d0 !important;
  color: #16a34a !important;
}
.theme-light .sr-group-status-badge.is-stopped.is-active {
  background: #ffedd5 !important;
  border-color: #fed7aa !important;
  color: #ea580c !important;
}
.theme-light .sr-group-status-badge.is-offline.is-active {
  background: #f1f5f9 !important;
  border-color: #e2e8f0 !important;
  color: #64748b !important;
}

.theme-light .sr-object-row {
  border-bottom-color: #f1f5f9 !important;
}

.theme-light .sr-object-row:hover {
  background: #f8fafc !important;
}

.theme-light .sr-object-row.is-selected {
  background: #eff6ff !important;
  border-color: #bfdbfe !important;
}

.theme-light .sr-object-name {
  color: #1e293b !important;
}

.theme-light .sr-object-address {
  color: #64748b !important;
}

.theme-light .sr-muted-text {
  color: #94a3b8 !important;
}

.theme-light .sr-muted-icon {
  color: #cbd5e1 !important;
}

.theme-light .sr-blue-text {
  color: #4f46e5 !important;
}

.theme-light .sr-slate-text {
  color: #475569 !important;
}

.theme-light .glass-panel[class*="xl:min-h-"] {
  background: #ffffff !important;
}
`;

fs.appendFileSync(cssPath, additions, 'utf8');
console.log('Appended additional light mode styles.');
