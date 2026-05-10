# Repository Guidelines

## Project Structure & Module Organization

This repository is the Linux fork of GitHub Desktop, a TypeScript/Electron app.
Application code lives in `app/src`: UI components are under `app/src/ui`, shared
logic under `app/src/lib`, models under `app/src/models`, and Electron main
process code under `app/src/main-process`. Styles are in `app/styles`, static
assets in `app/static`, and documentation in `docs/`. Build, release, and
maintenance scripts live in `script/`. Tests are in `app/test`, with unit tests
in `app/test/unit`, helpers in `app/test/helpers`, mocks in `app/test/__mocks__`,
and Git fixture repositories in `app/test/fixtures`.

## Build, Test, and Development Commands

Use Yarn 1.x and Node 20.x, as described in `docs/contributing/setup.md`.

- `yarn` installs root and app dependencies.
- `yarn build:dev` compiles a development build.
- `yarn start` launches the development app with background recompilation.
- `yarn compile:dev` runs the development webpack compilation only.
- `yarn test` runs unit tests and script tests.
- `yarn test:unit -- <pattern>` runs matching Jest unit tests.
- `yarn test:script` runs tests for repository scripts.
- `yarn lint` checks Prettier formatting and ESLint rules.
- `yarn lint:fix` applies Prettier and ESLint autofixes.

## Coding Style & Naming Conventions

Write TypeScript using the repository ESLint and Prettier configuration. Use
camelCase for methods and variables, PascalCase for classes and React
components, and JSDoc `/** ... */` comments for public or non-obvious APIs. In
application code, prefer asynchronous Node APIs; synchronous variants should be
rare and named with a `Sync` suffix. Script code may favor synchronous APIs for
readability.

## Testing Guidelines

Jest is the primary test framework. Add unit tests beside related areas under
`app/test/unit`, mirroring `app/src` when practical. New test files should use
the pattern `[app-module]-test.ts`. Keep unit tests focused on one module or
function, and use `app/test/fixtures` for repository state needed by Git tests.
Run `yarn test:unit` before submitting application changes; run `yarn test` when
touching shared behavior or scripts.

## Notable subsystems

### Pull Request Review (`app/src/lib/api/pull-request-reviews.ts`, `app/src/lib/stores/pull-request-review-store.ts`, `app/src/ui/pull-request-review/`)

In-app PR review dialog. Loads threads via REST, lets the user draft
line comments, set a verdict, and submit a review in a single shot.

- API: `fetchPullRequestThreads`, `postLineComment`, `submitReview`. The
  `IHttpClient` interface is fully injectable so the wrapper is testable
  without `fetch`. Production uses `makeAccountHttpClient(account)`.
- Store: `PullRequestReviewStore` holds at most one active session.
  Drafts are kept locally; on submit success they're cleared, on
  failure they survive so the user can retry.
- UI: opened via `PopupType.PullRequestReviewSession` (carries
  `repository` + `prNumber`). The diff-rendered inline comment overlay
  is Phase 2 work.
- 50 unit tests, 100% line coverage on the API + store + model.

### Repository Health Dashboard (`app/src/lib/repo-health/`, `app/src/lib/stores/repo-health-store.ts`, `app/src/ui/repo-health/`)

Cross-repo at-a-glance status view: uncommitted files, ahead/behind,
PR count, CI status, attention score per repo.

- `aggregate-status.ts`: pure scoring formula (capped at 100). 100% coverage.
- `collect-health.ts`: per-repo collector composing injectable probes.
  Probe failures degrade gracefully — one bad signal doesn't poison
  the snapshot. `collectMany(repos, opts, concurrency=4)` runs collectors
  in a bounded pool, preserving input order.
- `RepoHealthStore`: in-memory snapshot, 60s dedup window, in-flight
  coalescing.
- UI: `RepoHealthDashboard` (sort + filter + refresh) + `RepoHealthRow`,
  wrapped in `RepoHealthDashboardDialog`, opened via
  `PopupType.RepoHealthDashboard`.
- Default probes (`makeDefaultRepoHealthProbes` in `app-store.ts`)
  currently wire `getStatus` and `getAheadBehind`. PR / CI / activity
  probes return 0 in v1 — extend incrementally without breaking the
  contract.
- 45 unit tests, 100% on store/scoring/row, 89% on the dashboard component.

### Integrated Terminal (`app/src/lib/terminal/`, `app/src/main-process/terminal/`, `app/src/ui/terminal/`)

A repo-scoped terminal panel anchored to the bottom of the window. `Ctrl+`` `
toggles. Architecture (see `docs/proposals/01-integrated-terminal.md` for the
full design):

- **Main process** (`app/src/main-process/terminal/`): `TerminalManager` owns
  every active `PtySession`. Each session wraps a `node-pty` process and a
  per-session Electron `MessageChannelMain` for high-throughput byte traffic
  (avoids head-of-line blocking on the regular IPC bus). The main-process
  IPC handler is registered in `main.ts` via `registerTerminalIpc()`.
- **Renderer** (`app/src/ui/terminal/`): `TerminalPanel` is the slide-up
  shell; `XtermView` mounts xterm.js into a div and binds it to the
  per-session `MessagePort`. xterm.js owns its own DOM; React state never
  re-renders on terminal data.
- **Renderer state** (`app/src/lib/stores/terminal-store.ts`): visibility,
  height (persisted to localStorage), per-session snapshots, repo↔session
  bindings. `MessagePort`s themselves are NOT in the store (not
  serializable) — the `AppStore` keeps them in a private `Map`.
- **Dispatcher**: `toggleTerminal`, `spawnTerminal`, `killTerminal`,
  `resizeTerminal`, `getTerminalPort`, `setTerminalHeight`.

Tests: 100 unit tests across 8 files in `app/test/unit/terminal/`. Mock PTY
+ MockPort helpers in `app/test/helpers/mock-pty.ts` so tests run without
node-pty's native binding.

### Stash Manager (`app/src/lib/git/stash.ts`, `app/src/lib/stores/stash-store.ts`, `app/src/ui/stashes/`)

End-user stash management. Three layers:
1. **Git wrappers** (`stash.ts`): `getAllStashes` (Desktop + CLI), `applyStash` (apply without dropping), `createStashWithMessage` (custom message + optional `--include-untracked`). The pre-existing `getStashes` / `popStashEntry` / `dropDesktopStashEntry` filter to Desktop-marked entries; the new `getAll*` does not.
2. **`StashStore`**: per-`repositoryId` cache of `IRepoStashState` (`{entries, loading, error, loadedAt}`). Concurrent loads coalesce. Surfaced via `IAppState.stashesByRepoId`.
3. **UI**: `StashList` + `StashListItem` render the sidebar; `StashCreateDialog` is a popup (`PopupType.StashCreate`). The Stashes tab lives next to Changes/History inside `RepositoryView` (`RepositorySectionTab.Stashes`).

`IStashEntry` has been extended with `message: string` and `stashedAt: number`. Test fixtures that construct `IStashEntry` literals must include both.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often with scoped prefixes for
automation such as `build(deps): bump ...`. Keep commits focused and mention PR
or issue numbers when relevant. Open draft PRs for work in progress, include a
clear description, link related issues, and add screenshots or recordings for UI
changes. Expect review iteration; mark the PR ready only after tests and linting
that match the change have passed.
