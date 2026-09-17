# @ozjsey/dependency-grouper

> **[Live demo and documentation](https://ozjsey.github.io/npm-portfolio-playground/)**

> Group and reuse dependency sets across monorepo projects

[![npm version](https://img.shields.io/npm/v/@ozjsey/dependency-grouper.svg)](https://www.npmjs.com/package/@ozjsey/dependency-grouper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Works with:**
- ✅ pnpm workspaces
- ✅ npm workspaces  
- ✅ yarn workspaces
- ✅ **no workspace at all** — a `.dep-groups.yaml` is itself a valid root, so a flat set of sibling
  folders that each carry their own `node_modules` can be grouped too. See the case study below.

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

### Option A: Bootstrap from an existing monorepo

> ### ⛔ Do not run `generate` on a tree whose packages have different dependencies
>
> `"depGroups": []` everywhere plus `generate` was this README's "Recommended" path for thirteen
> releases. **It cross-contaminates every package**, and it does not undo.
>
> Bootstrap pours *every* non-root package's dependencies into one flat `standalone` group, then
> hands that whole group back to *every* non-root package. A React app and a Vue app in the same
> tree each come out depending on both React and Vue, and the next install pulls both into both:
>
> ```console
> $ npx dependency-grouper generate         # react-app declared only react; vue-app only vue
> $ cat packages/react-app/package.json
> { "dependencies": { "react": "^18.2.0", "react-dom": "^18.2.0", "vue": "^3.5.17" }, … }
> $ cat packages/vue-app/package.json
> { "dependencies": { "react": "^18.2.0", "react-dom": "^18.2.0", "vue": "^3.5.17" }, … }
> ```
>
> And **the reorganise-then-regenerate recovery this README used to print does not remove them.**
> Merge is additive: splitting `standalone` into `react` and `vue` groups and repointing
> `depGroups` leaves `vue` sitting in `react-app` and re-captures it into `standalone` on the next
> run. The only way back is to edit each member's `dependencies` by hand.
>
> Pinned by `test/characterisation.test.ts` → *the bootstrap the README calls "Recommended"*.
>
> Bootstrap is still fine when you know the tree already shares one dependency set, or on a
> throwaway branch you can `git checkout --` afterwards.

**Use `sync` instead.** It writes the same draft config and never touches a `package.json`:

```bash
# 1. Install at workspace root
pnpm add -D dependency-grouper

# 2. Draft .dep-groups.yaml from what your packages already declare.
#    This command only ever writes .dep-groups.yaml — no manifest is modified.
npx dependency-grouper sync

# 3. Edit the draft into real groups, and DELETE the `standalone` bucket it drafted:
code .dep-groups.yaml
# groups:
#   root:
#     devDependencies: { typescript: ^5.3.3 }
#   react:                          ← was in `standalone`
#     dependencies: { react: ^18.2.0, react-dom: ^18.2.0 }
#   vue:                            ← was in `standalone`
#     dependencies: { vue: ^3.5.17 }

# 4. Name the real groups in each package.json — never `[]`, never `standalone`:
# packages/react-app/package.json → "depGroups": ["react"]
# packages/vue-app/package.json   → "depGroups": ["vue"]

# 5. Now generate. Each package gets its own groups and nothing else.
npx dependency-grouper generate
pnpm install
```

**What `generate` did:**
1. ✅ Merged each package's named groups into its `dependencies` / `devDependencies`, sorted
2. ✅ Lifted any version a member had drifted on back up into the group
3. ✅ Captured anything no named group covers into `standalone`  — an entry there means a
   dependency was added without being classified
4. ✅ Injected a guarded `preinstall` (`dependency-grouper generate || exit 0`) — see
   [Automation](#automation-optional)

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

## Case study: the repo this package lives in

This package sits in a portfolio of twelve sibling folders, each an independent npm package with
its own `package.json` and its own `node_modules`. There is **no root `package.json`, no
`pnpm-workspace.yaml`, and no workspace of any kind** — the repo's own `CLAUDE.md` opens by saying
so. On paper that is the one layout this tool does not serve.

It serves it fine. `findWorkspaceRoot` checks for `.dep-groups.yaml` *before* it checks for any
workspace marker, so the config file is a root in its own right. Dropping one into
`playground/` was the entire setup; nothing about the repo's structure had to change.

The playground — the live demo app for every package in the portfolio, 31 dependencies — is
managed by this tool. Four groups, named after what they are for:

```yaml
# playground/.dep-groups.yaml
groups:
  portfolio-packages:      # the published packages the demo cards import
    dependencies:
      "@ozjsey/v-copy": "^1.1.0"
      "@ozjsey/v-dropzone": "^0.1.0"
      # …nine more

  vue-runtime:
    dependencies:
      vue: "^3.5.13"

  vue-app-tooling:         # build + typecheck
    devDependencies:
      "@types/node": "^26.2.0"
      "@vitejs/plugin-vue": "^5.2.1"
      typescript: "^5.7.0"
      vite: "^6.0.0"
      vue-tsc: "^2.2.0"

  live-editor:             # CodeMirror + the in-browser SFC transpiler
    devDependencies:
      "@codemirror/autocomplete": "^6.20.0"
      # …thirteen more
```

`package.json` names them, and `generate` writes the rest:

```diff
   "scripts": {
+    "deps": "dependency-grouper generate",
     "dev": "vite",
+    "preinstall": "dependency-grouper generate || exit 0",
     …
   },
   "devDependencies": {
-    "@codemirror/commands": "^6.10.0",
     "@codemirror/autocomplete": "^6.20.0",
+    "@codemirror/commands": "^6.10.0",
     "@codemirror/lang-vue": "^0.1.3",
-    "@codemirror/lint": "^6.8.0",
     "@codemirror/language": "^6.12.0",
+    "@codemirror/lint": "^6.8.0",
     …
-  }
+  },
+  "depGroups": [
+    "portfolio-packages",
+    "vue-runtime",
+    "vue-app-tooling",
+    "live-editor"
+  ]
 }
```

Three things that are worth taking from this rather than from the synthetic `example/` directory:

1. **Every dependency belongs to exactly one group, so the auto-managed `standalone` bucket stays
   empty.** That turns `standalone` into a useful signal: an entry showing up there means a
   dependency was added without being classified.
2. **`generate` is idempotent.** After the first run, a second changes nothing — which is what makes
   it safe to put on `preinstall`.
3. **The `preinstall` it injects is guarded**: `dependency-grouper generate || exit 0`. Here it
   was seeded by hand, because the tool wrote the unguarded form until 0.3.6; it now writes this
   exact string itself. See the warning under [Automation](#automation-optional) for why.

---

## Behaviour worth knowing before you adopt it

Pinned by `test/characterisation.test.ts` and tabulated in
[`ARCHITECTURE.md`](./ARCHITECTURE.md#pinned-surprises). Read at least the first two.

### Bootstrap shares one `standalone` bucket between every package, permanently

`"depGroups": []` everywhere plus `generate` gives every sub-package the union of all of them, and
merge is additive so reorganising afterwards never takes anything back out. Draft with `sync` and
assign real groups before the first `generate` — full detail and the recovery under
[Option A](#option-a-bootstrap-from-an-existing-monorepo).

### `.dep-groups.yaml` owns membership. `package.json` owns versions.

`generate` runs sync (`package.json` → config) **before** merge (config → `package.json`). So:

- Adding a dependency to a group **works** — no member declares it yet, so it flows down to all of
  them.
- Changing a version in a group **does not**. Sync overwrites your edit from the members before
  merge ever reads it.
- When two members disagree about a shared dependency, **the last one in directory-walk order
  wins**, silently. Only that member can raise a shared version; a bump anywhere else is undone by
  the next `generate`.

To move a shared version, change it in every member — or in the last one, and let the next
`generate` pull the rest along.

### ⚠️ Do not put a published package in a group without reading this

`generate` injects a `preinstall` into **every** package it manages, the workspace root included,
and there is no flag to turn that off. npm runs a dependency's `preinstall` **on the consumer's
machine**, so a published library managed this way asks everyone who installs it to run
`dependency-grouper generate`.

Since **0.3.6** the injected command is guarded, so it no longer *fails* anyone's install:

```json
"preinstall": "dependency-grouper generate || exit 0"
```

Through 0.3.5 it was the bare `dependency-grouper generate`, which exits `127` when the CLI is not
on PATH and takes the install down with it — including the first `install` after a fresh clone of
your own repo, because `preinstall` runs *before* dependencies are installed. If a manifest of
yours still carries the unguarded form, `generate` will not rewrite it (any `preinstall` mentioning
`dependency-grouper` is left alone); add the `|| exit 0` yourself.

The guard makes the hook harmless, not absent. **A published package should not be managed by this
tool at all** unless you are willing to ship a `preinstall` to every consumer.

### Everything else

- **No ignore list, and the walk does not stop at a nested project root.** Vendored examples,
  fixtures and archived packages inside the tree get managed too. The skip test is
  `dir.includes('node_modules')` — a substring, so a directory named `my-node_modules-notes`
  vanishes from the walk as well.
- **Comments in `.dep-groups.yaml` are not durable.** The file is re-emitted from the parsed object
  whenever anything changes, so annotations survive only until the next version drift.
- **Removing an entry from a group does not remove it from members.** Merge is additive; the
  dependency reappears in `standalone` instead.
- **An empty `.dep-groups.yaml`** fails with `Cannot read properties of null (reading 'groups')`,
  which does not name the file. Use `groups: {}`.
- **`peerDependencies` and `optionalDependencies` cannot be grouped.**

---

## CLI Commands

### `dependency-grouper generate`

**Full bidirectional sync** - Use this most of the time.

1. Scans all package.json files  
2. Updates `.dep-groups.yaml` with new dependencies
3. Merges group dependencies back into package.json files
4. Auto-populates empty `depGroups: []` arrays — `["root"]` at the root, `["standalone"]` below
   it, which is the cross-contaminating path described under
   [Option A](#option-a-bootstrap-from-an-existing-monorepo)
5. Injects a guarded `preinstall` into every package it touches

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

Add hooks to your **workspace root** `package.json` for automatic syncing.

> **This one is not really optional — `generate` installs it for you.** Every package it manages
> gets a `preinstall`, appended to an existing one unless that one already mentions
> `dependency-grouper`. There is no opt-out flag. The form below is exactly what it writes, so a
> manifest you seed by hand and one `generate` writes are byte-identical.

### Preinstall Hook (Recommended)

Runs `generate` before every `pnpm install`:

```json
{
  "scripts": {
    "preinstall": "dependency-grouper generate || exit 0"
  }
}
```

✅ Always in sync  
✅ Team members don't need to remember  
✅ `|| exit 0` keeps a **fresh clone** installable — `preinstall` runs before dependencies do, so
the CLI is not there yet, and the unguarded form fails the install with `code 127`  
✅ Appending to a `preinstall` you already have parenthesises the guard —
`your-check && (dependency-grouper generate || exit 0)` — so a failure of *your* command still
fails the install. Without the parentheses `&&`/`||` associate left and `|| exit 0` would swallow
it  
❌ Slower if you install frequently  
⚠️ **Never ship this on a published package.** npm runs a dependency's `preinstall` on the
consumer's machine. See [Behaviour worth knowing](#behaviour-worth-knowing-before-you-adopt-it).

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

⚠️ **This holds only once every package names real groups.** While a package is on
`["standalone"]` — which is what bootstrap assigns — "unmanaged" means *unmanaged by anyone*, and
the one flat `standalone` bucket is shared by every such package. That is the cross-contamination
described under [Option A](#option-a-bootstrap-from-an-existing-monorepo).

### Nested Monorepos

Recursively finds ALL package.json files:
```text
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
npm test              # vitest — 41 characterisation tests, run against src/
npm run test:legacy   # builds, then the original hand-rolled runner against dist/
```

`test/characterisation.test.ts` pins current behaviour, not intended behaviour. **A failing test
there means the test is wrong until proven otherwise** — see the note at the top of the file.

### Testing in Example Monorepo

```bash
npm run build
cd example
node ../dist/cli.min.js generate
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

### Adding a Dependency to Every Package in a Group

```bash
# Add it to the group in .dep-groups.yaml:
# react:
#   dependencies:
#     react: ^18.2.0
#     react-dom: ^18.2.0   ← new

npx dependency-grouper generate
pnpm install
# Every package using the 'react' group now has react-dom.
```

### Updating a Dependency Version

> **Not by editing `.dep-groups.yaml`.** `generate` syncs `package.json` → config before it merges
> config → `package.json`, so an edit to a version already present in a member is overwritten
> before it is applied. Earlier versions of this README claimed otherwise; it has never worked
> that way. See [Behaviour worth knowing](#behaviour-worth-knowing-before-you-adopt-it).

```bash
# Change the version in the member package.json files:
#   packages/*/package.json:  "react": "^18.2.0"  →  "^18.3.0"
#
# Changing it in the LAST package in directory order is enough — sync lifts that
# value into the group, and merge pushes it down to every other member:
npx dependency-grouper generate
pnpm install
```

---

## License

MIT

## Troubleshooting

**Q: `.dep-groups.yaml` wasn't created**  
A: Run `dependency-grouper sync`. It drafts the file from what your packages already declare and
writes no `package.json`. (Adding `"depGroups": []` everywhere and running `generate` also creates
it — and cross-contaminates every package; see
[Option A](#option-a-bootstrap-from-an-existing-monorepo).)

**Q: Dependencies not merging**  
A: Check that:
- `depGroups` field exists in package.json
- Group names match exactly (case-sensitive)  
- You ran `generate` (not just `sync`)

**Q: How to use AI to organize dependencies?**  
A:
1. Run `npx dependency-grouper sync` → drafts `.dep-groups.yaml`, touches no `package.json`
2. Give `.dep-groups.yaml` to AI: *"Reorganize into logical groups (react, testing, build-tools, etc.)"*
3. AI rewrites with better organization; delete the drafted `standalone` bucket
4. Set `depGroups` in each package.json to the new group names
5. Run `npx dependency-grouper generate` to apply

Do **not** run `generate` before step 4 — until each package names its own groups it is on
`standalone`, and every package shares that one bucket.
