import { PullRequestReviewStore } from '../../../src/lib/stores/pull-request-review-store'
import {
  IHttpClient,
  IHttpResponse,
} from '../../../src/lib/api/pull-request-reviews'

class FakeHttp implements IHttpClient {
  public calls: Array<{ method: string; path: string; body?: unknown }> = []
  public queue: IHttpResponse[] = []
  public enqueue(r: IHttpResponse) {
    this.queue.push(r)
    return this
  }
  public async request(method: any, path: string, body?: unknown) {
    this.calls.push({ method, path, body })
    const r = this.queue.shift()
    if (!r) {
      return { ok: false, status: 500, body: null }
    }
    return r
  }
}

const ok = (body: unknown): IHttpResponse => ({
  ok: true,
  status: 200,
  body,
})

describe('PullRequestReviewStore', () => {
  describe('open', () => {
    it('flips to "loading" then "ready" with threads', async () => {
      const http = new FakeHttp().enqueue(ok([]))
      const store = new PullRequestReviewStore(http)
      let updates = 0
      store.onDidUpdate(() => updates++)
      await store.open(1, 'o', 'r', 7)
      const s = store.getSession()!
      expect(s.status).toBe('ready')
      expect(s.prNumber).toBe(7)
      expect(s.repoId).toBe(1)
      expect(s.threads).toEqual([])
      // At least 'loading' update + 'ready' update.
      expect(updates).toBeGreaterThanOrEqual(2)
    })

    it('sets status to error on http throw', async () => {
      const http: IHttpClient = {
        async request() {
          throw new Error('network')
        },
      }
      const store = new PullRequestReviewStore(http)
      let errors = 0
      store.onDidError(() => errors++)
      await store.open(1, 'o', 'r', 7)
      expect(store.getSession()!.status).toBe('error')
      expect(store.getSession()!.error?.message).toBe('network')
      expect(errors).toBe(1)
    })
  })

  describe('close', () => {
    it('clears the session', async () => {
      const http = new FakeHttp().enqueue(ok([]))
      const store = new PullRequestReviewStore(http)
      await store.open(1, 'o', 'r', 7)
      store.close()
      expect(store.getSession()).toBeNull()
    })
  })

  describe('drafts', () => {
    let store: PullRequestReviewStore
    beforeEach(async () => {
      store = new PullRequestReviewStore(new FakeHttp().enqueue(ok([])))
      await store.open(1, 'o', 'r', 7)
    })

    it('addDraft appends a draft with a unique id', () => {
      store.addDraft('p', 1, 'RIGHT', 'hello')
      const drafts = store.getSession()!.draftComments
      expect(drafts).toHaveLength(1)
      expect(drafts[0].id).toMatch(/^draft-/)
    })

    it('addDraft is a no-op when body is whitespace', () => {
      store.addDraft('p', 1, 'RIGHT', '   ')
      expect(store.getSession()!.draftComments).toHaveLength(0)
    })

    it('addDraft is a no-op when no session is open', () => {
      store.close()
      store.addDraft('p', 1, 'RIGHT', 'hi')
      expect(store.getSession()).toBeNull()
    })

    it('discardDraft removes by id', () => {
      store.addDraft('p', 1, 'RIGHT', 'a')
      store.addDraft('p', 2, 'RIGHT', 'b')
      const id = store.getSession()!.draftComments[0].id
      store.discardDraft(id)
      const remaining = store.getSession()!.draftComments
      expect(remaining).toHaveLength(1)
      expect(remaining.find(d => d.id === id)).toBeUndefined()
    })

    it('discardDraft is a no-op when no session is open', () => {
      store.close()
      expect(() => store.discardDraft('whatever')).not.toThrow()
    })
  })

  describe('setVerdict / setSummary', () => {
    it('updates the session fields', async () => {
      const store = new PullRequestReviewStore(new FakeHttp().enqueue(ok([])))
      await store.open(1, 'o', 'r', 7)
      store.setVerdict({ kind: 'approve' })
      store.setSummary('lgtm')
      const s = store.getSession()!
      expect(s.verdict.kind).toBe('approve')
      expect(s.summary).toBe('lgtm')
    })

    it('setVerdict is a no-op when no session is open', () => {
      const store = new PullRequestReviewStore(new FakeHttp())
      store.setVerdict({ kind: 'approve' })
      expect(store.getSession()).toBeNull()
    })

    it('setSummary is a no-op when no session is open', () => {
      const store = new PullRequestReviewStore(new FakeHttp())
      store.setSummary('hi')
      expect(store.getSession()).toBeNull()
    })
  })

  describe('submit', () => {
    it('returns false when no session is open', async () => {
      const store = new PullRequestReviewStore(new FakeHttp())
      expect(await store.submit('o', 'r')).toBe(false)
    })

    it('returns false when verdict is pending', async () => {
      const http = new FakeHttp().enqueue(ok([]))
      const store = new PullRequestReviewStore(http)
      await store.open(1, 'o', 'r', 7)
      expect(await store.submit('o', 'r')).toBe(false)
    })

    it('on success: clears drafts, resets verdict, returns true', async () => {
      const http = new FakeHttp()
        .enqueue(ok([])) // open
        .enqueue(ok({ id: 1 })) // submit
      const store = new PullRequestReviewStore(http)
      await store.open(1, 'o', 'r', 7)
      store.addDraft('p', 1, 'RIGHT', 'a')
      store.setVerdict({ kind: 'approve' })
      store.setSummary('lgtm')
      const result = await store.submit('o', 'r')
      expect(result).toBe(true)
      const s = store.getSession()!
      expect(s.draftComments).toEqual([])
      expect(s.verdict.kind).toBe('pending')
      expect(s.summary).toBe('')
    })

    it('on failure: leaves drafts intact and surfaces an error', async () => {
      const http = new FakeHttp().enqueue(ok([])).enqueue({
        ok: false,
        status: 422,
        body: { message: 'Validation Failed' },
      })
      const store = new PullRequestReviewStore(http)
      await store.open(1, 'o', 'r', 7)
      store.addDraft('p', 1, 'RIGHT', 'a')
      store.setVerdict({ kind: 'approve' })
      const result = await store.submit('o', 'r')
      expect(result).toBe(false)
      expect(store.getSession()!.draftComments).toHaveLength(1)
      expect(store.getSession()!.error?.message).toBe('Validation Failed')
    })
  })

  describe('setThreads', () => {
    it('replaces the threads when a session is open', async () => {
      const http = new FakeHttp().enqueue(ok([]))
      const store = new PullRequestReviewStore(http)
      await store.open(1, 'o', 'r', 7)
      const t: any = {
        id: 't1',
        path: 'p',
        line: 1,
        comments: [],
        resolved: false,
      }
      store.setThreads([t])
      expect(store.getSession()!.threads).toEqual([t])
    })

    it('is a no-op when no session is open', () => {
      const store = new PullRequestReviewStore(new FakeHttp())
      store.setThreads([])
      expect(store.getSession()).toBeNull()
    })
  })
})
