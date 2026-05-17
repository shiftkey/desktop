import { git } from './core'
import { Repository, LinkedWorkTree } from '../../models/repository'
import { getStatus } from './status'

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
    let head = '0000000000000000000000000000000000000000'

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.substring('worktree '.length)
      } else if (line.startsWith('HEAD ')) {
        head = line.substring('HEAD '.length)
      }
    }

    if (path === null) {
      log.debug(
        `[listWorkTrees] entry '${entry}' does not have a worktree path. Skipping...`
      )
      continue
    }

    worktrees.push({ path, head })
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
