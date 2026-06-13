import {
  getNextPagePathWithIncreasingPageSize,
  getOAuthAuthorizationURL,
  getDotComAPIEndpoint,
  parseOAuthScopes,
  parseSSOAuthorizationURL,
} from '../../src/lib/api'
import * as URL from 'url'

interface IPageInfo {
  per_page: number
  page: number
}

function createHeadersWithNextLink(url: string) {
  return new Headers({
    Link: `<${url}>; rel="next"`,
  })
}

function assertNext(current: IPageInfo, expected: IPageInfo) {
  const headers = createHeadersWithNextLink(
    `/items?per_page=${current.per_page}&page=${current.page}`
  )

  const nextPath = getNextPagePathWithIncreasingPageSize(
    new Response(null, { headers })
  )

  expect(nextPath).not.toBeNull()
  const { pathname, query } = URL.parse(nextPath!, true)

  expect(pathname).toBe('/items')

  const per_page = parseInt(
    typeof query.per_page === 'string' ? query.per_page : '',
    10
  )
  const page = parseInt(typeof query.page === 'string' ? query.page : '', 10)

  expect(per_page).toBe(expected.per_page)
  expect(page).toBe(expected.page)

  // If getNextPagePathWithIncreasingPageSize has fiddled with the
  // page size or page number we want to ensure that the next page will
  // get us more items than what we've gotten thus far.
  if (current.per_page !== per_page || current.page !== page) {
    const receivedCurrent = current.per_page * current.page
    const receivedNext = per_page * page

    expect(receivedNext).toBeGreaterThan(receivedCurrent)
  }
}

