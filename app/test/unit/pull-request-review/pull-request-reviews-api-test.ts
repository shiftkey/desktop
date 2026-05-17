import {
  fetchPullRequestThreads,
  postLineComment,
  submitReview,
  buildThreads,
  mapComment,
  IHttpClient,
  IHttpResponse,
} from '../../../src/lib/api/pull-request-reviews'
import { groupThreadsByPath } from '../../../src/models/pull-request-review'

class FakeHttp implements IHttpClient {
  public calls: Array<{ method: string; path: string; body?: unknown }> = []
  public queue: IHttpResponse[] = []

  public enqueue(res: IHttpResponse) {
    this.queue.push(res)
    return this
  }

  public async request(method: any, path: string, body?: unknown) {
    this.calls.push({ method, path, body })
    const r = this.queue.shift()
    if (!r) {
      throw new Error('FakeHttp: no response queued for ' + path)
    }
    return r
  }
}

const ok = (body: unknown, status = 200): IHttpResponse => ({
  ok: true,
  status,
  body,
})
const err = (status: number, body: unknown = null): IHttpResponse => ({
  ok: false,
  status,
  body,
})

const rawComment = (over: any = {}) => ({
  id: 1,
  node_id: 'NODE_1',
  path: 'src/foo.ts',
  line: 10,
  side: 'RIGHT',
  body: 'looks good',
  user: { login: 'alice', avatar_url: 'https://x/a.png' },
  created_at: '2025-01-01T10:00:00Z',
  updated_at: '2025-01-01T10:00:00Z',
  in_reply_to_id: null,
  resolved: false,
  ...over,
})

describe('mapComment', () => {
  it('maps every required field', () => {
    const c = mapComment(rawComment())
    expect(c).toEqual({
      id: 1,
      nodeId: 'NODE_1',
      path: 'src/foo.ts',
      line: 10,
      side: 'RIGHT',
      body: 'looks good',
      author: { login: 'alice', avatarURL: 'https://x/a.png' },
      createdAt: '2025-01-01T10:00:00Z',
      updatedAt: '2025-01-01T10:00:00Z',
      inReplyToId: null,
      resolved: false,
    })
  })

  it('falls back to original_line when line is missing', () => {
    const c = mapComment(rawComment({ line: undefined, original_line: 33 }))
    expect(c.line).toBe(33)
  })

  it('coerces unknown side to RIGHT', () => {
    expect(mapComment(rawComment({ side: 'LEFT' })).side).toBe('LEFT')
    expect(mapComment(rawComment({ side: 'WHATEVER' })).side).toBe('RIGHT')
  })

  it('handles missing user gracefully', () => {
    const c = mapComment(rawComment({ user: undefined }))
    expect(c.author.login).toBe('')
    expect(c.author.avatarURL).toBe('')
  })
})

describe('buildThreads', () => {
  it('returns one thread per top-level comment', () => {
    const cs = [
      mapComment(rawComment({ id: 1, in_reply_to_id: null })),
      mapComment(rawComment({ id: 2, in_reply_to_id: null })),
    ]
    const t = buildThreads(cs)
    expect(t).toHaveLength(2)
  })

  it('attaches replies to their root in chronological order', () => {
    const cs = [
      mapComment(
        rawComment({
          id: 1,
          in_reply_to_id: null,
          created_at: '2025-01-01T00:00:00Z',
        })
      ),
      mapComment(
        rawComment({
          id: 2,
          in_reply_to_id: 1,
          body: 'reply 2',
          created_at: '2025-01-02T00:00:00Z',
        })
      ),
      mapComment(
        rawComment({
          id: 3,
          in_reply_to_id: 1,
          body: 'reply 3 (earlier)',
          created_at: '2025-01-01T12:00:00Z',
        })
      ),
    ]
    const [thread] = buildThreads(cs)
    expect(thread.comments).toHaveLength(3)
    expect(thread.comments[0].id).toBe(1)
    expect(thread.comments[1].id).toBe(3)
    expect(thread.comments[2].id).toBe(2)
  })

  it('flattens nested replies onto the root thread', () => {
    const cs = [
      mapComment(rawComment({ id: 1, in_reply_to_id: null })),
      mapComment(rawComment({ id: 2, in_reply_to_id: 1, body: 'r2' })),
      mapComment(rawComment({ id: 3, in_reply_to_id: 2, body: 'r3' })),
    ]
    const [t] = buildThreads(cs)
    expect(t.comments).toHaveLength(3)
  })

  it('drops replies whose parent is missing', () => {
    const cs = [mapComment(rawComment({ id: 1, in_reply_to_id: 999 }))]
    const t = buildThreads(cs)
    expect(t).toHaveLength(0)
  })

  it('marks a thread resolved when its root is resolved', () => {
    const cs = [
      mapComment(rawComment({ id: 1, in_reply_to_id: null, resolved: true })),
    ]
    expect(buildThreads(cs)[0].resolved).toBe(true)
  })
})

