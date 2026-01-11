#!/usr/bin/env node

import { generateDependencies } from './index';
import process from 'process';

const command = process.argv[2];

if (command === 'generate') {
  try {
    generateDependencies();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
} else if (command === 'sync') {
  try {
    const workspaceRoot = require('./index').findWorkspaceRoot();
    if (!workspaceRoot) {
      console.error('Could not find workspace root');
      process.exit(1);
    }
    console.log(`Found workspace root: ${workspaceRoot}\n`);
    require('./index').syncFromPackages(workspaceRoot);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
} else {
  console.log(`
dependency-grouper - Group and reuse dependency sets

Usage:
  dependency-grouper generate    Generate dependencies from groups
  dependency-grouper sync        Sync package.json dependencies to .dep-groups.yaml

Example:
  1. Create .dep-groups.yaml at workspace root
  2. Add "depGroups": ["groupName"] to package.json
  3. Run: dependency-grouper generate

Supports: pnpm, npm, and yarn workspaces
  `);
  process.exit(command ? 1 : 0);
}
