# Proposal 02 — In-app Pull Request Review

**Status**: Implemented (v1)
**Effort**: ~2 weeks
**Risk**: Medium (large API surface, comment threading is fiddly)
**User priority**: P1

> **Implementation notes** (2026-05-09)
>
> v1 ships read-mostly: load PR threads, draft line comments by entering
> `path` + `line` + `body`, set verdict, submit. Diff-rendered inline
> overlays are deferred — they require the existing diff component to
> host overlays, which is a separate refactor.
>
> - **API client** (`app/src/lib/api/pull-request-reviews.ts`): GET threads,
>   POST line comment, POST review (single-shot submit). 24 unit tests,
>   100% line coverage; 80% branch coverage (defensive null fallbacks).
> - **HTTP adapter** (`app/src/lib/api/account-http-client.ts`): minimal
>   `fetch`-backed `IHttpClient` keyed by an `Account`. 9 tests.
> - **Store** (`app/src/lib/stores/pull-request-review-store.ts`): one
>   active session, draft management, optimistic state. 17 tests, 100%
>   line coverage.
> - **UI** (`app/src/ui/pull-request-review/pr-review-dialog.tsx`):
>   `PRReviewDialog` shown via `PopupType.PullRequestReviewSession`.
> - **Wiring**: 7 dispatcher methods, 7 AppStore methods, IAppState gains
>   `pullRequestReviewSession`.
>
> Total: **50 new tests pass**, 0 regressions. GraphQL `resolveThread` and
> in-diff comment rendering are tracked as Phase 2 work.

## 1. Goal & non-goals

### Goal
Let users review pull requests — read the diff, leave line-level comments,
approve / request changes / submit a general review — without leaving the app.

### Non-goals
- Authoring new PRs (already covered upstream).
- Merging PRs (the existing PR list already supports this).
- Suggested-change blocks with "Apply suggestion" button (v2).
- Reviewing PRs from forks where the user isn't a collaborator (just-read mode
  is fine; comment posting requires write access — surface 401 cleanly).
- Reviewing draft markdown previews.

## 2. User stories

1. **As a reviewer**, I open a PR from the app's PR list and see its diff in a
   side-by-side view.
2. **As a reviewer**, I click a line in the diff and leave a comment that
   posts to the PR.
3. **As a reviewer**, I read existing comment threads inline at the line
   they were left on, and reply to them.
4. **As a reviewer**, I submit a full review with overall verdict
   (Approve / Request changes / Comment) and a summary.
5. **As an author**, I open my own PR and see review threads inline with the
   diff.
6. **As a reviewer**, I resolve a thread.

## 3. Architecture

### Data flow

```
┌─────────────────────────────── GitHub REST/GraphQL ──────────────────────┐
│                                                                          │
│  GET  /repos/:owner/:repo/pulls/:n                  (PR metadata)        │
│  GET  /repos/:owner/:repo/pulls/:n/files            (changed files)      │
│  GET  /repos/:owner/:repo/pulls/:n/reviews          (existing reviews)   │
│  GET  /repos/:owner/:repo/pulls/:n/comments         (line comments)      │
│  POST /repos/:owner/:repo/pulls/:n/reviews          (submit review)      │
│  POST /repos/:owner/:repo/pulls/:n/comments         (single line comment)│
│  PATCH .../comments/:id   /  DELETE .../comments/:id                     │
│                                                                          │
│  GraphQL: resolveReviewThread (REST has no resolve endpoint)             │
└──────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    PullRequestReviewStore (renderer)
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
           IAppState.pr           Dispatcher
           ReviewSession          .openPullRequestReview(pr)
                                  .leaveLineComment(...)
                                  .submitReview(...)
                                  .resolveThread(...)
```

### Why a dedicated store

The existing `app-store.ts` is already 6000+ lines. PR review has its own
caching needs (per-PR state, optimistic comment posting) and a different
lifecycle (modal/popup, not always present). A separate store keeps the blast
radius small and matches the precedent of `commit-status-store.ts`.

### Caching strategy

- Per-PR cache, keyed by `repoId:prNumber`.
- Stale after 60s; refreshed on focus regain or manual refresh.
- Optimistic insert for new comments (immediately render, reconcile on POST
  success/failure with a visible "retry" affordance).

## 4. File layout

### New files

