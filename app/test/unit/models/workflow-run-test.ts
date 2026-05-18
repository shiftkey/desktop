import {
  WorkflowRunStatus,
  WorkflowRunConclusion,
} from '../../../src/models/workflow-run'

describe('WorkflowRunStatus', () => {
  it('has expected values', () => {
    expect(WorkflowRunStatus.Queued).toBe('queued')
    expect(WorkflowRunStatus.InProgress).toBe('in_progress')
    expect(WorkflowRunStatus.Completed).toBe('completed')
    expect(WorkflowRunStatus.Waiting).toBe('waiting')
    expect(WorkflowRunStatus.Pending).toBe('pending')
    expect(WorkflowRunStatus.Requested).toBe('requested')
  })
})

describe('WorkflowRunConclusion', () => {
  it('has expected values', () => {
    expect(WorkflowRunConclusion.Success).toBe('success')
    expect(WorkflowRunConclusion.Failure).toBe('failure')
    expect(WorkflowRunConclusion.Neutral).toBe('neutral')
    expect(WorkflowRunConclusion.Cancelled).toBe('cancelled')
    expect(WorkflowRunConclusion.Skipped).toBe('skipped')
    expect(WorkflowRunConclusion.TimedOut).toBe('timed_out')
    expect(WorkflowRunConclusion.ActionRequired).toBe('action_required')
    expect(WorkflowRunConclusion.Stale).toBe('stale')
  })
})
