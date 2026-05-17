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
    // Capture the session we create so the post-await writes can detect
    // that the user closed the dialog — or opened a different PR — while
    // the threads request was in flight. Spreading `this.session` blindly
    // there would resurrect a closed session (`{...null}`) or clobber a
    // newer PR's session with this PR's stale threads.
    const session: IPRReviewSession = {
      prNumber,
      repoId,
      status: 'loading',
      threads: [],
      draftComments: [],
      verdict: { kind: 'pending' },
      summary: '',
      error: null,
    }
    this.session = session
    this.emitUpdate()

    try {
      const threads = await fetchPullRequestThreads(
        this.client,
        owner,
        repo,
        prNumber
      )
      if (this.session !== session) {
        return
      }
      this.session = { ...session, threads, status: 'ready' }
      this.emitUpdate()
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      if (this.session === session) {
        this.session = { ...session, status: 'error', error }
        this.emitUpdate()
      }
      this.emitError(error)
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
    if (this.session === null) {
      return
    }
    if (body.trim().length === 0) {
      return
    }
    const draft: IDraftComment = {
      id: `draft-${Date.now()}-${randomDraftSuffix()}`,
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
    if (this.session === null) {
      return
    }
    this.session = {
      ...this.session,
      draftComments: this.session.draftComments.filter(d => d.id !== draftId),
    }
    this.emitUpdate()
  }

  public setVerdict(verdict: ReviewVerdict): void {
    if (this.session === null) {
      return
    }
    this.session = { ...this.session, verdict }
    this.emitUpdate()
  }

  public setSummary(summary: string): void {
    if (this.session === null) {
      return
    }
    this.session = { ...this.session, summary }
    this.emitUpdate()
  }

  /**
   * Submit the active review (verdict + drafts + summary). Returns true on
   * success; on failure leaves drafts intact so the user can retry.
   *
   * Network failures (DNS, offline, fetch rejection) are caught and surfaced
   * as a normal error so the dialog never wedges in the 'submitting' state.
   */
  public async submit(owner: string, repo: string): Promise<boolean> {
    if (this.session === null) {
      return false
    }
    if (this.session.verdict.kind === 'pending') {
      return false
    }
    this.session = { ...this.session, status: 'submitting', error: null }
    this.emitUpdate()

    let result: { ok: boolean; status: number; error?: string }
    try {
      result = await submitReviewApi(
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
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      if (this.session !== null) {
        this.session = { ...this.session, status: 'ready', error }
        this.emitUpdate()
      }
      this.emitError(error)
      return false
    }

    // Session may have been closed while we awaited the network. Don't
    // resurrect it.
    if (this.session === null) {
      return result.ok
    }

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
    if (this.session === null) {
      return
    }
    this.session = { ...this.session, threads }
    this.emitUpdate()
  }
}

/**
 * 6-char random hex suffix from a CSPRNG. The id is non-secret, but lint
 * forbids `Math.random` and the CSPRNG is available in both renderer
 * (`window.crypto`) and main (`require('crypto')`).
 */
function randomDraftSuffix(): string {
  const g = (typeof globalThis !== 'undefined' ? (globalThis as any) : {}) as {
    crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array }
  }
  const wc = g.crypto
  if (wc && typeof wc.getRandomValues === 'function') {
    const buf = new Uint8Array(3)
    wc.getRandomValues(buf)
    return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto = require('crypto') as {
    randomBytes: (n: number) => Buffer
  }
  return nodeCrypto.randomBytes(3).toString('hex')
}
