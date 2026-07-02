const fs = require('fs');
const path = 'c:/Users/User/Desktop/smartroute/frontend/src/index.css';
let css = fs.readFileSync(path, 'utf8');

// Replace the :root[data-theme='light'] block
css = css.replace(/:root\[data-theme='light'\]\s*{[^}]*}/, `:root[data-theme='light'] {
  color-scheme: light;
  --app-bg: #f8f9fa;
  --app-text: #1e293b;
  --glass-bg: #ffffff;
  --glass-border: #e2e8f0;
  --glass-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
  --content-bg: none;
  --export-green-text: #4f46e5;
  --fleet-row-selected-bg: #eff6ff;
  --fleet-row-hover-bg: #f8fafc;
}`);

// Strip out ALL existing .theme-light blocks
css = css.replace(/\.theme-light[^{]*{[^}]*}/g, '');

// Strip out :root[data-theme='light'] related pseudo-elements (like ::-webkit-scrollbar)
css = css.replace(/:root\[data-theme='light'\][^{]*{[^}]*}/g, function(match) {
  if(match.includes('--app-bg: #f8f9fa;')) return match; // Keep our main root
  return '';
});

// Now append the new .theme-light styling
const newStyles = `

/* DABANG DAY THEME OVERRIDES */
.theme-light.app-shell {
  background-image: none !important;
  background-color: var(--app-bg) !important;
}

.theme-light .brand-title {
  color: #4f46e5 !important;
  background-image: linear-gradient(90deg, #4f46e5, #6366f1) !important;
}

.theme-light .glass-panel {
  background: var(--glass-bg) !important;
  border-color: var(--glass-border) !important;
  box-shadow: var(--glass-shadow) !important;
}

.theme-light .glass-panel:hover {
  border-color: #cbd5e1 !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05) !important;
}

.theme-light aside.glass-panel {
  background: #ffffff !important;
  border-right-color: var(--glass-border) !important;
  box-shadow: none !important;
}

.theme-light header.glass-panel {
  background-color: #ffffff !important;
  border-bottom: 1px solid var(--glass-border) !important;
  box-shadow: none !important;
}

/* Typography */
.theme-light [class*="text-slate-100"],
.theme-light [class*="text-slate-200"] {
  color: #1e293b !important;
}
.theme-light [class*="text-slate-300"] {
  color: #475569 !important;
}
.theme-light [class*="text-slate-400"] {
  color: #64748b !important;
}
.theme-light [class*="text-slate-500"],
.theme-light [class*="text-slate-600"] {
  color: #94a3b8 !important;
}

.theme-light .app-module-heading,
.theme-light .fuel-tab-heading {
  color: #0f172a !important;
  background-image: none !important;
  -webkit-background-clip: border-box !important;
  background-clip: border-box !important;
  -webkit-text-fill-color: currentColor !important;
}

/* Gradient text fix */
.theme-light .bg-clip-text.text-transparent {
  color: #1e293b !important;
  background-image: none !important;
  -webkit-text-fill-color: #1e293b !important;
}

/* Background overrides for inputs and tables */
.theme-light [class~="bg-slate-950/70"],
.theme-light [class~="bg-slate-900/95"],
.theme-light [class~="bg-slate-900/80"],
.theme-light [class~="bg-slate-900/70"],
.theme-light [class~="bg-slate-900/60"] {
  background-color: #f8fafc !important;
}

.theme-light [class~="bg-slate-900/50"],
.theme-light [class~="bg-slate-900/40"],
.theme-light [class~="bg-slate-900/30"],
.theme-light [class~="bg-slate-900/20"] {
  background-color: #ffffff !important;
}

.theme-light [class*="border-slate-"] {
  border-color: #e2e8f0 !important;
}

/* Sidebar Active Item */
.theme-light aside button[class*="bg-blue-500/20"] {
  background: #4f46e5 !important;
  border-color: #4f46e5 !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3) !important;
}
.theme-light aside button[class*="bg-blue-500/20"] span,
.theme-light aside button[class*="bg-blue-500/20"] svg {
  color: #ffffff !important;
}

/* Sidebar Inactive Item */
.theme-light aside nav button span {
  color: #64748b !important;
}
.theme-light aside nav button svg {
  color: #94a3b8 !important;
}
.theme-light aside nav button:hover {
  background-color: #f1f5f9 !important;
}

/* Stat Cards Pastel Backgrounds (Matching the Dabang Image) */
.theme-light .glass-panel:has(.from-purple-500.to-pink-400) {
  background-color: #fff1f2 !important; /* pink-50 */
  border-color: #ffe4e6 !important; /* pink-100 */
}
.theme-light .glass-panel:has(.from-orange-500.to-amber-400) {
  background-color: #fff7ed !important; /* orange-50 */
  border-color: #ffedd5 !important; /* orange-100 */
}
.theme-light .glass-panel:has(.from-blue-500.to-cyan-400) {
  background-color: #f0fdf4 !important; /* green-50 */
  border-color: #dcfce7 !important; /* green-100 */
}
.theme-light .glass-panel:has(.from-emerald-500.to-teal-400) {
  background-color: #faf5ff !important; /* purple-50 */
  border-color: #f3e8ff !important; /* purple-100 */
}

/* Icon Colors within the pastel cards */
.theme-light .glass-panel [class*="bg-gradient-to-br"] {
  color: #ffffff !important;
}
.theme-light .glass-panel [class*="bg-gradient-to-br"] svg {
  color: #ffffff !important;
}
.theme-light .glass-panel [class*="from-purple-500"][class*="to-pink-400"] {
  background-image: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%) !important; /* Red */
}
.theme-light .glass-panel [class*="from-orange-500"][class*="to-amber-400"] {
  background-image: linear-gradient(135deg, #f97316 0%, #ea580c 100%) !important; /* Orange */
}
.theme-light .glass-panel [class*="from-blue-500"][class*="to-cyan-400"] {
  background-image: linear-gradient(135deg, #22c55e 0%, #16a34a 100%) !important; /* Green */
}
.theme-light .glass-panel [class*="from-emerald-500"][class*="to-teal-400"] {
  background-image: linear-gradient(135deg, #a855f7 0%, #9333ea 100%) !important; /* Purple */
}

/* Buttons */
.theme-light button[class*="bg-blue-"],
.theme-light button[class*="bg-emerald-"],
.theme-light button.login-submit-btn {
  background: #4f46e5 !important;
  color: #ffffff !important;
  border: none !important;
  box-shadow: 0 4px 10px rgba(79, 70, 229, 0.2) !important;
}

/* Table rows */
.theme-light tbody tr:hover {
  background-color: var(--fleet-row-hover-bg) !important;
}
.theme-light .table-pagination-bar {
  background-color: #ffffff !important;
  border-top-color: var(--glass-border) !important;
}

/* Scrollbars */
:root[data-theme='light'] .dark-scrollbar::-webkit-scrollbar-track,
:root[data-theme='light'] .custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f5f9;
}
:root[data-theme='light'] .dark-scrollbar::-webkit-scrollbar-thumb,
:root[data-theme='light'] .custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-color: #f1f5f9;
}
:root[data-theme='light'] .dark-scrollbar::-webkit-scrollbar-thumb:hover,
:root[data-theme='light'] .custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Fix login inputs */
.theme-light .login-auth-input {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
  color: #1e293b !important;
  -webkit-text-fill-color: #1e293b !important;
}

/* Search inputs */
.theme-light input[type="text"], 
.theme-light input[type="date"], 
.theme-light select {
  background-color: #ffffff !important;
  border-color: #e2e8f0 !important;
  color: #1e293b !important;
}
`;

fs.writeFileSync(path, css + newStyles);
console.log('Successfully updated index.css for Dabang light theme.');