describe('API', () => {
  describe('getNextPagePathWithIncreasingPageSize', () => {
    it("returns null when there's no link header", () => {
      expect(getNextPagePathWithIncreasingPageSize(new Response())).toBeNull()
    })

    it('returns raw link when missing page size', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?page=2'),
        })
      )

      expect(nextPath).toEqual('/items?page=2')
    })

    it('returns raw link when missing page number', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?per_page=10'),
        })
      )

      expect(nextPath).toEqual('/items?per_page=10')
    })

    it('does not increase page size when not aligned', () => {
      const nextPath = getNextPagePathWithIncreasingPageSize(
        new Response(null, {
          headers: createHeadersWithNextLink('/items?per_page=10&page=2'),
        })
      )

      expect(nextPath).toEqual('/items?per_page=10&page=2')
    })

    it('increases page size on alignment with an initial page size of 10', () => {
      assertNext({ per_page: 10, page: 2 }, { per_page: 10, page: 2 })
      assertNext({ per_page: 10, page: 3 }, { per_page: 20, page: 2 })
      assertNext({ per_page: 20, page: 2 }, { per_page: 20, page: 2 })
      assertNext({ per_page: 20, page: 3 }, { per_page: 40, page: 2 })
      assertNext({ per_page: 40, page: 2 }, { per_page: 40, page: 2 })
      assertNext({ per_page: 40, page: 3 }, { per_page: 80, page: 2 })
      assertNext({ per_page: 80, page: 3 }, { per_page: 80, page: 3 })
      assertNext({ per_page: 80, page: 4 }, { per_page: 80, page: 4 })
      assertNext({ per_page: 80, page: 5 }, { per_page: 80, page: 5 })
      assertNext({ per_page: 80, page: 6 }, { per_page: 100, page: 5 })
    })

    it('increases page size on alignment with an initial page size of 5', () => {
      assertNext({ per_page: 5, page: 2 }, { per_page: 5, page: 2 })
      assertNext({ per_page: 5, page: 3 }, { per_page: 10, page: 2 })
    })

    it('increases page size on alignment with an initial page size of 1', () => {
      assertNext({ per_page: 1, page: 2 }, { per_page: 1, page: 2 })
      assertNext({ per_page: 1, page: 3 }, { per_page: 2, page: 2 })
      assertNext({ per_page: 2, page: 3 }, { per_page: 4, page: 2 })
      assertNext({ per_page: 4, page: 2 }, { per_page: 4, page: 2 })
      assertNext({ per_page: 4, page: 3 }, { per_page: 8, page: 2 })
      assertNext({ per_page: 8, page: 2 }, { per_page: 8, page: 2 })
      assertNext({ per_page: 8, page: 3 }, { per_page: 16, page: 2 })
      assertNext({ per_page: 16, page: 2 }, { per_page: 16, page: 2 })
      assertNext({ per_page: 16, page: 3 }, { per_page: 32, page: 2 })
      assertNext({ per_page: 32, page: 2 }, { per_page: 32, page: 2 })
      assertNext({ per_page: 32, page: 3 }, { per_page: 64, page: 2 })
    })

    it("doesn't increase page size when page size is 100", () => {
      assertNext({ per_page: 100, page: 2 }, { per_page: 100, page: 2 })
      assertNext({ per_page: 100, page: 3 }, { per_page: 100, page: 3 })
      assertNext({ per_page: 100, page: 4 }, { per_page: 100, page: 4 })
      assertNext({ per_page: 100, page: 5 }, { per_page: 100, page: 5 })
      assertNext({ per_page: 100, page: 6 }, { per_page: 100, page: 6 })
      assertNext({ per_page: 100, page: 7 }, { per_page: 100, page: 7 })
      assertNext({ per_page: 100, page: 8 }, { per_page: 100, page: 8 })
      assertNext({ per_page: 100, page: 9 }, { per_page: 100, page: 9 })
      assertNext({ per_page: 100, page: 10 }, { per_page: 100, page: 10 })
    })
  })

  describe('getOAuthAuthorizationURL', () => {
    function getRequestedScopes(endpoint: string): ReadonlyArray<string> {
      const url = getOAuthAuthorizationURL(endpoint, 'some-state')
      const { query } = URL.parse(url, true)
      const scope = typeof query.scope === 'string' ? query.scope : ''
      return scope.split(' ').filter(s => s.length > 0)
    }

    it('requests read:org so the user’s organizations are discoverable', () => {
      // Without read:org the /user/orgs endpoint returns nothing for OAuth
      // tokens, which would leave org discovery (and the org list in account
      // preferences) empty.
      expect(getRequestedScopes(getDotComAPIEndpoint())).toContain('read:org')
    })

    it('requests repo so the user can clone, pull, and push org repositories', () => {
      expect(getRequestedScopes(getDotComAPIEndpoint())).toContain('repo')
    })

    it('requests the full expected set of scopes', () => {
      expect([...getRequestedScopes(getDotComAPIEndpoint())].sort()).toEqual(
        ['read:org', 'repo', 'user', 'workflow'].sort()
      )
    })

    it('targets the login/oauth/authorize endpoint with the provided state', () => {
      const url = getOAuthAuthorizationURL(getDotComAPIEndpoint(), 'my-state')
      expect(url).toContain('/login/oauth/authorize')
      expect(url).toContain('state=my-state')
    })
  })

  describe('parseOAuthScopes', () => {
    it('parses a comma-separated X-OAuth-Scopes header', () => {
      expect(parseOAuthScopes('repo, read:org, user, workflow')).toEqual([
        'repo',
        'read:org',
        'user',
        'workflow',
      ])
    })

    it('trims whitespace and drops empty entries', () => {
      expect(parseOAuthScopes(' repo ,, read:org ')).toEqual([
        'repo',
        'read:org',
      ])
    })

    it('returns an empty list when the header is absent', () => {
      expect(parseOAuthScopes(null)).toEqual([])
      expect(parseOAuthScopes('')).toEqual([])
    })
  })

  describe('parseSSOAuthorizationURL', () => {
    it('extracts the authorization url from a required X-GitHub-SSO header', () => {
      const header =
        'required; url=https://github.com/orgs/octo-org/sso?authorization_request=AZSCKtL4U8yX1H3sCQIVvKgs2sHFI'
      expect(parseSSOAuthorizationURL(header)).toEqual(
        'https://github.com/orgs/octo-org/sso?authorization_request=AZSCKtL4U8yX1H3sCQIVvKgs2sHFI'
      )
    })

    it('returns null when the header is absent', () => {
      expect(parseSSOAuthorizationURL(null)).toBeNull()
    })

    it('returns null when the header carries no url', () => {
      expect(
        parseSSOAuthorizationURL('partial-results; organizations=octo')
      ).toBeNull()
    })
  })
})
