import { getBoolean, setBoolean } from '../local-storage'
import { TokenStore } from '../stores/token-store'
import { Repository } from '../../models/repository'

const aiCommitMessagesEnabledKey = 'ai-commit-messages-enabled'
const aiCommitMessagesModelKey = 'ai-commit-messages-model'
const aiCommitMessagesBaseUrlKey = 'ai-commit-messages-base-url'
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
  return {
    enabled: getBoolean(aiCommitMessagesEnabledKey, false),
    apiKey:
      (await TokenStore.getItem(
        openRouterTokenStoreKey,
        openRouterTokenStoreLogin
      )) || '',
    model:
      localStorage.getItem(aiCommitMessagesModelKey) || DefaultOpenRouterModel,
    baseUrl:
      localStorage.getItem(aiCommitMessagesBaseUrlKey) ||
      DefaultOpenRouterBaseUrl,
  }
}

export async function setAICommitMessageSettings(
  settings: IAICommitMessageSettings
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
    await TokenStore.setItem(
      openRouterTokenStoreKey,
      openRouterTokenStoreLogin,
      normalized.apiKey
    )
  } else {
    await TokenStore.deleteItem(
      openRouterTokenStoreKey,
      openRouterTokenStoreLogin
    )
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
