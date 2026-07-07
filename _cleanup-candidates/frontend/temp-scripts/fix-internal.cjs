const fs = require('fs');
const path = require('path');

const movedFiles = [
  'features/dashboard/DispatcherDashboard.tsx',
  'features/turniket-jurnal/AccessControlManager.tsx',
  'features/esmo-jurnal/MedicalManager.tsx',
  'features/fuel-monitoring/FuelManager.tsx',
  'features/gps-monitoring/LiveTracker.tsx',
  'features/transport/FleetManager.tsx',
  'features/drivers/DriverManager.tsx',
  'features/maintenance/MechanicManager.tsx',
  'features/cargo-volume/CargoManager.tsx',
  'features/waybill/WaybillManager.tsx',
  'features/waybill/WaybillFormModal.tsx',
  'features/waybill/WaybillSignModal.tsx',
  'features/reports/ReportsManager.tsx',
  'features/shift-schedule/ShiftScheduleManager.tsx',
  'features/tools/ToolsManager.tsx',
  'features/users/UserManager.tsx',
  'features/smart-start/SmartStartWorkflow.tsx',
  'features/mobile-app/MobileAppSimulation.tsx',
  'features/auth/LoginPage.tsx',
  'components/shared/LocalizedDateInput.tsx',
  'components/shared/smartrouteDatePicker.shared.ts'
];

let updatedCount = 0;

movedFiles.forEach(rel => {
  const full = path.join(__dirname, 'src', rel);
  if (fs.existsSync(full)) {
    let content = fs.readFileSync(full, 'utf8');
    let original = content;
    // Replace `from '../` with `from '../../`
    content = content.replace(/from\s+['"]\.\.\/([^'"]+)['"]/g, "from '../../$1'");
    // Replace `import '../` with `import '../../` (e.g. assets)
    content = content.replace(/import\s+([^'"]*?)['"]\.\.\/([^'"]+)['"]/g, "import $1'../../$2'");
    
    if (content !== original) {
      fs.writeFileSync(full, content);
      updatedCount++;
      console.log('Fixed:', rel);
    }
  }
});

console.log(`Done! Fixed ${updatedCount} files.`);
