import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import sortPackageJson from 'sort-package-json';
import { DepGroups, PackageJson } from './types';

export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let currentDir = startDir;
  
  while (currentDir !== path.parse(currentDir).root) {
    const pnpmWorkspace = path.join(currentDir, 'pnpm-workspace.yaml');
    const configPath = path.join(currentDir, '.dep-groups.yaml');
    const packageJsonPath = path.join(currentDir, 'package.json');
    
    // Check for .dep-groups.yaml first
    if (fs.existsSync(configPath)) {
      return currentDir;
    }
    
    // Check for pnpm workspace
    if (fs.existsSync(pnpmWorkspace)) {
      return currentDir;
    }
    
    // Check for npm/yarn workspaces in package.json
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkgContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkgContent.workspaces) {
          return currentDir;
        }
      } catch (e) {
        // Invalid package.json, continue searching
      }
    }
    
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

export function loadDepGroups(rootDir: string): DepGroups {
  const configPath = path.join(rootDir, '.dep-groups.yaml');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`.dep-groups.yaml not found at ${configPath}`);
  }
  
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.parse(content) as DepGroups;
}

export function findPackageJsonFiles(rootDir: string): string[] {
  const packages: string[] = [];
  
  function walk(dir: string) {
    if (dir.includes('node_modules') || dir.includes('.git')) {
      return;
    }
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (file === 'package.json') {
        packages.push(fullPath);
      }
    }
  }
  
  walk(rootDir);
  return packages;
}

