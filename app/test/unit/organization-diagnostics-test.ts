import {
  getOrganizationDiagnostics,
  OrganizationDiagnosticsKind,
} from '../../src/lib/organizations/organization-diagnostics'
import { IAPIOrganization } from '../../src/lib/api'

function createOrg(login: string, id: number): IAPIOrganization {
  return {
    id,
    login,
    url: `https://api.github.com/orgs/${login}`,
    avatar_url: `https://avatars.githubusercontent.com/${login}`,
  }
}

describe('organization diagnostics', () => {
  it('sorts visible organizations by login', () => {
    const diagnostics = getOrganizationDiagnostics({
      kind: 'ok',
      organizations: [createOrg('zeta', 2), createOrg('alpha', 1)],
    })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.Visible)
    expect(diagnostics.organizations.map(o => o.login)).toEqual([
      'alpha',
      'zeta',
    ])
    expect(diagnostics.summary).toEqual('2 organizations visible')
  })

  it('returns a no organizations diagnostic with likely causes', () => {
    const diagnostics = getOrganizationDiagnostics({
      kind: 'ok',
      organizations: [],
    })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.None)
    expect(diagnostics.summary).toEqual('No organizations visible')
    expect(diagnostics.causes).toContain('OAuth app access restrictions')
    expect(diagnostics.causes).toContain('SAML single sign-on authorization')
  })

  it('reports a missing scope so the user knows to re-authenticate', () => {
    const diagnostics = getOrganizationDiagnostics({
      kind: 'missing-scope',
      missingScopes: ['read:org'],
    })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.MissingScope)
    expect(diagnostics.summary.toLowerCase()).toContain('read:org')
  })

  it('surfaces the SSO authorization url when single sign-on is required', () => {
    const url = 'https://github.com/orgs/octo-org/sso?authorization_request=ABC'
    const diagnostics = getOrganizationDiagnostics({
      kind: 'sso-required',
      authorizationURL: url,
    })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.SSORequired)
    expect(diagnostics.authorizationURL).toEqual(url)
  })

  it('reports a forbidden response as an OAuth app restriction', () => {
    const diagnostics = getOrganizationDiagnostics({ kind: 'forbidden' })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.Forbidden)
    expect(diagnostics.causes).toContain('OAuth app access restrictions')
  })

  it('reports a generic error when the request fails', () => {
    const diagnostics = getOrganizationDiagnostics({ kind: 'error' })

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.Error)
  })
})
