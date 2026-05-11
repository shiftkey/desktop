import * as path from 'path'
import * as FSE from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import { getWorkingDirectoryStats } from '../../../src/lib/git/working-directory-stats'
import { setupEmptyRepository } from '../../helpers/repositories'
import { exec } from 'dugite'

async function makeInitialCommit(repo: Repository) {
  await FSE.writeFile(path.join(repo.path, 'README.md'), '# Hello\n')
  await exec(['add', 'README.md'], repo.path)
  await exec(['commit', '-m', 'Initial commit'], repo.path)
}

describe('git/working-directory-stats', () => {
  describe('getWorkingDirectoryStats', () => {
    it('returns null for empty repository with no changes', async () => {
      const repo = await setupEmptyRepository()
      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).toBeNull()
    })

    it('counts additions for a modified file', async () => {
      const repo = await setupEmptyRepository()
      await makeInitialCommit(repo)
      await FSE.writeFile(
        path.join(repo.path, 'README.md'),
        '# Hello\nNew line 1\nNew line 2\nNew line 3\n'
      )

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(3)
      expect(stats!.deletions).toBe(0)
    })

    it('counts deletions for removed lines', async () => {
      const repo = await setupEmptyRepository()
      await makeInitialCommit(repo)
      await FSE.writeFile(path.join(repo.path, 'README.md'), '# Hel\n')

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(1)
      expect(stats!.deletions).toBe(1)
    })

    it('handles a new untracked file in repo with commits', async () => {
      const repo = await setupEmptyRepository()
      await makeInitialCommit(repo)
      const filePath = path.join(repo.path, 'new-file.txt')
      await FSE.writeFile(filePath, 'Line 1\nLine 2\nLine 3\n')

      const stats = await getWorkingDirectoryStats(repo)
      // git diff --numstat HEAD does not include untracked files
      expect(stats).toBeNull()
    })

    it('handles multiple tracked files', async () => {
      const repo = await setupEmptyRepository()
      await makeInitialCommit(repo)
      await FSE.writeFile(path.join(repo.path, 'file-a.txt'), 'A1\nA2\n')
      await FSE.writeFile(path.join(repo.path, 'file-b.txt'), 'B1\nB2\nB3\n')
      await exec(['add', '.'], repo.path)

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(2)
      expect(stats!.additions).toBe(5)
      expect(stats!.deletions).toBe(0)
    })

    it('handles binary files', async () => {
      const repo = await setupEmptyRepository()
      await makeInitialCommit(repo)
      // Create a binary-looking file with enough content for git to detect it as binary
      const buffer = Buffer.alloc(1024)
      buffer[0] = 0x89
      buffer[1] = 0x50
      buffer[2] = 0x4e
      buffer[3] = 0x47
      await FSE.writeFile(path.join(repo.path, 'binary.png'), buffer)
      await exec(['add', 'binary.png'], repo.path)

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(0)
      expect(stats!.deletions).toBe(0)
    })
  })
})
