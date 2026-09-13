# Changelog

All notable changes to `@ozjsey/dependency-grouper`.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/spec/v2.0.0.html) — still `0.x`, so a minor bump may break you.

**On the accuracy of this file.** Entries for 0.1.0 – 0.3.5 were reconstructed *after the fact*
from this package's git history — one commit per release, each carrying the version bump in the
same commit — and from the version recorded in `package.json` at that commit. They were not
written at release time. Dates are commit dates, not publish dates: the package was originally
published unscoped as `dependency-grouper`, and that name was **unpublished from npm on
2026-09-13**, taking its publish timestamps with it. The only release the registry can still
confirm is `@ozjsey/dependency-grouper@0.3.5`, published 2026-09-13. Where a commit message did
not say what changed, the entry says so rather than guessing.

## [Unreleased]

### Added

- `CHANGELOG.md` and `ARCHITECTURE.md`.
- A **characterisation test suite** — 41 tests, `vitest`, run against `src/` rather than the built
  `dist/`. These pin what the tool already does, including ten behaviours a reader would not
  predict from the README; `ARCHITECTURE.md` → "Pinned surprises" tabulates them. `npm test` now
  runs this suite; the original hand-rolled runner is kept as `npm run test:legacy`.
- README case study: this repo's own playground is managed by the tool, with the before/after diff.

### Documented (no code change)

Behaviours discovered by using the tool on this repo and pinned by the new suite. None of these
were altered — they are recorded so the next change to them is deliberate:

- A bare `.dep-groups.yaml` is accepted as a root on its own, with **no workspace of any kind**.
  The README and the CLI help both claim workspaces are required.
- The README's "Updating a Dependency Version" recipe does not work. `generate` syncs
  `package.json` → config *before* it merges config → `package.json`, so an edit to the config is
  overwritten by the members before it is applied.
- When two member packages declare different versions of a shared dependency, the last one in
  directory-walk order wins, silently.
- `generate` injects a `preinstall` script into every managed `package.json` and there is no way to
  opt out. On a **published** package this runs on the consumer's machine and fails their install
  with code 127 when the CLI is not on their PATH.
- The directory walk has no ignore list and does not stop at a nested project root.

### Known gaps

- `src/index.ts` is a single 452-line module; the repo convention is single-purpose modules behind
  a thin entry. `ARCHITECTURE.md` names the intended split. Deferred deliberately until the
  characterisation suite has been trusted for a while.
- `peerDependencies` and `optionalDependencies` cannot be grouped.

## [0.3.5] — 2026-09-13

### Changed

- Renamed to the scoped `@ozjsey/dependency-grouper` (`publishConfig.access: public`); README links
  updated. The unscoped `dependency-grouper` name was unpublished the same day.
- The version bump to 0.3.5 itself landed earlier, on 2026-03-29, in a commit whose message
  (`chore(package): updated package v`) touched nothing but the version field. It was published
  under the scoped name.

## [0.3.4] — 2026-03-29

### Changed

- Build moved to **esbuild**: `dist/index.min.js` and `dist/cli.min.js` are now bundled and
  minified, with `yaml` and `sort-package-json` left external. `tsc` is reduced to
  `--emitDeclarationOnly`. `package.json` `main`/`bin` repoint at the `.min.js` files and `files`
  ships `dist/*.min.js` + `dist/*.d.ts` only.

## [0.3.3] — 2026-01-15

Version bump only — the commit (`chore: version bump, will release`) changed nothing but the
version field. The preceding commit corrected the maintainer name in `package.json`.

## [0.3.2] — 2026-01-12

### Added

- `workspace:` protocol dependencies are skipped by sync, so internal monorepo references are never
  captured into a group.
- Version-conflict warnings in `mergeDepGroups` when two of a package's groups disagree about the
  same dependency. The later group still wins; the warning names both.
- The generated `.dep-groups.yaml` carries inline comments — a file header, and an explanation on
  the `root` and `standalone` groups.

## [0.3.1] — 2026-01-12

### Fixed

- Sync now updates the version of a dependency a group already contains, instead of only ever
  adding new names. This is the change that made `package.json` authoritative for versions; see
  `ARCHITECTURE.md` → "The invariant".

## [0.3.0] — 2026-01-12

### Changed

- **Breaking:** the auto-managed bucket was renamed from `common` to `standalone`.
- "Smart sync": a dependency already covered by one of a package's own groups is no longer
  re-added; only genuinely unmanaged dependencies land in `standalone`.

## [0.2.2] — 2026-01-11

### Added

- The original test suite — `test/test.js`, a hand-rolled runner, 15 assertions at the time
  (19 today).

## [0.2.1] — 2026-01-11

### Changed

- README restructured.

## [0.2.0] — 2026-01-11

### Added

- `"depGroups": []` is auto-populated on `generate` — `["root"]` for the workspace root package,
  `["standalone"]` for everything below it. This is what makes the bootstrap flow work.
- `generate` injects a `preinstall` script into every managed `package.json`, appending to an
  existing one unless it already mentions `dependency-grouper`. There is no opt-out; see the
  Unreleased notes above for why this matters for published packages.

## [0.1.3] — 2026-01-11

### Added

- Bootstrap separates the workspace root's dependencies (`root` group) from those of the packages
  below it (`common`, later `standalone`).

## [0.1.2] — 2026-01-11

### Fixed

- `.dep-groups.yaml` is always created, with a default `common` group, rather than being skipped
  when there was nothing to write.

## [0.1.1] — 2026-01-11

### Added

- `dependency-grouper sync` — the one-way `package.json` → `.dep-groups.yaml` command, intended for
  postinstall hooks. It never writes a `package.json`.

### Changed

- README: quick start for an existing monorepo, and a note that nested projects are found
  recursively.

## [0.1.0] — 2026-01-11

Initial release.

- `.dep-groups.yaml` defines named dependency sets; `"depGroups": [...]` in a `package.json`
  selects them.
- `dependency-grouper generate` merges the selected groups into each package and sorts the result
  with `sort-package-json`.
- Roots are found by walking up for `.dep-groups.yaml`, `pnpm-workspace.yaml`, or a `workspaces`
  field.
