import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../auth'
import { Account } from '../../models/account'
import { fetchUser, EmailVisibility, getEnterpriseAPIURL } from '../api'
import { fatalError } from '../fatal-error'
import { TypedBaseStore } from './base-store'
import { isGHE } from '../endpoint-capabilities'

/** The data-only interface for storage. */
interface IEmail {
  readonly email: string
  /**
   * Represents whether GitHub has confirmed the user has access to this
   * email address. New users require a verified email address before
   * they can sign into GitHub Desktop.
   */
  readonly verified: boolean
  /**
   * Flag for the user's preferred email address. Other email addresses
   * are provided for associating commit authors with the one GitHub account.
   */
  readonly primary: boolean

  /** The way in which the email is visible. */
  readonly visibility: EmailVisibility
}

function isKeyChainError(e: any) {
  const error = e as Error
  return (
    error.message &&
    error.message.startsWith(
      'The user name or passphrase you entered is not correct'
    )
  )
}

/** The data-only interface for storage. */
interface IAccount {
  readonly token: string
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<IEmail>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
  readonly plan?: string
}

/** The store for logged in accounts. */
export class AccountsStore extends TypedBaseStore<ReadonlyArray<Account>> {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private accounts: ReadonlyArray<Account> = []

  /** Maps endpoint → active user id for multi-account switching. */
  private activeAccountByEndpoint: Map<string, number> = new Map()

