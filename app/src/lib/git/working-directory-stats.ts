import { Repository } from '../../models/repository'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { git } from '.'

/**
 * Compute aggregate diff statistics for the working directory
 * by running `git diff --numstat -z HEAD`.
 *
 * Binary files appear as `-\t-\t` and are counted as 0 additions / 0 deletions.
 * Untracked files are included because diffing against HEAD picks them up
 * as additions (the entire file).
 */
export async function getWorkingDirectoryStats(
  repository: Repository
): Promise<IWorkingDirectoryStats | null> {
  let result
  try {
    result = await git(
      ['diff', '--numstat', '-z', 'HEAD', '--'],
      repository.path,
      'getWorkingDirectoryStats'
    )
  } catch {
    // Repositories without any commits don't have a HEAD yet.
    return null
  }

  if (result.stdout.length === 0) {
    return null
  }

  let files = 0
  let additions = 0
  let deletions = 0

  const entries = result.stdout.split('\0')

  for (const entry of entries) {
    if (entry.trim().length === 0) {
      continue
    }

    // Format: "<added>\t<deleted>\t<path>"
    // Binary files: "-\t-\t<path>"
    const match = /^(\d+|-)\t(\d+|-)\t/.exec(entry)

    if (match) {
      const [, addedStr, deletedStr] = match
      const added = addedStr === '-' ? 0 : parseInt(addedStr, 10)
      const deleted = deletedStr === '-' ? 0 : parseInt(deletedStr, 10)

      additions += added
      deletions += deleted
      files++
    }
  }

  return { files, additions, deletions }
}
