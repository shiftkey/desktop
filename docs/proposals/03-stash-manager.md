# Proposal 03 — Git Stash Manager

**Status**: Implemented (Phase 1–4)
**Effort**: ~1 week
**Risk**: Low (pure local git, no API, no native deps)
**User priority**: P2 (recommended to implement **first** for engineering risk reasons)

> **Implementation notes** (2026-05-09)
>
> Phases 1–4 landed. New API surface: `getAllStashes`, `applyStash`,
> `createStashWithMessage`, `StashStore`, dispatcher methods (`loadStashes`,
> `applyStash`, `createStash`), `PopupType.StashCreate`,
> `RepositorySectionTab.Stashes`, sidebar tab + detail pane in
> `RepositoryView`. 66 tests pass, 100% line coverage on new files
> (`stash-store.ts`, `stash-list.tsx`, `stash-list-item.tsx`,
> `stash-create-dialog.tsx`, `stash-entry.ts`). `git/stash.ts` overall
> coverage is 83% (pre-existing untested helpers remain uncovered;
> all NEW functions are covered).

## 1. Goal & non-goals

### Goal
A visible, manageable stash list as a sidebar panel: see all stashes, preview
their diff, apply or pop a specific stash, drop one with confirmation, and
create a new stash from the current working changes.

### Non-goals
- Stash with selected files only (v2 — requires partial-stash UX work).
- Stashing into branches (`git stash branch`) — niche, defer.
- Sync stashes across machines (Git doesn't support this; out of scope).

### Why this is the *engineering* P0
Smallest blast radius. No API, no native module, no cross-process IPC. It
validates the sidebar-panel UX pattern that the Terminal panel will reuse,
without any of the Terminal's risk. Ship this first to derisk the layout work.

## 2. User stories

1. **As a user**, I open the Stashes panel from the sidebar and see a list of
   all stashes for the current repo, newest first.
2. **As a user**, I click a stash and see its diff in the existing diff pane.
3. **As a user**, I right-click a stash → "Apply", "Pop", or "Drop".
4. **As a user**, I have uncommitted changes; I click "Stash changes…" and
   give it a message.
5. **As a user**, "Drop" prompts for confirmation (destructive).
6. **As a user**, when I switch repos, the stash list updates.

## 3. Architecture

### Data flow
```
RepositoryStateCache  ←─  StashStore  ←─  git.stash.list()  (existing util)
                              │
                              ▼
                       Dispatcher (apply/pop/drop/save)
                              │
                              ▼
                          git.stash.{apply,pop,drop,save}
```

There's already partial stash plumbing in `app/src/lib/git/stash.ts` (it's
used today for the "stash on branch switch" prompt). This proposal exposes
that plumbing through a UI surface.

## 4. File layout

### New
```
app/src/lib/stores/
└── stash-store.ts                 # Per-repo stash list cache

app/src/ui/stashes/
├── stash-panel.tsx                # The sidebar panel
├── stash-list.tsx                 # List of stash entries
├── stash-list-item.tsx            # One stash row
├── stash-create-dialog.tsx        # "Stash changes…" prompt
└── stash-context-menu.tsx         # Right-click menu

app/test/unit/stashes/
├── stash-store-test.ts
├── stash-list-item-test.tsx
└── stash-create-dialog-test.tsx

app/test/unit/git/
└── stash-extended-test.ts         # Cover the apply/pop/drop wrappers we add
```

### Modified
| File | Change |
|---|---|
| `app/src/lib/git/stash.ts` | Add `applyStash`, `popStash`, `dropStash`, `saveStash` if not already present (audit first) |
| `app/src/lib/app-state.ts` | Repository state gains `stashes: ReadonlyArray<IStashEntry>` |
| `app/src/ui/dispatcher/dispatcher.ts` | `loadStashes`, `applyStash`, `popStash`, `dropStash`, `createStash` |
| `app/src/ui/repository-view.tsx` | Tab/button to toggle Stashes panel |
| `app/src/lib/feature-flag.ts` | `enableStashManager()` |
| `app/styles/ui/_stashes.scss` | New |
| `docs/learn-more/index.md` | Section: "Working with stashes" |

## 5. Data model