  /** A promise that will resolve when the accounts have been loaded. */
  private loadingPromise: Promise<void>

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
    this.loadingPromise = this.loadFromStore()
  }

  /**
   * Get the list of accounts in the cache.
   */
  public async getAll(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise

    return this.accounts.slice()
  }

  /** Returns the active account id map (endpoint → user id). */
  public getActiveAccountByEndpoint(): ReadonlyMap<string, number> {
    return this.activeAccountByEndpoint
  }

  /** Returns the active account for an endpoint, falling back to the first one. */
  public getActiveAccount(endpoint: string): Account | null {
    const activeId = this.activeAccountByEndpoint.get(endpoint)
    const endpointAccounts = this.accounts.filter(a => a.endpoint === endpoint)
    if (endpointAccounts.length === 0) {return null}
    if (activeId !== undefined) {
      return (
        endpointAccounts.find(a => a.id === activeId) ?? endpointAccounts[0]
      )
    }
    return endpointAccounts[0]
  }

  /** Set the active account for its endpoint. */
  public setActiveAccount(account: Account): void {
    this.activeAccountByEndpoint.set(account.endpoint, account.id)
    this.saveActiveAccounts()
    this.emitUpdate(this.accounts)
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise

    try {
      const key = getKeyForAccount(account)
      await this.secureStore.setItem(key, account.login, account.token)
    } catch (e) {
      log.error(`Error adding account '${account.login}'`, e)

      if (__DARWIN__ && isKeyChainError(e)) {
        this.emitError(
          new Error(
            `GitHub Desktop was unable to store the account token in the keychain. Please check you have unlocked access to the 'login' keychain.`
          )
        )
      } else {
        this.emitError(e)
      }
      return null
    }

    // Dedup by (endpoint, id) — allows multiple accounts per endpoint.
    const existingIdx = this.accounts.findIndex(
      a => a.endpoint === account.endpoint && a.id === account.id
    )
    if (existingIdx >= 0) {
      this.accounts = [
        ...this.accounts.slice(0, existingIdx),
        account,
        ...this.accounts.slice(existingIdx + 1),
      ]
    } else {
      this.accounts = [...this.accounts, account]
    }

    // Make this account active for its endpoint.
    this.activeAccountByEndpoint.set(account.endpoint, account.id)

    this.save()
    return account
  }

  /** Refresh all accounts by fetching their latest info from the API. */
  public async refresh(): Promise<void> {
    this.accounts = await Promise.all(
      this.accounts.map(acc => this.tryUpdateAccount(acc))
    )

    this.save()
    this.emitUpdate(this.accounts)
  }

  /**
   * Attempts to update the Account with new information from
   * the API.
   *
   * If the update fails for whatever reason this function
   * will return the old Account instance. Usually updates fails
   * due to connectivity issues but in the future we should
   * investigate whether we're able to detect here that the
   * token is definitely not valid anymore and let the
   * user know that they've been signed out.
   */
  private async tryUpdateAccount(account: Account): Promise<Account> {
    try {
      return await updatedAccount(account)
    } catch (e) {
      log.warn(`Error refreshing account '${account.login}'`, e)
      return account
    }
  }

  /**
   * Remove the account from the store.
   */
  public async removeAccount(account: Account): Promise<void> {
    await this.loadingPromise

    try {
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    } catch (e) {
      log.error(`Error removing account '${account.login}'`, e)
      this.emitError(e)
      return
    }

    this.accounts = this.accounts.filter(
      a => !(a.endpoint === account.endpoint && a.id === account.id)
    )

    // If the removed account was active, switch to the next available one.
    const activeId = this.activeAccountByEndpoint.get(account.endpoint)
    if (activeId === account.id) {
      const next = this.accounts.find(a => a.endpoint === account.endpoint)
      if (next) {
        this.activeAccountByEndpoint.set(account.endpoint, next.id)
      } else {
        this.activeAccountByEndpoint.delete(account.endpoint)
      }
    }

    this.save()
  }

  private getMigratedGHEAccounts(
    accounts: ReadonlyArray<IAccount>
  ): ReadonlyArray<IAccount> | null {
    let migrated = false
    const migratedAccounts = accounts.map(account => {
      let endpoint = account.endpoint
      const endpointURL = new URL(endpoint)
      // Migrate endpoints of subdomains of `.ghe.com` that use the `/api/v3`
      // path to the correct URL using the `api.` subdomain.
      if (isGHE(endpoint) && !endpointURL.hostname.startsWith('api.')) {
        endpoint = getEnterpriseAPIURL(endpoint)
        migrated = true
      }

      return {
        ...account,
        endpoint,
      }
    })

    return migrated ? migratedAccounts : null
  }

  /**
   * Load the users into memory from storage.
   */
  private async loadFromStore(): Promise<void> {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const parsedAccounts: ReadonlyArray<IAccount> = JSON.parse(raw)
    const migratedAccounts = this.getMigratedGHEAccounts(parsedAccounts)
    const rawAccounts = migratedAccounts ?? parsedAccounts

    const accountsWithTokens = []
    for (const account of rawAccounts) {
      const accountWithoutToken = new Account(
        account.login,
        account.endpoint,
        '',
        account.emails,
        account.avatarURL,
        account.id,
        account.name,
        account.plan
      )

      const key = getKeyForAccount(accountWithoutToken)
      try {
        const token = await this.secureStore.getItem(key, account.login)
        accountsWithTokens.push(accountWithoutToken.withToken(token || ''))
      } catch (e) {
        log.error(`Error getting token for '${key}'. Skipping.`, e)

        this.emitError(e)
      }
    }

    this.accounts = accountsWithTokens

    // Load active account selections.
    const rawActive = this.dataStore.getItem('activeAccounts')
    if (rawActive) {
      try {
        const parsed: ReadonlyArray<{ endpoint: string; id: number }> =
          JSON.parse(rawActive)
        for (const { endpoint, id } of parsed) {
          // Only restore if the account still exists.
          if (this.accounts.some(a => a.endpoint === endpoint && a.id === id)) {
            this.activeAccountByEndpoint.set(endpoint, id)
          }
        }
      } catch (e) {
        log.warn('Failed to parse activeAccounts from store', e)
      }
    }

    // For any endpoint without an active selection, default to the first.
    for (const account of this.accounts) {
      if (!this.activeAccountByEndpoint.has(account.endpoint)) {
        this.activeAccountByEndpoint.set(account.endpoint, account.id)
      }
    }

    // If any account was migrated, make sure to persist the new value
    if (migratedAccounts !== null) {
      this.save() // Save already emits an update
    } else {
      this.emitUpdate(this.accounts)
    }
  }

  private saveActiveAccounts() {
    const entries = [...this.activeAccountByEndpoint.entries()].map(
      ([endpoint, id]) => ({ endpoint, id })
    )
    this.dataStore.setItem('activeAccounts', JSON.stringify(entries))
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account =>
      account.withToken('')
    )
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
    this.saveActiveAccounts()

    this.emitUpdate(this.accounts)
  }
}

async function updatedAccount(account: Account): Promise<Account> {
  if (!account.token) {
    return fatalError(
      `Cannot update an account which doesn't have a token: ${account.login}`
    )
  }

  return fetchUser(account.endpoint, account.token)
}
