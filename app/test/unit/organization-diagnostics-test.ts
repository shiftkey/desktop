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
    const diagnostics = getOrganizationDiagnostics([
      createOrg('zeta', 2),
      createOrg('alpha', 1),
    ])

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.Visible)
    expect(diagnostics.organizations.map(o => o.login)).toEqual([
      'alpha',
      'zeta',
    ])
    expect(diagnostics.summary).toEqual('2 organizations visible')
  })

  it('returns a no organizations diagnostic with likely causes', () => {
    const diagnostics = getOrganizationDiagnostics([])

    expect(diagnostics.kind).toEqual(OrganizationDiagnosticsKind.None)
    expect(diagnostics.summary).toEqual('No organizations visible')
    expect(diagnostics.causes).toContain('OAuth app access restrictions')
    expect(diagnostics.causes).toContain('SAML single sign-on authorization')
  })
})
