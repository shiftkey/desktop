/**
 * Models for the in-app Pull Request Review feature.
 *
 * Distinct from the lighter PR types in `app/src/models/pull-request.ts` —
 * those describe a PR row in a list, these describe a review session.
 */

export type ReviewVerdict =
  | { readonly kind: 'pending' }
  | { readonly kind: 'comment' }
  | { readonly kind: 'approve' }
  | { readonly kind: 'request_changes' }

export interface IReviewAuthor {
  readonly login: string
  readonly avatarURL: string
}

export interface IReviewComment {
  readonly id: number
  /** GraphQL node id; needed for resolve / unresolve threads. */
  readonly nodeId: string
  readonly path: string
  /** 1-indexed line number, in the new file (RIGHT side). */
  readonly line: number
  readonly side: 'LEFT' | 'RIGHT'
  readonly body: string
  readonly author: IReviewAuthor
  readonly createdAt: string
  readonly updatedAt: string
  /** id of the parent comment this is a reply to, or null when top-level. */
  readonly inReplyToId: number | null
  readonly resolved: boolean
}

export interface IReviewThread {
  /** Stable id for the thread root (same as the first comment's nodeId). */
  readonly id: string
  readonly path: string
  readonly line: number
  readonly comments: ReadonlyArray<IReviewComment>
  readonly resolved: boolean
}

/** A locally-drafted comment that has not yet been posted to GitHub. */
export interface IDraftComment {
  /** Local id, prefixed `draft-` so it cannot collide with a server id. */
  readonly id: string
  readonly path: string
  readonly line: number
  readonly side: 'LEFT' | 'RIGHT'
  readonly body: string
}

export interface IPRReviewSession {
  readonly prNumber: number
  readonly repoId: number
  readonly status: 'loading' | 'ready' | 'submitting' | 'error'
  readonly threads: ReadonlyArray<IReviewThread>
  readonly draftComments: ReadonlyArray<IDraftComment>
  readonly verdict: ReviewVerdict
  /** The text of the overall review summary. */
  readonly summary: string
  readonly error: Error | null
}

/** Group threads by file path for the file-tree pane. */
export function groupThreadsByPath(
  threads: ReadonlyArray<IReviewThread>
): ReadonlyMap<string, ReadonlyArray<IReviewThread>> {
  const map = new Map<string, IReviewThread[]>()
  for (const t of threads) {
    const list = map.get(t.path) ?? []
    list.push(t)
    map.set(t.path, list)
  }
  return map
}
