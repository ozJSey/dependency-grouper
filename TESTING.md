# Testing pnpm-dep-grouper in the Example Monorepo

## Step 1: Generate Dependencies

Run the generator to populate dependencies from groups:

```bash
cd example
node ../dist/cli.js generate
```

This will read `dep-groups.yaml` and merge the dependencies into packages.

## Step 2: Install Dependencies

Run pnpm install to actually install the packages:

```bash
pnpm install
```

## Step 3: Verify

Check that dependencies were installed:

```bash
ls -la node_modules/
ls -la packages/vue-app/node_modules/
ls -la packages/react-app/node_modules/
```

## What Should Happen

Before running generate:
- `vue-app/package.json` has empty dependencies/devDependencies
- Only `depGroups` field is populated

After running generate:
- `vue-app/package.json` should have vue, vite, and testing dependencies merged
- `react-app/package.json` should have react and webpack dependencies merged
- All dependencies are alphabetically sorted

After running `pnpm install`:
- Shared dependencies go to `example/node_modules/`
- Package-specific deps may go to `packages/*/node_modules/`
- pnpm creates symlinks for efficient space usage

## Quick Test

```bash
# From the project root
cd example

# Step 1: Generate dependencies
node ../dist/cli.js generate

# Step 2: Install
pnpm install

# Step 3: Verify vue is installed
ls node_modules/ | grep vue

# Step 4: Check package.json was updated
cat packages/vue-app/package.json
```
