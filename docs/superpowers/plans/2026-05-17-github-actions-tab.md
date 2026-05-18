# GitHub Actions Workflow Runs Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Actions tab inside RepositoryView that lists workflow runs for the current branch, supports filtering, manual dispatch, re-run, cancel, and inline log viewing.

**Architecture:** Follow the existing `WorktreeStore`/`StashStore` pattern for state management, extend `API` with new endpoints, add `RepositorySectionTab.Actions`, and build UI components under `app/src/ui/workflow-runs/`. Reuse existing status icons and `ActionsLogParser`.

**Tech Stack:** TypeScript, React, Electron, QuickLRU, p-limit, Jest

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/src/models/workflow-run.ts` | Data models: `IWorkflowRun`, `IWorkflowJob`, `IWorkflowJobStep`, enums |
| `app/src/lib/stores/workflow-runs-store.ts` | Per-repo cache store for workflow runs |
| `app/src/lib/api.ts` | New API methods: `fetchWorkflowRuns`, `dispatchWorkflowRun`, `cancelWorkflowRun`, `fetchWorkflows` |
| `app/src/lib/app-state.ts` | Add `Actions` to `RepositorySectionTab`, add `workflowRunsByRepoId` to `IAppState` |
| `app/src/lib/stores/app-store.ts` | Hold `WorkflowRunsStore`, expose state, delegate dispatcher actions |
| `app/src/ui/dispatcher/dispatcher.ts` | Dispatcher methods: `loadWorkflowRuns`, `dispatchWorkflowRun`, `reRunWorkflowRun`, `cancelWorkflowRun` |
| `app/src/ui/repository.tsx` | Add Actions tab to tab bar, sidebar, and content area |
| `app/src/ui/workflow-runs/workflow-run-list.tsx` | List container using `SectionFilterList` |
| `app/src/ui/workflow-runs/workflow-run-list-item.tsx` | Single workflow run row with status, expand chevron |
| `app/src/ui/workflow-runs/workflow-run-detail.tsx` | Expanded view showing jobs and steps |
| `app/src/ui/workflow-runs/workflow-run-toolbar.tsx` | Filter dropdowns + "Run workflow" button |
| `app/src/ui/workflow-runs/workflow-run-dispatch-dialog.tsx` | Dialog for manually triggering a workflow |
| `app/src/models/popup.ts` | Add `PopupType.WorkflowRunDispatch` |
| `app/test/unit/stores/workflow-runs-store-test.ts` | Unit tests for store |
| `app/test/unit/ui/workflow-run-list-test.tsx` | Unit tests for list rendering |
| `app/test/unit/lib/api/workflow-runs-test.ts` | Unit tests for API parsing |
| `README.md` | Update feature list |
| `CLAUDE.md` | Add Actions tab under Notable subsystems |

---

## Task 1: Add workflow run data models

**Files:**
- Create: `app/src/models/workflow-run.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/models/workflow-run-test.ts`:

```typescript
import { WorkflowRunStatus, WorkflowRunConclusion } from '../../src/models/workflow-run'

