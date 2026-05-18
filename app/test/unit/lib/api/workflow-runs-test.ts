import { API } from '../../../../src/lib/api'

describe('API workflow run methods', () => {
  test('fetchWorkflowRuns constructs correct path', async () => {
    const api = new API('https://api.github.com', 'fake-token')
    const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        total_count: 1,
        workflow_runs: [
          {
            id: 123,
            workflow_id: 456,
            cancel_url:
              'https://api.github.com/repos/owner/name/actions/runs/123/cancel',
            created_at: '2026-05-17T10:00:00Z',
            logs_url:
              'https://api.github.com/repos/owner/name/actions/runs/123/logs',
            name: 'CI',
            rerun_url:
              'https://api.github.com/repos/owner/name/actions/runs/123/rerun',
            check_suite_id: 789,
            event: 'push',
            head_branch: 'main',
            head_sha: 'abc123',
            run_number: 1,
            status: 'completed',
            conclusion: 'success',
            updated_at: '2026-05-17T10:05:00Z',
            run_started_at: '2026-05-17T10:01:00Z',
            html_url: 'https://github.com/owner/name/actions/runs/123',
            jobs_url:
              'https://api.github.com/repos/owner/name/actions/runs/123/jobs',
            path: '.github/workflows/ci.yml',
            pull_requests: [],
          },
        ],
      }),
      headers: new Headers(),
    })

    const result = await api.fetchWorkflowRuns('owner', 'name', 'main')
    expect(result).not.toBeNull()
    expect(result?.workflow_runs.length).toBe(1)
    expect(result?.workflow_runs[0].id).toBe(123)

    requestSpy.mockRestore()
  })
})