export function syncFromPackages(rootDir: string): void {
  const configPath = path.join(rootDir, '.dep-groups.yaml');
  
  // Load existing groups or create empty structure
  const fileExists = fs.existsSync(configPath);
  let depGroups: DepGroups;
  if (fileExists) {
    const content = fs.readFileSync(configPath, 'utf-8');
    depGroups = yaml.parse(content) as DepGroups;
  } else {
    depGroups = { groups: {} };
  }
  
  const packageFiles = findPackageJsonFiles(rootDir);
  let updated = false;
  let hasAnyDepGroups = false;
  
  // First pass: check if any package has depGroups defined
  for (const pkgPath of packageFiles) {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    if (packageJson.depGroups && packageJson.depGroups.length > 0) {
      hasAnyDepGroups = true;
      break;
    }
  }
  
  for (const pkgPath of packageFiles) {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    
    // Check if this is the root package.json
    const isRootPkg = path.dirname(pkgPath) === rootDir;
    
    // Determine which groups to sync to
    let targetGroups: string[];
    if (packageJson.depGroups && packageJson.depGroups.length > 0) {
      targetGroups = packageJson.depGroups;
    } else if (!hasAnyDepGroups || !fileExists) {
      // Bootstrap mode: no depGroups exist yet, or file is new
      // Root package.json goes to "root" group, others to "standalone"
      targetGroups = [isRootPkg ? 'root' : 'standalone'];
    } else {
      // File exists and other packages have depGroups, but this one doesn't - skip it
      continue;
    }
    
    // Helper function to find which group contains a dependency
    const findGroupWithDep = (dep: string, isDevDep: boolean): string | null => {
      for (const groupName of targetGroups) {
        const group = depGroups.groups[groupName];
        if (!group) continue;
        
        if (isDevDep && group.devDependencies && group.devDependencies[dep]) {
          return groupName;
        }
        if (!isDevDep && group.dependencies && group.dependencies[dep]) {
          return groupName;
        }
      }
      return null;
    };
    
    // Collect new dependencies and check for version updates
    const newDependencies: Record<string, string> = {};
    const newDevDependencies: Record<string, string> = {};
    
    if (packageJson.dependencies) {
      for (const [dep, version] of Object.entries(packageJson.dependencies)) {
        // Skip workspace protocol dependencies (internal monorepo refs)
        if (typeof version === 'string' && version.startsWith('workspace:')) {
          continue;
        }
        
        const groupName = findGroupWithDep(dep, false);
        if (!groupName) {
          // New dependency - add to standalone
          newDependencies[dep] = version;
        } else {
          // Existing dependency - check for version mismatch
          const group = depGroups.groups[groupName];
          if (group.dependencies && group.dependencies[dep] !== version) {
            group.dependencies[dep] = version;
            updated = true;
            console.log(`  ↻ Updated ${dep}: ${group.dependencies[dep]} → ${version} in group "${groupName}"`);
          }
        }
      }
    }
    
    if (packageJson.devDependencies) {
      for (const [dep, version] of Object.entries(packageJson.devDependencies)) {
        // Skip workspace protocol dependencies (internal monorepo refs)
        if (typeof version === 'string' && version.startsWith('workspace:')) {
          continue;
        }
        
        const groupName = findGroupWithDep(dep, true);
        if (!groupName) {
          // New dependency - add to standalone
          newDevDependencies[dep] = version;
        } else {
          // Existing dependency - check for version mismatch
          const group = depGroups.groups[groupName];
          if (group.devDependencies && group.devDependencies[dep] !== version) {
            group.devDependencies[dep] = version;
            updated = true;
            console.log(`  ↻ Updated ${dep} (dev): ${group.devDependencies[dep]} → ${version} in group "${groupName}"`);
          }
        }
      }
    }
    
    // Add new dependencies to "standalone" group (or "root" for root package)
    if (Object.keys(newDependencies).length > 0 || Object.keys(newDevDependencies).length > 0) {
      const standaloneGroupName = isRootPkg ? 'root' : 'standalone';
      
      if (!depGroups.groups[standaloneGroupName]) {
        depGroups.groups[standaloneGroupName] = {};
      }
      
      const standaloneGroup = depGroups.groups[standaloneGroupName];
      
      // Add new dependencies
      if (Object.keys(newDependencies).length > 0) {
        if (!standaloneGroup.dependencies) {
          standaloneGroup.dependencies = {};
        }
        for (const [dep, version] of Object.entries(newDependencies)) {
          if (!standaloneGroup.dependencies[dep]) {
            standaloneGroup.dependencies[dep] = version;
            updated = true;
            console.log(`  + Added ${dep}@${version} to group "${standaloneGroupName}"`);
          }
        }
      }
      
      // Add new devDependencies
      if (Object.keys(newDevDependencies).length > 0) {
        if (!standaloneGroup.devDependencies) {
          standaloneGroup.devDependencies = {};
        }
        for (const [dep, version] of Object.entries(newDevDependencies)) {
          if (!standaloneGroup.devDependencies[dep]) {
            standaloneGroup.devDependencies[dep] = version;
            updated = true;
            console.log(`  + Added ${dep}@${version} (dev) to group "${standaloneGroupName}"`);
          }
        }
      }
    }
  }
  
  if (updated || !fileExists) {
    // Add helpful comments for special groups
    let yamlContent = '';
    
    // Add header comment
    yamlContent += '# Dependency Groups Configuration\n';
    yamlContent += '# Define shared dependency sets and reference them in package.json via "depGroups"\n\n';
    
    yamlContent += 'groups:\n';
    
    // Sort groups: root first, standalone last, others alphabetically
    const groupNames = Object.keys(depGroups.groups).sort((a, b) => {
      if (a === 'root') return -1;
      if (b === 'root') return 1;
      if (a === 'standalone') return 1;
      if (b === 'standalone') return -1;
      return a.localeCompare(b);
    });
    
    for (const groupName of groupNames) {
      const group = depGroups.groups[groupName];
      
      // Add comment for special groups
      if (groupName === 'root') {
        yamlContent += '  # Root group: for workspace root package.json only\n';
      } else if (groupName === 'standalone') {
        yamlContent += '  # Standalone group: auto-managed package-specific dependencies\n';
        yamlContent += '  # Do not manually add "standalone" to depGroups - it\'s used internally\n';
      }
      
      yamlContent += `  ${groupName}:\n`;
      
      if (group.dependencies && Object.keys(group.dependencies).length > 0) {
        yamlContent += '    dependencies:\n';
        for (const [dep, version] of Object.entries(group.dependencies)) {
          const quotedDep = dep.includes('@') || dep.includes(':') ? `"${dep}"` : dep;
          yamlContent += `      ${quotedDep}: ${JSON.stringify(version)}\n`;
        }
      }
      
      if (group.devDependencies && Object.keys(group.devDependencies).length > 0) {
        yamlContent += '    devDependencies:\n';
        for (const [dep, version] of Object.entries(group.devDependencies)) {
          const quotedDep = dep.includes('@') || dep.includes(':') ? `"${dep}"` : dep;
          yamlContent += `      ${quotedDep}: ${JSON.stringify(version)}\n`;
        }
      }
      
      // Empty line between groups
      if (groupName !== groupNames[groupNames.length - 1]) {
        yamlContent += '\n';
      }
    }
    
    // Write back to .dep-groups.yaml (create if new, or update if changed)
    fs.writeFileSync(configPath, yamlContent, 'utf-8');
    if (fileExists) {
      console.log(`\n✓ Updated .dep-groups.yaml\n`);
    } else {
      console.log(`\n✓ Created .dep-groups.yaml\n`);
    }
  } else {
    console.log('✓ .dep-groups.yaml is up to date\n');
  }
}

