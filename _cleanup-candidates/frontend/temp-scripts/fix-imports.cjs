const fs = require('fs');
const path = require('path');

const componentMap = {
  'DispatcherDashboard': 'features/dashboard/DispatcherDashboard',
  'AccessControlManager': 'features/turniket-jurnal/AccessControlManager',
  'MedicalManager': 'features/esmo-jurnal/MedicalManager',
  'FuelManager': 'features/fuel-monitoring/FuelManager',
  'LiveTracker': 'features/gps-monitoring/LiveTracker',
  'FleetManager': 'features/transport/FleetManager',
  'DriverManager': 'features/drivers/DriverManager',
  'MechanicManager': 'features/maintenance/MechanicManager',
  'CargoManager': 'features/cargo-volume/CargoManager',
  'WaybillManager': 'features/waybill/WaybillManager',
  'WaybillFormModal': 'features/waybill/WaybillFormModal',
  'WaybillSignModal': 'features/waybill/WaybillSignModal',
  'ReportsManager': 'features/reports/ReportsManager',
  'ShiftScheduleManager': 'features/shift-schedule/ShiftScheduleManager',
  'ToolsManager': 'features/tools/ToolsManager',
  'UserManager': 'features/users/UserManager',
  'SmartStartWorkflow': 'features/smart-start/SmartStartWorkflow',
  'MobileAppSimulation': 'features/mobile-app/MobileAppSimulation',
  'LoginPage': 'features/auth/LoginPage',
  'LocalizedDateInput': 'components/shared/LocalizedDateInput',
  'smartrouteDatePicker.shared': 'components/shared/smartrouteDatePicker.shared'
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const srcDir = path.join(__dirname, 'src');
const files = walk(srcDir);

let updatedFilesCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // Resolve file's relative path from src
  const fileRelPath = path.relative(srcDir, file).replace(/\\/g, '/');
  const fileDir = path.dirname(fileRelPath); // e.g. "features/auth", "."

  for (const [compName, targetRelPath] of Object.entries(componentMap)) {
    // 1. Replace from old paths like './components/Comp' or '../components/Comp' or '../../components/Comp'
    // Regex matches from any relative path that ends with /components/Comp or ./Comp (if it was inside components folder)
    
    // Create a precise relative path from the current file's directory to the target file
    let newRelPath = path.posix.relative(fileDir, targetRelPath);
    if (!newRelPath.startsWith('.')) {
      newRelPath = './' + newRelPath;
    }

    // A) Replace `from '.../components/CompName'`
    const regex1 = new RegExp(`from\\s+['"](?:\\.[\\.\\/]*)(?:components\\/)?${compName}['"]`, 'g');
    content = content.replace(regex1, `from '${newRelPath}'`);

    // B) Replace `import('.../components/CompName')` (lazy loading in App.tsx)
    const regex2 = new RegExp(`import\\(['"](?:\\.[\\.\\/]*)(?:components\\/)?${compName}['"]\\)`, 'g');
    content = content.replace(regex2, `import('${newRelPath}')`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    updatedFilesCount++;
    console.log('Updated:', fileRelPath);
  }
});

console.log(`Done! Updated ${updatedFilesCount} files.`);
