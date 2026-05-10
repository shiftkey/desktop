# Proposal 04 — Repository Health Dashboard

**Status**: Implemented (v1)
**Effort**: ~1.5 weeks
**Risk**: Low–Medium (no new git/API; aggregates existing data)
**User priority**: P3

> **Implementation notes** (2026-05-09)
>
> v1 ships with two probes wired (uncommitted-count, ahead/behind) plus
> the full collector + scoring + dashboard infrastructure. PR count, CI
> status, last-activity, and stale-branch probes are stubbed to return
> zero — they can be wired into the existing PR / commit-status stores
> incrementally without changing the contract.
>
> - **Scoring** (`app/src/lib/repo-health/aggregate-status.ts`): pure
>   function, 9 tests, 100% coverage.
> - **Collector** (`app/src/lib/repo-health/collect-health.ts`):
>   per-repo + parallel collectMany with concurrency cap. 8 tests,
>   91% coverage (only the unreachable outer catch uncovered).
> - **Store** (`app/src/lib/stores/repo-health-store.ts`): per-repo cache,
>   60s dedup window, in-flight coalescing, refreshOne / forget / clear.
>   10 tests, 100% coverage.
> - **UI** (`app/src/ui/repo-health/`): `RepoHealthDashboard` (sort /
>   filter / refresh), `RepoHealthRow` (signal pills), wrapped in a
>   `RepoHealthDashboardDialog`. 18 tests; 100% on row, 89% on dashboard.
> - **Wiring**: 2 dispatcher methods, 2 AppStore methods, `IAppState.repoHealth`,
>   `PopupType.RepoHealthDashboard`. Probes use `getStatus` and
>   `getAheadBehind` from the existing git layer.
>
> Total: **45 new tests pass**, 0 regressions.

## 1. Goal & non-goals

### Goal
A single screen that lists every tracked repository with at-a-glance status:
unpushed commits, uncommitted changes, behind/ahead remote, stale branches,
open PR count, and CI status of the default branch.

### Non-goals
- Cross-org search/discovery.
- Repo-creation workflow.
- Cleanup actions (deleting stale branches in bulk) — v2.
- Background sync of read-only repos the user doesn't have locally.

## 2. User stories

1. **As a power user with 20+ repos**, I open Dashboard and see at a glance
   which need attention.
2. **As a user**, I click a repo row → it opens that repo in the main view.
3. **As a user**, I sort by "needs attention" and see repos with unpushed
   commits / dirty trees first.
4. **As a user**, I filter by "has open PRs" and see only those.
5. **As a user**, I refresh — slow operations show a spinner per row, not
   blocking the whole view.

## 3. Architecture

### Data source map

| Status field | Source | Cost |
|---|---|---|
| Uncommitted file count | `git status --porcelain=v2` (per repo) | ~50–200ms each |
| Ahead/behind | `git rev-list --left-right --count @{u}...HEAD` | ~30ms each |
| Default branch CI | Existing `commit-status-store.ts` | Cached |
| Open PR count | Existing `PullRequestStore` | Cached |
| Last activity | `git log -1 --format=%ct` on default branch | ~20ms each |
| Stale branches | `git for-each-ref --format='%(refname) %(committerdate:unix)'` | ~50ms each |

### Why a separate aggregator
Per-repo polls are cheap individually, expensive in aggregate. A dedicated
`RepoHealthStore` runs them in a controlled concurrent pool (default
`Promise.all` with concurrency 4), de-dupes within a 60s window, and exposes
the result as a frozen snapshot.

```
┌────────────────────────────────────────────┐
│  RepoHealthStore                           │
│   ├── snapshot: ReadonlyMap<repoId,Health> │
│   ├── refreshOne(repoId)                   │
│   ├── refreshAll(concurrency=4)            │
│   └── debounced auto-refresh on focus      │
└────────────────────────────────────────────┘
              │
              ▼
        IAppState.repoHealth
              │
              ▼
        <RepoHealthDashboard>
```

## 4. File layout

### New
```
app/src/lib/stores/
└── repo-health-store.ts

app/src/lib/repo-health/
├── collect-health.ts              # Per-repo collector (composes git utils)
├── aggregate-status.ts            # Derives "needs attention" score
└── types.ts                       # IRepoHealth, IRepoHealthSnapshot

app/src/ui/repo-health/
├── repo-health-dashboard.tsx      # Top-level view
├── repo-health-row.tsx            # One repo's row
├── repo-health-filter-bar.tsx     # Sort + filter controls
└── repo-health-empty.tsx

app/test/unit/repo-health/
├── repo-health-store-test.ts
├── collect-health-test.ts
├── aggregate-status-test.ts
└── repo-health-row-test.tsx
```

### Modified
| File | Change |
|---|---|
| `app/src/lib/app-state.ts` | Add `repoHealth: IRepoHealthSnapshot` |
| `app/src/ui/dispatcher/dispatcher.ts` | `refreshRepoHealth`, `refreshSingleRepoHealth` |
| `app/src/ui/app.tsx` | New "Dashboard" view in the no-repo-selected slot, or top-level toggle |
| `app/src/lib/feature-flag.ts` | `enableRepoHealthDashboard()` |
| `app/styles/ui/_repo-health.scss` | New |
| `docs/learn-more/index.md` | New section: "Repository health dashboard" |

