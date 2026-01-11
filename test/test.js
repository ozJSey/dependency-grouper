#!/usr/bin/env node

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { generateDependencies, mergeDepGroups, loadDepGroups } = require('../dist/index.js');

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

function runTests() {
  console.log('\n=== Running pnpm-dep-grouper tests ===\n');
  
  try {
    setup();
    
    testLoadDepGroups();
    testMergeDepGroups();
    testGenerateDependencies();
    testMissingGroup();
    
    cleanup();
    
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error(error.stack);
    cleanup();
    process.exit(1);
  }
}

runTests();