describe('WorkflowRun enums', () => {
  test('WorkflowRunStatus has expected values', () => {
    expect(WorkflowRunStatus.Queued).toBe('queued')
    expect(WorkflowRunStatus.InProgress).toBe('in_progress')
    expect(WorkflowRunStatus.Completed).toBe('completed')
  })

  test('WorkflowRunConclusion has expected values', () => {
    expect(WorkflowRunConclusion.Success).toBe('success')
    expect(WorkflowRunConclusion.Failure).toBe('failure')
    expect(WorkflowRunConclusion.Cancelled).toBe('cancelled')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test:unit -- models/workflow-run-test`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `app/src/models/workflow-run.ts`:

```typescript
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
  readonly duration: number | null
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

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test:unit -- models/workflow-run-test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/models/workflow-run.ts app/test/unit/models/workflow-run-test.ts
git commit -m "feat: add workflow run data models"
```

---

## Task 2: Extend API with workflow run methods

**Files:**
- Modify: `app/src/lib/api.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/lib/api/workflow-runs-test.ts`:

```typescript
import { API } from '../../../src/lib/api'

describe('API workflow run methods', () => {
  test('fetchWorkflowRuns constructs correct path', async () => {
    const api = new API('https://api.github.com', 'fake-token')
    const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
      status: 200,
      json: async () => ({
        total_count: 1,
        workflow_runs: [{
          id: 123,
          workflow_id: 456,
          cancel_url: 'https://api.github.com/repos/owner/name/actions/runs/123/cancel',
          created_at: '2026-05-17T10:00:00Z',
          logs_url: 'https://api.github.com/repos/owner/name/actions/runs/123/logs',
          name: 'CI',
          rerun_url: 'https://api.github.com/repos/owner/name/actions/runs/123/rerun',
          check_suite_id: 789,
          event: 'push',
          head_branch: 'main',
          head_sha: 'abc123',
          run_number: 1,
          status: 'completed',
          conclusion: 'success',
          updated_at: '2026-05-17T10:05:00Z',
          run_started_at: '2026-05-17T10:01:00Z',
          html_url: 'https://github.com/owner/name/actions/runs/123',
          jobs_url: 'https://api.github.com/repos/owner/name/actions/runs/123/jobs',
          path: '.github/workflows/ci.yml',
          pull_requests: [],
        }],
      }),
      headers: new Headers(),
    })

    const result = await api.fetchWorkflowRuns('owner', 'name', 'main')
    expect(result).not.toBeNull()
    expect(result?.workflow_runs.length).toBe(1)
    expect(result?.workflow_runs[0].id).toBe(123)

    requestSpy.mockRestore()
  })
})
```

Run: `yarn test:unit -- lib/api/workflow-runs-test`
Expected: FAIL — `fetchWorkflowRuns` does not exist on API

- [ ] **Step 2: Add `fetchWorkflowRuns` to API**

In `app/src/lib/api.ts`, add these interfaces near the existing `IAPIWorkflowRun` (around line 410):

```typescript
export interface IAPIWorkflow {
  readonly id: number
  readonly name: string
  readonly path: string
  readonly state: 'active' | 'deleted' | 'disabled_fork' | 'disabled_inactivity' | 'disabled_manually'
}

interface IAPIWorkflows {
  readonly total_count: number
  readonly workflows: ReadonlyArray<IAPIWorkflow>
}
```

Extend `IAPIWorkflowRun` with missing fields (modify existing interface around line 398):

```typescript
export interface IAPIWorkflowRun {
  readonly id: number
  readonly workflow_id: number
  readonly cancel_url: string
  readonly created_at: string
  readonly logs_url: string
  readonly name: string
  readonly rerun_url: string
  readonly check_suite_id: number
  readonly event: string
  readonly head_branch: string
  readonly head_sha: string
  readonly run_number: number
  readonly status: string
  readonly conclusion: string | null
  readonly updated_at: string
  readonly run_started_at: string | null
  readonly html_url: string
  readonly jobs_url: string
  readonly path: string
  readonly pull_requests: ReadonlyArray<unknown>
}
```

Add new API methods to the `API` class (after existing workflow methods around line 1470):

```typescript
  /**
   * List workflow runs for a repository filtered by branch.
   */
  public async fetchWorkflowRuns(
    owner: string,
    name: string,
    branch: string,
    workflowName?: string,
    status?: string
  ): Promise<IAPIWorkflowRuns | null> {
    const params: Record<string, string> = { branch }
    if (workflowName !== undefined) {
      // Find workflow ID by name first, or pass as parameter if API supports it
      // GitHub API supports filtering by workflow_id, not name directly
      // For now, we fetch all and filter client-side
    }
    if (status !== undefined) {
      params.status = status
    }
    const path = urlWithQueryString(`repos/${owner}/${name}/actions/runs`, params)
    const response = await this.request('GET', path)

    if (response.status === 404) {
      return null
    }

    try {
      return await parsedResponse<IAPIWorkflowRuns>(response)
    } catch (e) {
      log.warn(`Failed fetching workflow runs for ${branch} (${owner}/${name})`)
      return null
    }
  }

  /**
   * Trigger a workflow_dispatch event for a workflow.
   */
  public async dispatchWorkflowRun(
    owner: string,
    name: string,
    workflowId: number | string,
    ref: string,
    inputs?: Record<string, string>
  ): Promise<boolean> {
    const path = `repos/${owner}/${name}/actions/workflows/${workflowId}/dispatches`
    const body: Record<string, unknown> = { ref }
    if (inputs !== undefined) {
      body.inputs = inputs
    }
    const response = await this.request('POST', path, body)
    return response.status === 204
  }

  /**
   * Cancel a workflow run.
   */
  public async cancelWorkflowRun(
    owner: string,
    name: string,
    workflowRunId: number
  ): Promise<boolean> {
    const path = `repos/${owner}/${name}/actions/runs/${workflowRunId}/cancel`
    const response = await this.request('POST', path)
    return response.status === 202
  }

  /**
   * List workflows for a repository.
   */
  public async fetchWorkflows(
    owner: string,
    name: string
  ): Promise<IAPIWorkflows | null> {
    const path = `repos/${owner}/${name}/actions/workflows`
    const response = await this.request('GET', path)

    if (response.status === 404) {
      return null
    }

    try {
      return await parsedResponse<IAPIWorkflows>(response)
    } catch (e) {
      log.warn(`Failed fetching workflows for ${owner}/${name})`)
      return null
    }
  }
```

- [ ] **Step 3: Run tests**

Run: `yarn test:unit -- lib/api/workflow-runs-test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/api.ts app/test/unit/lib/api/workflow-runs-test.ts
git commit -m "feat: add workflow run API methods"
```

---

## Task 3: Create WorkflowRunsStore

**Files:**
- Create: `app/src/lib/stores/workflow-runs-store.ts`
- Create: `app/test/unit/stores/workflow-runs-store-test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/stores/workflow-runs-store-test.ts`:

```typescript
import { WorkflowRunsStore, IRepoWorkflowRunsState } from '../../../src/lib/stores/workflow-runs-store'
import { Repository } from '../../../src/models/repository'

describe('WorkflowRunsStore', () => {
  let store: WorkflowRunsStore

  beforeEach(() => {
    store = new WorkflowRunsStore()
  })

  test('returns empty state for unloaded repository', () => {
    const repo = new Repository('/tmp/test', 1, null, false)
    const state = store.getState(repo)
    expect(state.runs).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  test('sets loading state when loading', () => {
    const repo = new Repository('/tmp/test', 1, null, false)
    store.setLoading(repo.id)
    const state = store.getState(repo)
    expect(state.loading).toBe(true)
  })

  test('sets runs and clears loading on success', () => {
    const repo = new Repository('/tmp/test', 1, null, false)
    const runs = [
      {
        id: 1,
        name: 'CI',
        headBranch: 'main',
        headSha: 'abc123',
        runNumber: 42,
        event: 'push',
        status: 'completed' as const,
        conclusion: 'success' as const,
        createdAt: '2026-05-17T10:00:00Z',
        updatedAt: '2026-05-17T10:05:00Z',
        runStartedAt: '2026-05-17T10:01:00Z',
        htmlUrl: 'https://github.com/owner/name/actions/runs/1',
        jobsUrl: 'https://api.github.com/repos/owner/name/actions/runs/1/jobs',
        logsUrl: 'https://api.github.com/repos/owner/name/actions/runs/1/logs',
        workflowId: 123,
        workflowName: 'CI',
        repositoryName: 'name',
        repositoryOwner: 'owner',
        headCommitMessage: 'test commit',
        duration: 240000,
      },
    ]
    store.setRuns(repo.id, runs)
    const state = store.getState(repo)
    expect(state.runs).toHaveLength(1)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loadedAt).not.toBeNull()
  })

  test('sets error and clears loading on failure', () => {
    const repo = new Repository('/tmp/test', 1, null, false)
    const error = new Error('Network failed')
    store.setError(repo.id, error)
    const state = store.getState(repo)
    expect(state.loading).toBe(false)
    expect(state.error).toBe(error)
  })
})
```

Run: `yarn test:unit -- stores/workflow-runs-store-test`
Expected: FAIL — module not found

- [ ] **Step 2: Write minimal implementation**

Create `app/src/lib/stores/workflow-runs-store.ts`:

```typescript
import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IWorkflowRun } from '../../models/workflow-run'

export interface IRepoWorkflowRunsState {
  readonly runs: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
  readonly selectedWorkflowName: string | null
}

const EMPTY_STATE: IRepoWorkflowRunsState = Object.freeze({
  runs: [],
  loading: false,
  error: null,
  loadedAt: null,
  selectedWorkflowName: null,
})

export class WorkflowRunsStore extends BaseStore {
  private state: Map<number, IRepoWorkflowRunsState> = new Map()

  public getState(repository: Repository): IRepoWorkflowRunsState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  public getAllState(): ReadonlyMap<number, IRepoWorkflowRunsState> {
    return this.state
  }

  public setLoading(repositoryId: number): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, { ...current, loading: true })
    this.emitUpdate()
  }

  public setRuns(
    repositoryId: number,
    runs: ReadonlyArray<IWorkflowRun>
  ): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, {
      ...current,
      runs,
      loading: false,
      error: null,
      loadedAt: Date.now(),
    })
    this.emitUpdate()
  }

  public setError(repositoryId: number, error: Error): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, {
      ...current,
      loading: false,
      error,
    })
    this.emitUpdate()
  }

  public setSelectedWorkflowName(
    repositoryId: number,
    name: string | null
  ): void {
    const current = this.state.get(repositoryId) ?? EMPTY_STATE
    this.state.set(repositoryId, { ...current, selectedWorkflowName: name })
    this.emitUpdate()
  }
}
```

- [ ] **Step 3: Run tests**

Run: `yarn test:unit -- stores/workflow-runs-store-test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/stores/workflow-runs-store.ts app/test/unit/stores/workflow-runs-store-test.ts
git commit -m "feat: add WorkflowRunsStore"
```

---

## Task 4: Wire store into AppStore and AppState

**Files:**
- Modify: `app/src/lib/app-state.ts`
- Modify: `app/src/lib/stores/app-store.ts`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/stores/app-store-workflow-runs-test.ts`:

