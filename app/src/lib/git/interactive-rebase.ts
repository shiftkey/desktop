import { rm, writeFile } from 'fs/promises'
import { IInteractiveRebaseEntry } from '../../models/multi-commit-operation'
import { IMultiCommitOperationProgress } from '../../models/progress'
import { Repository } from '../../models/repository'
import { getTempFilePath } from '../file-system'
import { rebaseInteractive, RebaseResult } from './rebase'
import { Commit } from '../../models/commit'

/**
 * Executes an interactive rebase using a user-defined todo list.
 *
 * Entries are provided newest-first (matching the UI display order). The
 * function reverses them before writing the git todo file so git processes
 * them oldest-first as expected by `git rebase -i`.
 */
export async function interactiveRebase(
  repository: Repository,
  entries: ReadonlyArray<IInteractiveRebaseEntry>,
  lastRetainedCommitRef: string | null,
  progressCallback?: (progress: IMultiCommitOperationProgress) => void,
  allCommits?: ReadonlyArray<Commit>
): Promise<RebaseResult> {
  if (entries.length === 0) {
    return RebaseResult.Error
  }

  let todoPath: string | undefined

  try {
    todoPath = await getTempFilePath('interactiveRebaseTodo')

    // Entries arrive newest-first; git expects oldest-first in the todo file.
    const lines = [...entries]
      .reverse()
      .map(e => `${e.action} ${e.commit.sha} ${e.commit.summary}`)
      .join('\n')

    await writeFile(todoPath, lines + '\n', 'utf8')

    return await rebaseInteractive(
      repository,
      todoPath,
      lastRetainedCommitRef,
      'Interactive Rebase',
      ':',
      progressCallback,
      allCommits
    )
  } finally {
    if (todoPath !== undefined) {
      await rm(todoPath, { force: true }).catch(() => undefined)
    }
  }
}
