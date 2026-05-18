import { dirname } from 'path'
import { remove } from 'fs-extra'
import { Repository } from '../../models/repository'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { getTempFilePath } from '../file-system'
import { git } from '.'

/**
 * Compute aggregate diff statistics for the working directory.
 *
 * The stats cover every pending change — tracked modifications,
 * tracked deletions, and brand-new untracked files. `git diff HEAD`
 * on its own ignores untracked files, so to include them the changes
 * are staged with `--intent-to-add` into a throwaway index and then
 * diffed against HEAD. The throwaway index keeps the repository's
 * real index untouched, and `--intent-to-add` records only the path
 * (no blob is written to the object database).
 *
 * Binary files appear as `-\t-\t` and are counted as 0 additions /
 * 0 deletions. Files ignored via .gitignore are excluded.
 */
export async function getWorkingDirectoryStats(
  repository: Repository
): Promise<IWorkingDirectoryStats | null> {
  let indexPath: string | null = null
  let result

  try {
    indexPath = await getTempFilePath('desktop-working-dir-stats-index')
    const env = { GIT_INDEX_FILE: indexPath }

    // Seed the throwaway index with the HEAD tree, then stage every
    // change (including untracked files) with intent-to-add so the
    // diff against HEAD reflects the full set of pending changes.
    // `read-tree` fails when the repository has no commits yet, which
    // is caught below and reported as "no stats".
    await git(
      ['read-tree', 'HEAD'],
      repository.path,
      'getWorkingDirectoryStats',
      { env }
    )
    await git(
      ['add', '--all', '--intent-to-add'],
      repository.path,
      'getWorkingDirectoryStats',
      { env }
    )
    result = await git(
      ['diff', '--numstat', '-z', 'HEAD', '--'],
      repository.path,
      'getWorkingDirectoryStats',
      { env }
    )
  } catch {
    // Repositories without any commits don't have a HEAD yet.
    return null
  } finally {
    if (indexPath !== null) {
      await remove(dirname(indexPath)).catch(() => {})
    }
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
