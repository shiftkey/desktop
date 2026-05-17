import * as Os from 'os'
import * as Path from 'path'
import * as FSE from 'fs-extra'
import { exec } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import {
  listWorkTrees,
  getWorktreeStatusCount,
  parseWorktreeListPorcelain,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
} from '../../../src/lib/git/worktree'
import { Repository } from '../../../src/models/repository'

describe('git/worktree', () => {
  describe('parseWorktreeListPorcelain', () => {
    it('parses the checked-out branch and shortens the ref', () => {
      const result = parseWorktreeListPorcelain(
        [
          'worktree /repo',
          'HEAD 1111111111111111111111111111111111111111',
          'branch refs/heads/main',
          '',
          'worktree /repo-feature',
          'HEAD 2222222222222222222222222222222222222222',
          'branch refs/heads/feature/login',
          '',
        ].join('\n')
      )

      expect(result).toEqual([
        {
          path: '/repo',
          head: '1111111111111111111111111111111111111111',
          branch: 'main',
          isDetached: false,
          isBare: false,
          lockedReason: null,
          prunableReason: null,
        },
        {
          path: '/repo-feature',
          head: '2222222222222222222222222222222222222222',
          branch: 'feature/login',
          isDetached: false,
          isBare: false,
          lockedReason: null,
          prunableReason: null,
        },
      ])
    })

    it('marks a detached worktree and leaves its branch null', () => {
      const [entry] = parseWorktreeListPorcelain(
        [
          'worktree /repo-detached',
          'HEAD 3333333333333333333333333333333333333333',
          'detached',
          '',
        ].join('\n')
      )

      expect(entry.branch).toBeNull()
      expect(entry.isDetached).toBe(true)
      expect(entry.head).toBe('3333333333333333333333333333333333333333')
    })

    it('marks the bare repository entry', () => {
      const [entry] = parseWorktreeListPorcelain(
        ['worktree /bare-repo', 'bare', ''].join('\n')
      )

      expect(entry.isBare).toBe(true)
      expect(entry.branch).toBeNull()
      expect(entry.head).toBe('0000000000000000000000000000000000000000')
    })

    it('captures lock state with and without a reason', () => {
      const result = parseWorktreeListPorcelain(
        [
          'worktree /repo-locked-bare',
          'HEAD 4444444444444444444444444444444444444444',
          'branch refs/heads/a',
          'locked',
          '',
          'worktree /repo-locked-reason',
          'HEAD 5555555555555555555555555555555555555555',
          'branch refs/heads/b',
          'locked on a removable drive',
          '',
        ].join('\n')
      )

      expect(result[0].lockedReason).toBe('')
      expect(result[1].lockedReason).toBe('on a removable drive')
    })

    it('captures prunable state with its reason', () => {
      const [entry] = parseWorktreeListPorcelain(
        [
          'worktree /repo-gone',
          'HEAD 6666666666666666666666666666666666666666',
          'detached',
          'prunable gitdir file points to non-existent location',
          '',
        ].join('\n')
      )

      expect(entry.prunableReason).toBe(
        'gitdir file points to non-existent location'
      )
    })

    it('skips entries with no worktree path and tolerates trailing blank lines', () => {
      const result = parseWorktreeListPorcelain(
        [
          'HEAD 7777777777777777777777777777777777777777',
          'branch refs/heads/orphan',
          '',
          'worktree /repo-valid',
          'HEAD 8888888888888888888888888888888888888888',
          'branch refs/heads/main',
          '',
          '',
        ].join('\n')
      )

      expect(result).toHaveLength(1)
      expect(result[0].path).toBe('/repo-valid')
    })
  })

  describe('listWorktrees', () => {
    describe('for an unborn repository', () => {
      let repository: Repository

      beforeEach(async () => {
        repository = await setupEmptyRepository()
      })

      it('returns one entry', async () => {
        const result = await listWorkTrees(repository)
        expect(result).toHaveLength(1)
      })

      it('contains the head of the main repository', async () => {
        const result = await listWorkTrees(repository)
        const first = result[0]
        expect(first.head).toBe('0000000000000000000000000000000000000000')
      })
    })

    describe('for a repository containing commits', () => {
      let repository: Repository
      let currentHeadSha: string

      beforeEach(async () => {
        repository = await setupEmptyRepository()
        await exec(
          ['commit', '--allow-empty', '-m', '"first commit!"'],
          repository.path
        )
        await exec(
          ['commit', '--allow-empty', '-m', '"second commit!"'],
          repository.path
        )

        const result = await exec(['rev-parse', 'HEAD'], repository.path)
        currentHeadSha = result.stdout.trim()
      })

      it('the head points to the right commit', async () => {
        const result = await listWorkTrees(repository)
        const first = result[0]
        expect(first.head).toBe(currentHeadSha)
      })

      describe('after adding a worktree manually', () => {
        const workTreePrefix = Path.join(
          Os.tmpdir(),
          'test-desktop-worktree-path'
        )
        let workTreePath: string

        beforeEach(async () => {
          workTreePath = await FSE.mkdtemp(workTreePrefix)
          const result = await exec(
            ['worktree', 'add', '-f', workTreePath, 'HEAD'],
            repository.path
          )
          expect(result.exitCode).toBe(0)
        })

        afterEach(async () => {
          await exec(
            ['worktree', 'remove', '-f', workTreePath],
            repository.path
          )
        })

        it('returns another entry', async () => {
          const result = await listWorkTrees(repository)
          expect(result).toHaveLength(2)
        })

        it('points to same commit sha', async () => {
          const result = await listWorkTrees(repository)
          const first = result[0]
          const last = result[1]
          expect(first.head).toBe(last.head)
        })
      })
    })
  })

  describe('getWorktreeStatusCount', () => {
    let repository: Repository
    let workTreePath: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      await exec(
        ['commit', '--allow-empty', '-m', '"initial commit"'],
        repository.path
      )
      workTreePath = await FSE.mkdtemp(
        Path.join(Os.tmpdir(), 'test-worktree-status')
      )
      await exec(
        ['worktree', 'add', '-f', workTreePath, 'HEAD'],
        repository.path
      )
    })

    afterEach(async () => {
      await exec(['worktree', 'remove', '-f', workTreePath], repository.path)
    })

    it('returns 0 for a clean worktree', async () => {
      const count = await getWorktreeStatusCount(workTreePath)
      expect(count).toBe(0)
    })

    it('returns the number of changes in a dirty worktree', async () => {
      const filePath = Path.join(workTreePath, 'new-file.txt')
      await FSE.writeFile(filePath, 'hello world')

      const count = await getWorktreeStatusCount(workTreePath)
      expect(count).toBe(1)
    })
  })

  describe('addWorktree / removeWorktree / pruneWorktrees', () => {
    let repository: Repository
    let worktreePath: string

    beforeEach(async () => {
      repository = await setupEmptyRepository()
      await exec(
        ['commit', '--allow-empty', '-m', 'initial commit'],
        repository.path
      )
      // git worktree add wants a path it can create itself.
      const parent = await FSE.mkdtemp(Path.join(Os.tmpdir(), 'wt-actions-'))
      worktreePath = Path.join(parent, 'linked')
    })

    afterEach(async () => {
      await exec(
        ['worktree', 'remove', '--force', worktreePath],
        repository.path
      ).catch(() => undefined)
      await FSE.remove(Path.dirname(worktreePath)).catch(() => undefined)
    })

    const linkedEntry = async () => {
      const trees = await listWorkTrees(repository)
      return trees.find(
        t => Path.resolve(t.path) === Path.resolve(worktreePath)
      )
    }

    it('creates a worktree on a new branch', async () => {
      await addWorktree(repository, worktreePath, { newBranch: 'feature-x' })
      expect(await listWorkTrees(repository)).toHaveLength(2)
      expect((await linkedEntry())?.branch).toBe('feature-x')
    })

    it('creates a worktree checking out an existing branch', async () => {
      await exec(['branch', 'existing'], repository.path)
      await addWorktree(repository, worktreePath, { committish: 'existing' })
      expect((await linkedEntry())?.branch).toBe('existing')
    })

    it('removes a worktree', async () => {
      await addWorktree(repository, worktreePath, { newBranch: 'feature-x' })
      await removeWorktree(repository, worktreePath)
      expect(await listWorkTrees(repository)).toHaveLength(1)
    })

    it('refuses to remove a dirty worktree without force', async () => {
      await addWorktree(repository, worktreePath, { newBranch: 'feature-x' })
      await FSE.writeFile(Path.join(worktreePath, 'dirty.txt'), 'uncommitted')
      await expect(
        removeWorktree(repository, worktreePath, false)
      ).rejects.toThrow()
      // With force the removal succeeds.
      await removeWorktree(repository, worktreePath, true)
      expect(await listWorkTrees(repository)).toHaveLength(1)
    })

    it('prunes bookkeeping for a worktree whose folder is gone', async () => {
      await addWorktree(repository, worktreePath, { newBranch: 'feature-x' })
      await FSE.remove(worktreePath)
      await pruneWorktrees(repository)
      expect(await listWorkTrees(repository)).toHaveLength(1)
    })
  })
})
