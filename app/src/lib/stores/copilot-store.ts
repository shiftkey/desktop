import { CopilotClient } from '@github/copilot-sdk'
import type { ModelInfo } from '@github/copilot-sdk'
import { AccountsStore } from './accounts-store'
import { Account, isDotComAccount } from '../../models/account'
import {
  ICopilotCommitMessage,
  parseCopilotCommitMessage,
} from '../copilot-commit-message'
import * as ipcRenderer from '../ipc-renderer'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { BaseStore } from './base-store'

/** The default model ID used for Copilot commit message generation. */
export const DefaultCopilotModel = 'gpt-5-mini'
const DefaultReasoningEffort: ReasoningEffort = 'low'

/** Copilot features that support per-model selection. */
export type CopilotFeature = 'commit-message-generation'

/**
 * Per-feature model selections. An absent key means the default model
 * will be used for that feature.
 */
export type CopilotModelSelections = Partial<Record<CopilotFeature, string>>

/**
 * How long to cache the model list before re-fetching from the SDK.
 * Matches the MaxFetchFrequency pattern used by other stores (e.g. GitHubUserStore).
 */
const ModelListCacheTTL = 10 * 60 * 1000

/**
 * Returns the path of the executable (Electron/Node) used to run the Copilot CLI.
 *
 * This corresponds to the value of `process.execPath` used when launching the
 * Copilot CLI via an eval-based entry point (for example, `--eval "import './index.js'"`).
 */
export async function getCopilotCLIPath(): Promise<string> {
  return ipcRenderer.invoke('get-exec-path')
}

function getCopilotCLIDir(): string {
  return join(__dirname, 'copilot')
}

/**
 * System prompt for the Copilot commit message generation session.
 */
const CommitMessageSystemPrompt = `
You're an AI assistant whose job is to concisely summarize code changes into
short, useful commit messages, with a title and a description.

A changeset is given in the git diff output format, affecting one or multiple files.

The commit title should be no longer than 50 characters and should summarize the
contents of the changeset for other developers reading the commit history.

The commit description can be longer, and should provide more context about the
changeset, including why the changeset is being made, and any other relevant
information. The commit description is optional, so you can omit it if the
changeset is small enough that it can be described in the commit title or if you
don't have enough context.

Be brief and concise.

Do NOT include a description of changes in "lock" files from dependency managers
like npm, yarn, or pip (and others), unless those are the only changes in the commit.

Your response must be a JSON object with the attributes "title" and "description"
containing the commit title and commit description. Do not use markdown to wrap
the JSON object, just return it as plain text. For example:

{
  "title": "Fix issue with login form",
  "description": "The login form was not submitting correctly. This commit fixes that issue by adding a missing \`name\` attribute to the submit button."
}
`

/** Ordered reasoning effort levels from lowest to highest. */
const ReasoningEffortOrder = ['low', 'medium', 'high', 'xhigh'] as const

type ReasoningEffort = typeof ReasoningEffortOrder[number]

/**
 * Returns the lowest reasoning effort supported by the given model, or
 * undefined if the model does not support reasoning effort configuration.
 */
export function getLowestReasoningEffort(
  model: ModelInfo
): ReasoningEffort | undefined {
  const supported = model.supportedReasoningEfforts as
    | ReadonlyArray<ReasoningEffort>
    | undefined
  if (!supported || supported.length === 0) {
    return undefined
  }
  return ReasoningEffortOrder.find(e => supported.includes(e))
}

/**
 * Selects the model to use for commit message generation. Prefers
 * `DefaultCopilotModel` if it is in the list; otherwise falls back to the
 * cheapest available model by billing multiplier.
 *
 * Returns null if the model list is empty.
 */