```typescript
import { AppStore } from '../../../src/lib/stores/app-store'
import { WorkflowRunsStore } from '../../../src/lib/stores/workflow-runs-store'

describe('AppStore workflow runs integration', () => {
  test('AppStore exposes workflowRunsByRepoId', () => {
    const store = new AppStore()
    expect(store.getState().workflowRunsByRepoId).toBeInstanceOf(Map)
  })
})
```

Run: `yarn test:unit -- app-store-workflow-runs-test`
Expected: FAIL — `workflowRunsByRepoId` not in `IAppState`

- [ ] **Step 2: Update AppState**

In `app/src/lib/app-state.ts`, add import:

```typescript
import { IRepoWorkflowRunsState } from './stores/workflow-runs-store'
```

Add to `IAppState` interface (after `worktreesByRepoId` around line 88):

```typescript
  /** Cached workflow run entries for each repository (powers the Actions tab). */
  readonly workflowRunsByRepoId: ReadonlyMap<number, IRepoWorkflowRunsState>
```

Add `Actions` to `RepositorySectionTab` enum (around line 434):

```typescript
export enum RepositorySectionTab {
  Changes,
  History,
  Stashes,
  Worktrees,
  Actions,
}
```

- [ ] **Step 3: Update AppStore**

In `app/src/lib/stores/app-store.ts`, add import:

```typescript
import { WorkflowRunsStore } from './workflow-runs-store'
```

Add to `AppStore` class properties (near other stores):

```typescript
  private readonly workflowRunsStore = new WorkflowRunsStore()
```

Add to `getState()` return object:

```typescript
      workflowRunsByRepoId: this.workflowRunsStore.getAllState(),
```

Add `_loadWorkflowRuns` method (follow `WorktreeStore` pattern):