export function mergeDepGroups(
  packageJson: PackageJson,
  depGroups: DepGroups
): PackageJson {
  if (!packageJson.depGroups || packageJson.depGroups.length === 0) {
    return packageJson;
  }
  
  const merged: PackageJson = { ...packageJson };
  merged.dependencies = { ...packageJson.dependencies };
  merged.devDependencies = { ...packageJson.devDependencies };
  
  // Track version conflicts
  const depVersions: Record<string, { version: string; group: string }> = {};
  const devDepVersions: Record<string, { version: string; group: string }> = {};
  
  for (const groupName of packageJson.depGroups) {
    const group = depGroups.groups[groupName];
    
    if (!group) {
      console.warn(`Warning: Group "${groupName}" not found in .dep-groups.yaml`);
      continue;
    }
    
    if (group.dependencies) {
      for (const [dep, version] of Object.entries(group.dependencies)) {
        // Check for version conflicts
        if (depVersions[dep] && depVersions[dep].version !== version) {
          console.warn(`Warning: Version conflict for "${dep}": ${depVersions[dep].version} (${depVersions[dep].group}) vs ${version} (${groupName}). Using ${version}.`);
        }
        depVersions[dep] = { version, group: groupName };
      }
      
      merged.dependencies = {
        ...merged.dependencies,
        ...group.dependencies,
      };
    }
    
    if (group.devDependencies) {
      for (const [dep, version] of Object.entries(group.devDependencies)) {
        // Check for version conflicts
        if (devDepVersions[dep] && devDepVersions[dep].version !== version) {
          console.warn(`Warning: Version conflict for "${dep}" (dev): ${devDepVersions[dep].version} (${devDepVersions[dep].group}) vs ${version} (${groupName}). Using ${version}.`);
        }
        devDepVersions[dep] = { version, group: groupName };
      }
      
      merged.devDependencies = {
        ...merged.devDependencies,
        ...group.devDependencies,
      };
    }
  }
  
  // Sort dependencies alphabetically
  if (merged.dependencies) {
    merged.dependencies = Object.keys(merged.dependencies)
      .sort()
      .reduce((acc, key) => {
        acc[key] = merged.dependencies![key];
        return acc;
      }, {} as Record<string, string>);
  }
  
  if (merged.devDependencies) {
    merged.devDependencies = Object.keys(merged.devDependencies)
      .sort()
      .reduce((acc, key) => {
        acc[key] = merged.devDependencies![key];
        return acc;
      }, {} as Record<string, string>);
  }
  
  return merged;
}

export function generateDependencies(rootDir?: string): void {
  const workspaceRoot = rootDir || findWorkspaceRoot();
  
  if (!workspaceRoot) {
    console.error('Could not find workspace root (looking for pnpm-workspace.yaml, npm/yarn workspaces, or .dep-groups.yaml)');
    process.exit(1);
  }
  
  console.log(`Found workspace root: ${workspaceRoot}\n`);
  
  // Step 1: Sync from package.json to .dep-groups.yaml
  console.log('Step 1: Syncing from package.json to .dep-groups.yaml...');
  syncFromPackages(workspaceRoot);
  
  // Step 2: Load updated groups
  console.log('Step 2: Merging from .dep-groups.yaml to package.json...');
  const depGroups = loadDepGroups(workspaceRoot);
  const packageFiles = findPackageJsonFiles(workspaceRoot);
  
  console.log(`Found ${packageFiles.length} package.json files`);
  
  let processed = 0;
  
  for (const pkgPath of packageFiles) {
    const content = fs.readFileSync(pkgPath, 'utf-8');
    const packageJson: PackageJson = JSON.parse(content);
    
    // Check if this is the root package.json
    const isRootPkg = path.dirname(pkgPath) === workspaceRoot;
    
    // Auto-populate depGroups if it's an empty array
    if (packageJson.depGroups !== undefined && Array.isArray(packageJson.depGroups) && packageJson.depGroups.length === 0) {
      packageJson.depGroups = [isRootPkg ? 'root' : 'standalone'];
      console.log(`Auto-populated depGroups for ${packageJson.name || path.basename(path.dirname(pkgPath))} → [${packageJson.depGroups.join(', ')}]`);
    }
    
    // Skip packages without depGroups
    if (!packageJson.depGroups || packageJson.depGroups.length === 0) {
      continue;
    }
    
    console.log(`Processing ${packageJson.name || path.basename(path.dirname(pkgPath))}...`);
    
    const merged = mergeDepGroups(packageJson, depGroups);
    
    // Auto-inject preinstall script if missing or append to existing
    const generateCmd = 'dependency-grouper generate';
    if (!merged.scripts) {
      merged.scripts = {};
    }
    
    if (!merged.scripts.preinstall) {
      merged.scripts.preinstall = generateCmd;
      console.log(`  + Added preinstall script`);
    } else if (!merged.scripts.preinstall.includes('dependency-grouper')) {
      merged.scripts.preinstall = `${merged.scripts.preinstall} && ${generateCmd}`;
      console.log(`  + Appended to existing preinstall script`);
    }
    
    // Sort package.json keys using sort-package-json
    const sorted = sortPackageJson(merged);
    
    // Write back to file
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(sorted, null, 2) + '\n',
      'utf-8'
    );
    
    processed++;
    console.log(`  ✓ Updated with groups: ${packageJson.depGroups.join(', ')}`);
  }
  
  console.log(`\nSuccessfully processed ${processed} package(s)`);
}
