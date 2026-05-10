import { Account } from '../../models/account'
import { IHttpClient, IHttpResponse } from './pull-request-reviews'

/**
 * Minimal `IHttpClient` backed by `fetch` and an `Account` for auth headers.
 *
 * The existing `API` class has its own elaborate request pipeline (proxies,
 * retry, dotcom vs GHES base URL handling), but it is not currently exposed
 * as an IHttpClient. This adapter is a focused subset for the PR review
 * feature; it can be replaced with a wrapper over `API` later without
 * changing consumers.
 */
export function makeAccountHttpClient(
  account: Account,
  fetchImpl: typeof fetch = fetch
): IHttpClient {
  return {
    async request(method, path, body) {
      const url = `${account.endpoint.replace(/\/$/, '')}${
        path.startsWith('/') ? path : '/' + path
      }`
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
      if (account.token) {
        headers.Authorization = `token ${account.token}`
      }
      const init: RequestInit = { method, headers }
      if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      const res = await fetchImpl(url, init)
      const text = await res.text().catch(() => '')
      let parsed: unknown = null
      if (text.length > 0) {
        try {
          parsed = JSON.parse(text)
        } catch {
          parsed = text
        }
      }
      const out: IHttpResponse = {
        status: res.status,
        ok: res.ok,
        body: parsed,
      }
      return out
    },
  }
}
