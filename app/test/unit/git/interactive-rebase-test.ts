import { interactiveRebase } from '../../../src/lib/git/interactive-rebase'
import { getCommits } from '../../../src/lib/git'
import { RebaseResult } from '../../../src/lib/git/rebase'
import {
  IInteractiveRebaseEntry,
  RebaseTodoAction,
} from '../../../src/models/multi-commit-operation'
import { Commit } from '../../../src/models/commit'
import { Repository } from '../../../src/models/repository'
import { setupEmptyRepository } from '../../helpers/repositories'
import { makeCommit } from '../../helpers/repository-scaffolding'

async function commitFile(
  repository: Repository,
  path: string,
  message: string
): Promise<void> {
  await makeCommit(repository, {
    entries: [{ path, contents: path }],
    commitMessage: message,
  })
}

/**
 * Builds a repo with a base commit followed by three commits, each touching a
 * distinct file so reordering and squashing never conflict. Returns the three
 * commits above the base in newest-first order (the order the history view and
 * the dialog use) plus the base ref the dialog would compute for them.
 */
async function setupRepoWithBase(): Promise<{
  repository: Repository
  commits: ReadonlyArray<Commit>
  base: string
}> {
  const repository = await setupEmptyRepository()

  await commitFile(repository, 'base.txt', 'Base commit')
  await commitFile(repository, 'a.txt', 'Commit A')
  await commitFile(repository, 'b.txt', 'Commit B')
  await commitFile(repository, 'c.txt', 'Commit C')

  // getCommits returns newest-first: [C, B, A, Base]. The editable window is
  // the three commits above the base.
  const all = await getCommits(repository, 'HEAD', 10)
  const commits = all.slice(0, 3)
  const oldest = commits.at(-1)!
  return { repository, commits, base: `${oldest.sha}^` }
}

function entriesFrom(
  commits: ReadonlyArray<Commit>,
  actions: ReadonlyArray<RebaseTodoAction>
): ReadonlyArray<IInteractiveRebaseEntry> {
  return commits.map((commit, i) => ({ commit, action: actions[i] }))
}

describe('git/interactiveRebase', () => {
  it('returns an error for an empty todo list', async () => {
    const { repository } = await setupRepoWithBase()
    const result = await interactiveRebase(repository, [], null)
    expect(result).toBe(RebaseResult.Error)
  })

  it('is a no-op when every commit is picked in place', async () => {
    const { repository, commits, base } = await setupRepoWithBase()

    const result = await interactiveRebase(
      repository,
      entriesFrom(commits, ['pick', 'pick', 'pick']),
      base
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const after = await getCommits(repository, 'HEAD', 10)
    expect(after.map(c => c.summary)).toEqual([
      'Commit C',
      'Commit B',
      'Commit A',
      'Base commit',
    ])
  })

  it('drops a commit from the middle of the range', async () => {
    const { repository, commits, base } = await setupRepoWithBase()

    // commits are [C, B, A] newest-first; drop B.
    const result = await interactiveRebase(
      repository,
      entriesFrom(commits, ['pick', 'drop', 'pick']),
      base
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const after = await getCommits(repository, 'HEAD', 10)
    expect(after.map(c => c.summary)).toEqual([
      'Commit C',
      'Commit A',
      'Base commit',
    ])
  })

  it('reorders commits according to the todo order', async () => {
    const { repository, commits, base } = await setupRepoWithBase()

    // Display order [C, B, A] -> move B above C, giving [B, C, A].
    const [c, b, a] = commits
    const reordered = [b, c, a]
    const result = await interactiveRebase(
      repository,
      reordered.map(commit => ({ commit, action: 'pick' as RebaseTodoAction })),
      base
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const after = await getCommits(repository, 'HEAD', 10)
    expect(after.map(c => c.summary)).toEqual([
      'Commit B',
      'Commit C',
      'Commit A',
      'Base commit',
    ])
  })

  it('squashes the newest commit into the one below it', async () => {
    const { repository, commits, base } = await setupRepoWithBase()

    // commits are [C, B, A]; squash C into B (the older commit below it).
    const result = await interactiveRebase(
      repository,
      entriesFrom(commits, ['squash', 'pick', 'pick']),
      base
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const after = await getCommits(repository, 'HEAD', 10)
    expect(after.map(c => c.summary)).toEqual([
      'Commit B',
      'Commit A',
      'Base commit',
    ])
  })

  it('rebases from --root when no base ref is given', async () => {
    const repository = await setupEmptyRepository()
    await commitFile(repository, 'a.txt', 'Commit A')
    await commitFile(repository, 'b.txt', 'Commit B')
    await commitFile(repository, 'c.txt', 'Commit C')

    // [C, B, A] with A as the repository root; drop the oldest while rebasing
    // onto --root (lastRetainedCommitRef is null).
    const commits = await getCommits(repository, 'HEAD', 10)
    const result = await interactiveRebase(
      repository,
      entriesFrom(commits, ['pick', 'pick', 'drop']),
      null
    )

    expect(result).toBe(RebaseResult.CompletedWithoutError)

    const after = await getCommits(repository, 'HEAD', 10)
    expect(after.map(c => c.summary)).toEqual(['Commit C', 'Commit B'])
  })
})
