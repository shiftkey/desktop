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
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (account: Account) => void
}

enum SignInType {
  DotCom,
  Enterprise,
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
      this.props.dotComAccount !== nextProps.dotComAccount ||
      this.props.enterpriseAccount !== nextProps.enterpriseAccount
    ) {
      this.refreshOrganizations(nextProps)
    }
  }

  public render() {
    return (
      <DialogContent className="accounts-tab">
        <h2>GitHub.com</h2>
        {this.props.dotComAccount
          ? this.renderAccount(this.props.dotComAccount, SignInType.DotCom)
          : this.renderSignIn(SignInType.DotCom)}

        <h2>GitHub Enterprise</h2>
        {this.props.enterpriseAccount
          ? this.renderAccount(
              this.props.enterpriseAccount,
              SignInType.Enterprise
            )
          : this.renderSignIn(SignInType.Enterprise)}
      </DialogContent>
    )
  }

  private renderAccount(account: Account, type: SignInType) {
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    const accountTypeLabel =
      type === SignInType.DotCom ? 'GitHub.com' : 'GitHub Enterprise'

    const accounts = [
      ...(this.props.dotComAccount ? [this.props.dotComAccount] : []),
      ...(this.props.enterpriseAccount ? [this.props.enterpriseAccount] : []),
    ]

    // The DotCom account is shown first, so its sign in/out button should be
    // focused initially when the dialog is opened.
    const className =
      type === SignInType.DotCom ? DialogPreferredFocusClassName : undefined

    return (
      <div className="account-section">
        <Row className="account-info">
          <div className="user-info-container">
            <Avatar accounts={accounts} user={avatarUser} />
            <div className="user-info">
              <div className="name">{account.name}</div>
              <div className="login">@{account.login}</div>
            </div>
          </div>
          <Button onClick={this.logout(account)} className={className}>
            {__DARWIN__ ? 'Sign Out of' : 'Sign out of'} {accountTypeLabel}
          </Button>
        </Row>
        {this.renderOrganizationStatus(account)}
      </div>
    )
  }

  private getAccountKey(account: Account) {
    return `${account.endpoint}:${account.id}`
  }

  private refreshOrganizations(props: IAccountsProps) {
    const accounts = [
      ...(props.dotComAccount ? [props.dotComAccount] : []),
      ...(props.enterpriseAccount ? [props.enterpriseAccount] : []),
    ]

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
          If an organization is missing, check OAuth app restrictions, SAML SSO,
          private membership, and repository permissions.
        </p>
        <LinkButton uri={OrganizationApprovalDocsURL}>
          Request organization approval
        </LinkButton>
      </div>
    )
  }

  private onDotComSignIn = () => {
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = () => {
    this.props.onEnterpriseSignIn()
  }

  private renderSignIn(type: SignInType) {
    const signInTitle = __DARWIN__ ? 'Sign Into' : 'Sign into'
    switch (type) {
      case SignInType.DotCom: {
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub.com'}
            onAction={this.onDotComSignIn}
            // The DotCom account is shown first, so its sign in/out button should be
            // focused initially when the dialog is opened.
            buttonClassName={DialogPreferredFocusClassName}
          >
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      }
      case SignInType.Enterprise:
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub Enterprise'}
            onAction={this.onEnterpriseSignIn}
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

  private logout = (account: Account) => {
    return () => {
      this.props.onLogout(account)
    }
  }
}