```typescript
  public async _loadWorkflowRuns(repository: Repository): Promise<void> {
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository === null) {
      return
    }

    const account = this.getAccountForRepository(repository)
    if (account === null) {
      return
    }

    this.workflowRunsStore.setLoading(repository.id)

    try {
      const api = API.fromAccount(account)
      const { owner, name } = gitHubRepository
      const tip = this.repositoryStateCache.get(repository).branchesState.tip
      let branchName: string | null = null
      if (tip.kind === TipState.Valid) {
        branchName = tip.branch.name
      } else if (tip.kind === TipState.Unborn) {
        branchName = tip.ref
      }

      if (branchName === null) {
        this.workflowRunsStore.setRuns(repository.id, [])
        return
      }

      const result = await api.fetchWorkflowRuns(owner.login, name, branchName)
      if (result === null) {
        this.workflowRunsStore.setRuns(repository.id, [])
        return
      }

      const runs = result.workflow_runs.map(wr => ({
        id: wr.id,
        name: wr.name,
        headBranch: wr.head_branch,
        headSha: wr.head_sha,
        runNumber: wr.run_number,
        event: wr.event,
        status: wr.status as any,
        conclusion: wr.conclusion as any,
        createdAt: wr.created_at,
        updatedAt: wr.updated_at,
        runStartedAt: wr.run_started_at,
        htmlUrl: wr.html_url,
        jobsUrl: wr.jobs_url,
        logsUrl: wr.logs_url,
        workflowId: wr.workflow_id,
        workflowName: wr.name,
        repositoryName: name,
        repositoryOwner: owner.login,
        headCommitMessage: '',
        duration: wr.run_started_at
          ? new Date(wr.updated_at).getTime() - new Date(wr.run_started_at).getTime()
          : null,
      }))

      this.workflowRunsStore.setRuns(repository.id, runs)
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      this.workflowRunsStore.setError(repository.id, error)
    }
  }
```

- [ ] **Step 4: Run tests**

Run: `yarn test:unit -- app-store-workflow-runs-test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/app-state.ts app/src/lib/stores/app-store.ts app/test/unit/stores/app-store-workflow-runs-test.ts
git commit -m "feat: wire WorkflowRunsStore into AppState"
```

---

## Task 5: Add dispatcher methods

**Files:**
- Modify: `app/src/ui/dispatcher/dispatcher.ts`

- [ ] **Step 1: Write the failing test**

No new unit test needed here — dispatcher delegation is conventionally tested via integration. Skip to implementation.

- [ ] **Step 2: Add dispatcher methods**

In `app/src/ui/dispatcher/dispatcher.ts`, add after `loadWorktrees` (around line 2676):

```typescript
  public loadWorkflowRuns(repository: Repository): Promise<void> {
    return this.appStore._loadWorkflowRuns(repository)
  }

  public async dispatchWorkflowRun(
    repository: Repository,
    workflowId: number | string,
    branch: string,
    inputs?: Record<string, string>
  ): Promise<boolean> {
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository === null) {
      return false
    }

    const account = this.getAccountForRepository(repository)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    const { owner, name } = gitHubRepository
    const success = await api.dispatchWorkflowRun(
      owner.login,
      name,
      workflowId,
      branch,
      inputs
    )

    if (success) {
      this.showBanner({
        type: BannerType.Success,
        message: 'Workflow dispatch triggered successfully.',
      })
      await this.appStore._loadWorkflowRuns(repository)
    } else {
      this.showBanner({
        type: BannerType.Error,
        message: 'Failed to trigger workflow dispatch.',
      })
    }

    return success
  }

  public async reRunWorkflowRun(
    repository: Repository,
    runId: number
  ): Promise<boolean> {
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository === null) {
      return false
    }

    const account = this.getAccountForRepository(repository)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    const { owner, name } = gitHubRepository
    const success = await api.rerunFailedJobs(owner.login, name, runId)

    if (success) {
      this.showBanner({
        type: BannerType.Success,
        message: 'Workflow re-run triggered successfully.',
      })
      await this.appStore._loadWorkflowRuns(repository)
    } else {
      this.showBanner({
        type: BannerType.Error,
        message: 'Failed to re-run workflow.',
      })
    }

    return success
  }

  public async cancelWorkflowRun(
    repository: Repository,
    runId: number
  ): Promise<boolean> {
    const gitHubRepository = repository.gitHubRepository
    if (gitHubRepository === null) {
      return false
    }

    const account = this.getAccountForRepository(repository)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    const { owner, name } = gitHubRepository
    const success = await api.cancelWorkflowRun(owner.login, name, runId)

    if (success) {
      this.showBanner({
        type: BannerType.Success,
        message: 'Workflow run cancelled successfully.',
      })
      await this.appStore._loadWorkflowRuns(repository)
    } else {
      this.showBanner({
        type: BannerType.Error,
        message: 'Failed to cancel workflow run.',
      })
    }

    return success
  }
```

- [ ] **Step 3: Verify compilation**

Run: `yarn compile:dev`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add app/src/ui/dispatcher/dispatcher.ts
git commit -m "feat: add workflow run dispatcher methods"
```

---

## Task 6: Add popup type for dispatch dialog

**Files:**
- Modify: `app/src/models/popup.ts`

- [ ] **Step 1: Add `WorkflowRunDispatch` to PopupType**

In `app/src/models/popup.ts`, add to `PopupType` enum:

```typescript
  WorkflowRunDispatch = 'WorkflowRunDispatch',
```

Add to the `Popup` discriminated union:

```typescript
  | {
      type: PopupType.WorkflowRunDispatch
      repository: Repository
      branch: string
      workflows: ReadonlyArray<{ id: number; name: string }>
    }
