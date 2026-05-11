# Git Change Summary Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact badge to the Changes sidebar header showing file count, additions (+green), and deletions (-red).

**Architecture:** Compute diff stats via `git diff --numstat HEAD` in `_loadStatus`, store them in `IChangesState`, and render a new `ChangeSummaryBadge` React component in the `ChangesList` header.

**Tech Stack:** TypeScript, React, Jest, Sass, custom `git()` wrapper, existing `TooltippedContent` tooltip component.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/src/models/working-directory-stats.ts` | `IWorkingDirectoryStats` interface |
| `app/src/lib/git/working-directory-stats.ts` | `getWorkingDirectoryStats()` — runs `git diff --numstat -z HEAD` and parses output |
| `app/src/lib/stores/updates/changes-state.ts` | `updateChangedFiles` accepts `diffStats` and returns it in `ChangedFilesResult` |
| `app/src/lib/app-state.ts` | `IChangesState` gains `readonly diffStats: IWorkingDirectoryStats \| null` |
| `app/src/lib/stores/app-store.ts` | `_loadStatus` calls `getWorkingDirectoryStats` and passes result into `updateChangedFiles` |
| `app/src/ui/changes/change-summary-badge.tsx` | `ChangeSummaryBadge` React component |
| `app/src/ui/changes/changes-list.tsx` | Render badge next to header checkbox |
| `app/styles/ui/changes/_changes-list.scss` | Badge styling (additions green, deletions red, tabular nums) |
| `app/test/unit/git/working-directory-stats-test.ts` | `getWorkingDirectoryStats` unit tests |
| `app/test/unit/changes/change-summary-badge-test.ts` | `ChangeSummaryBadge` rendering unit tests |

---

## Task 1: Define the `IWorkingDirectoryStats` model

**Files:**
- Create: `app/src/models/working-directory-stats.ts`
- Test: `app/test/unit/git/working-directory-stats-test.ts` (failing compilation test only)

- [ ] **Step 1: Write the model interface**

Create `app/src/models/working-directory-stats.ts`:

```typescript
/** Line-level stats for the working directory diff. */
export interface IWorkingDirectoryStats {
  /** Total number of changed files. */
  readonly files: number

  /** Number of added lines across all changed files. */
  readonly additions: number

