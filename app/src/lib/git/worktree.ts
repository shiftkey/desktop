import { git } from './core'
import { Repository, LinkedWorkTree } from '../../models/repository'
import { getStatus } from './status'

/** Enumerate the list of work trees reported by Git for a repository */
export async function listWorkTrees(
  repository: Repository
): Promise<ReadonlyArray<LinkedWorkTree>> {
  const result = await git(
    ['worktree', 'list', '--porcelain'],
    repository.path,
    'listWorkTrees'
  )

  const worktrees = new Array<LinkedWorkTree>()

  // the porcelain output from git-worktree covers multiple lines
  const listWorkTreeRe =
    /worktree (.*)\nHEAD ([a-f0-9]*)\n(branch .*|detached)\n/gm

  const matches = Array.from(result.stdout.matchAll(listWorkTreeRe))
  matches.forEach(m => {
    if (m.length === 4) {
      worktrees.push({
        path: m[1],
        head: m[2],
      })
    } else {
      log.debug(
        `[listWorkTrees] match '${m[0]}' does not have the expected data or output. Skipping...`
      )
    }
  })

  return worktrees
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