```
app/src/lib/api/
└── pull-request-reviews.ts         # Typed wrappers around the REST endpoints

app/src/lib/stores/
└── pull-request-review-store.ts    # Per-PR review session cache

app/src/models/
├── pull-request-review.ts          # IPullRequestReview, IReviewComment
└── pull-request-review-state.ts    # IPRReviewSession state machine

app/src/ui/pull-request-review/
├── pr-review-dialog.tsx            # Top-level dialog (full-screen popup)
├── pr-review-header.tsx            # PR title, branches, overall status
├── pr-file-tree.tsx                # Files-changed sidebar
├── pr-diff-pane.tsx                # Renders the diff with thread overlays
├── pr-comment-thread.tsx           # Inline thread component
├── pr-comment-composer.tsx         # New-comment textarea + submit
└── pr-review-submit-bar.tsx        # Approve / Request / Comment + summary

app/test/unit/pull-request-review/
├── pull-request-review-store-test.ts
├── pull-request-reviews-api-test.ts     # Uses nock or msw for HTTP fakes
├── pr-comment-thread-test.tsx
└── pr-review-submit-bar-test.tsx
```

### Modified

| File | Change |
|---|---|
| `app/src/lib/app-state.ts` | Add `currentPullRequestReview: IPRReviewSession | null` |
| `app/src/models/popup.ts` | Add `PopupType.PullRequestReview` |
| `app/src/ui/dispatcher/dispatcher.ts` | `openPullRequestReview`, `leaveLineComment`, `submitReview`, `resolveThread`, `closePullRequestReview` |
| `app/src/ui/branches/pull-request-list-item.tsx` | Add "Review" button next to existing "View on GitHub" |
| `app/src/lib/feature-flag.ts` | `enablePullRequestReviewInApp()` |
| `app/styles/ui/_pr-review.scss` | New |
| `docs/learn-more/index.md` | Section: "Reviewing pull requests" |

## 5. Data model

```typescript
// app/src/models/pull-request-review.ts
export type ReviewVerdict =
  | { kind: 'pending' }
  | { kind: 'comment' }
  | { kind: 'approve' }
  | { kind: 'request_changes' }

export interface IReviewComment {
  readonly id: number
  readonly nodeId: string                   // GraphQL id, needed for resolve
  readonly path: string
  readonly line: number                     // line in the new file
  readonly side: 'LEFT' | 'RIGHT'
  readonly body: string
  readonly author: { login: string; avatarURL: string }
  readonly createdAt: string
  readonly updatedAt: string
  readonly inReplyToId: number | null
  readonly resolved: boolean
}

export interface IReviewThread {
  readonly id: string                       // node id of root comment
  readonly path: string
  readonly line: number
  readonly comments: ReadonlyArray<IReviewComment>
  readonly resolved: boolean
}

// app/src/models/pull-request-review-state.ts
export interface IPRReviewSession {
  readonly prNumber: number
  readonly repoId: number
  readonly status: 'loading' | 'ready' | 'submitting' | 'error'
  readonly diff: ReadonlyArray<IDiffFile>           // reuse existing IDiffFile
  readonly threads: ReadonlyArray<IReviewThread>
  readonly draftComments: ReadonlyArray<IDraftComment>  // not yet posted
  readonly verdict: ReviewVerdict
  readonly summary: string                          // text for overall review
  readonly error: Error | null
}
```

## 6. APIs / Dispatcher

```typescript
// All return Promise<void> for the dispatcher pattern
openPullRequestReview(repository: Repository, prNumber: number)
closePullRequestReview()

// Drafting (purely client-side, no network)
addDraftComment(path: string, line: number, side: 'LEFT'|'RIGHT', body: string)
discardDraftComment(draftId: string)
setReviewSummary(text: string)
setReviewVerdict(verdict: ReviewVerdict)

// Network actions
postSingleLineComment(path: string, line: number, side: 'LEFT'|'RIGHT', body: string)
submitReview()                                     // posts all drafts + verdict
resolveThread(threadNodeId: string)
unresolveThread(threadNodeId: string)
```

`submitReview()` POSTs to `/reviews` with `event: APPROVE | REQUEST_CHANGES |
COMMENT` and `comments: [{path, line, side, body}, ...]`. Single-shot review
submission keeps the API surface minimal.

## 7. UX spec

### Layout (full-screen popup)

