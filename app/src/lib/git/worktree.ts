import { git } from './core'
import { Repository, LinkedWorkTree } from '../../models/repository'
import { getStatus } from './status'

const NULL_SHA = '0000000000000000000000000000000000000000'

/** Strip the `refs/heads/` prefix from a branch ref reported by Git. */
function shortenBranchRef(ref: string): string {
  const prefix = 'refs/heads/'
  return ref.startsWith(prefix) ? ref.substring(prefix.length) : ref
}

/**
 * Parse the output of `git worktree list --porcelain`.
 *
 * Each worktree is a block of `attribute [value]` lines separated by a
 * blank line. Every attribute the UI needs is surfaced: the checked-out
 * branch, detached/bare state, and the lock/prune reasons. A `locked` or
 * `prunable` line may appear with or without a trailing reason.
 */
export function parseWorktreeListPorcelain(
  output: string
): ReadonlyArray<LinkedWorkTree> {
  const worktrees = new Array<LinkedWorkTree>()

  for (const entry of output.split(/\n{2,}/)) {
    const lines = entry.trim().split('\n')
    if (lines.length === 0 || lines[0] === '') {
      continue
    }

    let path: string | null = null
    let head = NULL_SHA
    let branch: string | null = null
    let isDetached = false
    let isBare = false
    let lockedReason: string | null = null
    let prunableReason: string | null = null

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      } else if (line.startsWith('branch ')) {
        branch = shortenBranchRef(line.substring('branch '.length))
      } else if (line === 'detached') {
        isDetached = true
      } else if (line === 'bare') {
        isBare = true
      } else if (line === 'locked' || line.startsWith('locked ')) {
        lockedReason = line === 'locked' ? '' : line.substring('locked '.length)
      } else if (line === 'prunable' || line.startsWith('prunable ')) {
        prunableReason =
          line === 'prunable' ? '' : line.substring('prunable '.length)
      }
    }

    if (path === null) {
      log.debug(
        `[listWorkTrees] entry '${entry}' does not have a worktree path. Skipping...`
      )
      continue
    }

    worktrees.push({
      path,
      head,
      branch,
      isDetached,
      isBare,
      lockedReason,
      prunableReason,
    })
  }

  return worktrees
}

/** Enumerate the list of work trees reported by Git for a repository */
export async function listWorkTrees(
  repository: Repository
): Promise<ReadonlyArray<LinkedWorkTree>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorkTrees'
  )

  return parseWorktreeListPorcelain(result.stdout)
}

/**
 * Get the number of changed files in a worktree.
 * This runs git status in the worktree path.
 */
export async function getWorktreeStatusCount(
  worktreePath: string
): Promise<number> {
  try {
    const repo = new Repository(worktreePath, -1, null, false)
    const status = await getStatus(repo)
    return status?.workingDirectory.files.length ?? 0
  } catch (e) {
    log.debug(`[getWorktreeStatusCount] failed for ${worktreePath}:`, e)
    return 0
  }
}

/** Options controlling how a new worktree is created. */
export interface IAddWorktreeOptions {
  /**
   * When set, create a new branch with this name in the worktree
   * (`git worktree add -b <name>`). When omitted, `committish` is checked
   * out directly.
   */
  readonly newBranch?: string
  /**
   * Branch name or commit-ish the worktree starts from. When `newBranch`
   * is set this is the start point; otherwise it is the ref to check out.
   * Omitted entirely, Git derives a branch from the path basename.
   */
  readonly committish?: string
  /**
   * Pass `--force`. Needed when the target branch is already checked out
   * in another worktree, or the target directory already exists.
   */
  readonly force?: boolean
}

/**
 * Create a new linked worktree for `repository` at `worktreePath`.
 *
 * Throws `GitError` when Git refuses (path already populated, branch
 * already checked out elsewhere, …) so the caller can surface the message.
 */
export async function addWorktree(
  repository: Repository,
  worktreePath: string,
  options: IAddWorktreeOptions = {}
): Promise<void> {
  const args = ['worktree', 'add']
  if (options.force === true) {
    args.push('--force')
  }
  if (options.newBranch !== undefined && options.newBranch.length > 0) {
    args.push('-b', options.newBranch)
  }
  args.push(worktreePath)
  if (options.committish !== undefined && options.committish.length > 0) {
    args.push(options.committish)
  }
  await git(args, repository.path, 'addWorktree')
}

/**
 * Remove the linked worktree at `worktreePath`.
 *
 * Git refuses to remove a worktree with uncommitted changes or a locked
 * worktree unless `force` is set. Throws `GitError` on refusal.
 */
export async function removeWorktree(
  repository: Repository,
  worktreePath: string,
  force: boolean = false
): Promise<void> {
  const args = ['worktree', 'remove']
  if (force) {
    args.push('--force')
  }
  args.push(worktreePath)
  await git(args, repository.path, 'removeWorktree')
}

/**
 * Prune worktree administrative entries whose working directory is gone
 * (`git worktree prune`). Safe to run at any time — it only clears stale
 * bookkeeping, never a live worktree.
 */
export async function pruneWorktrees(repository: Repository): Promise<void> {
  await git(['worktree', 'prune'], repository.path, 'pruneWorktrees')
}
