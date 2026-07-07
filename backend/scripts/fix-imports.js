const fs = require('fs');
const path = require('path');

const entityMap = {
  'vehicle.entity': 'fleet/vehicle.entity',
  'trip.entity': 'fleet/trip.entity',
  'transport-registry-snapshot.entity': 'fleet/transport-registry-snapshot.entity',
  'driver.entity': 'people/driver.entity',
  'user.entity': 'people/user.entity',
  'role-permission.entity': 'people/role-permission.entity',
  'medical.entity': 'people/medical.entity',
  'fuel-entry.entity': 'operations/fuel-entry.entity',
  'garvex-tracking-point.entity': 'operations/garvex-tracking-point.entity',
  'mechanical.entity': 'operations/mechanical.entity',
  'tool-issue.entity': 'operations/tool-issue.entity',
  'eimzo-login-log.entity': 'auth/eimzo-login-log.entity',
  'shift-schedule-snapshot.entity': 'scheduling/shift-schedule-snapshot.entity',
  'onec-weight-entry.entity': 'hr/onec-weight-entry.entity'
};

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const srcDir = path.join(__dirname, '../src');
const files = walk(srcDir);

let updatedFilesCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  // 1. For imports from other modules (e.g. '../entities/vehicle.entity')
  for (const [entityName, newRelPath] of Object.entries(entityMap)) {
    // Regex matches from '.../entities/xxx.entity'
    const re = new RegExp(`from\\s+['"](.*?\\/entities)\\/(${entityName})['"]`, 'g');
    content = content.replace(re, `from '$1/${newRelPath}'`);
  }
  
  // 2. For inter-entity imports (inside src/entities/xxx/yyy.entity)
  // They used to be import ... from './vehicle.entity'
  // Now they need to traverse correctly. e.g. from './vehicle.entity' -> from '../fleet/vehicle.entity'
  if (file.includes(path.join('src', 'entities'))) {
    // We are inside an entity file!
    const currentFolder = path.basename(path.dirname(file)); // e.g. 'fleet', 'people'
    
    for (const [entityName, newRelPath] of Object.entries(entityMap)) {
      const targetFolder = newRelPath.split('/')[0];
      const targetFile = newRelPath.split('/')[1];
      
      const re2 = new RegExp(`from\\s+['"]\\.\\/(${entityName})['"]`, 'g');
      
      if (currentFolder === targetFolder) {
        // Same folder, use './'
        content = content.replace(re2, `from './${targetFile}'`);
      } else {
        // Different folder, use '../targetFolder/'
        content = content.replace(re2, `from '../${targetFolder}/${targetFile}'`);
      }
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    updatedFilesCount++;
    console.log('Updated:', file);
  }
});

console.log(`Done! Updated ${updatedFilesCount} files.`);
