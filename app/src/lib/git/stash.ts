import { GitError as DugiteError } from 'dugite'
import { git, GitError } from './core'
import { Repository } from '../../models/repository'
import {
  IStashEntry,
  StashedChangesLoadStates,
  StashedFileChanges,
} from '../../models/stash-entry'
import {
  WorkingDirectoryFileChange,
  CommittedFileChange,
} from '../../models/status'
import { parseRawLogWithNumstat } from './log'
import { stageFiles } from './update-index'
import { Branch } from '../../models/branch'
import { createLogParser } from './git-delimiter-parser'

export const DesktopStashEntryMarker = '!!GitHub_Desktop'

/**
 * RegEx for determining if a stash entry is created by Desktop
 *
 * This is done by looking for a magic string with the following
 * format: `!!GitHub_Desktop<branch>`
 */
const desktopStashEntryMessageRe = /!!GitHub_Desktop<(.+)>$/

type StashResult = {
  /** The stash entries created by Desktop */
  readonly desktopEntries: ReadonlyArray<IStashEntry>

  /**
   * The total amount of stash entries,
   * i.e. stash entries created both by Desktop and outside of Desktop
   */
  readonly stashEntryCount: number
}

/**
 * Get the list of stash entries created by Desktop in the current repository
 * using the default ordering of refs (which is LIFO ordering),
 * as well as the total amount of stash entries.
 */
export async function getStashes(repository: Repository): Promise<StashResult> {
  const entries = await readStashLog(repository)
  const desktopEntries: Array<IStashEntry> = []
  const files: StashedFileChanges = { kind: StashedChangesLoadStates.NotLoaded }

  for (const { name, message, stashSha, tree, parents, stashedAt } of entries) {
    const branchName = extractBranchFromMessage(message)

    if (branchName !== null) {
      desktopEntries.push({
        name,
        stashSha,
        branchName,
        message,
        stashedAt,
        tree,
        parents: parents.length > 0 ? parents.split(' ') : [],
        files,
      })
    }
  }

  return { desktopEntries, stashEntryCount: entries.length }
}

/**
 * Get every stash entry in the repository (Desktop-created and CLI-created),
 * in LIFO order. Unlike `getStashes`, this does not filter by the Desktop
 * marker — it powers the stash management UI where users want to see and
 * manage every stash they have.
 *
 * For CLI-created stashes the `branchName` is parsed out of the standard
 * `WIP on <branch>: ...` / `On <branch>: ...` reflog message. If the branch
 * cannot be parsed it is reported as an empty string.
 */
export async function getAllStashes(
  repository: Repository
): Promise<ReadonlyArray<IStashEntry>> {
  const entries = await readStashLog(repository)
  const files: StashedFileChanges = { kind: StashedChangesLoadStates.NotLoaded }

  return entries.map(({ name, message, stashSha, tree, parents, stashedAt }) => ({
    name,
    stashSha,
    branchName:
      extractBranchFromMessage(message) ??
      extractBranchFromCliMessage(message) ??
      '',
    message,
    stashedAt,
    tree,
    parents: parents.length > 0 ? parents.split(' ') : [],
    files,
  }))
}

interface IRawStashLogEntry {
  readonly name: string
  readonly stashSha: string
  readonly message: string
  readonly tree: string
  readonly parents: string
  readonly stashedAt: number
}

async function readStashLog(
  repository: Repository
): Promise<ReadonlyArray<IRawStashLogEntry>> {
  const { formatArgs, parse } = createLogParser({
    name: '%gD',
    stashSha: '%H',
    message: '%gs',
    tree: '%T',
    parents: '%P',
    stashedAtStr: '%ct',
  })

  const result = await git(
    ['log', '-g', ...formatArgs, 'refs/stash', '--'],
    repository.path,
    'getStashEntries',
    { successExitCodes: new Set([0, 128]) }
  )

  // There's no refs/stash reflog (no stashes, or not a repo).
  if (result.exitCode === 128) {
    return []
  }

  return parse(result.stdout).map(e => ({
    name: e.name,
    stashSha: e.stashSha,
    message: e.message,
    tree: e.tree,
    parents: e.parents,
    stashedAt: parseInt(e.stashedAtStr, 10) || 0,
  }))
}

