import { makeAccountHttpClient } from '../../../src/lib/api/account-http-client'
import { Account } from '../../../src/models/account'

const acct = (over: Partial<Account> = {}) =>
  new Account(
    'alice',
    'https://api.github.com',
    'tok-1',
    [],
    '',
    1,
    'Alice',
    'free'
  )

describe('makeAccountHttpClient', () => {
  function makeFetch(response: { status?: number; bodyText?: string }) {
    const calls: Array<{ url: string; init: any }> = []
    const fakeFetch = (async (url: string, init: any) => {
      calls.push({ url, init })
      return {
        ok: (response.status ?? 200) < 400,
        status: response.status ?? 200,
        text: async () => response.bodyText ?? '',
      }
    }) as any
    return { fakeFetch, calls }
  }

  it('builds a token-authenticated GET URL', async () => {
    const { fakeFetch, calls } = makeFetch({ bodyText: '[]' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    await client.request('GET', '/repos/o/r')
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r')
    expect(calls[0].init.headers.Authorization).toBe('token tok-1')
    expect(calls[0].init.headers.Accept).toBe('application/vnd.github+json')
    expect(calls[0].init.method).toBe('GET')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('joins paths whether they start with a slash or not', async () => {
    const { fakeFetch, calls } = makeFetch({ bodyText: '[]' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    await client.request('GET', 'foo/bar')
    expect(calls[0].url).toBe('https://api.github.com/foo/bar')
  })

  it('strips trailing slash from endpoint', async () => {
    const { fakeFetch, calls } = makeFetch({ bodyText: '[]' })
    const a = new Account(
      'a',
      'https://ghe.example.com/api/v3/',
      't',
      [],
      '',
      1,
      'A'
    )
    const client = makeAccountHttpClient(a, fakeFetch)
    await client.request('GET', '/x')
    expect(calls[0].url).toBe('https://ghe.example.com/api/v3/x')
  })

  it('serializes a JSON body and sets Content-Type', async () => {
    const { fakeFetch, calls } = makeFetch({ bodyText: '{}' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    await client.request('POST', '/x', { hello: 'world' })
    expect(calls[0].init.body).toBe('{"hello":"world"}')
    expect(calls[0].init.headers['Content-Type']).toBe('application/json')
  })

  it('parses JSON body in the response', async () => {
    const { fakeFetch } = makeFetch({ bodyText: '{"a":1}' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    const r = await client.request('GET', '/x')
    expect(r.body).toEqual({ a: 1 })
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
  })

  it('returns text body when JSON parse fails', async () => {
    const { fakeFetch } = makeFetch({ bodyText: 'not json' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    const r = await client.request('GET', '/x')
    expect(r.body).toBe('not json')
  })

  it('sets ok=false on >=400 status', async () => {
    const { fakeFetch } = makeFetch({ status: 422, bodyText: '{}' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    const r = await client.request('GET', '/x')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(422)
  })

  it('omits Authorization header for an account with no token', async () => {
    const { fakeFetch, calls } = makeFetch({ bodyText: '[]' })
    const a = new Account('a', 'https://api.github.com', '', [], '', 1, 'A')
    const client = makeAccountHttpClient(a, fakeFetch)
    await client.request('GET', '/x')
    expect(calls[0].init.headers.Authorization).toBeUndefined()
  })

  it('returns body=null when response text is empty', async () => {
    const { fakeFetch } = makeFetch({ bodyText: '' })
    const client = makeAccountHttpClient(acct(), fakeFetch)
    const r = await client.request('DELETE', '/x')
    expect(r.body).toBeNull()
  })
})
