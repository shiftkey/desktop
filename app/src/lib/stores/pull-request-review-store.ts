import { BaseStore } from './base-store'
import {
  IPRReviewSession,
  IDraftComment,
  ReviewVerdict,
  IReviewThread,
} from '../../models/pull-request-review'
import {
  fetchPullRequestThreads,
  submitReview as submitReviewApi,
  IHttpClient,
} from '../api/pull-request-reviews'

/**
 * Holds at most one active review session in memory at a time. Opening a
 * different PR replaces the cache rather than growing it — matches the
 * "one dialog at a time" UX.
 */
export class PullRequestReviewStore extends BaseStore {
  private session: IPRReviewSession | null = null
  private readonly client: IHttpClient

  public constructor(client: IHttpClient) {
    super()
    this.client = client
  }

  public getSession(): IPRReviewSession | null {
    return this.session
  }

  /** Open a PR review session. Refresh threads from the API. */
  public async open(
    repoId: number,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<void> {
    this.session = {
      prNumber,
      repoId,
      status: 'loading',
      threads: [],
      draftComments: [],
      verdict: { kind: 'pending' },
      summary: '',
      error: null,
    }
    this.emitUpdate()

    try {
      const threads = await fetchPullRequestThreads(
        this.client,
        owner,
        repo,
        prNumber
      )
      this.session = { ...this.session, threads, status: 'ready' }
      this.emitUpdate()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      this.session = { ...this.session, status: 'error', error }
      this.emitError(error)
      this.emitUpdate()
    }
  }

  /** Close the active session (e.g., dialog dismissed). */
  public close(): void {
    this.session = null
    this.emitUpdate()
  }

  public addDraft(
    path: string,
    line: number,
    side: 'LEFT' | 'RIGHT',
    body: string
  ): void {
    if (this.session === null) return
    if (body.trim().length === 0) return
    const draft: IDraftComment = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path,
      line,
      side,
      body,
    }
    this.session = {
      ...this.session,
      draftComments: [...this.session.draftComments, draft],
    }
    this.emitUpdate()
  }

  public discardDraft(draftId: string): void {
    if (this.session === null) return
    this.session = {
      ...this.session,
      draftComments: this.session.draftComments.filter(d => d.id !== draftId),
    }
    this.emitUpdate()
  }

  public setVerdict(verdict: ReviewVerdict): void {
    if (this.session === null) return
    this.session = { ...this.session, verdict }
    this.emitUpdate()
  }

  public setSummary(summary: string): void {
    if (this.session === null) return
    this.session = { ...this.session, summary }
    this.emitUpdate()
  }

  /**
   * Submit the active review (verdict + drafts + summary). Returns true on
   * success; on failure leaves drafts intact so the user can retry.
   */
  public async submit(owner: string, repo: string): Promise<boolean> {
    if (this.session === null) return false
    if (this.session.verdict.kind === 'pending') return false
    this.session = { ...this.session, status: 'submitting', error: null }
    this.emitUpdate()

    const result = await submitReviewApi(
      this.client,
      owner,
      repo,
      this.session.prNumber,
      {
        verdict: this.session.verdict,
        summary: this.session.summary,
        drafts: this.session.draftComments.map(d => ({
          path: d.path,
          line: d.line,
          side: d.side,
          body: d.body,
        })),
      }
    )

    if (!result.ok) {
      this.session = {
        ...this.session,
        status: 'ready',
        error: new Error(result.error ?? 'Submit failed'),
      }
      this.emitUpdate()
      return false
    }

    this.session = {
      ...this.session,
      status: 'ready',
      draftComments: [],
      verdict: { kind: 'pending' },
      summary: '',
    }
    this.emitUpdate()
    return true
  }

  /** Replace the threads cache (e.g., after a refresh outside open()). */
  public setThreads(threads: ReadonlyArray<IReviewThread>): void {
    if (this.session === null) return
    this.session = { ...this.session, threads }
    this.emitUpdate()
  }
}
