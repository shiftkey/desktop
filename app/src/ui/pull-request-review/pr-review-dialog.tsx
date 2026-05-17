import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import {
  IPRReviewSession,
  ReviewVerdict,
  groupThreadsByPath,
} from '../../models/pull-request-review'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

interface IPRReviewDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  /** Pull request number this dialog is reviewing. */
  readonly prNumber: number
  readonly session: IPRReviewSession | null
  readonly onDismissed: () => void
}

interface IPRReviewDialogState {
  readonly newCommentBody: string
  readonly newCommentPath: string
  readonly newCommentLine: string
}

/**
 * Read-mostly review dialog. v1 surface:
 *   - Lists threads grouped by file
 *   - Lets the user draft a single line comment by typing path+line+body
 *   - Sets a verdict (approve / request changes / comment)
 *   - Submits the review in one shot
 *
 * Diff-rendered inline comment widgets are deferred to a follow-up — they
 * require the existing diff component to host overlays which is out of
 * scope for v1.
 */
export class PRReviewDialog extends React.Component<
  IPRReviewDialogProps,
  IPRReviewDialogState
> {
  public constructor(props: IPRReviewDialogProps) {
    super(props)
    this.state = { newCommentBody: '', newCommentPath: '', newCommentLine: '' }
  }

  public componentDidMount() {
    // Load the review threads here — not in the parent's render() — so the
    // fetch fires once when the dialog opens rather than on every unrelated
    // app re-render that occurs before the session resolves.
    const { session, prNumber, repository } = this.props
    if (
      session === null ||
      session.prNumber !== prNumber ||
      session.repoId !== repository.id
    ) {
      this.props.dispatcher.openPullRequestReview(repository, prNumber)
    }
  }

  public render() {
    const { session } = this.props
    const title = __DARWIN__ ? 'Review Pull Request' : 'Review pull request'
    return (
      <Dialog
        id="pr-review"
        title={title}
        loading={session?.status === 'submitting'}
        disabled={session?.status === 'submitting'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          {session === null
            ? this.renderEmpty()
            : session.status === 'loading'
            ? this.renderLoading()
            : this.renderReady(session)}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Submit Review' : 'Submit review'}
            okButtonDisabled={
              session === null ||
              session.status !== 'ready' ||
              session.verdict.kind === 'pending'
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private renderEmpty() {
    return <Row>No active review session.</Row>
  }

  private renderLoading() {
    return <Row>Loading review threads…</Row>
  }

  private renderReady(session: IPRReviewSession) {
    const grouped = groupThreadsByPath(session.threads)
    return (
      <>
        {session.error && (
          <Row>
            <span className="error">{session.error.message}</span>
          </Row>
        )}
        <Row>
          <h3>PR #{session.prNumber}</h3>
        </Row>
        {grouped.size === 0 && <Row>No comments yet.</Row>}
        {[...grouped.entries()].map(([path, threads]) => (
          <div key={path} className="pr-review-file">
            <h4>{path}</h4>
            {threads.map(t => (
              <div
                key={t.id}
                className={`pr-review-thread${t.resolved ? ' resolved' : ''}`}
              >
                <div className="pr-review-thread__line">Line {t.line}</div>
                {t.comments.map(c => (
                  <div key={c.id} className="pr-review-comment">
                    <strong>{c.author.login}</strong>
                    <span> · </span>
                    <span>{c.body}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
        <Row>
          <h4>Add a line comment</h4>
        </Row>
        <Row>
          <TextBox
            label="Path"
            value={this.state.newCommentPath}
            onValueChanged={this.onNewCommentPathChange}
          />
        </Row>
        <Row>
          <TextBox
            label="Line"
            value={this.state.newCommentLine}
            onValueChanged={this.onNewCommentLineChange}
          />
        </Row>
        <Row>
          <TextBox
            label="Comment"
            value={this.state.newCommentBody}
            onValueChanged={this.onNewCommentBodyChange}
          />
        </Row>
        <Row>
          <button
            type="button"
            onClick={this.onAddDraftClick}
            disabled={
              this.state.newCommentBody.trim().length === 0 ||
              this.state.newCommentPath.trim().length === 0 ||
              !/^\d+$/.test(this.state.newCommentLine.trim())
            }
          >
            Add draft
          </button>
        </Row>
        {session.draftComments.length > 0 && (
          <Row>
            <strong>{session.draftComments.length} pending draft(s)</strong>
          </Row>
        )}
        <Row>
          <h4>Verdict</h4>
        </Row>
        <Row>
          {(['comment', 'approve', 'request_changes'] as const).map(kind => (
            <label key={kind} style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="verdict"
                value={kind}
                checked={session.verdict.kind === kind}
                onChange={this.onVerdictChange}
              />
              {labelFor(kind)}
            </label>
          ))}
        </Row>
        <Row>
          <TextBox
            label="Summary"
            value={session.summary}
            onValueChanged={this.onSummaryChange}
          />
        </Row>
      </>
    )
  }

  private setVerdict(kind: ReviewVerdict['kind']) {
    if (kind === 'pending') {
      return
    }
    this.props.dispatcher.setReviewVerdict({ kind } as ReviewVerdict)
  }

  private onVerdictChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setVerdict(e.currentTarget.value as ReviewVerdict['kind'])
  }

  private onNewCommentPathChange = (p: string) => {
    this.setState({ newCommentPath: p })
  }

  private onNewCommentLineChange = (l: string) => {
    this.setState({ newCommentLine: l })
  }

  private onNewCommentBodyChange = (b: string) => {
    this.setState({ newCommentBody: b })
  }

  private onSummaryChange = (s: string) => {
    this.props.dispatcher.setReviewSummary(s)
  }

  private onAddDraftClick = () => {
    const path = this.state.newCommentPath.trim()
    const line = parseInt(this.state.newCommentLine.trim(), 10)
    const body = this.state.newCommentBody.trim()
    if (!path || !Number.isFinite(line) || !body) {
      return
    }
    this.props.dispatcher.addReviewDraft(path, line, 'RIGHT', body)
    this.setState({
      newCommentBody: '',
      newCommentLine: '',
    })
  }

  private onSubmit = async () => {
    const { session, repository } = this.props
    if (session === null || session.status !== 'ready') {
      return
    }
    if (session.verdict.kind === 'pending') {
      return
    }
    const owner = repository.gitHubRepository?.owner?.login
    const repo = repository.gitHubRepository?.name
    if (!owner || !repo) {
      return
    }
    const ok = await this.props.dispatcher.submitReview(owner, repo)
    if (ok) {
      this.props.onDismissed()
    }
  }
}

function labelFor(kind: ReviewVerdict['kind']): string {
  switch (kind) {
    case 'approve':
      return 'Approve'
    case 'request_changes':
      return 'Request changes'
    case 'comment':
      return 'Comment'
    default:
      return 'Pending'
  }
}