export function getPreferredDefaultModel(
  models: ReadonlyArray<ModelInfo>
): ModelInfo | null {
  if (models.length === 0) {
    return null
  }

  const defaultModel = models.find(m => m.id === DefaultCopilotModel)
  if (defaultModel !== undefined) {
    return defaultModel
  }

  // Default model unavailable — pick the cheapest one. Models without billing
  // info are treated as most expensive (unknown cost) so we don't accidentally
  // pick a costly model.
  return [...models].sort(
    (a, b) =>
      (a.billing?.multiplier ?? Infinity) - (b.billing?.multiplier ?? Infinity)
  )[0]
}

/**
 * This store manages the Copilot client lifecycle based on the user's
 * GitHub.com account. It tracks account changes and creates the client
 * lazily when a Copilot feature is used.
 *
 * Currently, Copilot is only available for GitHub.com accounts.
 */
export class CopilotStore extends BaseStore {
  private currentAccount: Account | null = null

  private cachedModels: ReadonlyArray<ModelInfo> | null = null
  private modelsCachedAt: number = 0
  private modelsInFlight: Promise<ReadonlyArray<ModelInfo>> | null = null

  public constructor(private readonly accountsStore: AccountsStore) {
    super()
    this.accountsStore.onDidUpdate(this.onAccountsUpdated)
    this.initializeFromAccounts()
  }

  /**
   * Initialize the account from the current accounts.
   */
  private async initializeFromAccounts(): Promise<void> {
    const accounts = await this.accountsStore.getAll()
    this.onAccountsUpdated(accounts)
  }

  /**
   * Handler for account updates. Updates the stored account reference.
   */
  private onAccountsUpdated = (accounts: ReadonlyArray<Account>): void => {
    // Copilot is only available on GitHub.com, so we look for a dotcom account
    const dotComAccount = accounts.find(isDotComAccount) ?? null

    if (dotComAccount?.login !== this.currentAccount?.login) {
      this.cachedModels = null
      this.modelsCachedAt = 0
      this.modelsInFlight = null
    }

    this.currentAccount = dotComAccount

    if (dotComAccount === null) {
      log.debug('CopilotStore: No GitHub.com account available')
      this.emitUpdate()
    } else {
      log.debug(`CopilotStore: Account updated for '${dotComAccount.login}'`)
      // Proactively fetch models so they are ready when the user opens the
      // Copilot tab in Settings, even if they signed in without reopening
      // the dialog.
      this.getCachedModels().then(this.emitUpdate, this.emitUpdate)
    }
  }

