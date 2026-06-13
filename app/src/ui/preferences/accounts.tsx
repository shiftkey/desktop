import * as React from 'react'
import { Account } from '../../models/account'
import { IAvatarUser } from '../../models/avatar'
import { API, IAPIOrganization } from '../../lib/api'
import { lookupPreferredEmail } from '../../lib/email'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'
import { LinkButton } from '../lib/link-button'
import {
  getOrganizationDiagnostics,
  OrganizationDiagnosticsKind,
} from '../../lib/organizations/organization-diagnostics'

interface IAccountsProps {
  readonly dotComAccounts: ReadonlyArray<Account>
  readonly enterpriseAccounts: ReadonlyArray<Account>
  readonly activeAccountByEndpoint: ReadonlyMap<string, number>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (account: Account) => void
  readonly onSwitchAccount: (account: Account) => void
}

type OrganizationLookupState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly orgs: ReadonlyArray<IAPIOrganization> }
  | { readonly kind: 'error' }

interface IAccountsState {
  readonly organizationLookup: Map<string, OrganizationLookupState>
}

const OrganizationApprovalDocsURL =
  'https://docs.github.com/en/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-your-membership-in-organizations/requesting-organization-approval-for-oauth-apps'

export class Accounts extends React.Component<IAccountsProps, IAccountsState> {
  public constructor(props: IAccountsProps) {
    super(props)
    this.state = { organizationLookup: new Map() }
  }

  public componentDidMount() {
    this.refreshOrganizations(this.props)
  }

  public componentWillReceiveProps(nextProps: IAccountsProps) {
    if (
      this.props.dotComAccounts !== nextProps.dotComAccounts ||
      this.props.enterpriseAccounts !== nextProps.enterpriseAccounts
    ) {
      this.refreshOrganizations(nextProps)
    }
  }

  public render() {
    return (
      <DialogContent className="accounts-tab">
        <h2>GitHub.com</h2>
        {this.props.dotComAccounts.length > 0
          ? this.props.dotComAccounts.map((a, i) =>
              this.renderAccount(a, 'dotcom', i === 0)
            )
          : this.renderSignIn('dotcom')}
        <div className="account-add-row">
          <Button onClick={this.props.onDotComSignIn}>
            {__DARWIN__ ? 'Add GitHub.com Account' : 'Add GitHub.com account'}
          </Button>
        </div>

        <h2>GitHub Enterprise</h2>
        {this.props.enterpriseAccounts.length > 0
          ? this.props.enterpriseAccounts.map((a, i) =>
              this.renderAccount(a, 'enterprise', i === 0)
            )
          : this.renderSignIn('enterprise')}
        <div className="account-add-row">
          <Button onClick={this.props.onEnterpriseSignIn}>
            {__DARWIN__
              ? 'Add GitHub Enterprise Account'
              : 'Add GitHub Enterprise account'}
          </Button>
        </div>
      </DialogContent>
    )
  }

  private isActiveAccount(account: Account): boolean {
    const activeId = this.props.activeAccountByEndpoint.get(account.endpoint)
    return activeId === account.id
  }

  private renderAccount(
    account: Account,
    type: 'dotcom' | 'enterprise',
    isFirst: boolean
  ) {
    const allAccounts = [
      ...this.props.dotComAccounts,
      ...this.props.enterpriseAccounts,
    ]

    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    const isActive = this.isActiveAccount(account)
    const className =
      isFirst && type === 'dotcom' ? DialogPreferredFocusClassName : undefined

    return (
      <div
        className={`account-section${
          isActive ? ' account-section--active' : ''
        }`}
        key={`${account.endpoint}:${account.id}`}
      >
        <Row className="account-info">
          <div className="user-info-container">
            <Avatar accounts={allAccounts} user={avatarUser} />
            <div className="user-info">
              <div className="name">{account.name}</div>
              <div className="login">@{account.login}</div>
              {isActive && (
                <div className="active-badge">
                  {__DARWIN__ ? 'Active' : 'active'}
                </div>
              )}
            </div>
          </div>
          <div className="account-actions">
            {!isActive && (
              <Button onClick={this.switchTo(account)}>
                {__DARWIN__ ? 'Switch To' : 'Switch to'}
              </Button>
            )}
            <Button
              onClick={this.logout(account)}
              className={isActive ? className : undefined}
            >
              {__DARWIN__ ? 'Sign Out' : 'Sign out'}
            </Button>
          </div>
        </Row>
        {isActive && this.renderOrganizationStatus(account)}
      </div>
    )
  }

  private getAccountKey(account: Account) {
    return `${account.endpoint}:${account.id}`
  }

  private refreshOrganizations(props: IAccountsProps) {
    const accounts = [...props.dotComAccounts, ...props.enterpriseAccounts]
    for (const account of accounts) {
      this.fetchOrganizations(account)
    }
  }

  private async fetchOrganizations(account: Account) {
    const key = this.getAccountKey(account)
    const loadingLookup = new Map(this.state.organizationLookup)
    loadingLookup.set(key, { kind: 'loading' })
    this.setState({ organizationLookup: loadingLookup })

    try {
      const orgs = await API.fromAccount(account).fetchOrgs()
      const loadedLookup = new Map(this.state.organizationLookup)
      loadedLookup.set(key, { kind: 'loaded', orgs })
      this.setState({ organizationLookup: loadedLookup })
    } catch (e) {
      const errorLookup = new Map(this.state.organizationLookup)
      errorLookup.set(key, { kind: 'error' })
      this.setState({ organizationLookup: errorLookup })
    }
  }

  private renderOrganizationStatus(account: Account) {
    const lookup = this.state.organizationLookup.get(
      this.getAccountKey(account)
    )

    if (lookup === undefined || lookup.kind === 'loading') {
      return (
        <div className="organization-status">
          <strong>Organizations</strong>
          <p>Loading visible organizations...</p>
        </div>
      )
    }

    if (lookup.kind === 'error') {
      return (
        <div className="organization-status">
          <strong>Organizations</strong>
          <p>Unable to load organizations for this account.</p>
        </div>
      )
    }

    const diagnostics = getOrganizationDiagnostics(lookup.orgs)

    if (diagnostics.kind === OrganizationDiagnosticsKind.Visible) {
      return (
        <div className="organization-status">
          <strong>{diagnostics.summary}</strong>
          <div className="organization-list">
            {diagnostics.organizations.map(org => (
              <span className="organization-pill" key={org.id}>
                {org.login}
              </span>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className="organization-status">
        <strong>{diagnostics.summary}</strong>
        <p>
          If an organization is missing, sign out and back in to grant
          organization access, then check OAuth app restrictions, SAML SSO,
          private membership, and repository permissions.
        </p>
        <LinkButton uri={OrganizationApprovalDocsURL}>
          Request organization approval
        </LinkButton>
      </div>
    )
  }

  private renderSignIn(type: 'dotcom' | 'enterprise') {
    const signInTitle = __DARWIN__ ? 'Sign Into' : 'Sign into'
    switch (type) {
      case 'dotcom':
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub.com'}
            onAction={this.props.onDotComSignIn}
            buttonClassName={DialogPreferredFocusClassName}
          >
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      case 'enterprise':
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub Enterprise'}
            onAction={this.props.onEnterpriseSignIn}
          >
            <div>
              If you are using GitHub Enterprise at work, sign in to it to get
              access to your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private switchTo = (account: Account) => {
    return () => {
      this.props.onSwitchAccount(account)
    }
  }

  private logout = (account: Account) => {
    return () => {
      this.props.onLogout(account)
    }
  }
}
