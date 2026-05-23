import * as path from 'path'
import * as FSE from 'fs-extra'
import { exec } from 'dugite'
import { StashStore } from '../../../src/lib/stores/stash-store'
import { setupEmptyRepository } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { generateString } from '../../helpers/random-data'
import * as StashGit from '../../../src/lib/git/stash'
import { IStashEntry } from '../../../src/models/stash-entry'

describe('StashStore', () => {
  let store: StashStore
  let repository: Repository

  beforeEach(async () => {
    store = new StashStore()
    repository = await setupEmptyRepository()
    const readme = path.join(repository.path, 'README.md')
    await FSE.writeFile(readme, '')
    await exec(['add', 'README.md'], repository.path)
    await exec(['commit', '-m', 'initial'], repository.path)
    // Force a non-negative id since IRepoStashState is keyed by it.
    repository = new Repository(repository.path, 42, null, false)
  })

  describe('getState', () => {
    it('returns an empty state for a repo that has not been loaded', () => {
      const state = store.getState(repository)
      expect(state.entries).toHaveLength(0)
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.loadedAt).toBeNull()
    })
  })

  describe('loadStashes', () => {
    it('populates the cache with stash entries from the repo', async () => {
      const readme = path.join(repository.path, 'README.md')
      await FSE.appendFile(readme, generateString())
      await exec(['stash', 'push', '-m', 'first'], repository.path)

      await store.loadStashes(repository)

      const state = store.getState(repository)
      expect(state.entries).toHaveLength(1)
      expect(state.entries[0].message).toContain('first')
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.loadedAt).not.toBeNull()
    })

    it('emits onDidUpdate at least twice (loading=true, then result)', async () => {
      let updateCount = 0
      store.onDidUpdate(() => updateCount++)

      await store.loadStashes(repository)

      expect(updateCount).toBeGreaterThanOrEqual(2)
    })

    it('coalesces concurrent loads for the same repo (single git invocation)', async () => {
      const readme = path.join(repository.path, 'README.md')
      await FSE.appendFile(readme, generateString())
      await exec(['stash', 'push', '-m', 'only'], repository.path)

      // Kick off two concurrent loads. The second should early-exit.
      const a = store.loadStashes(repository)
      const b = store.loadStashes(repository)
      await Promise.all([a, b])

      const state = store.getState(repository)
      expect(state.entries).toHaveLength(1)
      expect(state.loading).toBe(false)
    })

    it('isolates state per repository', async () => {
      const repo2Setup = await setupEmptyRepository()
      const repo2 = new Repository(repo2Setup.path, 99, null, false)
      const readme2 = path.join(repo2.path, 'README.md')
      await FSE.writeFile(readme2, '')
      await exec(['add', 'README.md'], repo2.path)
      await exec(['commit', '-m', 'initial'], repo2.path)
      await FSE.appendFile(readme2, generateString())
      await exec(['stash', 'push', '-m', 'in-repo-2'], repo2.path)

      // Only stash in repo2; repo1 has no stashes.
      await Promise.all([
        store.loadStashes(repository),
        store.loadStashes(repo2),
      ])

      expect(store.getState(repository).entries).toHaveLength(0)
      expect(store.getState(repo2).entries).toHaveLength(1)
    })

    it('records errors and emits onDidError when git fails', async () => {
      const broken = new Repository('/nonexistent-path-xyz', 7, null, false)
      let errorEmitted = false
      store.onDidError(() => (errorEmitted = true))

      await store.loadStashes(broken)

      const state = store.getState(broken)
      expect(state.error).not.toBeNull()
      expect(state.loading).toBe(false)
      expect(errorEmitted).toBe(true)
    })

    it('preserves prior entries when a refresh fails', async () => {
      const readme = path.join(repository.path, 'README.md')
      await FSE.appendFile(readme, generateString())
      await exec(['stash', 'push', '-m', 'cached'], repository.path)

      await store.loadStashes(repository)
      expect(store.getState(repository).entries).toHaveLength(1)

      // Repoint repository at a broken path with the same id, then refresh.
      const broken = new Repository('/nonexistent-xyz', 42, null, false)
      await store.loadStashes(broken)

      // The prior entries for id=42 should still be there.
      const state = store.getState(broken)
      expect(state.entries).toHaveLength(1)
      expect(state.error).not.toBeNull()
    })

    it('does not resurrect state cleared while a load is in flight', async () => {
      // Seed cached state with a real load first.
      await store.loadStashes(repository)
      expect(store.getAllState().has(42)).toBe(true)

      // Hold the next load open so we can clear the repo mid-flight.
      let release: (entries: ReadonlyArray<IStashEntry>) => void = () => {}
      const spy = jest.spyOn(StashGit, 'getAllStashes').mockReturnValueOnce(
        new Promise<ReadonlyArray<IStashEntry>>(resolve => {
          release = resolve
        })
      )

      const inFlight = store.loadStashes(repository)
      store.clear(repository)
      expect(store.getAllState().has(42)).toBe(false)

      release([])
      await inFlight

      // The completed load must not recreate state for the removed repo.
      expect(store.getAllState().has(42)).toBe(false)
      expect(store.getState(repository).loadedAt).toBeNull()

      spy.mockRestore()
    })
  })

  describe('clear', () => {
    it('drops cached state and emits an update', async () => {
      const readme = path.join(repository.path, 'README.md')
      await FSE.appendFile(readme, generateString())
      await exec(['stash', 'push', '-m', 'x'], repository.path)
      await store.loadStashes(repository)

      let emitted = 0
      store.onDidUpdate(() => emitted++)

      store.clear(repository)

      expect(store.getState(repository).entries).toHaveLength(0)
      expect(emitted).toBe(1)
    })

    it('is a no-op when the repo is not cached', () => {
      let emitted = 0
      store.onDidUpdate(() => emitted++)

      store.clear(repository) // never loaded

      expect(emitted).toBe(0)
    })
  })

  describe('getAllState', () => {
    it('returns the live state map', async () => {
      const readme = path.join(repository.path, 'README.md')
      await FSE.appendFile(readme, generateString())
      await exec(['stash', 'push', '-m', 'all-state'], repository.path)
      await store.loadStashes(repository)

      const all = store.getAllState()
      expect(all.has(42)).toBe(true)
      expect(all.get(42)!.entries).toHaveLength(1)
    })
  })
})
