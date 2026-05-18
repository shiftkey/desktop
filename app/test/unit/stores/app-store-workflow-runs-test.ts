import { AppStore } from '../../../src/lib/stores/app-store'

describe('AppStore workflow runs integration', () => {
  test('AppStore exposes workflowRunsByRepoId', () => {
    const store = new AppStore(
      { onDidUpdate: () => ({ dispose: () => {} }) } as any,
      {
        repositories: [],
        onDidUpdate: () => ({ dispose: () => {} }),
        onDidError: () => ({ dispose: () => {} }),
        getRepositoryState: () => null,
      } as any,
      null as any,
      {
        getOptOut: () => false,
        onDidUpdate: () => ({ dispose: () => {} }),
        onDidError: () => ({ dispose: () => {} }),
      } as any,
      {
        getState: () => null,
        onDidAuthenticate: () => ({ dispose: () => {} }),
        onDidUpdate: () => ({ dispose: () => {} }),
        onDidError: () => ({ dispose: () => {} }),
      } as any,
      {
        onDidUpdate: () => ({ dispose: () => {} }),
        onDidError: () => ({ dispose: () => {} }),
        getActiveAccountByEndpoint: () => new Map(),
      } as any,
      {
        onDidUpdate: () => ({ dispose: () => {} }),
      } as any,
      {
        onPullRequestsChanged: () => ({ dispose: () => {} }),
        onIsLoadingPullRequests: () => ({ dispose: () => {} }),
      } as any,
      null as any,
      {
        getState: () => new Map(),
        onDidUpdate: () => ({ dispose: () => {} }),
        onDidError: () => ({ dispose: () => {} }),
      } as any,
      {
        onChecksFailedNotification: () => ({ dispose: () => {} }),
        onPullRequestReviewSubmitNotification: () => ({
          dispose: () => {},
        }),
        onPullRequestCommentNotification: () => ({
          dispose: () => {},
        }),
      } as any
    )
    expect(store.getState().workflowRunsByRepoId).toBeInstanceOf(Map)
  })
})
