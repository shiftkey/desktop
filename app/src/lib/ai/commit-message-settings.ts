import { getBoolean, setBoolean } from '../local-storage'
import { TokenStore } from '../stores/token-store'

const aiCommitMessagesEnabledKey = 'ai-commit-messages-enabled'
const aiCommitMessagesModelKey = 'ai-commit-messages-model'
const aiCommitMessagesBaseUrlKey = 'ai-commit-messages-base-url'
const openRouterTokenStoreKey = 'openrouter-api-key'
const openRouterTokenStoreLogin = 'openrouter'

export const DefaultOpenRouterBaseUrl = 'https://openrouter.ai/api/v1'
export const DefaultOpenRouterModel = 'openrouter/auto'

export interface IAICommitMessageSettings {
  readonly enabled: boolean
  readonly apiKey: string
  readonly model: string
  readonly baseUrl: string
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
  setBoolean(aiCommitMessagesEnabledKey, settings.enabled)
  localStorage.setItem(
    aiCommitMessagesModelKey,
    settings.model || DefaultOpenRouterModel
  )
  localStorage.setItem(
    aiCommitMessagesBaseUrlKey,
    settings.baseUrl || DefaultOpenRouterBaseUrl
  )

  if (settings.apiKey.length > 0) {
    await TokenStore.setItem(
      openRouterTokenStoreKey,
      openRouterTokenStoreLogin,
      settings.apiKey
    )
  } else {
    await TokenStore.deleteItem(
      openRouterTokenStoreKey,
      openRouterTokenStoreLogin
    )
  }
}

export function hasUsableAICommitMessageSettings(
  settings: IAICommitMessageSettings
): boolean {
  return (
    settings.enabled &&
    settings.apiKey.trim().length > 0 &&
    settings.model.trim().length > 0 &&
    settings.baseUrl.trim().length > 0
  )
}