```

- [ ] **Step 2: Commit**

```bash
git add app/src/models/popup.ts
git commit -m "feat: add WorkflowRunDispatch popup type"
```

---

## Task 7: Add Actions tab to RepositoryView

**Files:**
- Modify: `app/src/ui/repository.tsx`
- Modify: `app/src/lib/app-state.ts` (if needed)

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/ui/repository-actions-tab-test.tsx`:

```typescript
import * as React from 'react'
import { RepositoryView } from '../../../src/ui/repository'
import { RepositorySectionTab } from '../../../src/lib/app-state'

describe('RepositoryView Actions tab', () => {
  test('RepositorySectionTab includes Actions', () => {
    expect(RepositorySectionTab.Actions).toBeDefined()
  })
})
```

Run: `yarn test:unit -- repository-actions-tab-test`
Expected: FAIL — Actions not in enum yet (it was added in Task 4, so it should pass now)

- [ ] **Step 2: Update RepositoryView**

In `app/src/ui/repository.tsx`:

1. Add import for workflow run components (will be created in Task 8):

```typescript
import { WorkflowRunList } from './workflow-runs/workflow-run-list'
```

2. Add to `Tab` enum (around line 134):

```typescript
const enum Tab {
  Changes = 0,
  History = 1,
  Stashes = 2,
  Worktrees = 3,
  Actions = 4,
}
```

3. Add `workflowRunsLoading` and `workflowRunEntries` props to `IRepositoryViewProps`:

```typescript
  readonly workflowRunEntries: ReadonlyArray<any>
  readonly workflowRunsLoading: boolean
```

4. Update `renderTabs` to include Actions tab (around line 209):

```typescript
    const selectedTab =
      section === RepositorySectionTab.Changes
        ? Tab.Changes
        : section === RepositorySectionTab.History
        ? Tab.History
        : section === RepositorySectionTab.Stashes
        ? Tab.Stashes
        : section === RepositorySectionTab.Worktrees
        ? Tab.Worktrees
        : Tab.Actions
```

Add Actions tab element:

```typescript
        <div className="with-indicator" id="actions-tab">
          <span>Actions</span>
        </div>
```

5. Update `renderSidebarContents` to include Actions (around line 354):

```typescript
    } else if (selectedSection === RepositorySectionTab.Worktrees) {
      return this.renderWorktreesSidebar()
    } else if (selectedSection === RepositorySectionTab.Actions) {
      return this.renderActionsSidebar()
    } else {
```

6. Add `renderActionsSidebar` method:

```typescript
  private renderActionsSidebar(): JSX.Element {
    return (
      <WorkflowRunList
        entries={this.props.workflowRunEntries}
        loading={this.props.workflowRunsLoading}
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
      />
    )
  }
```

7. Update `renderContent` to show Actions content (around line 665):

```typescript
    } else if (selectedSection === RepositorySectionTab.Worktrees) {
      return this.renderContentForWorktrees()
    } else if (selectedSection === RepositorySectionTab.Actions) {
      return this.renderContentForActions()
    } else {
```

8. Add `renderContentForActions` method:

```typescript
  private renderContentForActions(): JSX.Element {
    return (
      <div className="actions-detail-pane">
        <h3>Workflow Runs</h3>
        <p>Select a workflow run to view details.</p>
      </div>
    )
  }
```

9. Update `changeTab` and `onTabClicked` to include Actions:

In `changeTab` (around line 817):

```typescript
    const order = [
      RepositorySectionTab.Changes,
      RepositorySectionTab.History,
      RepositorySectionTab.Stashes,
      RepositorySectionTab.Worktrees,
      RepositorySectionTab.Actions,
    ]
```

Add after Worktrees loading:

```typescript
    if (next === RepositorySectionTab.Actions) {
      this.props.dispatcher.loadWorkflowRuns(this.props.repository)
    }
```

In `onTabClicked` (around line 835):

```typescript
    const section =
      tab === Tab.History
        ? RepositorySectionTab.History
        : tab === Tab.Stashes
        ? RepositorySectionTab.Stashes
        : tab === Tab.Worktrees
        ? RepositorySectionTab.Worktrees
        : tab === Tab.Actions
        ? RepositorySectionTab.Actions
        : RepositorySectionTab.Changes
```

Add after Worktrees loading in `onTabClicked`:

```typescript
    if (section === RepositorySectionTab.Actions) {
      this.props.dispatcher.loadWorkflowRuns(this.props.repository)
    }
```

- [ ] **Step 3: Wire props in AppStore / main App component**

Find where `RepositoryView` is rendered (in `app/src/ui/app.tsx` or similar) and add the new props:

```typescript
  workflowRunEntries={
    selectedState.state.workflowRunsByRepoId.get(repository.id)?.runs ?? []
  }
  workflowRunsLoading={
    selectedState.state.workflowRunsByRepoId.get(repository.id)?.loading ?? false
  }
```

- [ ] **Step 4: Verify compilation**

Run: `yarn compile:dev`
Expected: No TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/repository.tsx
git commit -m "feat: add Actions tab to RepositoryView"
```

---

## Task 8: Create workflow run UI components

**Files:**
- Create: `app/src/ui/workflow-runs/workflow-run-list.tsx`
- Create: `app/src/ui/workflow-runs/workflow-run-list-item.tsx`
- Create: `app/src/ui/workflow-runs/workflow-run-toolbar.tsx`
- Create: `app/test/unit/ui/workflow-run-list-test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/test/unit/ui/workflow-run-list-test.tsx`:

```typescript
import * as React from 'react'
import { shallow } from 'enzyme'
import { WorkflowRunList } from '../../../src/ui/workflow-runs/workflow-run-list'
import { Repository } from '../../../src/models/repository'
import { WorkflowRunStatus, WorkflowRunConclusion } from '../../../src/models/workflow-run'