```typescript
// app/src/models/stash-entry.ts (likely already exists — extend if so)
export interface IStashEntry {
  readonly name: string             // refs/stash@{N}
  readonly stashSha: string
  readonly branchName: string       // branch when stashed
  readonly message: string          // user-provided or auto-generated
  readonly createdAt: number        // unix seconds
  readonly files: ReadonlyArray<string>  // changed paths summary
}
```

## 6. Dispatcher

```typescript
loadStashes(repository: Repository): Promise<void>
createStash(repository: Repository, message: string,
            includeUntracked: boolean): Promise<void>
applyStash(repository: Repository, stash: IStashEntry): Promise<void>
popStash(repository: Repository, stash: IStashEntry): Promise<void>
dropStash(repository: Repository, stash: IStashEntry): Promise<void>
```

All four mutating ops:
1. Run the git command.
2. Refresh `loadStashes` to pick up new state.
3. Refresh working-tree status (already done by existing dispatcher methods —
   reuse `_loadStatus`).

## 7. UX spec

### Sidebar tab
The repo sidebar already has Changes / History tabs. Add a third: Stashes.

```
┌─────────────────┐
│ ┌───┬───┬─────┐ │
│ │Chg│Hst│Stsh │ │  <- new tab
│ └───┴───┴─────┘ │
├─────────────────┤
│ + Stash changes │  <- create button
├─────────────────┤
│ stash@{0}       │
│ "WIP fix nav"   │
│ 2h ago · 3 files│
├─────────────────┤
│ stash@{1}       │
│ "experiment"    │
│ 1d ago · 12 fls │
└─────────────────┘
```

### Right-click menu
- Apply (keep stash)
- Pop (apply + drop)
- Drop… (confirm dialog)
- Copy SHA

### Edge cases

| Case | Behavior |
|---|---|
| Apply with conflicts | Show conflict resolution UI (existing flow) |
| Drop a stash that no longer exists (raced) | Toast "Stash already gone"; refresh list |
| No stashes | Empty state: "No stashes. Click + to stash your current changes." |
| Working tree dirty when applying | Warn: "You have uncommitted changes — apply anyway?" |

## 8. Testing strategy

| File | Coverage | What |
|---|---|---|
| `stash-extended-test.ts` | 100% | Each git wrapper against fixture repos in `app/test/fixtures/` |
| `stash-store-test.ts` | 95% | Cache per repo, refresh on dispatch, error states |
| `stash-list-item-test.tsx` | 100% | Render variants: many files, long message, recent vs old timestamps |
| `stash-create-dialog-test.tsx` | 100% | Validation, "include untracked" toggle, submit wiring |

Git tests use the existing fixture infrastructure under `app/test/fixtures/`
(see `app/test/helpers/repositories.ts`). Each test creates a temp repo with
a known stash state.

### Manual test plan
- Create stash with message → verify appears.
- Apply on dirty tree → conflict resolution.
- Pop → list shrinks by one.
- Drop with confirm.
- Switch repos → list refreshes.

## 9. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stash conflicts on apply | Certain | Bad UX | Reuse existing conflict resolution flow |
| Untracked files in stash | Medium | Confusion | Surface as a separate "include untracked" checkbox; document behavior |
| Stash list parsing edge cases (commits with newlines) | Low | Wrong display | Use git's `-z` null-delimited output |

## 10. Phased delivery

**Phase 1 — Git wrappers + tests (2 days)**
Audit existing `stash.ts`, fill gaps, 100% wrapper coverage.

**Phase 2 — Store + dispatcher (1 day)**
`stash-store.ts`, `IAppState` field, dispatcher methods.

**Phase 3 — Sidebar panel + list (2 days)**
`stash-panel.tsx`, `stash-list.tsx`, `stash-list-item.tsx`, tab integration.

**Phase 4 — Create + menu actions (2 days)**
Create dialog, context menu, confirmation flows.

Total: ~7 working days.

## 11. Open questions

1. **Show stash count as badge on the tab?** Yes — small UX win.
2. **Include `--keep-index` option?** Power-user feature; defer to v2.
3. **Sort order configurable?** No — newest first matches GitHub Desktop's
   other lists.
