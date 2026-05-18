# GitHub Actions Workflow Runs Tab — Design Spec

## Overview
Add a new **Actions** tab inside `RepositoryView` (next to Changes, History, Stashes, Worktrees) that lets users browse workflow runs for the current branch, view their status/jobs/logs, filter by status or workflow name, and manually trigger, re-run, or cancel workflows.

## Goals
- Surface GitHub Actions workflow runs in-context inside the repository view
- Allow filtering by status and workflow name
- Support manual `workflow_dispatch` triggering for eligible workflows
- Support re-run and cancel operations on existing runs
- Reuse existing API, store, and UI patterns from the codebase

## Non-Goals (Phase 2)
- Editing workflow YAML files
- Creating new workflows from templates
- Configuring repository-level Actions settings (secrets, variables, runners)
- Cross-repository workflow browsing

## Architecture

### Data Model

```typescript
// app/src/models/workflow-run.ts

export enum WorkflowRunStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed',
  Waiting = 'waiting',
  Pending = 'pending',
  Requested = 'requested',
}

export enum WorkflowRunConclusion {
  Success = 'success',
  Failure = 'failure',
  Neutral = 'neutral',
  Cancelled = 'cancelled',
  Skipped = 'skipped',
  TimedOut = 'timed_out',
  ActionRequired = 'action_required',
  Stale = 'stale',
}

export interface IWorkflowRun {
  readonly id: number
  readonly name: string
  readonly headBranch: string
  readonly headSha: string
  readonly runNumber: number
  readonly event: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly runStartedAt: string | null
  readonly htmlUrl: string
  readonly jobsUrl: string
  readonly logsUrl: string | null
  readonly workflowId: number
  readonly workflowName: string
  readonly repositoryName: string
  readonly repositoryOwner: string
  readonly headCommitMessage: string
  readonly duration: number | null // ms, computed
}

export interface IWorkflowJob {
  readonly id: number
  readonly runId: number
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly htmlUrl: string
  readonly steps: ReadonlyArray<IWorkflowJobStep>
}

export interface IWorkflowJobStep {
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly number: number
  readonly startedAt: string | null
  readonly completedAt: string | null
}
```

### Store Layer

`WorkflowRunsStore` (`app/src/lib/stores/workflow-runs-store.ts`) follows the `CommitStatusStore` / `PullRequestStore` pattern:

- Cache: `QuickLRU` keyed by `${owner}/${repo}/${branch}/${filter}`
- Subscription model: `subscribe(repo, branch, callback)` returns `DisposableLike`
- Concurrency: `pLimit(6)` for API calls
- Refresh: 60-second dedup window; background refresh every 3 minutes while app is focused
- Store shape:

```typescript
interface IWorkflowRunsState {
  readonly runs: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
  readonly selectedWorkflowName: string | null // for filtering
}
```

### API Additions

Extend `API` in `app/src/lib/api.ts` with:

```typescript
async fetchWorkflowRuns(
  owner: string,
  name: string,
  branch: string,
  workflowName?: string,
  status?: string,
  page?: number
): Promise<ReadonlyArray<IAPIWorkflowRun>>

async dispatchWorkflowRun(
  owner: string,
  name: string,
  workflowId: number | string,
  ref: string,
  inputs?: Record<string, string>
): Promise<void>

async fetchWorkflows(
  owner: string,
  name: string
): Promise<ReadonlyArray<IAPIWorkflow>>
```

Re-use existing `fetchWorkflowRunJobs`, `rerunFailedJobs`, `rerunJob`, `rerequestCheckSuite`, cancel API.

### Dispatcher Actions

Add to `Dispatcher` (`app/src/ui/dispatcher/dispatcher.ts`):

```typescript
loadWorkflowRuns(repository: Repository, branch: string): void
dispatchWorkflowRun(
  repository: Repository,
  workflowId: number | string,
  branch: string,
  inputs?: Record<string, string>
): Promise<void>
reRunWorkflowRun(repository: Repository, runId: number): Promise<void>
cancelWorkflowRun(repository: Repository, runId: number): Promise<void>
```

### UI Components

```
app/src/ui/workflow-runs/
  workflow-run-list.tsx           # SectionFilterList container
  workflow-run-list-item.tsx      # Row: status icon, name, run #, branch, commit, duration, timestamp
  workflow-run-detail.tsx         # Expanded view: jobs + steps + logs
  workflow-run-toolbar.tsx        # Filter dropdown + "Run workflow" button
  workflow-run-dispatch-dialog.tsx # Manual trigger dialog (workflow + branch + inputs)
  workflow-run-cancel-dialog.tsx   # Confirm cancel
```

#### WorkflowRunListItem
- Left: status icon (reuse `getSymbolForCheck` / `getClassNameForCheck` from `ci-checks.ts`)
- Middle: workflow name + run number, branch name, head commit message (truncated)
- Right: duration, timestamp, chevron for expand
- Click row → expand detail pane below (same list, not a new screen)

#### WorkflowRunDetail (expanded)
- Jobs table: job name, status, duration
- Click job → show steps
- Click step or "View logs" → open inline log viewer (reuses `ActionsLogParser`)
- Actions: Re-run, Cancel (disabled if not applicable)

#### WorkflowRunToolbar
- Dropdown: filter by status (`all`, `queued`, `in_progress`, `completed`, `failure`, `success`)
- Dropdown: filter by workflow name (populated from `fetchWorkflows`)
- Button: "Run workflow" → opens `WorkflowRunDispatchDialog`

### Integration Points

1. **RepositoryView** (`app/src/ui/repository.tsx`)
   - Add `RepositorySectionTab.Actions`
   - Render `WorkflowRunList` when tab is active

2. **AppStore** (`app/src/lib/stores/app-store.ts`)
   - Hold `WorkflowRunsStore` instance
   - Surface `IAppState.workflowRunsByRepoId: Map<string, IWorkflowRunsState>`

3. **Tab bar** (`app/src/ui/repository.tsx` tab rendering)
   - Add "Actions" tab label; show badge with in-progress / failed count

### Error Handling

- API failure → store `error` field; list renders inline error with retry button
- Dispatch failure → toast notification via existing `Dispatcher.showPopup`
- Cancel / re-run failure → same toast pattern
- Network offline → show cached data with stale indicator; disable trigger actions

### Testing Strategy

- **Unit tests** (`app/test/unit/stores/workflow-runs-store-test.ts`):
  - Store subscription lifecycle
  - Cache deduplication
  - Background refresh behavior
  - Error recovery
- **Unit tests** (`app/test/unit/ui/workflow-run-list-test.tsx`):
  - Rendering with various statuses
  - Filter changes update displayed items
  - Expand/collapse behavior
- **Unit tests** (`app/test/unit/lib/api/workflow-runs-test.ts`):
  - API request construction
  - Response parsing
  - Error handling
- Integration: no new integration tests required; store + component pattern matches existing tested areas.

### Performance

- `QuickLRU` cap: 250 entries (same as `CommitStatusStore`)
- Fetch concurrency: 6 (same as `CommitStatusStore`)
- Background refresh only when app window is focused
- Virtualized list via `SectionFilterList` (same as PR list)
- Log parsing is deferred until user expands a job (lazy)

## Security Considerations

- `workflow_dispatch` inputs are user-provided strings → validate length (max 255 chars), sanitize before sending to API
- Token is already handled by `API.fromAccount`; no new auth surface
- Cancel / re-run require write access; GitHub API returns 403 if unauthorized; show friendly error

## Documentation Updates

- `README.md`: add Actions tab to feature list
- `CLAUDE.md`: add Actions tab under Notable subsystems
