# Architecture

A CLI that rewrites `package.json` files on disk from a single `.dep-groups.yaml`. No runtime, no
framework, no browser — the whole surface is five exported functions and two commands.

```
src/
├── cli.ts     argv → generate | sync | help. Catches, prints, sets the exit code.
├── index.ts   the entire library (458 lines)
└── types.ts   DepGroups, PackageJson, DependencySet
dist/
├── cli.min.js    bin: dependency-grouper, dep-grouper
└── index.min.js  main — `yaml` and `sort-package-json` stay external
```

## The five functions, and the order they run in

```
generateDependencies(rootDir?)
├── findWorkspaceRoot()        ── only when rootDir is omitted
├── syncFromPackages(root)     ── STEP 1  package.json  →  .dep-groups.yaml
│   └── findPackageJsonFiles()
├── loadDepGroups(root)        ── re-read, because step 1 just rewrote it
└── for each package.json:
    └── mergeDepGroups()       ── STEP 2  .dep-groups.yaml  →  package.json
```

`mergeDepGroups` is the only pure function; everything else touches the filesystem. It is exported
separately for exactly that reason — it is the piece you can reason about, and the piece the
characterisation suite leans on hardest.

## The invariant: sync runs before merge, and that decides who owns a version

This one ordering explains nearly every behaviour that surprises people:

> **`.dep-groups.yaml` owns *membership*. `package.json` owns *versions*.**

Step 1 lifts each member's declared versions *up* into its groups before step 2 pushes the groups
back *down*. So a version you type into `.dep-groups.yaml` is overwritten by the members before it
is ever applied, while a dependency that appears only in the group file — one no member declares
yet — flows down untouched. Adding a dependency to a group works. Changing one does not.

Anything that changes this ordering changes what the tool means. Do not reorder the two steps to
fix a symptom.

## Pinned surprises

`test/characterisation.test.ts` marks these `SURPRISING` and pins them. They are recorded, not
endorsed. **A failing characterisation test means the test is wrong until proven otherwise** — the
package shipped fifteen versions before it had an automated suite, and the field is better
evidence than an assertion written afterwards.

| Behaviour | Where | Consequence |
|---|---|---|
| Bootstrap shares one flat `standalone` bucket between every non-root package | `syncFromPackages` + the auto-populate in `generateDependencies` | The README's former "Recommended" path (`"depGroups": []` everywhere, then `generate`) gives every sub-package the **union** of all sub-packages' dependencies. Because merge is additive it is **not reversible by the tool** — reorganising the groups afterwards leaves the strays in the manifests and re-captures them into `standalone`. Draft with `sync` and assign real groups before the first `generate`. |
| `.dep-groups.yaml` alone marks a root — no workspace needed | `findWorkspaceRoot`, checked *first* | A flat set of sibling folders can be grouped. Undocumented; the README and CLI help both say "workspaces". |
| Editing a version in the config is reverted | the invariant above | The README's "Updating a Dependency Version" recipe does not work. |
| Member-vs-member version conflicts resolve by directory walk order | `syncFromPackages` | Only the alphabetically last member can raise a shared version; a bump anywhere else is silently undone next run. `mergeDepGroups` warns on group-vs-group conflicts — this path does not. |
| A `preinstall` hook is injected into every managed package — the workspace root included — with no opt-out | `generateDependencies` | npm runs a dependency's `preinstall` on the consumer's machine, so a **published** package managed by this tool ships that hook to every installer. Since 0.3.6 the injected command is guarded (`… \|\| exit 0`) so it can no longer *fail* an install; through 0.3.5 it was bare and exited 127 off a fresh clone. The only opt-out is still that an existing `preinstall` mentioning `dependency-grouper` is left alone. |
| The walk has no ignore list and no nested-root awareness | `findPackageJsonFiles` | Vendored examples, fixtures and archived packages inside the tree are managed too. The skip test is `dir.includes('node_modules')`, a substring — a directory named `my-node_modules-notes` also disappears. |
| Rewriting the config discards hand-written comments | `syncFromPackages` writer | It re-emits from the parsed object rather than editing. Annotations survive only until the next version drift. |
| Removing an entry from a group does not remove it from members | merge is additive | It reappears in the auto-managed `standalone` bucket instead. |
| Two members disagreeing about an *unmanaged* dependency: the loser is dropped | `standalone` is one flat bucket | No warning, no record. |
| An empty `.dep-groups.yaml` throws `TypeError: Cannot read properties of null` | `yaml.parse('')` is `null`, unguarded | The message does not name the file. |
| `peerDependencies` and `optionalDependencies` are invisible | `DependencySet` has two fields | Groups can only carry `dependencies` and `devDependencies`. |

## Known gap against `instructions/CONVENTIONS.md`

The repo rule is `src/` split into single-purpose modules behind a thin re-export entry, because
most people copy the source rather than install it. **This package does not comply**: `index.ts`
is one 458-line file holding root discovery, the directory walk, the YAML reader, the YAML
*writer* (hand-rolled string building, not `yaml.stringify`), the merge, and the orchestrator.

The natural split, when it is done, is along the invariant above:

```
src/
├── index.ts        re-export entry
├── root.ts         findWorkspaceRoot
├── discover.ts     findPackageJsonFiles
├── config-read.ts  loadDepGroups
├── config-write.ts the YAML emitter (comments, group ordering, quoting)
├── sync.ts         syncFromPackages           — step 1
├── merge.ts        mergeDepGroups (pure)      — step 2
├── generate.ts     generateDependencies       — the orchestrator, and the preinstall injection
└── types.ts
```

It is deliberately **not** done in the same change as the characterisation suite: the suite is what
makes that refactor safe, and it has to be trusted first. See the report attached to `DG-1`.

## Testing

- `npm test` — `vitest run`, 45 characterisation tests against `src/`, never `dist/`. Each creates
  its own `mkdtemp` root and deletes it afterwards. One of them shells out to `/bin/sh` to check
  the injected `preinstall` really has the exit status it claims, rather than asserting on the
  string alone.
- `npm run test:legacy` — the original hand-rolled runner (`test/test.js`, 19 assertions). It
  builds first and tests `dist/index.min.js`, so it also serves as the build smoke test. Its
  fixtures land in `test/fixtures/` and are gitignored.

Both are kept. They cover the same code from opposite sides: one from source, one from the
published artifact.