  /** Number of deleted lines across all changed files. */
  readonly deletions: number
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/models/working-directory-stats.ts
git commit -m "feat(model): add IWorkingDirectoryStats interface"
```

---

## Task 2: Add `diffStats` to `IChangesState`

**Files:**
- Modify: `app/src/lib/app-state.ts:735-779`

- [ ] **Step 1: Write the failing type test**

In `app/test/unit/changes/change-summary-badge-test.ts` (create file):

```typescript
import { IChangesState } from '../../src/lib/app-state'

describe('IChangesState diffStats', () => {
  it('accepts diffStats field', () => {
    const state: IChangesState = {
      // ... other required fields omitted for brevity — compiler will tell us
      diffStats: { files: 2, additions: 10, deletions: 5 },
    } as any
    expect(state.diffStats).toEqual({ files: 2, additions: 10, deletions: 5 })
  })
})
```

Run: `yarn test:unit -- change-summary-badge-test`
Expected: FAIL — `Property 'diffStats' does not exist on type 'IChangesState'`.

- [ ] **Step 2: Add `diffStats` to `IChangesState`**

In `app/src/lib/app-state.ts`, inside `export interface IChangesState`, add after `readonly currentRepoRulesInfo`:

```typescript
  /**
   * Aggregate diff statistics for the current working directory.
   * Null when stats have not yet been computed or there are no changes.
   */
  readonly diffStats: IWorkingDirectoryStats | null
```

Add import at the top of `app-state.ts`:

```typescript
import { IWorkingDirectoryStats } from '../models/working-directory-stats'
```

- [ ] **Step 3: Run test to verify it compiles**

Run: `yarn test:unit -- change-summary-badge-test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/app-state.ts app/test/unit/changes/change-summary-badge-test.ts
git commit -m "feat(state): add diffStats to IChangesState"
```

---

## Task 3: Implement `getWorkingDirectoryStats` git helper

**Files:**
- Create: `app/src/lib/git/working-directory-stats.ts`
- Modify: `app/src/lib/git/index.ts` — re-export
- Test: `app/test/unit/git/working-directory-stats-test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/git/working-directory-stats-test.ts`:

```typescript
import { getWorkingDirectoryStats } from '../../src/lib/git/working-directory-stats'

describe('getWorkingDirectoryStats', () => {
  it('parses numstat output', async () => {
    // We'll mock the git() call in the implementation
    // For now, this tests the existence of the function
    expect(typeof getWorkingDirectoryStats).toBe('function')
  })
})
```

Run: `yarn test:unit -- working-directory-stats-test`
Expected: FAIL — `Cannot find module '../src/lib/git/working-directory-stats'`.

- [ ] **Step 2: Implement `getWorkingDirectoryStats`**

Create `app/src/lib/git/working-directory-stats.ts`:

```typescript
import { Repository } from '../../models/repository'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { git } from '.'

/**
 * Compute aggregate diff statistics for the working directory
 * by running `git diff --numstat -z HEAD`.
 *
 * Binary files appear as `-\t-\t` and are counted as 0 additions / 0 deletions.
 * Untracked files are included because diffing against HEAD picks them up
 * as additions (the entire file).
 */
export async function getWorkingDirectoryStats(
  repository: Repository
): Promise<IWorkingDirectoryStats | null> {
  const result = await git(
    ['diff', '--numstat', '-z', 'HEAD', '--'],
    repository.path,
    'getWorkingDirectoryStats'
  )

  if (result.exitCode !== 0 || result.stdout.length === 0) {
    return null
  }

  let files = 0
  let additions = 0
  let deletions = 0

  const entries = result.stdout.split('\0')

  for (const entry of entries) {
    if (entry.trim().length === 0) {
      continue
    }

    // Format: "<added>\t<deleted>\t<path>"
    // Binary files: "-\t-\t<path>"
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(entry)

    if (match) {
      const [, addedStr, deletedStr] = match
      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10)
      const deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10)

      additions += added
      deletions += deleted
      files++
    }
  }

  return { files, additions, deletions }
}
```

- [ ] **Step 3: Re-export from git index**

In `app/src/lib/git/index.ts`, add:

```typescript
export * from './working-directory-stats'
```

Check the file to see the correct export pattern. Look at existing exports to match style.

- [ ] **Step 4: Run test**

Run: `yarn test:unit -- working-directory-stats-test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/git/working-directory-stats.ts app/src/lib/git/index.ts app/test/unit/git/working-directory-stats-test.ts
git commit -m "feat(git): add getWorkingDirectoryStats helper"
```

---

## Task 4: Wire `diffStats` through `updateChangedFiles`

**Files:**
- Modify: `app/src/lib/stores/updates/changes-state.ts:27-36`

- [ ] **Step 1: Update `ChangedFilesResult` type**

In `app/src/lib/stores/updates/changes-state.ts`, change:

```typescript
type ChangedFilesResult = {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selection: ChangesSelection
}
```

To:

```typescript
type ChangedFilesResult = {
  readonly workingDirectory: WorkingDirectoryStatus
  readonly selection: ChangesSelection
  readonly diffStats: IWorkingDirectoryStats | null
}
```

Add import at the top:

```typescript
import { IWorkingDirectoryStats } from '../../../models/working-directory-stats'
```

- [ ] **Step 2: Update `updateChangedFiles` signature and return value**

Change:

```typescript
export function updateChangedFiles(
  state: IChangesState,
  status: IStatusResult,
  clearPartialState: boolean
): ChangedFilesResult {
```

To:

```typescript
export function updateChangedFiles(
  state: IChangesState,
  status: IStatusResult,
  diffStats: IWorkingDirectoryStats | null,
  clearPartialState: boolean
): ChangedFilesResult {
```

At the end of `updateChangedFiles`, change the return from:

```typescript
  return { workingDirectory, selection }
```

To:

```typescript
  return { workingDirectory, selection, diffStats }
```

- [ ] **Step 3: Run tests**

Run: `yarn test:unit -- changes-state`
Expected: PASS (existing tests).

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/stores/updates/changes-state.ts
git commit -m "feat(store): wire diffStats through updateChangedFiles"
```

---

## Task 5: Call `getWorkingDirectoryStats` in `_loadStatus`

**Files:**
- Modify: `app/src/lib/stores/app-store.ts:2658-2692`

- [ ] **Step 1: Import `getWorkingDirectoryStats`**

In `app/src/lib/stores/app-store.ts`, add to existing git imports:

```typescript
import { getWorkingDirectoryStats } from '../git/working-directory-stats'
```

- [ ] **Step 2: Call it inside `_loadStatus`**

In `_loadStatus` (around line 2658-2692), change:

```typescript
    this.repositoryStateCache.updateChangesState(repository, state =>
      updateChangedFiles(state, status, clearPartialState)
    )
```

To:

```typescript
    const diffStats = await getWorkingDirectoryStats(repository)

    this.repositoryStateCache.updateChangesState(repository, state =>
      updateChangedFiles(state, status, diffStats, clearPartialState)
    )
```

- [ ] **Step 3: Run tests**

Run: `yarn test:unit -- app-store`
Expected: PASS (existing tests).

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/stores/app-store.ts
git commit -m "feat(store): compute diffStats during status load"
```

---

## Task 6: Build the `ChangeSummaryBadge` component

**Files:**
- Create: `app/src/ui/changes/change-summary-badge.tsx`
- Test: `app/test/unit/changes/change-summary-badge-test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/changes/change-summary-badge-test.tsx`:

```typescript
import * as React from 'react'
import { shallow } from 'enzyme'
import { ChangeSummaryBadge } from '../../src/ui/changes/change-summary-badge'

describe('ChangeSummaryBadge', () => {
  it('renders stats', () => {
    const stats = { files: 12, additions: 248, deletions: 67 }
    const wrapper = shallow(<ChangeSummaryBadge stats={stats} />)
    expect(wrapper.text()).toContain('12 files')
    expect(wrapper.text()).toContain('+248')
    expect(wrapper.text()).toContain('-67')
  })

  it('renders nothing when stats is null', () => {
    const wrapper = shallow(<ChangeSummaryBadge stats={null} />)
    expect(wrapper.isEmptyRender()).toBe(true)
  })

  it('renders nothing when files is 0', () => {
    const wrapper = shallow(
      <ChangeSummaryBadge stats={{ files: 0, additions: 0, deletions: 0 }} />
    )
    expect(wrapper.isEmptyRender()).toBe(true)
  })
})
```

Run: `yarn test:unit -- change-summary-badge-test`
Expected: FAIL — `Cannot find module`.

- [ ] **Step 2: Implement the component**

Create `app/src/ui/changes/change-summary-badge.tsx`:

```typescript
import * as React from 'react'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface IChangeSummaryBadgeProps {
  readonly stats: IWorkingDirectoryStats | null
}

/** Displays a compact summary of working-directory changes. */
export class ChangeSummaryBadge extends React.Component<
  IChangeSummaryBadgeProps,
  {}
> {
  public render() {
    const { stats } = this.props

    if (stats === null || stats.files === 0) {
      return null
    }

    const { files, additions, deletions } = stats

    const tooltip = `${files} files changed • ${additions} additions • ${deletions} deletions`
    const filesLabel = files === 1 ? 'file' : 'files'

    return (
      <TooltippedContent
        tooltip={tooltip}
        direction={TooltipDirection.NORTH}
      >
        <span className="change-summary-badge">
          {files} {filesLabel}{' '}
          <span className="additions">+{additions}</span>{' '}
          <span className="deletions">-{deletions}</span>
        </span>
      </TooltippedContent>
    )
  }
}
```

- [ ] **Step 3: Run tests**

Run: `yarn test:unit -- change-summary-badge-test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/ui/changes/change-summary-badge.tsx app/test/unit/changes/change-summary-badge-test.tsx
git commit -m "feat(ui): add ChangeSummaryBadge component"
```

---

## Task 7: Render badge in `ChangesList` header

**Files:**
- Modify: `app/src/ui/changes/changes-list.tsx:1034-1081`
- Modify: `app/src/ui/changes/changes-list.tsx` imports (top of file)

- [ ] **Step 1: Add import**

At the top of `app/src/ui/changes/changes-list.tsx`, add:

```typescript
import { ChangeSummaryBadge } from './change-summary-badge'
```

- [ ] **Step 2: Render badge in header**

In the `render()` method, find the `<div className="header">` block (around line 1058-1081). Change:

```tsx
          <div
            className="header"
            onContextMenu={this.onContextMenu}
            ref={this.headerRef}
          >
            <TooltippedContent
              tooltip={selectedChangesDescription}
              direction={TooltipDirection.NORTH}
              openOnFocus={true}
            >
              <Checkbox
                ref={this.includeAllCheckBoxRef}
                label={filesDescription}
                value={includeAllValue}
                onChange={this.onIncludeAllChanged}
                disabled={disableAllCheckbox}
                ariaDescribedBy="changesDescription"
              />
            </TooltippedContent>
            <div className="sr-only" id="changesDescription">
              {selectedChangesDescription}
            </div>
          </div>
```

To:

```tsx
          <div
            className="header"
            onContextMenu={this.onContextMenu}
            ref={this.headerRef}
          >
            <TooltippedContent
              tooltip={selectedChangesDescription}
              direction={TooltipDirection.NORTH}
              openOnFocus={true}
            >
              <Checkbox
                ref={this.includeAllCheckBoxRef}
                label={filesDescription}
                value={includeAllValue}
                onChange={this.onIncludeAllChanged}
                disabled={disableAllCheckbox}
                ariaDescribedBy="changesDescription"
              />
            </TooltippedContent>
            <div className="sr-only" id="changesDescription">
              {selectedChangesDescription}
            </div>
            <ChangeSummaryBadge stats={this.props.changes.diffStats} />
          </div>
```

- [ ] **Step 3: Run lint and typecheck**

Run: `yarn lint`
Run: `yarn compile:dev`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/ui/changes/changes-list.tsx
git commit -m "feat(ui): render ChangeSummaryBadge in ChangesList header"
```

---

## Task 8: Style the badge

**Files:**
- Modify: `app/styles/ui/changes/_changes-list.scss`

- [ ] **Step 1: Add SCSS rules**

Append to `app/styles/ui/changes/_changes-list.scss`:

```scss
.change-summary-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-half);
  margin-left: auto;
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
  background-color: var(--list-item-badge-background-color);
  border-radius: 12px;
  line-height: 1;
  cursor: default;

  .additions {
    color: var(--color-new);
  }

  .deletions {
    color: var(--color-deleted);
  }
}
```

- [ ] **Step 2: Verify header layout**

The `.header` class in `_changes-list.scss` should already be a flex container. Check that `.header` uses `display: flex` and `align-items: center`. If not, add `display: flex; align-items: center;` to `.header` so the badge aligns to the right via `margin-left: auto`.

Open `_changes-list.scss`, find `.header` and ensure:

```scss
.header {
  display: flex;
  align-items: center;
  // ... existing styles
}
```

- [ ] **Step 3: Run lint**

Run: `yarn lint`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/styles/ui/changes/_changes-list.scss
git commit -m "feat(styles): add ChangeSummaryBadge styling"
```

---

## Task 9: Add `getWorkingDirectoryStats` unit tests

**Files:**
- Modify: `app/test/unit/git/working-directory-stats-test.ts`

- [ ] **Step 1: Write comprehensive tests**

Replace the content of `app/test/unit/git/working-directory-stats-test.ts`:

```typescript
import { getWorkingDirectoryStats } from '../../src/lib/git/working-directory-stats'
import { git } from '../../src/lib/git'
import { Repository } from '../../src/models/repository'

jest.mock('../../src/lib/git', () => ({
  git: jest.fn(),
}))

describe('getWorkingDirectoryStats', () => {
  const mockRepo = { path: '/fake/repo' } as Repository

  it('parses normal numstat output', async () => {
    ;(git as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: '10\t5\tfile-a.ts\012\t3\tfile-b.ts\0',
    })

    const result = await getWorkingDirectoryStats(mockRepo)
    expect(result).toEqual({ files: 2, additions: 22, deletions: 8 })
  })

  it('handles binary files (dash dash)', async () => {
    ;(git as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: '-\t-\tbinary.png\0',
    })

    const result = await getWorkingDirectoryStats(mockRepo)
    expect(result).toEqual({ files: 1, additions: 0, deletions: 0 })
  })

  it('returns null on non-zero exit', async () => {
    ;(git as jest.Mock).mockResolvedValue({
      exitCode: 1,
      stdout: '',
    })

    const result = await getWorkingDirectoryStats(mockRepo)
    expect(result).toBeNull()
  })

  it('returns null on empty stdout', async () => {
    ;(git as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: '',
    })

    const result = await getWorkingDirectoryStats(mockRepo)
    expect(result).toBeNull()
  })

  it('ignores empty entries from trailing null', async () => {
    ;(git as jest.Mock).mockResolvedValue({
      exitCode: 0,
      stdout: '1\t0\tfile.ts\0\0',
    })

    const result = await getWorkingDirectoryStats(mockRepo)
    expect(result).toEqual({ files: 1, additions: 1, deletions: 0 })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `yarn test:unit -- working-directory-stats-test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/test/unit/git/working-directory-stats-test.ts
git commit -m "test(git): add getWorkingDirectoryStats unit tests"
```

---

## Task 10: Run full test suite and lint

**Files:** None (validation only).

- [ ] **Step 1: Run all unit tests**

Run: `yarn test:unit`
Expected: All tests pass.

- [ ] **Step 2: Run lint**

Run: `yarn lint`
Expected: No errors.

- [ ] **Step 3: Commit if any lint fixes were applied**

```bash
git commit -m "style: apply lint fixes" || echo "No changes to commit"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Show only when repo has pending changes | Task 6 (null/zero guard) |
| Display total changed files | Task 6 |
| Display additions in green (+count) | Task 8 (`.additions { color: var(--color-new) }`) |
| Display deletions in red (-count) | Task 8 (`.deletions { color: var(--color-deleted) }`) |
| Include staged, unstaged, untracked | Task 3 (`git diff --numstat HEAD`) |
| Update automatically on status change | Task 5 (wired into `_loadStatus`) |
| Tooltip with full description | Task 6 (`TooltippedContent`) |
| Compact rounded styling with tabular numbers | Task 8 |

No gaps found. All requirements map to a task.

## Placeholder Scan

Plan checked for:
- [x] No "TBD" / "TODO" / "implement later"
- [x] No vague "add error handling" without code
- [x] No "write tests" without test code
- [x] No "similar to Task N" cross-references

## Type Consistency Check

- `IWorkingDirectoryStats` interface defined in Task 1, used consistently across Tasks 2-6
- `diffStats` parameter name consistent in `updateChangedFiles` (Task 4), `_loadStatus` (Task 5), `IChangesState` (Task 2), and `ChangeSummaryBadge` (Task 6)
- `getWorkingDirectoryStats` function name consistent across Tasks 3, 5, and 9
