/**
 * Characterisation tests for @ozjsey/dependency-grouper.
 *
 * These pin what the tool *does today*, not what it arguably should do. The
 * package shipped fifteen versions before it had an automated suite, so the
 * field is better evidence than any assertion written after the fact: **a
 * failing test here means the test is wrong until proven otherwise.** Do not
 * change `src/` to make one of these go green.
 *
 * Behaviours marked SURPRISING are pinned deliberately — they are the ones a
 * reader would not predict from the README, and the ones a future refactor is
 * most likely to break by accident. Each names the consequence so that if the
 * behaviour is ever *intentionally* changed, the test failure explains what is
 * being given up. See ARCHITECTURE.md → "Pinned surprises".
 *
 * Tests import `src/`, never `dist/` — `CLAUDE.md` records three separate runs
 * lost to a stale `dist/`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  findPackageJsonFiles,
  findWorkspaceRoot,
  generateDependencies,
  loadDepGroups,
  mergeDepGroups,
  syncFromPackages,
} from '../src/index'

let root: string

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dep-grouper-')))
  // The tool narrates every step; the suite is only interested in the files.
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(root, { recursive: true, force: true })
})

/** Write a package.json at `<root>/<dir>` (`dir: '.'` for the root package). */
function pkg(dir: string, contents: Record<string, unknown>): string {
  const target = path.join(root, dir)
  fs.mkdirSync(target, { recursive: true })
  const file = path.join(target, 'package.json')
  fs.writeFileSync(file, JSON.stringify(contents, null, 2) + '\n')
  return file
}

function readPkg(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, dir, 'package.json'), 'utf-8'))
}

function writeGroups(yamlText: string, at: string = root): void {
  fs.mkdirSync(at, { recursive: true })
  fs.writeFileSync(path.join(at, '.dep-groups.yaml'), yamlText)
}

function readGroupsText(): string {
  return fs.readFileSync(path.join(root, '.dep-groups.yaml'), 'utf-8')
}

// ---------------------------------------------------------------------------
// findWorkspaceRoot — what counts as a "workspace"
// ---------------------------------------------------------------------------

