/**
 * GitHub REST endpoints for in-app pull request review.
 *
 * Implemented as standalone functions taking an injectable `IHttpClient`
 * so the wrapper is fully unit-testable without `node-fetch`,
 * `fetch`, or the existing big `API` class.
 *
 * Each function maps the raw API JSON to the in-app `IReviewThread` /
 * `IReviewComment` shape.
 */

import {
  IReviewComment,
  IReviewThread,
  ReviewVerdict,
} from '../../models/pull-request-review'

export interface IHttpResponse {
  readonly status: number
  readonly ok: boolean
  /** Parsed JSON body, or `null` for 204 / non-JSON. */
  readonly body: unknown
}

export interface IHttpClient {
  request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<IHttpResponse>
}

/** Map a single REST PR-review-comment record to our internal shape. */
export function mapComment(raw: any): IReviewComment {
  return {
    id: Number(raw.id),
    nodeId: String(raw.node_id ?? ''),
    path: String(raw.path ?? ''),
    line: Number(raw.line ?? raw.original_line ?? 0),
    side: raw.side === 'LEFT' ? 'LEFT' : 'RIGHT',
    body: String(raw.body ?? ''),
    author: {
      login: String(raw.user?.login ?? ''),
      avatarURL: String(raw.user?.avatar_url ?? ''),
    },
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
    inReplyToId: raw.in_reply_to_id == null ? null : Number(raw.in_reply_to_id),
    // REST doesn't expose resolved state — caller can override with GraphQL.
    resolved: Boolean(raw.resolved ?? false),
  }
}

/**
 * Build review threads out of a flat array of comments. Top-level comments
 * (those with no `in_reply_to_id`) start a thread; replies attach to their
 * parent thread.
 */
export function buildThreads(
  comments: ReadonlyArray<IReviewComment>
): ReadonlyArray<IReviewThread> {
  const byId = new Map<number, IReviewComment>()
  for (const c of comments) {
    byId.set(c.id, c)
  }

  const rootIds: number[] = []
  const childrenByRoot = new Map<number, IReviewComment[]>()

  for (const c of comments) {
    if (c.inReplyToId === null) {
      rootIds.push(c.id)
      childrenByRoot.set(c.id, [])
    }
  }

  for (const c of comments) {
    if (c.inReplyToId === null) {
      continue
    }
    // Walk up to the root of the chain in case replies-of-replies exist.
    // Track visited ids so a corrupt API response with a cycle can't hang
    // the renderer in an infinite loop.
    const visited = new Set<number>([c.id])
    let current = c
    while (current.inReplyToId !== null) {
      const parent = byId.get(current.inReplyToId)
      if (parent === undefined || visited.has(parent.id)) {
        break
      }
      visited.add(parent.id)
      current = parent
    }
    const list = childrenByRoot.get(current.id)
    if (list !== undefined) {
      list.push(c)
    }
  }

  return rootIds.map(rootId => {
    const root = byId.get(rootId)!
    const replies = (childrenByRoot.get(rootId) ?? [])
      .slice()
      .sort(
        (a, b) => Number(new Date(a.createdAt)) - Number(new Date(b.createdAt))
      )
    return {
      id: root.nodeId,
      path: root.path,
      line: root.line,
      comments: [root, ...replies],
      resolved: root.resolved,
    }
  })
}

/**
 * Fetch every line-comment for a PR (paginated). Returns the threaded view.
 *
 * The 401 / 403 / 404 responses produce an empty array + no throw — callers
 * decide whether to surface an error to the user (typically yes for 401,
 * "no permission" message for 403).
 */
export async function fetchPullRequestThreads(
  client: IHttpClient,
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReadonlyArray<IReviewThread>> {
  const path = `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`
  const res = await client.request('GET', path)
  if (!res.ok || !Array.isArray(res.body)) {
    return []
  }
  const comments = res.body.map(mapComment)
  return buildThreads(comments)
}

/**
 * Submit a complete review in a single request. Drafts are translated into
 * the API's `comments` array; verdict maps to `event`.
 */
export async function submitReview(
  client: IHttpClient,
  owner: string,
  repo: string,
  prNumber: number,
  args: {
    verdict: ReviewVerdict
    summary: string
    drafts: ReadonlyArray<{
      path: string
      line: number
      side: 'LEFT' | 'RIGHT'
      body: string
    }>
  }
): Promise<{ ok: boolean; status: number; error?: string }> {
  const event = verdictToEvent(args.verdict)
  if (event === null) {
    return { ok: false, status: 400, error: 'Verdict is still pending' }
  }
  const body = {
    event,
    body: args.summary,
    comments: args.drafts.map(d => ({
      path: d.path,
      line: d.line,
      side: d.side,
      body: d.body,
    })),
  }
  const res = await client.request(
    'POST',
    `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
    body
  )
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: extractErrorMessage(res.body),
    }
  }
  return { ok: true, status: res.status }
}

/** Post a single line comment without creating a full review. */
export async function postLineComment(
  client: IHttpClient,
  owner: string,
  repo: string,
  prNumber: number,
  args: {
    commitSha: string
    path: string
    line: number
    side: 'LEFT' | 'RIGHT'
    body: string
  }
): Promise<IReviewComment | null> {
  const res = await client.request(
    'POST',
    `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    {
      commit_id: args.commitSha,
      path: args.path,
      line: args.line,
      side: args.side,
      body: args.body,
    }
  )
  if (!res.ok || res.body === null || typeof res.body !== 'object') {
    return null
  }
  return mapComment(res.body)
}

function verdictToEvent(
  verdict: ReviewVerdict
): 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' | null {
  switch (verdict.kind) {
    case 'comment':
      return 'COMMENT'
    case 'approve':
      return 'APPROVE'
    case 'request_changes':
      return 'REQUEST_CHANGES'
    default:
      return null
  }
}

function extractErrorMessage(body: unknown): string {
  if (body === null || typeof body !== 'object') {
    return 'Unknown error'
  }
  const m = (body as any).message
  return typeof m === 'string' ? m : 'Unknown error'
}
