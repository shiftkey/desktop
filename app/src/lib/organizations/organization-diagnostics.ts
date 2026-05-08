import { IAPIOrganization } from '../api'
import { caseInsensitiveCompare } from '../compare'

export enum OrganizationDiagnosticsKind {
  Visible = 'Visible',
  None = 'None',
}

export type OrganizationDiagnostics =
  | {
      readonly kind: OrganizationDiagnosticsKind.Visible
      readonly summary: string
      readonly organizations: ReadonlyArray<IAPIOrganization>
      readonly causes: ReadonlyArray<string>
    }
  | {
      readonly kind: OrganizationDiagnosticsKind.None
      readonly summary: string
      readonly organizations: ReadonlyArray<IAPIOrganization>
      readonly causes: ReadonlyArray<string>
    }

const MissingOrganizationCauses = [
  'OAuth app access restrictions',
  'SAML single sign-on authorization',
  'private organization membership',
  'insufficient repository permissions',
]

export function getOrganizationDiagnostics(
  organizations: ReadonlyArray<IAPIOrganization>
): OrganizationDiagnostics {
  const sortedOrganizations = [...organizations].sort((a, b) =>
    caseInsensitiveCompare(a.login, b.login)
  )

  if (sortedOrganizations.length === 0) {
    return {
      kind: OrganizationDiagnosticsKind.None,
      summary: 'No organizations visible',
      organizations: sortedOrganizations,
      causes: MissingOrganizationCauses,
    }
  }

  const plural = sortedOrganizations.length === 1 ? '' : 's'

  return {
    kind: OrganizationDiagnosticsKind.Visible,
    summary: `${sortedOrganizations.length} organization${plural} visible`,
    organizations: sortedOrganizations,
    causes: [],
  }
}
