#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { 
  generateDependencies, 
  mergeDepGroups, 
  loadDepGroups,
  findWorkspaceRoot,
  findPackageJsonFiles,
  syncFromPackages
} = require('../dist/index.js');

const TEST_DIR = path.join(__dirname, 'fixtures');

function setup() {
  // Clean and create test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Create .dep-groups.yaml
  const depGroupsContent = `groups:
  react:
    dependencies:
      react: "^18.2.0"
      react-dom: "^18.2.0"
  testing:
    devDependencies:
      jest: "^29.0.0"
      "@testing-library/react": "^14.0.0"
`;
  fs.writeFileSync(path.join(TEST_DIR, '.dep-groups.yaml'), depGroupsContent);

  // Create a test package.json
  const packageDir = path.join(TEST_DIR, 'packages', 'test-app');
  fs.mkdirSync(packageDir, { recursive: true });
  
  const packageJson = {
    name: 'test-app',
    version: '1.0.0',
    depGroups: ['react', 'testing'],
    dependencies: {
      axios: '^1.0.0'
    }
  };
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true });
  }
}

function testLoadDepGroups() {
  console.log('Testing loadDepGroups...');
  const depGroups = loadDepGroups(TEST_DIR);
  
  assert.ok(depGroups.groups, 'Should have groups object');
  assert.ok(depGroups.groups.react, 'Should have react group');
  assert.ok(depGroups.groups.testing, 'Should have testing group');
  assert.strictEqual(depGroups.groups.react.dependencies.react, '^18.2.0');
  assert.strictEqual(depGroups.groups.testing.devDependencies.jest, '^29.0.0');
  
  console.log('✓ loadDepGroups works correctly');
}

function testMergeDepGroups() {
  console.log('Testing mergeDepGroups...');
  
  const packageJson = {
    name: 'test',
    depGroups: ['react', 'testing'],
    dependencies: {
      axios: '^1.0.0'
    }
  };
  
  const depGroups = {
    groups: {
      react: {
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0'
        }
      },
      testing: {
        devDependencies: {
          jest: '^29.0.0'
        }
      }
    }
  };
  
  const merged = mergeDepGroups(packageJson, depGroups);
  
  assert.ok(merged.dependencies, 'Should have dependencies');
  assert.strictEqual(merged.dependencies.axios, '^1.0.0', 'Should keep existing deps');
  assert.strictEqual(merged.dependencies.react, '^18.2.0', 'Should add react');
  assert.strictEqual(merged.dependencies['react-dom'], '^18.2.0', 'Should add react-dom');
  assert.ok(merged.devDependencies, 'Should have devDependencies');
  assert.strictEqual(merged.devDependencies.jest, '^29.0.0', 'Should add jest');
  
  // Check alphabetical sorting
  const depKeys = Object.keys(merged.dependencies);
  const sortedDepKeys = [...depKeys].sort();
  assert.deepStrictEqual(depKeys, sortedDepKeys, 'Dependencies should be sorted alphabetically');
  
  console.log('✓ mergeDepGroups works correctly');
}

function testGenerateDependencies() {
  console.log('Testing generateDependencies...');
  
  generateDependencies(TEST_DIR);
  
  // Read the updated package.json
  const packagePath = path.join(TEST_DIR, 'packages', 'test-app', 'package.json');
  const updatedContent = fs.readFileSync(packagePath, 'utf-8');
  const updatedPackage = JSON.parse(updatedContent);
  
  assert.ok(updatedPackage.dependencies, 'Should have dependencies');
  assert.strictEqual(updatedPackage.dependencies.axios, '^1.0.0', 'Should keep axios');
  assert.strictEqual(updatedPackage.dependencies.react, '^18.2.0', 'Should add react');
  assert.strictEqual(updatedPackage.dependencies['react-dom'], '^18.2.0', 'Should add react-dom');
  assert.ok(updatedPackage.devDependencies, 'Should have devDependencies');
  assert.strictEqual(updatedPackage.devDependencies.jest, '^29.0.0', 'Should add jest');
  assert.strictEqual(updatedPackage.devDependencies['@testing-library/react'], '^14.0.0', 'Should add testing-library');
  
  console.log('✓ generateDependencies works correctly');
}

function testMissingGroup() {
  console.log('Testing missing group warning...');
  
  const packageJson = {
    name: 'test',
    depGroups: ['nonexistent'],
    dependencies: {}
  };
  
  const depGroups = { groups: {} };
  
  // Should not throw, just warn
  const merged = mergeDepGroups(packageJson, depGroups);
  assert.deepStrictEqual(merged.dependencies, {}, 'Should have empty dependencies');
  
  console.log('✓ Missing group handled correctly');
}