```
┌────────────────────────────────────────────────────────────────────────┐
│ [<] PR #1234: Refactor auth middleware                  [Open in browser]│
│  desktop/auth-rewrite → main · 5 commits · 12 files                     │
├──────────────┬─────────────────────────────────────────────────────────┤
│ Files (12)   │ src/auth/middleware.ts                                  │
│ ▸ middleware │ ┌───────────────────┬───────────────────────┐           │
│ ▸ session    │ │  - oldCode()      │  + newCode()          │           │
│ ▸ tests/...  │ │                   │  + extraLine()        │           │
│              │ ├───────────────────┼───────────────────────┤           │
│              │ │ 💬 alice (2 hrs)  Could we extract this?  │           │
│              │ │   [Reply…]                                │           │
│              │ ├───────────────────────────────────────────┤           │
│              │ │  - moreOld()      │  + moreNew()          │           │
│              │ └───────────────────┴───────────────────────┘           │
├──────────────┴─────────────────────────────────────────────────────────┤
│ Summary: [____________________________________________________]        │
│  ○ Comment   ● Approve   ○ Request changes        [Submit review]      │
└────────────────────────────────────────────────────────────────────────┘
```

### Keyboard

| Shortcut | Action |
|---|---|
| `J` / `K` | Next / prev file |
| `N` / `P` | Next / prev thread |
| `R` | Reply to focused thread |
| `Cmd+Enter` (in composer) | Save draft |
| `Cmd+Shift+Enter` | Submit review |
| `Esc` | Close dialog (warns if unsubmitted drafts) |

### Edge cases

| Case | Behavior |
|---|---|
| User loses connectivity mid-submit | Drafts kept locally; "Retry" surfaced |
| PR updated upstream while reviewing | Refresh button shows "PR has new commits — refresh?" banner |
| Comment exceeds 65k char body limit | Block submit, show error |
| User lacks write access | Disable verdict radios, allow only `Comment` |
| Token expired | Reuse the existing invalidated-token flow |

## 8. Testing strategy

| File | Coverage | What |
|---|---|---|
| `pull-request-reviews-api-test.ts` | 100% | All HTTP shapes, error mapping (401, 403, 404, 422) |
| `pull-request-review-store-test.ts` | 95% | Draft state, optimistic inserts, reconciliation, refresh |
| `pr-comment-thread-test.tsx` | 95% | Render variants: open, resolved, with replies, with author=self |
| `pr-review-submit-bar-test.tsx` | 95% | Verdict toggles, submit disable when no content, summary char count |

HTTP mocked with `msw` (no real network). API client uses the existing
`API.fromAccount(account)` pattern; the new `pull-request-reviews.ts` file
extends it with the new endpoint methods.

### Manual test plan
- Approve flow on a small PR end-to-end
- Request-changes flow with two line comments
- Reply to existing thread
- Resolve thread
- Submit review with no comments (general comment)

## 9. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GraphQL needed for resolve threads | Certain | New auth scope? | `read:discussion` already in our token scopes; verify |
| Diff renderer doesn't support thread overlays | High | Major UI rework | Audit existing diff component first; spike in Phase 1 |
| Rate limits on busy repos | Medium | Dialog feels slow | Cache 60s; debounce refresh; show quota warning if remaining < 100 |
| Markdown body rendering inconsistency vs github.com | Medium | User confusion | Use the same `dompurify` + `marked` config as commit-message rendering already in the app |
| Draft loss on accidental close | Medium | Lost work | LocalStorage-persist drafts per PR; restore on reopen |

## 10. Phased delivery

**Phase 1 — Spike: thread overlay on existing diff (2 days)**
Prove the diff component can host inline comment widgets. If not, scope a
diff-component refactor before continuing.

**Phase 2 — API client + store (3 days)**
`pull-request-reviews.ts`, `pull-request-review-store.ts`, full unit tests.

**Phase 3 — Read-only viewer (3 days)**
`pr-review-dialog.tsx` + file tree + diff + threads. No commenting yet.

**Phase 4 — Drafting + posting (3 days)**
Composer, draft state, optimistic posting, error recovery.

**Phase 5 — Submit review flow (2 days)**
Submit bar, verdict picker, single-shot submit.

**Phase 6 — Resolve + polish (2 days)**
Thread resolve via GraphQL, keyboard nav, accessibility pass.

Total: ~15 working days.

## 11. Open questions

1. **Reuse existing diff component or build new?** Decided in Phase 1 spike.
2. **Side-by-side default?** Yes — matches github.com. Inline as alt mode (use
   existing `imageDiffType` / `showSideBySideDiff` settings).
3. **Suggested changes (` ```suggestion `)?** Render them; "Apply" deferred to
   v2 (requires local commit flow integration).
4. **Notify reviewers?** Out of scope; GitHub already does this.
