# dependency-grouper

> Group and reuse dependency sets across monorepo projects

[![npm version](https://img.shields.io/npm/v/dependency-grouper.svg)](https://www.npmjs.com/package/dependency-grouper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Works with:**
- ✅ pnpm workspaces
- ✅ npm workspaces  
- ✅ yarn workspaces

## Problem

In a monorepo with multiple projects, you often have:
- Multiple React projects sharing the same React dependencies
- Multiple Vue projects sharing Vue dependencies  
- Shared tooling dependencies (webpack, vite, eslint, etc.)

Currently, you have to:
1. Copy-paste dependencies across package.json files
2. Manually keep versions in sync
3. Update multiple places when upgrading

## Solution

Define dependency groups once, reference them anywhere:

```yaml
# .dep-groups.yaml
groups:
  webpack:
    dependencies:
      webpack: ^5.95.0
      webpack-cli: ^5.1.4
      ts-loader: ^9.5.1
    devDependencies:
      '@types/webpack': ^5.28.0

  vue:
    dependencies:
      vue: ^3.5.17
      
  react:
    dependencies:
      react: ^18.2.0
      react-dom: ^18.2.0
    devDependencies:
      '@types/react': ^18.2.0
```

Then in your project's `package.json`:

```json
{
  "name": "my-vue-app",
  "depGroups": ["webpack", "vue"],
  "dependencies": {
    "axios": "^1.6.0"
  }
}
```

Run `dependency-grouper generate` and it merges the groups with automatic sorting:

```json
{
  "name": "my-vue-app",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.6.0",
    "ts-loader": "^9.5.1",
    "vue": "^3.5.17",
    "webpack": "^5.95.0",
    "webpack-cli": "^5.1.4"
  },
  "devDependencies": {
    "@types/webpack": "^5.28.0"
  },
  "depGroups": [
    "webpack",
    "vue"
  ]
}
```

## Usage

### 1. Install

```bash
# pnpm
pnpm add -D dependency-grouper

# npm
npm install -D dependency-grouper

# yarn
yarn add -D dependency-grouper
```

### 2. Create `.dep-groups.yaml` at workspace root

```yaml
groups:
  webpack:
    dependencies:
      webpack: ^5.95.0
      webpack-cli: ^5.1.4
  
  vue:
    dependencies:
      vue: ^3.5.17
```

### 3. Reference groups in package.json

```json
{
  "name": "my-project",
  "depGroups": ["webpack", "vue"],
  "dependencies": {
    "my-custom-dep": "^1.0.0"
  }
}
```

### 4. Generate dependencies

```bash
dependency-grouper generate
```

### 5. Install dependencies

```bash
# pnpm
pnpm install

# npm
npm install

# yarn
yarn install
```

## Automatic Generation (Optional)

### Option 1: Preinstall Hook (Full Generation)

To automatically generate dependencies before every install, add to your **workspace root** `package.json`:

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "preinstall": "dependency-grouper generate"
  }
}
```

### Option 2: Postinstall Hook (Sync Only)

To automatically sync new dependencies after install without regenerating all files:

```json
{
  "name": "my-monorepo",
  "private": true,
  "scripts": {
    "postinstall": "dependency-grouper sync"
  }
}
```

This captures any new dependencies added via `pnpm add` and updates .dep-groups.yaml, without modifying existing package.json files.

### Comparison

| Hook | Command | When | Updates .dep-groups.yaml | Updates package.json |
|------|---------|------|--------------------------|---------------------|
| preinstall | `generate` | Before install | ✅ | ✅ |
| postinstall | `sync` | After install | ✅ | ❌ |

**Benefits:**
- ✅ No manual `generate` command needed
- ✅ Dependencies always up-to-date before install
- ✅ Team members don't need to remember to run generate

**When to use:**
- ✓ Production/CI workflows - ensures consistency
- ✓ Team environments - automatic for everyone
- ✗ Active development - can be slower if you install frequently

**Note:** Make sure `dependency-grouper` is installed before the preinstall hook runs. Add it as a devDependency at the workspace root.

## Features

- ✅ **Multi-package manager** - Works with pnpm, npm, and yarn workspaces
- ✅ **Define once, use everywhere** - Create dependency groups in one place
- ✅ **Bidirectional sync** - Updates flow both ways automatically
- ✅ **Automatic sorting** - package.json keys and dependencies alphabetically sorted
- ✅ **Type-safe** - Full TypeScript support with type definitions
- ✅ **Smart merging** - Preserves project-specific dependencies
- ✅ **Version control** - Update versions in one place
- ✅ **CI/CD ready** - Optional preinstall hook for automation

## Configuration

### .dep-groups.yaml

```yaml
groups:
  groupName:
    dependencies:
      package-name: version
    devDependencies:
      dev-package: version
```

### package.json

```json
{
  "depGroups": ["groupName1", "groupName2"]
}
```

## How It Works

1. Detects workspace root (pnpm-workspace.yaml, npm/yarn workspaces, or .dep-groups.yaml)
2. Syncs new dependencies from package.json files to .dep-groups.yaml (bidirectional)
3. Finds all package.json files with `depGroups` field
4. Merges specified groups with existing dependencies
5. Sorts dependencies alphabetically within each section
6. Formats entire package.json with proper key ordering
7. Writes updated package.json files
8. Preserves project-specific dependencies

## Development

### Running Tests

```bash
npm test
```

### Testing in Example Monorepo

```bash
cd example
node ../dist/cli.js generate
pnpm install
```

The `example/` directory contains a working pnpm monorepo with:
- `react-app` - Uses react and webpack groups
- `vue-app` - Uses vue, vite, and testing groups

## CLI Commands

```bash
# Show help
dependency-grouper

# Generate dependencies from groups (sync + merge)
dependency-grouper generate

# Only sync package.json → .dep-groups.yaml (no merge back)
dependency-grouper sync
```

### When to Use Each Command

**`generate`** (Recommended for most cases)
- Full bidirectional sync
- Updates .dep-groups.yaml from package.json files
- Then updates all package.json files from .dep-groups.yaml
- Use in preinstall hooks or manually

**`sync`** (Lightweight)
- Only updates .dep-groups.yaml from package.json files
- Doesn't modify any package.json files
- Faster, useful for postinstall hooks to capture new dependencies
- Good for CI/CD to keep .dep-groups.yaml in sync

## Example Workflow

### Initial Setup

```bash
# 1. Install at workspace root
pnpm add -D dependency-grouper

# 2. Create .dep-groups.yaml
cat > .dep-groups.yaml << EOF
groups:
  react:
    dependencies:
      react: "^18.2.0"
      react-dom: "^18.2.0"
EOF

# 3. Add depGroups to a package
cat > packages/my-app/package.json << EOF
{
  "name": "my-app",
  "version": "1.0.0",
  "depGroups": ["react"]
}
EOF

# 4. Generate
dependency-grouper generate

# 5. Install
pnpm install
```

### Daily Development

```bash
# You manually add a package
cd packages/my-app
pnpm add axios

# Run generate - it syncs axios to your groups automatically
dependency-grouper generate

# Or if you have preinstall hook, just run:
pnpm install
# (generate runs automatically)
```

### Adding to Existing Groups

When you `pnpm add` a package to a project that has `depGroups`, the next time you run `generate`, it will:
1. Detect the new package in your package.json
2. Automatically add it to all groups listed in `depGroups`
3. Sync it across all packages using those groups

## License

MIT
