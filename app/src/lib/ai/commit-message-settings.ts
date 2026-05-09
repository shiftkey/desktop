import { getBoolean, setBoolean } from '../local-storage'
import { TokenStore } from '../stores/token-store'
import { Repository } from '../../models/repository'

const aiCommitMessagesEnabledKey = 'ai-commit-messages-enabled'
const aiCommitMessagesModelKey = 'ai-commit-messages-model'
const aiCommitMessagesBaseUrlKey = 'ai-commit-messages-base-url'
const aiCommitMessagesAPIKeyFallbackKey = 'ai-commit-messages-api-key'
const openRouterTokenStoreKey = 'openrouter-api-key'
const openRouterTokenStoreLogin = 'openrouter'

export const DefaultOpenRouterBaseUrl = 'https://openrouter.ai/api/v1'
export const DefaultOpenRouterModel = 'openrouter/auto'

function getRepositoryAICommitMessagesDisabledKey(repository: Repository) {
  return `ai-commit-messages-disabled-repository-${repository.id}`
}

export interface IAICommitMessageSettings {
  readonly enabled: boolean
  readonly apiKey: string
  readonly model: string
  readonly baseUrl: string
}

export interface IAICommitMessageSettingsValidationErrors {
  readonly apiKey?: string
  readonly model?: string
  readonly baseUrl?: string
}

export interface ISetAICommitMessageSettingsOptions {
  readonly clearAPIKey?: boolean
}

export function normalizeAICommitMessageSettings(
  settings: IAICommitMessageSettings
): IAICommitMessageSettings {
  return {
    enabled: settings.enabled,
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim() || DefaultOpenRouterModel,
    baseUrl: settings.baseUrl.trim() || DefaultOpenRouterBaseUrl,
  }
}

export function getAICommitMessageSettingsValidationErrors(
  settings: IAICommitMessageSettings
): IAICommitMessageSettingsValidationErrors {
  const normalized = normalizeAICommitMessageSettings(settings)
  const errors: {
    apiKey?: string
    model?: string
    baseUrl?: string
  } = {}

  if (normalized.enabled && normalized.apiKey.length === 0) {
    errors.apiKey = 'Enter an OpenRouter API key.'
  }

  if (/\s/.test(normalized.model)) {
    errors.model = 'Model IDs cannot contain spaces.'
  }

  try {
    const url = new URL(normalized.baseUrl)

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      errors.baseUrl = 'Enter an HTTP or HTTPS URL.'
    }
  } catch (e) {
    errors.baseUrl = 'Enter a valid OpenRouter base URL.'
  }

  return errors
}

export async function getAICommitMessageSettings(): Promise<IAICommitMessageSettings> {
  let apiKey = localStorage.getItem(aiCommitMessagesAPIKeyFallbackKey) || ''

  try {
    apiKey =
      (await TokenStore.getItem(
        openRouterTokenStoreKey,
        openRouterTokenStoreLogin
      )) || apiKey
  } catch (e) {
    log.warn('Unable to load OpenRouter API key from secure storage', e)
  }

  return {
    enabled: getBoolean(aiCommitMessagesEnabledKey, false),
    apiKey,
    model:
      localStorage.getItem(aiCommitMessagesModelKey) || DefaultOpenRouterModel,
    baseUrl:
      localStorage.getItem(aiCommitMessagesBaseUrlKey) ||
      DefaultOpenRouterBaseUrl,
  }
}

export async function setAICommitMessageSettings(
  settings: IAICommitMessageSettings,
  options: ISetAICommitMessageSettingsOptions = {}
): Promise<void> {
  const normalized = normalizeAICommitMessageSettings(settings)

  setBoolean(aiCommitMessagesEnabledKey, normalized.enabled)
  localStorage.setItem(
    aiCommitMessagesModelKey,
    normalized.model || DefaultOpenRouterModel
  )
  localStorage.setItem(
    aiCommitMessagesBaseUrlKey,
    normalized.baseUrl || DefaultOpenRouterBaseUrl
  )

  if (normalized.apiKey.length > 0) {
    localStorage.setItem(aiCommitMessagesAPIKeyFallbackKey, normalized.apiKey)

    try {
      await TokenStore.setItem(
        openRouterTokenStoreKey,
        openRouterTokenStoreLogin,
        normalized.apiKey
      )
    } catch (e) {
      log.warn('Unable to save OpenRouter API key to secure storage', e)
    }
  } else if (options.clearAPIKey === true) {
    localStorage.removeItem(aiCommitMessagesAPIKeyFallbackKey)

    try {
      await TokenStore.deleteItem(
        openRouterTokenStoreKey,
        openRouterTokenStoreLogin
      )
    } catch (e) {
      log.warn('Unable to delete OpenRouter API key from secure storage', e)
    }
  }
}

export function getAICommitMessagesEnabledForRepository(
  repository: Repository
): boolean {
  return !getBoolean(
    getRepositoryAICommitMessagesDisabledKey(repository),
    false
  )
}

export function setAICommitMessagesEnabledForRepository(
  repository: Repository,
  enabled: boolean
): void {
  setBoolean(getRepositoryAICommitMessagesDisabledKey(repository), !enabled)
}

export function hasUsableAICommitMessageSettings(
  settings: IAICommitMessageSettings,
  repository?: Repository
): boolean {
  const errors = getAICommitMessageSettingsValidationErrors(settings)

  return (
    settings.enabled &&
    (repository === undefined ||
      getAICommitMessagesEnabledForRepository(repository)) &&
    errors.apiKey === undefined &&
    errors.model === undefined &&
    errors.baseUrl === undefined
  )
}