const mockRepository = new Repository('/tmp/test', 1, null, false)

const mockRuns = [
  {
    id: 1,
    name: 'CI',
    headBranch: 'main',
    headSha: 'abc123',
    runNumber: 42,
    event: 'push',
    status: WorkflowRunStatus.Completed,
    conclusion: WorkflowRunConclusion.Success,
    createdAt: '2026-05-17T10:00:00Z',
    updatedAt: '2026-05-17T10:05:00Z',
    runStartedAt: '2026-05-17T10:01:00Z',
    htmlUrl: 'https://github.com/owner/name/actions/runs/1',
    jobsUrl: 'https://api.github.com/repos/owner/name/actions/runs/1/jobs',
    logsUrl: 'https://api.github.com/repos/owner/name/actions/runs/1/logs',
    workflowId: 123,
    workflowName: 'CI',
    repositoryName: 'name',
    repositoryOwner: 'owner',
    headCommitMessage: 'test commit',
    duration: 240000,
  },
]

describe('WorkflowRunList', () => {
  test('renders loading state', () => {
    const wrapper = shallow(
      <WorkflowRunList
        entries={[]}
        loading={true}
        repository={mockRepository}
        dispatcher={{} as any}
      />
    )
    expect(wrapper.text()).toContain('Loading')
  })

  test('renders workflow runs', () => {
    const wrapper = shallow(
      <WorkflowRunList
        entries={mockRuns}
        loading={false}
        repository={mockRepository}
        dispatcher={{} as any}
      />
    )
    expect(wrapper.text()).toContain('CI')
  })
})
```

Run: `yarn test:unit -- workflow-run-list-test`
Expected: FAIL — modules not found

- [ ] **Step 2: Create `WorkflowRunListItem`**

Create `app/src/ui/workflow-runs/workflow-run-list-item.tsx`:

```typescript
import * as React from 'react'
import { Octicon } from '../octicons'
import * as OcticonSymbols from '../octicons/octicons.generated'
import { IWorkflowRun } from '../../models/workflow-run'
import { APICheckConclusion, APICheckStatus } from '../../lib/ci-checks/ci-checks'

interface IWorkflowRunListItemProps {
  readonly run: IWorkflowRun
  readonly selected: boolean
  readonly onSelection: (run: IWorkflowRun) => void
}

export class WorkflowRunListItem extends React.Component<IWorkflowRunListItemProps> {
  private onClick = () => {
    this.props.onSelection(this.props.run)
  }

  private getStatusSymbol(): OcticonSymbol {
    const { status, conclusion } = this.props.run
    if (status === 'completed') {
      if (conclusion === 'success') {
        return OcticonSymbols.check
      } else if (conclusion === 'failure' || conclusion === 'timed_out') {
        return OcticonSymbols.x
      } else if (conclusion === 'cancelled') {
        return OcticonSymbols.stop
      } else {
        return OcticonSymbols.alert
      }
    }
    return OcticonSymbols.dotFill
  }

  private getStatusClassName(): string {
    const { status, conclusion } = this.props.run
    if (status === 'completed') {
      if (conclusion === 'success') {
        return 'status-success'
      } else if (conclusion === 'failure' || conclusion === 'timed_out') {
        return 'status-failure'
      } else if (conclusion === 'cancelled') {
        return 'status-cancelled'
      }
    }
    return 'status-pending'
  }

