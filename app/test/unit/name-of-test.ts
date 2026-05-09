import {
  Repository,
  getGitHubHtmlUrl,
  nameOf,
} from '../../src/models/repository'
import { gitHubRepoFixture } from '../helpers/github-repo-builder'
import { ForkContributionTarget } from '../../src/models/workflow-preferences'

const repoPath = '/some/cool/path'

describe('nameOf', () => {
  it('Returns the repo base path if there is no associated github metadata', () => {
    const repo = new Repository(repoPath, -1, null, false)

    const name = nameOf(repo)

    expect(name).toBe('path')
  })

  it('Returns the name of the repo', () => {
    const ghRepo = gitHubRepoFixture({ owner: 'desktop', name: 'name' })
    const repo = new Repository(repoPath, -1, ghRepo, false)

    const name = nameOf(repo)

    expect(name).toBe('desktop/name')
  })

  it('uses the fork URL as the default GitHub URL', () => {
    const parent = gitHubRepoFixture({ owner: 'shiftkey', name: 'desktop' })
    const fork = gitHubRepoFixture({
      owner: 'tommyqhoang',
      name: 'github-desktop-linux',
      parent,
    })
    const repo = new Repository(repoPath, -1, fork, false)

    expect(getGitHubHtmlUrl(repo)).toBe(
      'https://github.com/tommyqhoang/github-desktop-linux'
    )
  })

  it('uses the parent URL when the fork contribution target is parent', () => {
    const parent = gitHubRepoFixture({ owner: 'shiftkey', name: 'desktop' })
    const fork = gitHubRepoFixture({
      owner: 'tommyqhoang',
      name: 'github-desktop-linux',
      parent,
    })
    const repo = new Repository(repoPath, -1, fork, false, null, {
      forkContributionTarget: ForkContributionTarget.Parent,
    })

    expect(getGitHubHtmlUrl(repo)).toBe('https://github.com/shiftkey/desktop')
  })
})