function testFindWorkspaceRoot() {
  console.log('Testing findWorkspaceRoot...');
  
  // Test 1: Find root with .dep-groups.yaml
  const root1 = findWorkspaceRoot(path.join(TEST_DIR, 'packages', 'test-app'));
  assert.strictEqual(root1, TEST_DIR, 'Should find root with .dep-groups.yaml');
  
  // Test 2: Create pnpm-workspace.yaml test
  const pnpmTestDir = path.join(TEST_DIR, 'pnpm-test');
  fs.mkdirSync(pnpmTestDir, { recursive: true });
  fs.writeFileSync(path.join(pnpmTestDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"');
  const root2 = findWorkspaceRoot(pnpmTestDir);
  assert.strictEqual(root2, pnpmTestDir, 'Should find root with pnpm-workspace.yaml');
  
  // Test 3: npm workspaces in package.json
  const npmTestDir = path.join(TEST_DIR, 'npm-test');
  fs.mkdirSync(npmTestDir, { recursive: true });
  fs.writeFileSync(path.join(npmTestDir, 'package.json'), JSON.stringify({
    name: 'test-workspace',
    workspaces: ['packages/*']
  }));
  const root3 = findWorkspaceRoot(npmTestDir);
  assert.strictEqual(root3, npmTestDir, 'Should find root with npm workspaces');
  
  console.log('✓ findWorkspaceRoot works correctly');
}

function testFindPackageJsonFiles() {
  console.log('Testing findPackageJsonFiles...');
  
  // Create nested structure
  const nestedDir = path.join(TEST_DIR, 'nested');
  fs.mkdirSync(path.join(nestedDir, 'deep', 'deeper'), { recursive: true });
  fs.mkdirSync(path.join(nestedDir, 'node_modules', 'some-pkg'), { recursive: true });
  
  fs.writeFileSync(path.join(nestedDir, 'package.json'), '{}');
  fs.writeFileSync(path.join(nestedDir, 'deep', 'package.json'), '{}');
  fs.writeFileSync(path.join(nestedDir, 'deep', 'deeper', 'package.json'), '{}');
  fs.writeFileSync(path.join(nestedDir, 'node_modules', 'some-pkg', 'package.json'), '{}');
  
  const files = findPackageJsonFiles(nestedDir);
  
  // Should find 3 files (not the one in node_modules)
  assert.strictEqual(files.length, 3, 'Should find 3 package.json files');
  assert.ok(files.every(f => !f.includes('node_modules')), 'Should skip node_modules');
  
  console.log('✓ findPackageJsonFiles works correctly');
}

function testSyncFromPackages_NewFile() {
  console.log('Testing syncFromPackages (new file)...');
  
  const syncTestDir = path.join(TEST_DIR, 'sync-new');
  fs.mkdirSync(path.join(syncTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create package with empty depGroups
  fs.writeFileSync(path.join(syncTestDir, 'package.json'), JSON.stringify({
    name: 'root',
    depGroups: []
  }));
  
  fs.writeFileSync(path.join(syncTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: [],
    dependencies: {
      react: '^18.2.0',
      axios: '^1.0.0'
    },
    devDependencies: {
      jest: '^29.0.0'
    }
  }));
  
  syncFromPackages(syncTestDir);
  
  // Check .dep-groups.yaml was created
  assert.ok(fs.existsSync(path.join(syncTestDir, '.dep-groups.yaml')), 'Should create .dep-groups.yaml');
  
  const depGroups = loadDepGroups(syncTestDir);
  
  // Root should get 'root' group, app1 should get 'standalone' group
  assert.ok(depGroups.groups.standalone, 'Should have standalone group');
  assert.strictEqual(depGroups.groups.standalone.dependencies.react, '^18.2.0', 'Should capture react');
  assert.strictEqual(depGroups.groups.standalone.dependencies.axios, '^1.0.0', 'Should capture axios');
  assert.strictEqual(depGroups.groups.standalone.devDependencies.jest, '^29.0.0', 'Should capture jest');
  
  console.log('✓ syncFromPackages (new file) works correctly');
}

function testSyncFromPackages_ExistingFile() {
  console.log('Testing syncFromPackages (existing file)...');
  
  const syncTestDir = path.join(TEST_DIR, 'sync-existing');
  fs.mkdirSync(path.join(syncTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create existing .dep-groups.yaml
  fs.writeFileSync(path.join(syncTestDir, '.dep-groups.yaml'), `groups:
  standalone:
    dependencies:
      react: "^18.2.0"
`);
  
  // Create package with depGroups reference
  fs.writeFileSync(path.join(syncTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['standalone'],
    dependencies: {
      react: '^18.2.0',
      axios: '^1.0.0'  // New dependency
    }
  }));
  
  syncFromPackages(syncTestDir);
  
  const depGroups = loadDepGroups(syncTestDir);
  
  // Should keep react and add axios
  assert.strictEqual(depGroups.groups.standalone.dependencies.react, '^18.2.0', 'Should keep react');
  assert.strictEqual(depGroups.groups.standalone.dependencies.axios, '^1.0.0', 'Should add axios');
  
  console.log('✓ syncFromPackages (existing file) works correctly');
}

function testSyncFromPackages_RootVsCommon() {
  console.log('Testing syncFromPackages (root vs standalone groups)...');
  
  const syncTestDir = path.join(TEST_DIR, 'sync-root-standalone');
  fs.mkdirSync(path.join(syncTestDir, 'packages', 'app1'), { recursive: true });
  
  // Root package with empty depGroups
  fs.writeFileSync(path.join(syncTestDir, 'package.json'), JSON.stringify({
    name: 'monorepo-root',
    depGroups: [],
    devDependencies: {
      typescript: '^5.0.0',
      eslint: '^8.0.0'
    }
  }));
  
  // Sub-package with empty depGroups
  fs.writeFileSync(path.join(syncTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: [],
    dependencies: {
      react: '^18.2.0'
    }
  }));
  
  syncFromPackages(syncTestDir);
  
  const depGroups = loadDepGroups(syncTestDir);
  
  // Root deps should be in 'root' group
  assert.ok(depGroups.groups.root, 'Should have root group');
  assert.strictEqual(depGroups.groups.root.devDependencies.typescript, '^5.0.0', 'Root deps in root group');
  assert.strictEqual(depGroups.groups.root.devDependencies.eslint, '^8.0.0', 'Root deps in root group');
  
  // Sub-package deps should be in 'standalone' group
  assert.ok(depGroups.groups.standalone, 'Should have standalone group');
  assert.strictEqual(depGroups.groups.standalone.dependencies.react, '^18.2.0', 'Sub-package deps in standalone group');
  
  console.log('✓ syncFromPackages (root vs standalone) works correctly');
}

function testAutoPopulateDepGroups() {
  console.log('Testing auto-populate depGroups...');
  
  const autoPopTestDir = path.join(TEST_DIR, 'auto-populate');
  fs.mkdirSync(path.join(autoPopTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create .dep-groups.yaml
  fs.writeFileSync(path.join(autoPopTestDir, '.dep-groups.yaml'), `groups:
  root:
    devDependencies:
      typescript: "^5.0.0"
  standalone:
    dependencies:
      react: "^18.2.0"
`);
  
  // Root with empty depGroups
  fs.writeFileSync(path.join(autoPopTestDir, 'package.json'), JSON.stringify({
    name: 'root',
    depGroups: []
  }));
  
  // Sub-package with empty depGroups
  fs.writeFileSync(path.join(autoPopTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: []
  }));
  
  generateDependencies(autoPopTestDir);
  
  // Check root was populated with ["root"]
  const rootPkg = JSON.parse(fs.readFileSync(path.join(autoPopTestDir, 'package.json'), 'utf-8'));
  assert.deepStrictEqual(rootPkg.depGroups, ['root'], 'Root should get ["root"]');
  assert.strictEqual(rootPkg.devDependencies.typescript, '^5.0.0', 'Root should have typescript');
  
  // Check sub-package was populated with ["standalone"]
  const app1Pkg = JSON.parse(fs.readFileSync(path.join(autoPopTestDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  assert.deepStrictEqual(app1Pkg.depGroups, ['standalone'], 'Sub-package should get ["standalone"]');
  assert.strictEqual(app1Pkg.dependencies.react, '^18.2.0', 'Sub-package should have react');
  
  console.log('✓ Auto-populate depGroups works correctly');
}

function testPreinstallScriptInjection() {
  console.log('Testing preinstall script injection...');
  
  const scriptTestDir = path.join(TEST_DIR, 'script-inject');
  fs.mkdirSync(path.join(scriptTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create .dep-groups.yaml
  fs.writeFileSync(path.join(scriptTestDir, '.dep-groups.yaml'), `groups:
  standalone:
    dependencies:
      react: "^18.2.0"
`);
  
  // Test 1: No scripts object
  fs.writeFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['standalone']
  }));
  
  generateDependencies(scriptTestDir);
  
  const pkg1 = JSON.parse(fs.readFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  assert.ok(pkg1.scripts, 'Should create scripts object');
  assert.strictEqual(pkg1.scripts.preinstall, 'dependency-grouper generate', 'Should inject preinstall');
  
  // Test 2: Existing preinstall (different command)
  fs.writeFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['standalone'],
    scripts: {
      preinstall: 'echo "hello"'
    }
  }));
  
  generateDependencies(scriptTestDir);
  
  const pkg2 = JSON.parse(fs.readFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  assert.strictEqual(pkg2.scripts.preinstall, 'echo "hello" && dependency-grouper generate', 'Should append to existing');
  
  // Test 3: Preinstall already has dependency-grouper
  fs.writeFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['standalone'],
    scripts: {
      preinstall: 'dependency-grouper generate'
    }
  }));
  
  generateDependencies(scriptTestDir);
  
  const pkg3 = JSON.parse(fs.readFileSync(path.join(scriptTestDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  assert.strictEqual(pkg3.scripts.preinstall, 'dependency-grouper generate', 'Should not duplicate');
  
  console.log('✓ Preinstall script injection works correctly');
}

function testMultipleGroups() {
  console.log('Testing multiple groups per package...');
  
  const multiGroupDir = path.join(TEST_DIR, 'multi-groups');
  fs.mkdirSync(path.join(multiGroupDir, 'packages', 'app1'), { recursive: true });
  
  fs.writeFileSync(path.join(multiGroupDir, '.dep-groups.yaml'), `groups:
  react:
    dependencies:
      react: "^18.2.0"
      react-dom: "^18.2.0"
  utils:
    dependencies:
      axios: "^1.0.0"
      lodash: "^4.17.21"
  testing:
    devDependencies:
      jest: "^29.0.0"
`);
  
  fs.writeFileSync(path.join(multiGroupDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['react', 'utils', 'testing']
  }));
  
  generateDependencies(multiGroupDir);
  
  const pkg = JSON.parse(fs.readFileSync(path.join(multiGroupDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  
  // Should have all dependencies from all 3 groups
  assert.strictEqual(pkg.dependencies.react, '^18.2.0', 'Should have react from react group');
  assert.strictEqual(pkg.dependencies['react-dom'], '^18.2.0', 'Should have react-dom from react group');
  assert.strictEqual(pkg.dependencies.axios, '^1.0.0', 'Should have axios from utils group');
  assert.strictEqual(pkg.dependencies.lodash, '^4.17.21', 'Should have lodash from utils group');
  assert.strictEqual(pkg.devDependencies.jest, '^29.0.0', 'Should have jest from testing group');
  
  console.log('✓ Multiple groups work correctly');
}

function testEmptyDepGroups() {
  console.log('Testing empty depGroups array...');
  
  const packageJson = {
    name: 'test',
    depGroups: [],
    dependencies: { axios: '^1.0.0' }
  };
  
  const depGroups = { groups: { standalone: { dependencies: { react: '^18.2.0' } } } };
  
  // Should not merge anything for empty depGroups
  const merged = mergeDepGroups(packageJson, depGroups);
  assert.deepStrictEqual(merged.dependencies, { axios: '^1.0.0' }, 'Should keep only original deps');
  
  console.log('✓ Empty depGroups handled correctly');
}

function testVersionUpdateSync() {
  console.log('Testing version update sync...');
  
  const versionTestDir = path.join(TEST_DIR, 'version-update');
  fs.mkdirSync(path.join(versionTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create .dep-groups.yaml with old version
  fs.writeFileSync(path.join(versionTestDir, '.dep-groups.yaml'), `groups:
  react:
    dependencies:
      react: "^18.2.0"
      react-dom: "^18.2.0"
`);
  
  // Create package with updated version
  fs.writeFileSync(path.join(versionTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['react'],
    dependencies: {
      react: '^18.3.0',  // Updated version
      'react-dom': '^18.2.0'  // Same version
    }
  }));
  
  syncFromPackages(versionTestDir);
  
  const depGroups = loadDepGroups(versionTestDir);
  
  // react should be updated to 18.3.0
  assert.strictEqual(depGroups.groups.react.dependencies.react, '^18.3.0', 'Should update react version');
  assert.strictEqual(depGroups.groups.react.dependencies['react-dom'], '^18.2.0', 'Should keep react-dom unchanged');
  
  console.log('✓ Version sync works correctly');
}

function testWorkspaceProtocolSkip() {
  console.log('Testing workspace protocol skip...');
  
  const workspaceTestDir = path.join(TEST_DIR, 'workspace-protocol');
  fs.mkdirSync(path.join(workspaceTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create package with workspace dependencies
  fs.writeFileSync(path.join(workspaceTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: [],
    dependencies: {
      '@myorg/shared': 'workspace:*',  // Should be skipped
      react: '^18.2.0'  // Should be synced
    },
    devDependencies: {
      '@myorg/utils': 'workspace:^',  // Should be skipped
      jest: '^29.0.0'  // Should be synced
    }
  }));
  
  syncFromPackages(workspaceTestDir);
  
  const depGroups = loadDepGroups(workspaceTestDir);
  
  // Only react and jest should be in standalone, not workspace deps
  assert.ok(depGroups.groups.standalone, 'Should have standalone group');
  assert.strictEqual(depGroups.groups.standalone.dependencies.react, '^18.2.0', 'Should sync react');
  assert.strictEqual(depGroups.groups.standalone.devDependencies.jest, '^29.0.0', 'Should sync jest');
  assert.strictEqual(depGroups.groups.standalone.dependencies['@myorg/shared'], undefined, 'Should skip workspace:*');
  assert.strictEqual(depGroups.groups.standalone.devDependencies['@myorg/utils'], undefined, 'Should skip workspace:^');
  
  console.log('✓ Workspace protocol skip works correctly');
}

function testVersionConflictWarning() {
  console.log('Testing version conflict warning...');
  
  const packageJson = {
    name: 'test',
    depGroups: ['react-18', 'react-17'],
    dependencies: {}
  };
  
  const depGroups = {
    groups: {
      'react-18': {
        dependencies: {
          react: '^18.0.0'
        }
      },
      'react-17': {
        dependencies: {
          react: '^17.0.0'  // Conflict!
        }
      }
    }
  };
  
  // Should warn and use last group's version (react-17)
  const merged = mergeDepGroups(packageJson, depGroups);
  assert.strictEqual(merged.dependencies.react, '^17.0.0', 'Should use last group version');
  
  console.log('✓ Version conflict warning works correctly');
}

function testStaticDependenciesPreserved() {
  console.log('Testing static dependencies preservation...');
  
  const staticTestDir = path.join(TEST_DIR, 'static-deps');
  fs.mkdirSync(path.join(staticTestDir, 'packages', 'app1'), { recursive: true });
  
  // Create .dep-groups.yaml with groups
  fs.writeFileSync(path.join(staticTestDir, '.dep-groups.yaml'), `groups:
  react:
    dependencies:
      react: "^18.2.0"
  utils:
    dependencies:
      lodash: "^4.17.21"
`);
  
  // Create package with static dependency + groups
  fs.writeFileSync(path.join(staticTestDir, 'packages', 'app1', 'package.json'), JSON.stringify({
    name: 'app1',
    depGroups: ['react', 'utils'],
    dependencies: {
      'my-custom-lib': '^1.0.0'  // Static dependency
    }
  }));
  
  generateDependencies(staticTestDir);
  
  const pkg = JSON.parse(fs.readFileSync(path.join(staticTestDir, 'packages', 'app1', 'package.json'), 'utf-8'));
  
  // Should have all: static + react + utils groups
  assert.strictEqual(pkg.dependencies['my-custom-lib'], '^1.0.0', 'Should preserve static dependency');
  assert.strictEqual(pkg.dependencies.react, '^18.2.0', 'Should add react from group');
  assert.strictEqual(pkg.dependencies.lodash, '^4.17.21', 'Should add lodash from group');
  
  console.log('✓ Static dependencies preserved correctly');
}

function runTests() {
  console.log('\n=== Running dependency-grouper tests ===\n');
  
  try {
    setup();
    
    // Core functionality tests
    testLoadDepGroups();
    testMergeDepGroups();
    testGenerateDependencies();
    testMissingGroup();
    testEmptyDepGroups();
    testMultipleGroups();
    
    // Workspace detection tests
    testFindWorkspaceRoot();
    testFindPackageJsonFiles();
    
    // Sync tests
    testSyncFromPackages_NewFile();
    testSyncFromPackages_ExistingFile();
    testSyncFromPackages_RootVsCommon();
    testVersionUpdateSync();
    testWorkspaceProtocolSkip();
    
    // Feature tests
    testAutoPopulateDepGroups();
    testPreinstallScriptInjection();
    testVersionConflictWarning();
    testStaticDependenciesPreserved();
    
    cleanup();
    
    console.log('\n✓ All 19 tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    cleanup();
    process.exit(1);
  }
}

runTests();