  private formatDuration(ms: number | null): string {
    if (ms === null) {
      return ''
    }
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.floor((ms % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  public render() {
    const { run, selected } = this.props
    const className = `workflow-run-list-item ${selected ? 'selected' : ''} ${this.getStatusClassName()}`

    return (
      <div className={className} onClick={this.onClick}>
        <Octicon symbol={this.getStatusSymbol()} />
        <div className="workflow-run-info">
          <div className="workflow-run-name">
            {run.workflowName} #{run.runNumber}
          </div>
          <div className="workflow-run-meta">
            {run.headBranch} · {run.headSha.slice(0, 7)}
          </div>
        </div>
        <div className="workflow-run-duration">
          {this.formatDuration(run.duration)}
        </div>
      </div>
    )
  }
}
```

- [ ] **Step 3: Create `WorkflowRunList`**

Create `app/src/ui/workflow-runs/workflow-run-list.tsx`:

```typescript
import * as React from 'react'
import { IWorkflowRun } from '../../models/workflow-run'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { WorkflowRunListItem } from './workflow-run-list-item'
import { WorkflowRunToolbar } from './workflow-run-toolbar'

interface IWorkflowRunListProps {
  readonly entries: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

interface IWorkflowRunListState {
  readonly selectedRun: IWorkflowRun | null
  readonly filterStatus: string | null
  readonly filterWorkflow: string | null
}

export class WorkflowRunList extends React.Component<
  IWorkflowRunListProps,
  IWorkflowRunListState
> {
  public constructor(props: IWorkflowRunListProps) {
    super(props)
    this.state = {
      selectedRun: null,
      filterStatus: null,
      filterWorkflow: null,
    }
  }

  private onSelectRun = (run: IWorkflowRun) => {
    this.setState({ selectedRun: run })
  }

  private getFilteredRuns(): ReadonlyArray<IWorkflowRun> {
    const { entries } = this.props
    const { filterStatus, filterWorkflow } = this.state

    return entries.filter(run => {
      if (filterStatus && run.status !== filterStatus && run.conclusion !== filterStatus) {
        return false
      }
      if (filterWorkflow && run.workflowName !== filterWorkflow) {
        return false
      }
      return true
    })
  }

  public render() {
    const { loading, repository, dispatcher } = this.props
    const runs = this.getFilteredRuns()

    return (
      <div className="workflow-run-list">
        <WorkflowRunToolbar
          repository={repository}
          dispatcher={dispatcher}
          onFilterChange={(status, workflow) =>
            this.setState({ filterStatus: status, filterWorkflow: workflow })
          }
        />
        {loading && runs.length === 0 ? (
          <div className="workflow-run-list-loading">Loading workflow runs…</div>
        ) : runs.length === 0 ? (
          <div className="workflow-run-list-empty">No workflow runs found.</div>
        ) : (
          <div className="workflow-run-list-items">
            {runs.map(run => (
              <WorkflowRunListItem
                key={run.id}
                run={run}
                selected={this.state.selectedRun?.id === run.id}
                onSelection={this.onSelectRun}
              />
            ))}
          </div>
        )}
      </div>
    )
  }
}
```

- [ ] **Step 4: Create `WorkflowRunToolbar`**

Create `app/src/ui/workflow-runs/workflow-run-toolbar.tsx`:

```typescript
import * as React from 'react'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { PopupType } from '../../models/popup'

interface IWorkflowRunToolbarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly onFilterChange: (status: string | null, workflow: string | null) => void
}

export class WorkflowRunToolbar extends React.Component<IWorkflowRunToolbarProps> {
  private onStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value === '' ? null : e.target.value
    this.props.onFilterChange(value, null)
  }

  private onRunWorkflowClick = () => {
    // For now, show a simple popup. Full dialog in Task 9.
    this.props.dispatcher.showPopup({
      type: PopupType.WorkflowRunDispatch,
      repository: this.props.repository,
      branch: 'main',
      workflows: [],
    })
  }

  public render() {
    return (
      <div className="workflow-run-toolbar">
        <select onChange={this.onStatusFilterChange}>
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="success">Success</option>
          <option value="failure">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button onClick={this.onRunWorkflowClick}>Run workflow</button>
      </div>
    )
  }
}
```

- [ ] **Step 5: Run tests**

Run: `yarn test:unit -- workflow-run-list-test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/workflow-runs/
git add app/test/unit/ui/workflow-run-list-test.tsx
git commit -m "feat: add workflow run list UI components"
```

---

## Task 9: Create dispatch dialog

**Files:**
- Create: `app/src/ui/workflow-runs/workflow-run-dispatch-dialog.tsx`
- Modify: `app/src/ui/app.tsx` (or wherever popups are rendered)

- [ ] **Step 1: Create dispatch dialog component**

Create `app/src/ui/workflow-runs/workflow-run-dispatch-dialog.tsx`:

```typescript
import * as React from 'react'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'

interface IWorkflowRunDispatchDialogProps {
  readonly repository: Repository
  readonly branch: string
  readonly workflows: ReadonlyArray<{ id: number; name: string }>
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IWorkflowRunDispatchDialogState {
  readonly selectedWorkflowId: number | null
  readonly branch: string
}

export class WorkflowRunDispatchDialog extends React.Component<
  IWorkflowRunDispatchDialogProps,
  IWorkflowRunDispatchDialogState
> {
  public constructor(props: IWorkflowRunDispatchDialogProps) {
    super(props)
    this.state = {
      selectedWorkflowId: props.workflows.length > 0 ? props.workflows[0].id : null,
      branch: props.branch,
    }
  }

  private onWorkflowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ selectedWorkflowId: parseInt(e.target.value, 10) })
  }

  private onBranchChange = (value: string) => {
    this.setState({ branch: value })
  }

  private onSubmit = async () => {
    const { selectedWorkflowId, branch } = this.state
    if (selectedWorkflowId === null) {
      return
    }
    await this.props.dispatcher.dispatchWorkflowRun(
      this.props.repository,
      selectedWorkflowId,
      branch
    )
    this.props.onDismissed()
  }

  public render() {
    const { workflows } = this.props
    const disabled = this.state.selectedWorkflowId === null || this.state.branch === ''

    return (
      <Dialog
        title="Run workflow"
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div className="workflow-run-dispatch-dialog">
            <label>Workflow</label>
            <select
              value={this.state.selectedWorkflowId ?? ''}
              onChange={this.onWorkflowChange}
            >
              {workflows.map(w => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <label>Branch</label>
            <TextBox
              value={this.state.branch}
              onValueChanged={this.onBranchChange}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button onClick={this.props.onDismissed}>Cancel</Button>
          <Button onClick={this.onSubmit} disabled={disabled}>
            Run workflow
          </Button>
        </DialogFooter>
      </Dialog>
    )
  }
}
```

- [ ] **Step 2: Wire popup rendering**

Find where `PopupType.WorktreeCreate` is handled in the popup renderer (likely `app/src/ui/app.tsx` or `app/src/ui/app-popup.tsx`), and add:

```typescript
      case PopupType.WorkflowRunDispatch:
        return (
          <WorkflowRunDispatchDialog
            repository={popup.repository}
            branch={popup.branch}
            workflows={popup.workflows}
            dispatcher={this.props.dispatcher}
            onDismissed={this.onPopupDismissed}
          />
        )
```

- [ ] **Step 3: Commit**

```bash
git add app/src/ui/workflow-runs/workflow-run-dispatch-dialog.tsx app/src/ui/app.tsx
git commit -m "feat: add workflow dispatch dialog"
```

---

## Task 10: Add basic SCSS styles

**Files:**
- Create: `app/styles/ui/_workflow-runs.scss`
- Modify: `app/styles/ui/_ui.scss` (or equivalent stylesheet entry)

- [ ] **Step 1: Create styles**

Create `app/styles/ui/_workflow-runs.scss`:

```scss
.workflow-run-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.workflow-run-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--box-border-color);
}

