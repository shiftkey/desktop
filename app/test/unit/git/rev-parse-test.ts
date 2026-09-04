import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import { mkdir, writeFile } from 'fs/promises'

import { Repository } from '../../../src/models/repository'
import { getRepositoryType } from '../../../src/lib/git/rev-parse'
import { git } from '../../../src/lib/git/core'
import {
  setupFixtureRepository,
  setupEmptyRepository,
} from '../../helpers/repositories'
import { exec } from 'dugite'
import { createTempDirectory } from '../../helpers/temp'

describe('git/rev-parse', () => {
  describe('getRepositoryType', () => {
    it('should return an absolute path when run inside a working directory', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      assert.deepEqual(await getRepositoryType(repository.path), {
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })

      const subdirPath = path.join(repository.path, 'subdir')
      await mkdir(subdirPath)

      assert.deepEqual(await getRepositoryType(subdirPath), {
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })
    })

    it('should return missing when not run inside a working directory', async t => {
      const result = await getRepositoryType(await createTempDirectory(t))
      assert.deepEqual(result, { kind: 'missing' })
    })

    it('should return correct path for submodules', async t => {
      const fixturePath = await createTempDirectory(t)

      const firstRepoPath = path.join(fixturePath, 'repo1')
      const secondRepoPath = path.join(fixturePath, 'repo2')

      await git(['init', 'repo1'], fixturePath, '')

      await git(['init', 'repo2'], fixturePath, '')

      await git(
        ['commit', '--allow-empty', '-m', 'Initial commit'],
        secondRepoPath,
        ''
      )

      await git(
        [
          // Git 2.38 (backported into 2.35.5) changed the default here to 'user'
          ...['-c', 'protocol.file.allow=always'],
          ...['submodule', 'add', '../repo2'],
        ],
        firstRepoPath,
        ''
      )

      assert.deepEqual(await getRepositoryType(firstRepoPath), {
        kind: 'regular',
        topLevelWorkingDirectory: firstRepoPath,
      })

      const subModulePath = path.join(firstRepoPath, 'repo2')
      assert.deepEqual(await getRepositoryType(subModulePath), {
        kind: 'regular',
        topLevelWorkingDirectory: subModulePath,
      })
    })

    it('returns regular for default initialized repository', async t => {
      const repository = await setupEmptyRepository(t)
      assert.deepEqual(await getRepositoryType(repository.path), {
        kind: 'regular',
        topLevelWorkingDirectory: repository.path,
      })
    })

    it('returns bare for initialized bare repository', async t => {
      const path = await createTempDirectory(t)
      await exec(['init', '--bare'], path)
      assert.deepEqual(await getRepositoryType(path), {
        kind: 'bare',
      })
    })

    it('returns missing for empty directory', async t => {
      const p = await createTempDirectory(t)
      assert.deepEqual(await getRepositoryType(p), {
        kind: 'missing',
      })
    })

    it('returns missing for missing directory', async t => {
      const rootPath = await createTempDirectory(t)
      const missingPath = path.join(rootPath, 'missing-folder')

      assert.deepEqual(await getRepositoryType(missingPath), {
        kind: 'missing',
      })
    })

    it('returns unsafe for unsafe repository', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const previousHomeValue = process.env['HOME']

      // Creating a stub global config so we can unset safe.directory config
      // which will supersede any system config that might set * to ignore
      // warnings about a different owner
      //
      // This is because safe.directory setting is ignored if found in local
      // config, environment variables or command line arguments.
      const testHomeDirectory = await createTempDirectory(t)
      const gitConfigPath = path.join(testHomeDirectory, '.gitconfig')
      await writeFile(
        gitConfigPath,
        `[safe]
directory=`
      )

      process.env['HOME'] = testHomeDirectory
      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = '1'

      assert((await getRepositoryType(repository.path)).kind === 'unsafe')

      process.env['GIT_TEST_ASSUME_DIFFERENT_OWNER'] = undefined
      process.env['HOME'] = previousHomeValue
    })
  })
})