## 5. Data model

```typescript
// app/src/lib/repo-health/types.ts
export interface IRepoHealth {
  readonly repositoryId: number
  readonly uncommittedCount: number
  readonly aheadBy: number
  readonly behindBy: number
  readonly defaultBranchStatus: 'success' | 'pending' | 'failure' | 'unknown'
  readonly openPullRequestCount: number
  readonly lastActivityUnix: number
  readonly staleBranchCount: number       // local branches with no commits in 60d
  readonly attentionScore: number         // 0..100, higher = more urgent
  readonly collectedAt: number
  readonly error: string | null
}

export interface IRepoHealthSnapshot {
  readonly statuses: ReadonlyMap<number, IRepoHealth>
  readonly refreshing: ReadonlySet<number>      // in-flight repo IDs
  readonly lastRefreshAt: number | null
}
```

`attentionScore` formula (tweakable):
```
score =
  (uncommittedCount > 0 ? 30 : 0) +
  Math.min(aheadBy * 5, 25) +
  Math.min(behindBy * 5, 20) +
  (defaultBranchStatus === 'failure' ? 15 : 0) +
  Math.min(openPullRequestCount * 2, 10)
```

Capped at 100. Documented in `aggregate-status.ts` so users can find it.

## 6. Dispatcher

```typescript
refreshRepoHealth(): Promise<void>            // all repos
refreshSingleRepoHealth(repoId: number): Promise<void>
```

Auto-refresh triggers:
- App window regains focus *and* last refresh > 5 min ago.
- After a successful pull / push (refresh just that repo).
- Manual button click in the dashboard.

## 7. UX spec

### Layout
```
┌───────────────────────────────────────────────────────────────────┐
│ Dashboard                            [Sort: Attention ▾] [Refresh]│
├───────────────────────────────────────────────────────────────────┤
│ Filter: [needs attention] [has PRs] [behind remote] [clean]       │
├───────────────────────────────────────────────────────────────────┤
│  myrepo            ●  3 uncommitted · 2 ahead · ✗ CI · 1 PR · ⚠65 │
│  another-repo         clean · synced · ✓ CI · ⚠0                  │
│  staging              ●  1 behind · ⚠5                            │
└───────────────────────────────────────────────────────────────────┘
```

Click row → opens that repo. Right-click → "Refresh", "Open in browser",
"Reveal in file manager".

### Edge cases

| Case | Behavior |
|---|---|
| Repo missing on disk | Show row in red, status="missing", offer "Locate…" |
| Network down (CI/PR data unavailable) | Per-row icon "—" with tooltip "Offline" |
| Refresh of 100 repos | Concurrency cap; progress in toolbar; can cancel |
| Large monorepo with `git status` taking 5s | Per-row spinner; never blocks other rows |

## 8. Testing strategy

| File | Coverage | What |
|---|---|---|
| `aggregate-status-test.ts` | 100% | Score formula, every branch of the conditional |
| `collect-health-test.ts` | 95% | Each collector with fixture repos; error propagation |
| `repo-health-store-test.ts` | 95% | Concurrency limit, dedup window, refresh-single, focus trigger |
| `repo-health-row-test.tsx` | 100% | All status combinations, missing repo state, error state |

Mocks for Git use existing fixture infrastructure. PR/CI sources mocked via
the existing test helpers for `pull-request-store` and `commit-status-store`.

### Manual test plan
- Open dashboard with 0 / 1 / 20+ repos.
- Pull a repo from inside dashboard — that row updates.
- Sort by attention, then alphabetic.
- Filter combinations.

## 9. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Slow refresh blocks UI on big repo lists | High | Bad UX | Per-row async, concurrency cap, never await all-at-once on render |
| `git status` cost on large monorepos | High | Slow rows | Surface time per repo in tooltip; let user "skip" expensive repos |
| Disk-missing repos crash collector | Low | Whole refresh fails | Per-repo try/catch; one failure doesn't poison the snapshot |
| Stale CI/PR data | Certain | User confusion | Show "as of HH:MM" timestamp per row |
| Memory growth with 100+ repos | Low | OOM | Snapshot is lightweight (<200B per repo); no concern at expected scale |

## 10. Phased delivery

**Phase 1 — Collector + scoring (3 days)**
`collect-health.ts`, `aggregate-status.ts`, full unit tests, no UI.

**Phase 2 — Store + dispatcher (2 days)**
Concurrency pool, refresh triggers, focus integration.

**Phase 3 — Dashboard UI (3 days)**
Layout, sort, filter, click-through to repo.

**Phase 4 — Polish + edge cases (2 days)**
Missing repos, errors, offline state, perf with 50+ repos.

Total: ~10 working days.

## 11. Open questions

1. **Where is the entry point?** Sidebar item ("Dashboard"), or shown when no
   repo is selected? Recommend: a top-level toggle in the toolbar so it's
   reachable from any state.
2. **Persist sort/filter preferences?** Yes — localStorage, per-window.
3. **Background polling when window not focused?** No — battery-friendly. Only
   refresh on focus regain or explicit button.
4. **Cross-repo bulk actions (pull all, fetch all)?** v2 — surface the
   *information* first, automate later.