describe('fetchPullRequestThreads', () => {
  it('GETs the comments endpoint and returns threads', async () => {
    const http = new FakeHttp().enqueue(
      ok([rawComment(), rawComment({ id: 2 })])
    )
    const threads = await fetchPullRequestThreads(http, 'a', 'b', 7)
    expect(threads).toHaveLength(2)
    expect(http.calls[0].method).toBe('GET')
    expect(http.calls[0].path).toBe('/repos/a/b/pulls/7/comments?per_page=100')
  })

  it('returns empty array on non-2xx', async () => {
    const http = new FakeHttp().enqueue(err(401))
    expect(await fetchPullRequestThreads(http, 'a', 'b', 1)).toEqual([])
  })

  it('returns empty array when body is not an array', async () => {
    const http = new FakeHttp().enqueue(ok({ message: 'oops' }))
    expect(await fetchPullRequestThreads(http, 'a', 'b', 1)).toEqual([])
  })
})

describe('postLineComment', () => {
  it('POSTs the comment payload and returns the mapped comment', async () => {
    const http = new FakeHttp().enqueue(
      ok(rawComment({ id: 99, body: 'new', node_id: 'NODE_99' }), 201)
    )
    const c = await postLineComment(http, 'o', 'r', 5, {
      commitSha: 'abc',
      path: 'p.ts',
      line: 4,
      side: 'RIGHT',
      body: 'hi',
    })
    expect(c?.id).toBe(99)
    expect(c?.nodeId).toBe('NODE_99')
    expect(http.calls[0].method).toBe('POST')
    expect(http.calls[0].path).toBe('/repos/o/r/pulls/5/comments')
    expect(http.calls[0].body).toEqual({
      commit_id: 'abc',
      path: 'p.ts',
      line: 4,
      side: 'RIGHT',
      body: 'hi',
    })
  })

  it('returns null on non-2xx', async () => {
    const http = new FakeHttp().enqueue(err(422))
    const c = await postLineComment(http, 'o', 'r', 1, {
      commitSha: 'a',
      path: 'p',
      line: 1,
      side: 'RIGHT',
      body: 'b',
    })
    expect(c).toBeNull()
  })

  it('returns null when body is not an object', async () => {
    const http = new FakeHttp().enqueue(ok('plain text'))
    const c = await postLineComment(http, 'o', 'r', 1, {
      commitSha: 'a',
      path: 'p',
      line: 1,
      side: 'RIGHT',
      body: 'b',
    })
    expect(c).toBeNull()
  })
})

describe('submitReview', () => {
  it('rejects when verdict is pending', async () => {
    const http = new FakeHttp() // no responses queued -> would throw if called
    const r = await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'pending' },
      summary: 's',
      drafts: [],
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(400)
    expect(http.calls).toHaveLength(0)
  })

  it('maps "approve" verdict to APPROVE event', async () => {
    const http = new FakeHttp().enqueue(ok({ id: 1 }))
    await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'approve' },
      summary: 'lgtm',
      drafts: [],
    })
    expect((http.calls[0].body as any).event).toBe('APPROVE')
    expect((http.calls[0].body as any).body).toBe('lgtm')
  })

  it('maps "request_changes" verdict to REQUEST_CHANGES event', async () => {
    const http = new FakeHttp().enqueue(ok({ id: 1 }))
    await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'request_changes' },
      summary: 'no',
      drafts: [],
    })
    expect((http.calls[0].body as any).event).toBe('REQUEST_CHANGES')
  })

  it('maps "comment" verdict to COMMENT event', async () => {
    const http = new FakeHttp().enqueue(ok({ id: 1 }))
    await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'comment' },
      summary: 'fyi',
      drafts: [],
    })
    expect((http.calls[0].body as any).event).toBe('COMMENT')
  })

  it('forwards drafts as the comments array', async () => {
    const http = new FakeHttp().enqueue(ok({}))
    await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'comment' },
      summary: '',
      drafts: [
        { path: 'p1', line: 1, side: 'RIGHT', body: 'a' },
        { path: 'p2', line: 2, side: 'LEFT', body: 'b' },
      ],
    })
    expect((http.calls[0].body as any).comments).toEqual([
      { path: 'p1', line: 1, side: 'RIGHT', body: 'a' },
      { path: 'p2', line: 2, side: 'LEFT', body: 'b' },
    ])
  })

  it('reports server error message on 4xx', async () => {
    const http = new FakeHttp().enqueue(
      err(422, { message: 'Validation Failed' })
    )
    const r = await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'approve' },
      summary: '',
      drafts: [],
    })
    expect(r.ok).toBe(false)
    expect(r.status).toBe(422)
    expect(r.error).toBe('Validation Failed')
  })

  it('reports "Unknown error" when error body has no message', async () => {
    const http = new FakeHttp().enqueue(err(500))
    const r = await submitReview(http, 'o', 'r', 1, {
      verdict: { kind: 'approve' },
      summary: '',
      drafts: [],
    })
    expect(r.error).toBe('Unknown error')
  })
})

describe('groupThreadsByPath', () => {
  it('groups threads keyed by file path', () => {
    const t1: any = { path: 'a.ts', id: '1' }
    const t2: any = { path: 'a.ts', id: '2' }
    const t3: any = { path: 'b.ts', id: '3' }
    const grouped = groupThreadsByPath([t1, t2, t3])
    expect(grouped.get('a.ts')).toEqual([t1, t2])
    expect(grouped.get('b.ts')).toEqual([t3])
  })

  it('returns empty map for empty input', () => {
    expect(groupThreadsByPath([]).size).toBe(0)
  })
})
