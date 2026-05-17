import { Account } from '../../src/models/account'
import { getDotComAPIEndpoint } from '../../src/lib/api'
import { AccountsStore } from '../../src/lib/stores'
import { findGitHubTrampolineAccount } from '../../src/lib/trampoline/find-account'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

describe('trampoline/find-account', () => {
  it('uses the active account for the remote host', async () => {
    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )

    const first = new Account(
      'first',
      getDotComAPIEndpoint(),
      'first-token',
      [],
      '',
      1,
      '',
      'free'
    )
    const second = new Account(
      'second',
      getDotComAPIEndpoint(),
      'second-token',
      [],
      '',
      2,
      '',
      'free'
    )

    await accountsStore.addAccount(first)
    await accountsStore.addAccount(second)
    accountsStore.setActiveAccount(second)

    const account = await findGitHubTrampolineAccount(
      accountsStore,
      'https://github.com/desktop/desktop.git'
    )

    expect(account?.login).toBe('second')
    expect(account?.token).toBe('second-token')
  })

  it('honors an explicit username in the remote URL', async () => {
    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )

    const first = new Account(
      'first',
      getDotComAPIEndpoint(),
      'first-token',
      [],
      '',
      1,
      '',
      'free'
    )
    const second = new Account(
      'second',
      getDotComAPIEndpoint(),
      'second-token',
      [],
      '',
      2,
      '',
      'free'
    )

    await accountsStore.addAccount(first)
    await accountsStore.addAccount(second)
    accountsStore.setActiveAccount(second)

    const account = await findGitHubTrampolineAccount(
      accountsStore,
      'https://first@github.com/desktop/desktop.git'
    )

    expect(account?.login).toBe('first')
    expect(account?.token).toBe('first-token')
  })
})
