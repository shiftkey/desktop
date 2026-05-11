import * as path from 'path'
import * as FSE from 'fs-extra'

import { Repository } from '../../../src/models/repository'
import { getWorkingDirectoryStats } from '../../../src/lib/git/working-directory-stats'
import { setupEmptyRepository, setupFixtureRepository } from '../../helpers/repositories'
import { exec } from 'dugite'

const _temp = require('temp').track()

describe('git/working-directory-stats', () => {
  describe('getWorkingDirectoryStats', () => {
    it('returns null for empty repository with no changes', async () => {
      const repo = await setupEmptyRepository()
      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).toBeNull()
    })

    it('counts additions and deletions for a modified file', async () => {
      const repo = await setupFixtureRepository('test-repo')
      const filePath = path.join(repo.path, 'README.md')
      const originalContent = await FSE.readFile(filePath, 'utf8')
      const newContent = originalContent + '\nNew line 1\nNew line 2\nNew line 3\n'
      await FSE.writeFile(filePath, newContent)

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(3)
      expect(stats!.deletions).toBe(0)
    })

    it('counts deletions for removed lines', async () => {
      const repo = await setupFixtureRepository('test-repo')
      const filePath = path.join(repo.path, 'README.md')
      const originalContent = await FSE.readFile(filePath, 'utf8')
      const lines = originalContent.split('\n')
      const newContent = lines.slice(0, -2).join('\n')
      await FSE.writeFile(filePath, newContent)

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(0)
      expect(stats!.deletions).toBe(2)
    })

    it('handles a new untracked file', async () => {
      const repo = await setupEmptyRepository()
      const filePath = path.join(repo.path, 'new-file.txt')
      await FSE.writeFile(filePath, 'Line 1\nLine 2\nLine 3\n')

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(3)
      expect(stats!.deletions).toBe(0)
    })

    it('handles multiple files', async () => {
      const repo = await setupEmptyRepository()
      await FSE.writeFile(path.join(repo.path, 'file-a.txt'), 'A1\nA2\n')
      await FSE.writeFile(path.join(repo.path, 'file-b.txt'), 'B1\nB2\nB3\n')

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(2)
      expect(stats!.additions).toBe(5)
      expect(stats!.deletions).toBe(0)
    })

    it('handles binary files', async () => {
      const repo = await setupEmptyRepository()
      // Create a binary-looking file
      const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      await FSE.writeFile(path.join(repo.path, 'binary.png'), buffer)

      const stats = await getWorkingDirectoryStats(repo)
      expect(stats).not.toBeNull()
      expect(stats!.files).toBe(1)
      expect(stats!.additions).toBe(0)
      expect(stats!.deletions).toBe(0)
    })
  })
})
