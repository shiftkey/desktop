import {
  WorkflowRunStatus,
  WorkflowRunConclusion,
} from '../../../src/models/workflow-run'

describe('WorkflowRunStatus', () => {
  it('has queued status', () => {
    expect(WorkflowRunStatus.Queued).toBe('queued')
  })

  it('has in_progress status', () => {
    expect(WorkflowRunStatus.InProgress).toBe('in_progress')
  })

  it('has completed status', () => {
    expect(WorkflowRunStatus.Completed).toBe('completed')
  })

  it('has waiting status', () => {
    expect(WorkflowRunStatus.Waiting).toBe('waiting')
  })

  it('has pending status', () => {
    expect(WorkflowRunStatus.Pending).toBe('pending')
  })

  it('has requested status', () => {
    expect(WorkflowRunStatus.Requested).toBe('requested')
  })
})

describe('WorkflowRunConclusion', () => {
  it('has success conclusion', () => {
    expect(WorkflowRunConclusion.Success).toBe('success')
  })

  it('has failure conclusion', () => {
    expect(WorkflowRunConclusion.Failure).toBe('failure')
  })

  it('has neutral conclusion', () => {
    expect(WorkflowRunConclusion.Neutral).toBe('neutral')
  })

  it('has cancelled conclusion', () => {
    expect(WorkflowRunConclusion.Cancelled).toBe('cancelled')
  })

  it('has skipped conclusion', () => {
    expect(WorkflowRunConclusion.Skipped).toBe('skipped')
  })

  it('has timed_out conclusion', () => {
    expect(WorkflowRunConclusion.TimedOut).toBe('timed_out')
  })

  it('has action_required conclusion', () => {
    expect(WorkflowRunConclusion.ActionRequired).toBe('action_required')
  })

  it('has stale conclusion', () => {
    expect(WorkflowRunConclusion.Stale).toBe('stale')
  })

  it('has startup_failure conclusion', () => {
    expect(WorkflowRunConclusion.StartupFailure).toBe('startup_failure')
  })
})
