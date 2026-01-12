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

## Quick Start

### Option A: Bootstrap from Existing Monorepo (Recommended)

If you already have a monorepo with dependencies:

```bash
# 1. Install at workspace root
pnpm add -D dependency-grouper

# 2. Add "depGroups": [] to ALL package.json files
# ├── package.json          → "depGroups": []
# └── packages/
#     ├── app1/package.json → "depGroups": []
#     └── app2/package.json → "depGroups": []

# 3. Run generate (does everything automatically):
npx dependency-grouper generate
```

**What just happened:**
1. ✅ Created `.dep-groups.yaml` with all your dependencies organized
2. ✅ Root dependencies → `root` group, sub-packages → `standalone` group  
3. ✅ Auto-populated `depGroups: ["root"]` or `["standalone"]` in all files
4. ✅ Injected `preinstall` script for automatic sync

**Next steps:**
```bash
# 4. Review and reorganize the generated .dep-groups.yaml
code .dep-groups.yaml

# Example: Split 'standalone' into specific groups:
# groups:
#   standalone:
#     dependencies:
#       axios: ^1.6.0  → Move to 'shared-utils'
#   react:             ← New group
#     dependencies:
#       react: ^18.2.0
#       react-dom: ^18.2.0

# 5. Update package.json files to use new groups:
# packages/react-app/package.json:
# "depGroups": ["react", "shared-utils"]

# 6. Regenerate to apply changes:
npx dependency-grouper generate

# 7. Install and you're done!
pnpm install
```

### Option B: Fresh Setup (New Monorepo)

Starting from scratch:

#### 1. Install

```bash
pnpm add -D dependency-grouper  # or npm / yarn
```

#### 2. Create `.dep-groups.yaml` at workspace root

Define your dependency groups:

```yaml
groups:
  react:
    dependencies:
      react: ^18.2.0
      react-dom: ^18.2.0
    devDependencies:
      '@types/react': ^18.2.0
  
  shared-utils:
    dependencies:
      axios: ^1.6.0
      lodash: ^4.17.21
```

#### 3. Add `depGroups` to package.json files

```json
{
  "name": "my-react-app",
  "depGroups": ["react", "shared-utils"]
}
```

#### 4. Generate and install

```bash
npx dependency-grouper generate
pnpm install
```

---

## How It Works

1. **You define groups** in `.dep-groups.yaml` (shared dependency sets)
2. **You reference groups** in `package.json` with `"depGroups": ["group1", "group2"]`
3. **Run `generate`** → Merges group dependencies into each package.json
4. **Run package manager** → Installs the merged dependencies

**Bidirectional sync:**
- `.dep-groups.yaml` → `package.json` (group deps added to packages)
- `package.json` → `.dep-groups.yaml` (new deps captured in groups)

---

## CLI Commands

### `dependency-grouper generate`

**Full bidirectional sync** - Use this most of the time.

1. Scans all package.json files  
2. Updates `.dep-groups.yaml` with new dependencies
3. Merges group dependencies back into package.json files
4. Auto-populates empty `depGroups: []` arrays
5. Injects preinstall scripts

**When to use:**
- Initial setup
- After reorganizing groups
- In preinstall hooks

### `dependency-grouper sync`

**One-way sync only** - package.json → `.dep-groups.yaml`

Captures new dependencies without modifying package.json files. Faster, good for postinstall hooks.

**When to use:**
- Postinstall hooks to capture new deps
- CI/CD to keep `.dep-groups.yaml` updated

---

## Automation (Optional)

Add hooks to your **workspace root** `package.json` for automatic syncing:

### Preinstall Hook (Recommended)

Runs `generate` before every `pnpm install`:

```json
{
  "scripts": {
    "preinstall": "dependency-grouper generate"
  }
}
```

✅ Always in sync  
✅ Team members don't need to remember  
❌ Slower if you install frequently

### Postinstall Hook (Lightweight Alternative)

Runs `sync` after install to capture new deps:

```json
{
  "scripts": {
    "postinstall": "dependency-grouper sync"
  }
}
```

✅ Faster  
✅ Captures new deps automatically  
⚠️ Need to run `generate` manually to share with other packages

---

---

## Advanced Usage

### Multiple Groups per Package

```json
{
  "name": "my-app",
  "depGroups": ["react", "shared-utils", "testing"]
}
```

All groups are merged together into the package.

### Root vs Sub-Packages

When bootstrapping with empty `depGroups: []`:
- **Root** package.json → Auto-assigned `["root"]` group
- **Sub-packages** → Auto-assigned `["standalone"]` group

This separates monorepo tooling (root) from app dependencies (standalone).

### Smart Sync Behavior

When you run `sync`, only **new** dependencies are added:

```json
// package.json with multiple groups
{
  "depGroups": ["react", "webpack"],
  "dependencies": {
    "react": "^18.2.0",        // Already in "react" group → skipped
    "webpack": "^5.0.0",        // Already in "webpack" group → skipped
    "my-custom-lib": "^1.0.0"  // NEW → added to "standalone" only
  }
}
```

✅ Prevents polluting shared groups with package-specific dependencies  
✅ Only unmanaged dependencies go to "standalone" group

### Nested Monorepos

Recursively finds ALL package.json files:
```
monorepo/
├── packages/app1/package.json          ← Found
├── packages/nested/deep/app2/package.json ← Found
└── apps/frontend/utils/package.json    ← Found
```

Skips `node_modules/` and `.git/` automatically.

---

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

---

## Example Workflows

### Sharing a New Dependency

```bash
# 1. Add to one package
cd packages/app1
pnpm add axios

# 2. If you have postinstall hook, it's already in .dep-groups.yaml!
# Otherwise, run manually:
npx dependency-grouper sync

# 3. Share with other packages:
npx dependency-grouper generate
```

### Reorganizing Groups

```bash
# 1. Edit .dep-groups.yaml - split 'standalone' into specific groups
code .dep-groups.yaml

# 2. Update package.json files with new group names
# "depGroups": ["react", "api-utils"]  # was ["standalone"]

# 3. Regenerate
npx dependency-grouper generate
```

### Updating a Dependency Version

```bash
# Just update the version in .dep-groups.yaml:
# react: ^18.2.0  →  react: ^18.3.0

npx dependency-grouper generate
pnpm install
# All packages using the 'react' group get v18.3.0!
```

---

## License

MIT

## Troubleshooting

**Q: `.dep-groups.yaml` wasn't created**  
A: Add `"depGroups": []` to at least one package.json, then run `generate`.

**Q: Dependencies not merging**  
A: Check that:
- `depGroups` field exists in package.json
- Group names match exactly (case-sensitive)  
- You ran `generate` (not just `sync`)

**Q: How to use AI to organize dependencies?**  
A:
1. Run `npx dependency-grouper generate` → creates `.dep-groups.yaml`
2. Give `.dep-groups.yaml` to AI: *"Reorganize into logical groups (react, testing, build-tools, etc.)"*
3. AI rewrites with better organization
4. Update `depGroups` in package.json files to use new group names
5. Run `npx dependency-grouper generate` to apply
