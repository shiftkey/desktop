import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Get the set of canonical branch refs (e.g. `refs/heads/feature`)
 * checked out in any worktree (main or linked).
 */
export async function getWorktreeCheckedOutBranches(
  repository: Repository
): Promise<ReadonlySet<string>> {
  const result = await git(
    ['worktree', 'list', '--porcelain', '-z'],
    repository.path,
    'getWorktreeCheckedOutBranches'
  )

  const branches = new Set<string>()

  // With -z, lines are NUL-terminated and blocks are separated by
  // double NUL (i.e. an empty string between two NUL terminators).
  const blocks = result.stdout.split('\0\0')

  for (const block of blocks) {
    for (const line of block.split('\0')) {
      if (line.startsWith('branch ')) {
        branches.add(line.substring('branch '.length))
      }
    }
  }

  return branches
}