describe('findWorkspaceRoot', () => {
  it('accepts a bare .dep-groups.yaml as a root, with no workspace of any kind', () => {
    // The headline capability, and undocumented: the README says "create
    // .dep-groups.yaml at workspace root" and the CLI help says "Supports:
    // pnpm, npm, and yarn workspaces", but the config file alone is enough.
    // A flat set of sibling folders with no root package.json and no
    // pnpm-workspace.yaml can be grouped.
    writeGroups('groups: {}\n')
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true })

    expect(findWorkspaceRoot(path.join(root, 'a', 'b'))).toBe(root)
  })

  it('recognises a pnpm workspace', () => {
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    fs.mkdirSync(path.join(root, 'packages', 'app'), { recursive: true })

    expect(findWorkspaceRoot(path.join(root, 'packages', 'app'))).toBe(root)
  })

  it('recognises npm/yarn workspaces declared in package.json', () => {
    pkg('.', { name: 'ws-root', workspaces: ['packages/*'] })
    fs.mkdirSync(path.join(root, 'packages', 'app'), { recursive: true })

    expect(findWorkspaceRoot(path.join(root, 'packages', 'app'))).toBe(root)
  })

  it('prefers the nearest marker, so a nested .dep-groups.yaml shadows the outer workspace', () => {
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n")
    const nested = path.join(root, 'packages', 'app')
    writeGroups('groups: {}\n', nested)

    expect(findWorkspaceRoot(nested)).toBe(nested)
  })

  it('ignores an unparseable package.json and keeps walking up', () => {
    fs.writeFileSync(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\n')
    const child = path.join(root, 'child')
    fs.mkdirSync(child)
    fs.writeFileSync(path.join(child, 'package.json'), '{ not json')

    expect(findWorkspaceRoot(child)).toBe(root)
  })

  it('returns null when nothing above the start directory is a root', () => {
    fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true })

    expect(findWorkspaceRoot(path.join(root, 'a', 'b'))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// loadDepGroups
// ---------------------------------------------------------------------------

describe('loadDepGroups', () => {
  it('throws a path-carrying error when the config is absent', () => {
    expect(() => loadDepGroups(root)).toThrow(/\.dep-groups\.yaml not found at/)
  })

  it('parses groups off disk', () => {
    writeGroups('groups:\n  a:\n    dependencies:\n      left-pad: "^1.0.0"\n')

    expect(loadDepGroups(root)).toEqual({ groups: { a: { dependencies: { 'left-pad': '^1.0.0' } } } })
  })

  it('SURPRISING: an empty config file parses to null and every caller then throws', () => {
    // `yaml.parse('')` is null, and nothing guards the `.groups` access. The
    // CLI turns this into "Error: Cannot read properties of null (reading
    // 'groups')", which does not tell the user their file is empty. Pinned so
    // that adding a guard is a deliberate, visible change.
    writeGroups('')
    pkg('packages/app', { name: 'app', dependencies: { react: '^18.2.0' } })

    expect(loadDepGroups(root)).toBeNull()
    expect(() => syncFromPackages(root)).toThrow(TypeError)
  })
})

// ---------------------------------------------------------------------------
// findPackageJsonFiles — the walk, and what it refuses to skip
// ---------------------------------------------------------------------------

describe('findPackageJsonFiles', () => {
  it('finds package.json at any depth', () => {
    pkg('.', { name: 'root-pkg' })
    pkg('packages/app', { name: 'app' })
    pkg('packages/nested/deep/lib', { name: 'lib' })

    expect(findPackageJsonFiles(root).map((p) => path.relative(root, p)).sort()).toEqual([
      'package.json',
      path.join('packages', 'app', 'package.json'),
      path.join('packages', 'nested', 'deep', 'lib', 'package.json'),
    ])
  })

  it('skips node_modules and .git', () => {
    pkg('.', { name: 'root-pkg' })
    pkg('node_modules/left-pad', { name: 'left-pad' })
    pkg('.git/weird', { name: 'weird' })

    expect(findPackageJsonFiles(root).map((p) => path.relative(root, p))).toEqual(['package.json'])
  })

  it('SURPRISING: any path segment containing "node_modules" or ".git" is skipped, substring-wise', () => {
    // The guard is `dir.includes('node_modules')`, not a path-segment
    // comparison, so a legitimately named directory disappears from the walk.
    pkg('my-node_modules-notes/app', { name: 'app' })
    pkg('docs/.github-templates/app', { name: 'ghost' })

    expect(findPackageJsonFiles(root)).toEqual([])
  })

  it('SURPRISING: descends into a nested workspace instead of stopping at its root', () => {
    // There is no ignore list and no nested-root awareness. Point the tool at
    // a directory that contains an unrelated project with its own
    // .dep-groups.yaml — a vendored example, a fixture, an archived package —
    // and that project's manifests are managed too.
    pkg('.', { name: 'outer' })
    writeGroups('groups: {}\n', path.join(root, 'vendor', 'example'))
    pkg('vendor/example', { name: 'inner-root' })
    pkg('vendor/example/packages/app', { name: 'inner-app' })

    expect(findPackageJsonFiles(root)).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// mergeDepGroups — the pure half of the tool
// ---------------------------------------------------------------------------

describe('mergeDepGroups', () => {
  const groups = {
    groups: {
      react: { dependencies: { react: '^18.2.0' }, devDependencies: { '@types/react': '^18.2.0' } },
      build: { devDependencies: { webpack: '^5.95.0' } },
    },
  }

  it('returns the manifest untouched when depGroups is absent or empty', () => {
    const bare = { name: 'a', dependencies: { axios: '^1.6.0' } }

    expect(mergeDepGroups(bare, groups)).toBe(bare)
    expect(mergeDepGroups({ ...bare, depGroups: [] }, groups)).toEqual({ ...bare, depGroups: [] })
  })

  it('merges every named group over the manifest and sorts both blocks', () => {
    const merged = mergeDepGroups(
      { name: 'a', depGroups: ['react', 'build'], dependencies: { axios: '^1.6.0' } },
      groups,
    )

    expect(Object.keys(merged.dependencies!)).toEqual(['axios', 'react'])
    expect(Object.keys(merged.devDependencies!)).toEqual(['@types/react', 'webpack'])
  })

  it('lets the group overwrite a version the manifest already declared', () => {
    const merged = mergeDepGroups(
      { name: 'a', depGroups: ['react'], dependencies: { react: '^17.0.0' } },
      groups,
    )

    expect(merged.dependencies!.react).toBe('^18.2.0')
  })

  it('resolves a conflict between two groups in favour of the later one, and warns', () => {
    const warn = vi.spyOn(console, 'warn')
    const merged = mergeDepGroups({ name: 'a', depGroups: ['old', 'new'] }, {
      groups: {
        old: { dependencies: { react: '^17.0.0' } },
        new: { dependencies: { react: '^18.2.0' } },
      },
    })

    expect(merged.dependencies!.react).toBe('^18.2.0')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Version conflict for "react"'))
  })

  it('warns and carries on when a named group does not exist', () => {
    const warn = vi.spyOn(console, 'warn')
    const merged = mergeDepGroups({ name: 'a', depGroups: ['react', 'nope'] }, groups)

    expect(merged.dependencies!.react).toBe('^18.2.0')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Group "nope" not found'))
  })

  it('never removes a dependency the manifest declares but no group lists', () => {
    // Merge is additive. Deleting an entry from .dep-groups.yaml does not
    // uninstall it anywhere; see the syncFromPackages case below for where it
    // then reappears.
    const merged = mergeDepGroups(
      { name: 'a', depGroups: ['react'], dependencies: { 'private-lib': '^1.0.0' } },
      groups,
    )

    expect(merged.dependencies!['private-lib']).toBe('^1.0.0')
  })
})

// ---------------------------------------------------------------------------
// syncFromPackages — package.json -> .dep-groups.yaml
// ---------------------------------------------------------------------------

describe('syncFromPackages', () => {
  it('bootstraps an unconfigured tree: root deps to "root", everything else to "standalone"', () => {
    pkg('.', { name: 'ws', devDependencies: { turbo: '^2.0.0' } })
    pkg('packages/app', { name: 'app', dependencies: { react: '^18.2.0' } })

    syncFromPackages(root)

    expect(loadDepGroups(root)).toEqual({
      groups: {
        root: { devDependencies: { turbo: '^2.0.0' } },
        standalone: { dependencies: { react: '^18.2.0' } },
      },
    })
  })

  it('never captures workspace: protocol dependencies', () => {
    pkg('packages/app', { name: 'app', dependencies: { react: '^18.2.0', '@repo/ui': 'workspace:*' } })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.standalone.dependencies).toEqual({ react: '^18.2.0' })
  })

  it('skips packages without depGroups once the file exists and any package has them', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/managed', { name: 'managed', depGroups: ['react'], dependencies: { react: '^18.2.0' } })
    pkg('packages/opted-out', { name: 'opted-out', dependencies: { 'left-pad': '^1.0.0' } })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.standalone).toBeUndefined()
  })

  it('SURPRISING: package.json wins over .dep-groups.yaml on any version disagreement', () => {
    // Sync runs *before* merge inside `generate`, so the group file is the
    // source of truth for group *membership* only. It is not authoritative for
    // versions: whatever a member manifest declares is written back up into
    // the group.
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.3.0"\n')
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { react: '^18.2.0' } })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.react.dependencies!.react).toBe('^18.2.0')
  })

  it('SURPRISING: when two members disagree, the last one in walk order silently wins', () => {
    // There is no conflict detection on this path — `mergeDepGroups` warns on a
    // group-vs-group conflict, but a member-vs-member conflict is resolved by
    // directory order and only logged as a routine "Updated" line. Bumping a
    // dependency in any member but the last is therefore reverted by the next
    // `generate`.
    writeGroups('groups:\n  shared:\n    devDependencies:\n      typescript: "^5.5.0"\n')
    pkg('packages/a-first', { name: 'a', depGroups: ['shared'], devDependencies: { typescript: '^5.9.0' } })
    pkg('packages/z-last', { name: 'z', depGroups: ['shared'], devDependencies: { typescript: '^5.5.0' } })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.shared.devDependencies!.typescript).toBe('^5.5.0')
  })

  it('captures a dependency none of a package\'s own groups covers into "standalone"', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/app', {
      name: 'app',
      depGroups: ['react'],
      dependencies: { react: '^18.2.0', 'private-lib': '^1.0.0' },
    })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.standalone.dependencies).toEqual({ 'private-lib': '^1.0.0' })
  })

  it('SURPRISING: a second package\'s different version for the same uncovered dep is dropped', () => {
    // "standalone" is a single flat bucket keyed by name, and the writer only
    // fills a slot that is empty. Two packages that disagree about an
    // unmanaged dependency produce no warning and no record of the loser.
    writeGroups('groups: {}\n')
    pkg('packages/a-first', { name: 'a', depGroups: ['ghost'], dependencies: { 'private-lib': '^1.0.0' } })
    pkg('packages/z-last', { name: 'z', depGroups: ['ghost'], dependencies: { 'private-lib': '^2.0.0' } })

    syncFromPackages(root)

    expect(loadDepGroups(root).groups.standalone.dependencies).toEqual({ 'private-lib': '^1.0.0' })
  })

  it('leaves the config byte-identical, comments and all, when nothing changed', () => {
    const authored = '# hand-written note\ngroups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n'
    writeGroups(authored)
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { react: '^18.2.0' } })

    syncFromPackages(root)

    expect(readGroupsText()).toBe(authored)
  })

  it('SURPRISING: the first change discards every hand-written comment in the config', () => {
    // The writer re-emits the file from the parsed object rather than editing
    // it, so annotations explaining *why* a group exists survive only until the
    // next version drift.
    writeGroups('# why this group exists\ngroups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { react: '^18.3.0' } })

    syncFromPackages(root)

    expect(readGroupsText()).not.toContain('why this group exists')
    expect(readGroupsText()).toContain('# Dependency Groups Configuration')
  })

  it('orders groups root-first, standalone-last, the rest alphabetically', () => {
    writeGroups(
      'groups:\n  zebra:\n    dependencies:\n      z: "^1.0.0"\n  alpha:\n    dependencies:\n      a: "^1.0.0"\n',
    )
    pkg('.', { name: 'ws', depGroups: ['alpha'], dependencies: { turbo: '^2.0.0' } })
    pkg('packages/z', { name: 'z', depGroups: ['zebra'], dependencies: { z: '^1.0.0' } })
    pkg('packages/a', { name: 'a', depGroups: ['alpha'], dependencies: { a: '^1.0.0', extra: '^1.0.0' } })

    syncFromPackages(root)

    const order = [...readGroupsText().matchAll(/^ {2}([a-z]+):$/gm)].map((m) => m[1])
    expect(order).toEqual(['root', 'alpha', 'zebra', 'standalone'])
  })

  it('never writes to a package.json', () => {
    pkg('packages/app', { name: 'app', dependencies: { react: '^18.2.0' } })
    const before = fs.readFileSync(path.join(root, 'packages/app/package.json'), 'utf-8')

    syncFromPackages(root)

    expect(fs.readFileSync(path.join(root, 'packages/app/package.json'), 'utf-8')).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// generateDependencies — sync, then merge, then rewrite
// ---------------------------------------------------------------------------

describe('generateDependencies', () => {
  it('merges groups into every member and sorts the manifest', () => {
    writeGroups(
      'groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n    devDependencies:\n      "@types/react": "^18.2.0"\n',
    )
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { axios: '^1.6.0' } })

    generateDependencies(root)

    const app = readPkg('packages/app')
    expect(app.dependencies).toEqual({ axios: '^1.6.0', react: '^18.2.0' })
    expect(app.devDependencies).toEqual({ '@types/react': '^18.2.0' })
  })

  it('adds a dependency to every member when it is added to a shared group', () => {
    // The one direction that does work end to end, and the reason to adopt the
    // tool: membership plus a *new* entry propagates.
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n      react-dom: "^18.2.0"\n')
    pkg('packages/a', { name: 'a', depGroups: ['react'], dependencies: { react: '^18.2.0' } })
    pkg('packages/b', { name: 'b', depGroups: ['react'], dependencies: { react: '^18.2.0' } })

    generateDependencies(root)

    expect(readPkg('packages/a').dependencies['react-dom']).toBe('^18.2.0')
    expect(readPkg('packages/b').dependencies['react-dom']).toBe('^18.2.0')
  })

  it('SURPRISING: editing a version in .dep-groups.yaml is reverted, not propagated', () => {
    // The README's "Updating a Dependency Version" recipe — edit the yaml, run
    // generate, everyone gets it — does not hold. Step 1 (sync) overwrites the
    // edit from the members before step 2 (merge) ever reads it. The working
    // upgrade path is to edit *every* member, or the last one in walk order.
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.3.0"\n')
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { react: '^18.2.0' } })

    generateDependencies(root)

    expect(loadDepGroups(root).groups.react.dependencies!.react).toBe('^18.2.0')
    expect(readPkg('packages/app').dependencies.react).toBe('^18.2.0')
  })

  it('SURPRISING: dropping an entry from a group re-captures it into "standalone" instead of removing it', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/app', {
      name: 'app',
      depGroups: ['react'],
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
    })

    generateDependencies(root)

    expect(readPkg('packages/app').dependencies['react-dom']).toBe('^18.2.0')
    expect(loadDepGroups(root).groups.standalone.dependencies).toEqual({ 'react-dom': '^18.2.0' })
  })

  it('auto-populates an empty depGroups array — "root" for the root package, "standalone" below it', () => {
    writeGroups('groups: {}\n')
    pkg('.', { name: 'ws', depGroups: [], dependencies: { turbo: '^2.0.0' } })
    pkg('packages/app', { name: 'app', depGroups: [], dependencies: { react: '^18.2.0' } })

    generateDependencies(root)

    expect(readPkg('.').depGroups).toEqual(['root'])
    expect(readPkg('packages/app').depGroups).toEqual(['standalone'])
  })

  it('leaves a package with no depGroups field alone entirely', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/managed', { name: 'managed', depGroups: ['react'] })
    pkg('packages/opted-out', { name: 'opted-out', dependencies: { 'left-pad': '^1.0.0' } })
    const before = fs.readFileSync(path.join(root, 'packages/opted-out/package.json'), 'utf-8')

    generateDependencies(root)

    expect(fs.readFileSync(path.join(root, 'packages/opted-out/package.json'), 'utf-8')).toBe(before)
  })

  describe('the preinstall hook it installs for you', () => {
    it('SURPRISING: injects one into every managed package, with no way to opt out', () => {
      // There is no flag for this. It matters most for a *published* package:
      // npm runs a dependency's preinstall on the consumer's machine, so a
      // library grouped by this tool asks every one of its installers to run
      // `dependency-grouper generate`, and fails their install with code 127
      // when the binary is not on their PATH.
      writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
      pkg('packages/app', { name: 'app', depGroups: ['react'] })

      generateDependencies(root)

      expect(readPkg('packages/app').scripts.preinstall).toBe('dependency-grouper generate')
    })

    it('appends to an existing preinstall that does not already mention the tool', () => {
      writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
      pkg('packages/app', { name: 'app', depGroups: ['react'], scripts: { preinstall: 'node ./check.js' } })

      generateDependencies(root)

      expect(readPkg('packages/app').scripts.preinstall).toBe(
        'node ./check.js && dependency-grouper generate',
      )
    })

    it('leaves any preinstall that already contains "dependency-grouper" untouched', () => {
      // The only lever a consumer has: pre-seed a guarded form and the tool
      // stops overwriting it. This repo's own playground uses
      // `dependency-grouper generate || exit 0` so that a fresh clone, which
      // has not installed the CLI yet, still installs.
      writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
      const guarded = 'dependency-grouper generate || exit 0'
      pkg('packages/app', { name: 'app', depGroups: ['react'], scripts: { preinstall: guarded } })

      generateDependencies(root)

      expect(readPkg('packages/app').scripts.preinstall).toBe(guarded)
    })
  })

  it('is idempotent: a second run changes nothing on disk', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/app', { name: 'app', depGroups: ['react'], dependencies: { axios: '^1.6.0' } })

    generateDependencies(root)
    const manifest = fs.readFileSync(path.join(root, 'packages/app/package.json'), 'utf-8')
    const config = readGroupsText()

    generateDependencies(root)

    expect(fs.readFileSync(path.join(root, 'packages/app/package.json'), 'utf-8')).toBe(manifest)
    expect(readGroupsText()).toBe(config)
  })

  it('writes manifests as 2-space JSON with a trailing newline', () => {
    writeGroups('groups:\n  react:\n    dependencies:\n      react: "^18.2.0"\n')
    pkg('packages/app', { name: 'app', depGroups: ['react'] })

    generateDependencies(root)

    const raw = fs.readFileSync(path.join(root, 'packages/app/package.json'), 'utf-8')
    expect(raw.endsWith('}\n')).toBe(true)
    expect(raw).toContain('\n  "name": "app"')
  })
})
