# Git Change Summary Badge Design

## Overview

Add a compact Git Change Summary badge to the Changes sidebar header that displays uncommitted changes as:

```
12 files  +248  -67
```

The badge shows only when there are pending changes, and updates automatically when repository status changes.

## Placement

The badge lives in the **Changes list header** (`ChangesList` component), next to the existing "N changed files" checkbox label. It replaces/supplements the current simple file count with a richer at-a-glance summary.

## Architecture

### Data Flow

```
git diff --numstat -z HEAD
    └── getWorkingDirectoryStats(repository): IWorkingDirectoryStats
            └── AppStore._loadStatus()
                    └── repositoryStateCache.updateChangesState()
                            └── ChangesList.props.changes.diffStats
                                    └── ChangeSummaryBadge
```

### Components

1. **Git layer** (`app/src/lib/git/working-directory-stats.ts`)
   - `getWorkingDirectoryStats(repository: Repository): Promise<IWorkingDirectoryStats | null>`
   - Runs `git diff --numstat -z HEAD --` and parses output
   - Returns `{ files: number, additions: number, deletions: number }`
   - Handles binary files (marked as `-` in numstat) by counting them as 0 lines

2. **Model** (`app/src/models/working-directory-stats.ts`)
   - `interface IWorkingDirectoryStats` with `files`, `additions`, `deletions`

3. **Store** (`app/src/lib/stores/updates/changes-state.ts`)
   - `updateChangedFiles` also accepts `stats: IWorkingDirectoryStats | null`
   - `IChangesState` gains `readonly diffStats: IWorkingDirectoryStats | null`

4. **UI** (`app/src/ui/changes/change-summary-badge.tsx`)
   - `ChangeSummaryBadge` component
   - Props: `stats: IWorkingDirectoryStats | null`
   - Renders nothing if `stats` is null or `files === 0`
   - Renders: `<span className="change-summary-badge">{files} files  <span className="additions">+{additions}</span>  <span className="deletions">-{deletions}</span></span>`
   - Wrapped in `TooltippedContent` with tooltip: `"{files} files changed • {added} additions • {removed} deletions"`

5. **Styles** (`app/styles/ui/_changes.scss`)
   - `.change-summary-badge` — compact rounded styling with tabular numbers
   - `.change-summary-badge .additions` — green color (`--color-new`)
   - `.change-summary-badge .deletions` — red color (`--color-deleted`)

### Integration Points

- `app/src/lib/stores/app-store.ts`: Call `getWorkingDirectoryStats` in `_loadStatus`, pass result to `updateChangedFiles`
- `app/src/ui/changes/changes-list.tsx`: Render `<ChangeSummaryBadge stats={this.props.changes.diffStats} />` in the header div
- `app/src/lib/app-state.ts`: Add `diffStats` to `IChangesState`

## Behavior

- **Show only when pending changes**: Badge renders `null` if `files === 0`
- **Include all change types**: staged, unstaged, untracked — `git diff --numstat HEAD` captures all of these
- **Auto-update**: Tied to the existing status refresh cycle (`_loadStatus` is called after commits, fetches, file operations, etc.)
- **Tooltip**: Hovering shows the full descriptive text

## Styling

- Compact inline badge, right-aligned in the changes list header
- Rounded corners (`border-radius: 12px`)
- Tabular numbers (`font-variant-numeric: tabular-nums`)
- Font size `var(--font-size-xs)`, weight `var(--font-weight-semibold)`
- Green additions using existing `--color-new` variable
- Red deletions using existing `--color-deleted` variable
- Background: subtle badge background (`var(--list-item-badge-background-color)`)

## Testing

- Unit test `getWorkingDirectoryStats` with mock git output (staged file, unstaged file, binary file, no changes)
- Unit test `ChangeSummaryBadge` renders correctly with/without stats
- Verify `_loadStatus` populates `diffStats` in the store

## Files Modified

| File | Change |
|---|---|
| `app/src/lib/git/working-directory-stats.ts` | New — git helper |
| `app/src/models/working-directory-stats.ts` | New — model interface |
| `app/src/lib/stores/updates/changes-state.ts` | Update `updateChangedFiles` to accept and return `diffStats` |
| `app/src/lib/stores/app-store.ts` | Call `getWorkingDirectoryStats` in `_loadStatus` |
| `app/src/lib/app-state.ts` | Add `diffStats` to `IChangesState` |
| `app/src/ui/changes/change-summary-badge.tsx` | New — badge component |
| `app/src/ui/changes/changes-list.tsx` | Render badge in header |
| `app/styles/ui/_changes.scss` | Add badge styles |
| `app/test/unit/git/working-directory-stats-test.ts` | New — unit tests |
| `app/test/unit/changes/change-summary-badge-test.ts` | New — unit tests |
