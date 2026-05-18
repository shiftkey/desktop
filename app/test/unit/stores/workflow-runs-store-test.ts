import { Repository } from '../../../src/models/repository'
import {
  WorkflowRunStatus,
  WorkflowRunConclusion,
  IWorkflowRun,
} from '../../../src/models/workflow-run'
import { WorkflowRunsStore } from '../../../src/lib/stores/workflow-runs-store'

function makeRepo(id: number, path: string): Repository {
  return new Repository(path, id, null, false)
}

function makeRun(overrides?: Partial<IWorkflowRun>): any {
  return {
    id: 1,
    name: 'Test Run',
    headBranch: 'main',
    headSha: 'abc123',
    runNumber: 1,
    event: 'push',
    status: WorkflowRunStatus.Completed,
    conclusion: WorkflowRunConclusion.Success,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    runStartedAt: '2024-01-01T00:00:00Z',
    htmlUrl: 'https://github.com/foo/bar/actions/runs/1',
    jobsUrl: 'https://api.github.com/repos/foo/bar/actions/runs/1/jobs',
    logsUrl: 'https://api.github.com/repos/foo/bar/actions/runs/1/logs',
    workflowId: 1,
    workflowName: 'CI',
    repositoryName: 'bar',
    repositoryOwner: 'foo',
    headCommitMessage: 'commit',
    duration: 1000,
    ...overrides,
  }
}

describe('WorkflowRunsStore', () => {
  let store: WorkflowRunsStore

  beforeEach(() => {
    store = new WorkflowRunsStore()
  })

  it('returns empty state for unknown repository', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const state = store.getState(repo)
    expect(state.runs).toHaveLength(0)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loadedAt).toBeNull()
    expect(state.selectedWorkflowName).toBeNull()
  })

  it('sets loading flag', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const onUpdate = jest.fn()
    store.onDidUpdate(onUpdate)

    store.setLoading(repo.id)

    expect(onUpdate).toHaveBeenCalled()
    const state = store.getState(repo)
    expect(state.loading).toBe(true)
    expect(state.runs).toHaveLength(0)
  })

  it('stores runs and clears loading/error', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const runs = [makeRun()]

    store.setLoading(repo.id)
    store.setRuns(repo.id, runs)

    const state = store.getState(repo)
    expect(state.runs).toHaveLength(1)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loadedAt).not.toBeNull()
  })

  it('stores error and clears loading', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const err = new Error('fetch failed')

    store.setLoading(repo.id)
    store.setError(repo.id, err)

    const state = store.getState(repo)
    expect(state.error).toBe(err)
    expect(state.loading).toBe(false)
  })

  it('updates selected workflow name', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const onUpdate = jest.fn()
    store.onDidUpdate(onUpdate)

    store.setSelectedWorkflowName(repo.id, 'CI')

    expect(onUpdate).toHaveBeenCalled()
    const state = store.getState(repo)
    expect(state.selectedWorkflowName).toBe('CI')
  })
})
