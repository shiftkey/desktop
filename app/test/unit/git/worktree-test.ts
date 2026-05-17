import * as Os from 'os'
import * as Path from 'path'
import * as FSE from 'fs-extra'
import { exec } from 'dugite'

import { setupEmptyRepository } from '../../helpers/repositories'
import {
  listWorkTrees,
  getWorktreeStatusCount,
  parseWorktreeListPorcelain,
} from '../../../src/lib/git/worktree'
import { Repository } from '../../../src/models/repository'

describe('git/worktree', () => {
  describe('parseWorktreeListPorcelain', () => {
    it('parses entries with optional porcelain fields', () => {
      const result = parseWorktreeListPorcelain(
        [
          'worktree /repo',
          'HEAD 1111111111111111111111111111111111111111',
          'branch refs/heads/main',
          '',
          'worktree /repo-linked',
          'HEAD 2222222222222222222222222222222222222222',
          'detached',
          'locked',
          '',
        ].join('\n')
      )

      expect(result).toEqual([
        {
          path: '/repo',
          head: '1111111111111111111111111111111111111111',
        },
        {
          path: '/repo-linked',
          head: '2222222222222222222222222222222222222222',
        },
      ])
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
})
