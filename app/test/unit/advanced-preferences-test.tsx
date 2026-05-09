import { Advanced } from '../../src/ui/preferences/advanced'
import * as aiCommitMessageSettings from '../../src/lib/ai/commit-message-settings'
import * as aiCommitMessage from '../../src/lib/ai/commit-message'

function createAdvancedPreferences() {
  const component = new Advanced({
    useWindowsOpenSSH: false,
    optOutOfUsageTracking: false,
    useExternalCredentialHelper: false,
    repositoryIndicatorsEnabled: true,
    onUseWindowsOpenSSHChanged: jest.fn(),
    onOptOutofReportingChanged: jest.fn(),
    onUseExternalCredentialHelperChanged: jest.fn(),
    onRepositoryIndicatorsEnabledChanged: jest.fn(),
  })

  ;(component as any).setState = (state: any) => {
    component.state = { ...component.state, ...state }
  }

  return component
}

describe('Advanced preferences', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('validates AI commit message settings as they change', () => {
    const component = createAdvancedPreferences()

    ;(component as any).onAICommitMessagesEnabledChanged({
      currentTarget: { checked: true },
    })

    expect(component.state.aiCommitMessageSettingsErrors.apiKey).toEqual(
      'Enter an OpenRouter API key.'
    )
    ;(component as any).onOpenRouterBaseUrlChanged('not a url')

    expect(component.state.aiCommitMessageSettingsErrors.baseUrl).toEqual(
      'Enter a valid OpenRouter base URL.'
    )
  })

  it('normalizes AI commit message settings before saving them', () => {
    const setSettings = jest
      .spyOn(aiCommitMessageSettings, 'setAICommitMessageSettings')
      .mockResolvedValue(undefined)
    const component = createAdvancedPreferences()

    ;(component as any).onOpenRouterModelBlur('  ')
    ;(component as any).onOpenRouterBaseUrlBlur('  ')

    expect(component.state.openRouterModel).toEqual(
      aiCommitMessageSettings.DefaultOpenRouterModel
    )
    expect(component.state.openRouterBaseUrl).toEqual(
      aiCommitMessageSettings.DefaultOpenRouterBaseUrl
    )
    expect(setSettings).toHaveBeenLastCalledWith({
      enabled: false,
      apiKey: '',
      model: aiCommitMessageSettings.DefaultOpenRouterModel,
      baseUrl: aiCommitMessageSettings.DefaultOpenRouterBaseUrl,
    })
  })

  it('tests OpenRouter settings from current preference values', async () => {
    const generate = jest.fn().mockResolvedValue({
      summary: 'Update connection test',
      description: null,
    })
    const createProvider = jest
      .spyOn(aiCommitMessage, 'createOpenRouterAICommitMessageProvider')
      .mockReturnValue({ generate })
    const component = createAdvancedPreferences()

    ;(component as any).setAICommitMessageSettingsState({
      ...component.state,
      aiCommitMessagesEnabled: true,
      openRouterAPIKey: ' sk-or-test ',
      openRouterModel: 'openrouter/auto',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1/',
    })

    await (component as any).onTestAICommitMessageSettings()

    expect(createProvider).toHaveBeenCalledWith({
      enabled: true,
      apiKey: 'sk-or-test',
      model: 'openrouter/auto',
      baseUrl: 'https://openrouter.ai/api/v1/',
    })
    expect(generate).toHaveBeenCalledWith(
      aiCommitMessage.OpenRouterConnectionTestPrompt
    )
    expect(component.state.aiCommitMessageTestResult).toEqual(
      'OpenRouter returned: Update connection test'
    )
    expect(component.state.aiCommitMessageTestError).toBeNull()
  })

  it('shows OpenRouter test failures in preferences', async () => {
    jest
      .spyOn(aiCommitMessage, 'createOpenRouterAICommitMessageProvider')
      .mockReturnValue({
        generate: jest
          .fn()
          .mockRejectedValue(
            new Error('OpenRouter did not return a commit message.')
          ),
      })
    const component = createAdvancedPreferences()

    ;(component as any).setAICommitMessageSettingsState({
      ...component.state,
      aiCommitMessagesEnabled: true,
      openRouterAPIKey: 'sk-or-test',
      openRouterModel: 'openrouter/auto',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    await (component as any).onTestAICommitMessageSettings()

    expect(component.state.aiCommitMessageTestError).toEqual(
      'OpenRouter did not return a commit message.'
    )
    expect(component.state.aiCommitMessageTestResult).toBeNull()
  })
})
