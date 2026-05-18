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