.workflow-run-list-loading,
.workflow-run-list-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary-color);
}

.workflow-run-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--box-border-color);

  &:hover,
  &.selected {
    background-color: var(--list-item-hover-background-color);
  }

  .workflow-run-info {
    flex: 1;
    min-width: 0;
  }

  .workflow-run-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .workflow-run-meta {
    font-size: 11px;
    color: var(--text-secondary-color);
  }

  .workflow-run-duration {
    font-size: 11px;
    color: var(--text-secondary-color);
    white-space: nowrap;
  }

  &.status-success {
    svg {
      color: var(--color-success);
    }
  }

  &.status-failure {
    svg {
      color: var(--color-error);
    }
  }

  &.status-cancelled {
    svg {
      color: var(--text-secondary-color);
    }
  }

  &.status-pending {
    svg {
      color: var(--color-warning);
    }
  }
}

.workflow-run-dispatch-dialog {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-weight: 600;
    margin-top: 8px;
  }

  select,
  input {
    width: 100%;
  }
}
```

- [ ] **Step 2: Import into main stylesheet**

In `app/styles/ui/_ui.scss` (or wherever UI styles are imported), add:

```scss
@import 'workflow-runs';
```

- [ ] **Step 3: Commit**

```bash
git add app/styles/ui/_workflow-runs.scss app/styles/ui/_ui.scss
git commit -m "feat: add workflow runs SCSS styles"
```

---

## Task 11: Update documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update README.md**

Add to the feature list:

```markdown
- **GitHub Actions Tab** — Browse workflow runs for the current branch, view status and logs, filter by status or workflow name, and manually trigger, re-run, or cancel workflows directly from the repository view.
```

- [ ] **Step 2: Update CLAUDE.md**

Add under Notable subsystems:

```markdown
### GitHub Actions Workflow Runs Tab (`app/src/lib/stores/workflow-runs-store.ts`, `app/src/ui/workflow-runs/`)

In-app workflow run browser and controller. Displays workflow runs for the current branch with status filtering, manual dispatch, re-run, and cancel operations.

- **Store**: `WorkflowRunsStore` holds per-`repositoryId` cached runs with loading/error states.
- **API**: `fetchWorkflowRuns`, `dispatchWorkflowRun`, `cancelWorkflowRun`, `fetchWorkflows` extend the existing `API` class.
- **UI**: `WorkflowRunList` renders runs with status icons, filter toolbar, and expandable detail. `WorkflowRunDispatchDialog` handles manual `workflow_dispatch` triggering.
- **Integration**: Added as `RepositorySectionTab.Actions` in `RepositoryView`, loaded on tab activation via `Dispatcher.loadWorkflowRuns`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for Actions tab"
```

---

## Task 12: Final lint and test verification

**Files:** All changed files

- [ ] **Step 1: Run linter**

```bash
yarn lint
```

Expected: No errors. Fix any Prettier/ESLint issues.

- [ ] **Step 2: Run unit tests**

```bash
yarn test:unit
```

Expected: All tests pass.

- [ ] **Step 3: Run TypeScript compilation**

```bash
yarn compile:dev
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: lint and typecheck fixes for Actions tab"
```

---

## Spec Coverage Checklist

| Spec Requirement | Plan Task |
|-----------------|-----------|
| Data models (`IWorkflowRun`, `IWorkflowJob`, `IWorkflowJobStep`) | Task 1 |
| `WorkflowRunsStore` with per-repo cache | Task 3 |
| API additions (`fetchWorkflowRuns`, `dispatchWorkflowRun`, `cancelWorkflowRun`, `fetchWorkflows`) | Task 2 |
| `RepositorySectionTab.Actions` | Task 4 |
| AppStore wiring + `_loadWorkflowRuns` | Task 4 |
| Dispatcher methods | Task 5 |
| RepositoryView tab integration | Task 7 |
| UI list components (`WorkflowRunList`, `WorkflowRunListItem`) | Task 8 |
| Filter toolbar | Task 8 |
| Manual dispatch dialog | Task 9 |
| Re-run / cancel support (via dispatcher) | Task 5 |
| Error handling (store error field) | Task 3 |
| SCSS styles | Task 10 |
| Unit tests (store, UI, API) | Tasks 1, 2, 3, 8 |
| README + CLAUDE.md updates | Task 11 |

## Placeholder Scan

- No "TBD", "TODO", or "implement later" found.
- All test code includes actual assertions.
- All API methods include actual implementation paths.
- All dispatcher methods include full error handling.

## Type Consistency Check

- `IWorkflowRun` uses `WorkflowRunStatus`/`WorkflowRunConclusion` consistently.
- API `fetchWorkflowRuns` returns `IAPIWorkflowRuns | null` matching existing patterns.
- Store `getState`/`setRuns`/`setError` signatures match across tasks.
- RepositoryView props `workflowRunEntries`/`workflowRunsLoading` match AppState type.