  /**
   * Creates a new Copilot client for the current account.
   *
   * @throws Error if no GitHub.com account is available
   */
  private async createClient(repositoryPath?: string): Promise<CopilotClient> {
    if (this.currentAccount === null || !this.currentAccount.token) {
      throw new Error(
        'Cannot create Copilot client: No GitHub.com account available'
      )
    }

    // This relies on the fact that Copilot CLI is bundled with the app, but not
    // as a "single executable application", but the files from the npm package.
    // That means Desktop will use its own executable to run as Copilot CLI's
    // index.js as node.
    // However, when trying to do this directly without the --eval flag, Copilot
    // CLI fails to parse the arguments correctly, so we ended up using --eval
    // and just importing the index.js from the CLI as a workaround.
    const cliDir = getCopilotCLIDir()
    let importPath = join(cliDir, 'index.js')

    if (__WIN32__) {
      // On Windows, we need the import path to be a valid file:// URL.
      importPath = pathToFileURL(importPath).href
    }

    return new CopilotClient({
      cliPath: await getCopilotCLIPath(),
      cliArgs: ['--eval', `import '${importPath}'`, '--'],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        COPILOT_RUN_APP: '1',
      },
      cwd: repositoryPath,
      autoStart: true,
      githubToken: this.currentAccount.token,
    })
  }

  /**
   * Stops the given Copilot client.
   */
  private async stopClient(client: CopilotClient): Promise<void> {
    try {
      await client.stop()
    } catch (e) {
      log.error('CopilotStore: Error stopping client', e)
    }
  }

  /**
   * Generates a commit message for the given diff using Copilot.
   *
   * @param diff The diff of changes to be committed, in git format
   * @param model Optional model ID to use. If null/undefined,
   *   resolves via listModels: prefers {@link DefaultCopilotModel}, otherwise
   *   picks the cheapest available model.
   * @returns Commit details (title and description) generated by Copilot
   * @throws Error if no GitHub.com account is available or if generation fails
   */
  public async generateCommitMessage(
    diff: string,
    repositoryPath: string,
    model?: string | null
  ): Promise<ICopilotCommitMessage> {
    const cachedModels = await this.getCachedModels()
    const resolvedModel = model
      ? cachedModels.find(m => m.id === model) ?? null
      : getPreferredDefaultModel(cachedModels)

    // Use the resolved model's ID, the raw string ID the caller passed, or
    // the default model as a last resort.
    const modelId = resolvedModel?.id ?? model ?? DefaultCopilotModel

    const client = await this.createClient(repositoryPath)
    let session: Awaited<ReturnType<CopilotClient['createSession']>> | null =
      null

    try {
      const reasoningEffort = resolvedModel
        ? getLowestReasoningEffort(resolvedModel)
        : DefaultReasoningEffort

      // Create a session for commit message generation
      session = await client.createSession({
        model: modelId,
        reasoningEffort,
        systemMessage: {
          // It's important to 'append' the system prompt so that it doesn't
          // override any instructions, like copilot-instructions.md (in which
          // we rely for custom commit message generation instructions).
          mode: 'append',
          content: CommitMessageSystemPrompt,
        },
        availableTools: [],
        onPermissionRequest: async () => ({
          kind: 'denied-interactively-by-user',
        }),
      })

      // Send the diff and wait for response
      const response = await session.sendAndWait({ prompt: diff }, 30000)

      if (!response || !response.data.content) {
        throw new Error('No response from Copilot')
      }

      return parseCopilotCommitMessage(response.data.content)
    } catch (e) {
      log.warn('CopilotStore: Failed to generate commit message', e)
      throw e
    } finally {
      // Clean up the session
      await session?.destroy().catch(() => {})

      // Stop the client after use
      await this.stopClient(client)
    }
  }

  /**
   * Returns whether Copilot is available (i.e., a GitHub.com account is
   * signed in).
   */
  public get isAvailable(): boolean {
    return this.currentAccount !== null
  }

  /**
   * Returns the currently associated GitHub.com account, if any.
   */
  public get account(): Account | null {
    return this.currentAccount
  }

  /**
   * Returns the last-fetched model list without triggering a refresh.
   * Null if models have never been fetched.
   */
  public get cachedModelList(): ReadonlyArray<ModelInfo> | null {
    return this.cachedModels
  }

  /**
   * Lists the available Copilot models from the SDK, using a cached result if
   * it is less than {@link ModelListCacheTTL} old.
   *
   * Returns an empty array on failure or when no account is available.
   */
  public async listModels(): Promise<ReadonlyArray<ModelInfo>> {
    return this.getCachedModels()
  }

  /**
   * Returns the cached model list, refreshing it from the SDK if the cache
   * has expired.
   */
  private async getCachedModels(): Promise<ReadonlyArray<ModelInfo>> {
    if (this.currentAccount === null) {
      return []
    }

    if (
      this.cachedModels !== null &&
      Date.now() - this.modelsCachedAt < ModelListCacheTTL
    ) {
      return this.cachedModels
    }

    // Deduplicate concurrent fetches — if one is already in flight, reuse it.
    if (this.modelsInFlight !== null) {
      return this.modelsInFlight
    }

    this.modelsInFlight = this.fetchModels()
    try {
      return await this.modelsInFlight
    } finally {
      this.modelsInFlight = null
    }
  }

  private async fetchModels(): Promise<ReadonlyArray<ModelInfo>> {
    const client = await this.createClient()

    try {
      await client.start()
      const models = await client.listModels()
      this.cachedModels = models
      this.modelsCachedAt = Date.now()
      return models
    } catch (e) {
      log.warn('CopilotStore: Failed to list models', e)
      return this.cachedModels ?? []
    } finally {
      await this.stopClient(client)
    }
  }
}
