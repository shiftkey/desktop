import { API } from '../../../../src/lib/api'

describe('API workflow run methods', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('fetchWorkflowRuns', () => {
    it('fetches workflow runs for a branch', async () => {
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
      expect(requestSpy).toHaveBeenCalledWith(
        'GET',
        'repos/owner/name/actions/runs?branch=main'
      )
    })

    it('includes workflow_id and status in query when provided', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ total_count: 0, workflow_runs: [] }),
        headers: new Headers(),
      })

      await api.fetchWorkflowRuns(
        'owner',
        'name',
        'main',
        'ci.yml',
        'completed'
      )
      expect(requestSpy).toHaveBeenCalledWith(
        'GET',
        'repos/owner/name/actions/runs?branch=main&workflow_id=ci.yml&status=completed'
      )
    })

    it('returns null on 404', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 404,
        ok: false,
        headers: new Headers(),
      })

      const result = await api.fetchWorkflowRuns('owner', 'name', 'main')
      expect(result).toBeNull()
    })
  })

  describe('dispatchWorkflowRun', () => {
    it('triggers workflow dispatch with correct body', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      const requestSpy = jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 204,
        ok: true,
        headers: new Headers(),
      })

      const result = await api.dispatchWorkflowRun(
        'owner',
        'name',
        123,
        'main',
        { foo: 'bar' }
      )
      expect(result).toBe(true)
      expect(requestSpy).toHaveBeenCalledWith('POST', expect.any(String), {
        body: { ref: 'main', inputs: { foo: 'bar' } },
      })
    })

    it('returns false on failure', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockRejectedValue(new Error('network'))

      const result = await api.dispatchWorkflowRun('owner', 'name', 123, 'main')
      expect(result).toBe(false)
    })
  })

  describe('cancelWorkflowRun', () => {
    it('cancels a workflow run', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 202,
        ok: true,
        headers: new Headers(),
      })

      const result = await api.cancelWorkflowRun('owner', 'name', 123)
      expect(result).toBe(true)
    })

    it('returns false on failure', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockRejectedValue(new Error('network'))

      const result = await api.cancelWorkflowRun('owner', 'name', 123)
      expect(result).toBe(false)
    })
  })

  describe('fetchWorkflows', () => {
    it('fetches workflows', async () => {
      const api = new API('https://api.github.com', 'fake-token')
      jest.spyOn(api as any, 'request').mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          total_count: 1,
          workflows: [
            {
              id: 1,
              name: 'CI',
              path: '.github/workflows/ci.yml',
              state: 'active',
            },
          ],
        }),
        headers: new Headers(),
      })

      const result = await api.fetchWorkflows('owner', 'name')
      expect(result).not.toBeNull()
      expect(result?.workflows.length).toBe(1)
      expect(result?.workflows[0].name).toBe('CI')
    })
  })
})
