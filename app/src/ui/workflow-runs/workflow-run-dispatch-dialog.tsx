import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { TextBox } from '../lib/text-box'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IWorkflowRunDispatchDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: string
  readonly workflows: ReadonlyArray<{ id: number; name: string }>
  readonly onDismissed: () => void
}

interface IWorkflowRunDispatchDialogState {
  readonly workflowId: number | ''
  readonly branch: string
  readonly running: boolean
  readonly error: string | null
}

/**
 * Dialog to dispatch a new workflow run. Presents a dropdown of available
 * workflows and a branch input, then delegates to the dispatcher.
 */
export class WorkflowRunDispatchDialog extends React.Component<
  IWorkflowRunDispatchDialogProps,
  IWorkflowRunDispatchDialogState
> {
  public constructor(props: IWorkflowRunDispatchDialogProps) {
    super(props)
    this.state = {
      workflowId: props.workflows.length > 0 ? props.workflows[0].id : '',
      branch: props.branch,
      running: false,
      error: null,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Run Workflow' : 'Run workflow'
    return (
      <Dialog
        id="workflow-run-dispatch"
        title={title}
        loading={this.state.running}
        disabled={this.state.running}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <div className="workflow-run-dispatch-dialog">
            <label>
              Workflow
              <select
                value={this.state.workflowId}
                onChange={this.onWorkflowChange}
              >
                {this.props.workflows.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <TextBox
              label="Branch"
              value={this.state.branch}
              onValueChanged={this.onBranchChange}
            />
            {this.state.error !== null && (
              <span className="error">{this.state.error}</span>
            )}
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Run workflow" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onWorkflowChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ workflowId: parseInt(e.target.value, 10) })
  }

  private onBranchChange = (branch: string) => {
    this.setState({ branch })
  }

  private onSubmit = async () => {
    if (this.state.workflowId === '') {
      return
    }
    this.setState({ running: true, error: null })
    await this.props.dispatcher.dispatchWorkflowRun(
      this.props.repository,
      this.state.workflowId,
      this.state.branch
    )
    this.props.onDismissed()
  }
}