/**
 * Moves a stash entry to a different branch by means of creating
 * a new stash entry associated with the new branch and dropping the old
 * stash entry.
 */
export async function moveStashEntry(
  repository: Repository,
  { stashSha, parents, tree }: IStashEntry,
  branchName: string
) {
  const message = `On ${branchName}: ${createDesktopStashMessage(branchName)}`
  const parentArgs = parents.flatMap(p => ['-p', p])

  const { stdout: commitId } = await git(
    ['commit-tree', ...parentArgs, '-m', message, '--no-gpg-sign', tree],
    repository.path,
    'moveStashEntryToBranch'
  )

  await git(
    ['stash', 'store', '-m', message, commitId.trim()],
    repository.path,
    'moveStashEntryToBranch'
  )

  await dropDesktopStashEntry(repository, stashSha)
}

/**
 * Returns the last Desktop created stash entry for the given branch
 */
export async function getLastDesktopStashEntryForBranch(
  repository: Repository,
  branch: Branch | string
) {
  const stash = await getStashes(repository)
  const branchName = typeof branch === 'string' ? branch : branch.name

  // Since stash objects are returned in a LIFO manner, the first
  // entry found is guaranteed to be the last entry created
  return (
    stash.desktopEntries.find(stash => stash.branchName === branchName) || null
  )
}

/** Creates a stash entry message that indicates the entry was created by Desktop */
export function createDesktopStashMessage(branchName: string) {
  return `${DesktopStashEntryMarker}<${branchName}>`
}

/**
 * Stash the working directory changes for the current branch
 */
