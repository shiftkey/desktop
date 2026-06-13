import { IAPIOrganization, OrganizationAccessResult } from '../api'
import { caseInsensitiveCompare } from '../compare'

export enum OrganizationDiagnosticsKind {
  /** Organizations were returned and can be shown. */
  Visible = 'Visible',
  /** The request succeeded but returned no organizations. */
  None = 'None',
  /** The token is missing a scope (e.g. read:org) needed to list orgs. */
  MissingScope = 'MissingScope',
  /** A SAML organization requires the token to be authorized for SSO. */
  SSORequired = 'SSORequired',
  /** The request was forbidden, typically an OAuth app access restriction. */
  Forbidden = 'Forbidden',
  /** The request failed for an unknown reason. */
  Error = 'Error',
}

export type OrganizationDiagnostics = {
  readonly kind: OrganizationDiagnosticsKind
  readonly summary: string
  readonly organizations: ReadonlyArray<IAPIOrganization>
  readonly causes: ReadonlyArray<string>
  /** Present only for `SSORequired`: where the user authorizes SSO. */
  readonly authorizationURL?: string
}

const MissingOrganizationCauses = [
  'OAuth app access restrictions',
  'SAML single sign-on authorization',
  'private organization membership',
  'insufficient repository permissions',
]

function sortByLogin(
  organizations: ReadonlyArray<IAPIOrganization>
): ReadonlyArray<IAPIOrganization> {
  return [...organizations].sort((a, b) =>
    caseInsensitiveCompare(a.login, b.login)
  )
}

export function getOrganizationDiagnostics(
  result: OrganizationAccessResult
): OrganizationDiagnostics {
  switch (result.kind) {
    case 'ok': {
      const organizations = sortByLogin(result.organizations)

      if (organizations.length === 0) {
        return {
          kind: OrganizationDiagnosticsKind.None,
          summary: 'No organizations visible',
          organizations,
          causes: MissingOrganizationCauses,
        }
      }

      const plural = organizations.length === 1 ? '' : 's'

      return {
        kind: OrganizationDiagnosticsKind.Visible,
        summary: `${organizations.length} organization${plural} visible`,
        organizations,
        causes: [],
      }
    }

    case 'missing-scope': {
      const scopes = result.missingScopes.join(', ')
      return {
        kind: OrganizationDiagnosticsKind.MissingScope,
        summary: `Your sign-in is missing the ${scopes} permission`,
        organizations: [],
        causes: [],
      }
    }

    case 'sso-required':
      return {
        kind: OrganizationDiagnosticsKind.SSORequired,
        summary: 'Single sign-on authorization required',
        organizations: [],
        causes: [],
        authorizationURL: result.authorizationURL,
      }

    case 'forbidden':
      return {
        kind: OrganizationDiagnosticsKind.Forbidden,
        summary: 'Access to organizations was denied',
        organizations: [],
        causes: MissingOrganizationCauses,
      }

    case 'error':
      return {
        kind: OrganizationDiagnosticsKind.Error,
        summary: 'Unable to load organizations',
        organizations: [],
        causes: [],
      }
  }
}