export async function createDesktopStashEntry(
  repository: Repository,
  branch: Branch | string,
  untrackedFilesToStage: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<boolean> {
  // We must ensure that no untracked files are present before stashing
  // See https://github.com/desktop/desktop/pull/8085
  // First ensure that all changes in file are selected
  // (in case the user has not explicitly checked the checkboxes for the untracked files)
  const fullySelectedUntrackedFiles = untrackedFilesToStage.map(x =>
    x.withIncludeAll(true)
  )
  await stageFiles(repository, fullySelectedUntrackedFiles)

  const branchName = typeof branch === 'string' ? branch : branch.name
  const message = createDesktopStashMessage(branchName)
  const args = ['stash', 'push', '-m', message]

  const result = await git(args, repository.path, 'createStashEntry', {
    successExitCodes: new Set<number>([0, 1]),
  })

  if (result.exitCode === 1) {
    // search for any line starting with `error:` -  /m here to ensure this is
    // applied to each line, without needing to split the text
    const errorPrefixRe = /^error: /m

    const matches = errorPrefixRe.exec(result.stderr)
    if (matches !== null && matches.length > 0) {
      // rethrow, because these messages should prevent the stash from being created
      throw new GitError(result, args)
    }

    // if no error messages were emitted by Git, we should log but continue because
    // a valid stash was created and this should not interfere with the checkout

    log.info(
      `[createDesktopStashEntry] a stash was created successfully but exit code ${result.exitCode} reported. stderr: ${result.stderr}`
    )
  }

  // Stash doesn't consider it an error that there aren't any local changes to save.
  if (result.stdout === 'No local changes to save\n') {
    return false
  }

  return true
}

async function getStashEntryMatchingSha(repository: Repository, sha: string) {
  const stash = await getStashes(repository)
  return stash.desktopEntries.find(e => e.stashSha === sha) || null
}

/**
 * Removes the given stash entry if it exists
 *
 * @param stashSha the SHA that identifies the stash entry
 */
export async function dropDesktopStashEntry(
  repository: Repository,
  stashSha: string
) {
  const entryToDelete = await getStashEntryMatchingSha(repository, stashSha)

  if (entryToDelete !== null) {
    const args = ['stash', 'drop', entryToDelete.name]
    await git(args, repository.path, 'dropStashEntry')
  }
}

/**
 * Pops the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function popStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  // ignoring these git errors for now, this will change when we start
  // implementing the stash conflict flow
  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const successExitCodes = new Set<number>([0, 1])
  const stashToPop = await getStashEntryMatchingSha(repository, stashSha)

  if (stashToPop !== null) {
    const args = ['stash', 'pop', '--quiet', `${stashToPop.name}`]
    const result = await git(args, repository.path, 'popStashEntry', {
      expectedErrors,
      successExitCodes,
    })

    // popping a stashes that create conflicts in the working directory
    // report an exit code of `1` and are not dropped after being applied.
    // so, we check for this case and drop them manually
    if (result.exitCode === 1) {
      if (result.stderr.length > 0) {
        // rethrow, because anything in stderr should prevent the stash from being popped
        throw new GitError(result, args)
      }

      log.info(
        `[popStashEntry] a stash was popped successfully but exit code ${result.exitCode} reported.`
      )
      // bye bye
      await dropDesktopStashEntry(repository, stashSha)
    }
  }
}

function extractBranchFromMessage(message: string): string | null {
  const match = desktopStashEntryMessageRe.exec(message)
  return match === null || match[1].length === 0 ? null : match[1]
}

/**
 * Parse a CLI-style stash reflog message and return the branch the stash was
 * created on. Recognized forms (per git stash documentation):
 *   "WIP on <branch>: <commit-hash> <subject>"
 *   "On <branch>: <user-message>"
 */
const cliStashOnBranchRe = /^(?:WIP on|On) ([^:]+):/
function extractBranchFromCliMessage(message: string): string | null {
  const m = cliStashOnBranchRe.exec(message)
  return m === null || m[1].length === 0 ? null : m[1]
}

/**
 * Apply a stash entry without dropping it.
 *
 * Returns silently if the SHA does not match any known stash. Throws on merge
 * conflicts so the caller can route the user into the conflict resolution flow.
 */
export async function applyStash(
  repository: Repository,
  stashSha: string
): Promise<void> {
  const stashes = await getAllStashes(repository)
  const match = stashes.find(e => e.stashSha === stashSha)
  if (match === undefined) {
    return
  }

  const expectedErrors = new Set<DugiteError>([DugiteError.MergeConflicts])
  const successExitCodes = new Set<number>([0, 1])
  const args = ['stash', 'apply', '--quiet', match.name]

  const result = await git(args, repository.path, 'applyStash', {
    expectedErrors,
    successExitCodes,
  })

  // exit 1 with non-empty stderr means a real error (not just conflicts).
  if (result.exitCode === 1 && result.stderr.length > 0) {
    throw new GitError(result, args)
  }
}

/**
 * Stash the working directory with a user-provided message.
 *
 * @param message            Free-form description shown in the stash list.
 * @param includeUntracked   When true, passes `--include-untracked` so
 *                           untracked files are stashed too.
 * @returns true when a stash entry was created, false when the working
 *          directory had no changes to stash.
 */
export async function createStashWithMessage(
  repository: Repository,
  message: string,
  includeUntracked: boolean
): Promise<boolean> {
  const args = ['stash', 'push']
  if (includeUntracked) {
    args.push('--include-untracked')
  }
  // Always supply -m so callers cannot accidentally inject a flag via message.
  args.push('-m', message)

  const result = await git(args, repository.path, 'createStashWithMessage', {
    successExitCodes: new Set<number>([0, 1]),
  })

  if (result.exitCode === 1) {
    const errorPrefixRe = /^error: /m
    if (errorPrefixRe.test(result.stderr)) {
      throw new GitError(result, args)
    }
    log.info(
      `[createStashWithMessage] stash created but exit code 1 reported. stderr: ${result.stderr}`
    )
  }

  if (result.stdout === 'No local changes to save\n') {
    return false
  }

  return true
}

/** Get the files that were changed in the given stash commit */
export async function getStashedFiles(
  repository: Repository,
  stashSha: string
): Promise<ReadonlyArray<CommittedFileChange>> {
  const args = [
    'stash',
    'show',
    stashSha,
    '--raw',
    '--numstat',
    '-z',
    '--format=format:',
    '--no-show-signature',
    '--',
  ]

  const { stdout } = await git(args, repository.path, 'getStashedFiles')

  return parseRawLogWithNumstat(stdout, stashSha, `${stashSha}^`).files
}
