import * as React from 'react'
import { DialogContent } from '../dialog'
import { Button } from '../lib/button'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { LinkButton } from '../lib/link-button'
import { TextBox } from '../lib/text-box'
import { PasswordTextBox } from '../lib/password-text-box'
import { SamplesURL } from '../../lib/stats'
import { isWindowsOpenSSHAvailable } from '../../lib/ssh/ssh'
import {
  DefaultOpenRouterBaseUrl,
  DefaultOpenRouterModel,
  IAICommitMessageSettingsValidationErrors,
  getAICommitMessageSettingsValidationErrors,
  getAICommitMessageSettings,
  normalizeAICommitMessageSettings,
  setAICommitMessageSettings,
} from '../../lib/ai/commit-message-settings'
import {
  OpenRouterConnectionTestPrompt,
  createOpenRouterAICommitMessageProvider,
} from '../../lib/ai/commit-message'

interface IAdvancedPreferencesProps {
  readonly useWindowsOpenSSH: boolean
  readonly optOutOfUsageTracking: boolean
  readonly useExternalCredentialHelper: boolean
  readonly repositoryIndicatorsEnabled: boolean
  readonly onUseWindowsOpenSSHChanged: (checked: boolean) => void
  readonly onOptOutofReportingChanged: (checked: boolean) => void
  readonly onUseExternalCredentialHelperChanged: (checked: boolean) => void
  readonly onRepositoryIndicatorsEnabledChanged: (enabled: boolean) => void
}

interface IAdvancedPreferencesState {
  readonly optOutOfUsageTracking: boolean
  readonly canUseWindowsSSH: boolean
  readonly useExternalCredentialHelper: boolean
  readonly aiCommitMessagesEnabled: boolean
  readonly openRouterAPIKey: string
  readonly openRouterModel: string
  readonly openRouterBaseUrl: string
  readonly aiCommitMessageSettingsErrors: IAICommitMessageSettingsValidationErrors
  readonly isTestingAICommitMessages: boolean
  readonly aiCommitMessageTestResult: string | null
  readonly aiCommitMessageTestError: string | null
}

export class Advanced extends React.Component<
  IAdvancedPreferencesProps,
  IAdvancedPreferencesState
> {
  public constructor(props: IAdvancedPreferencesProps) {
    super(props)

    this.state = {
      optOutOfUsageTracking: this.props.optOutOfUsageTracking,
      canUseWindowsSSH: false,
      useExternalCredentialHelper: this.props.useExternalCredentialHelper,
      aiCommitMessagesEnabled: false,
      openRouterAPIKey: '',
      openRouterModel: DefaultOpenRouterModel,
      openRouterBaseUrl: DefaultOpenRouterBaseUrl,
      aiCommitMessageSettingsErrors: {},
      isTestingAICommitMessages: false,
      aiCommitMessageTestResult: null,
      aiCommitMessageTestError: null,
    }
  }

  public componentDidMount() {
    this.checkSSHAvailability()
    this.loadAICommitMessageSettings()
  }

  private async checkSSHAvailability() {
    this.setState({ canUseWindowsSSH: await isWindowsOpenSSHAvailable() })
  }

  private async loadAICommitMessageSettings() {
    const settings = await getAICommitMessageSettings()

    this.setState({
      aiCommitMessagesEnabled: settings.enabled,
      openRouterAPIKey: settings.apiKey,
      openRouterModel: settings.model,
      openRouterBaseUrl: settings.baseUrl,
      aiCommitMessageSettingsErrors:
        getAICommitMessageSettingsValidationErrors(settings),
    })
  }

  private getAICommitMessageSettingsFromState(
    state: Pick<
      IAdvancedPreferencesState,
      | 'aiCommitMessagesEnabled'
      | 'openRouterAPIKey'
      | 'openRouterModel'
      | 'openRouterBaseUrl'
    >
  ) {
    return {
      enabled: state.aiCommitMessagesEnabled,
      apiKey: state.openRouterAPIKey,
      model: state.openRouterModel,
      baseUrl: state.openRouterBaseUrl,
    }
  }

  private persistAICommitMessageSettings = async (
    state: Pick<
      IAdvancedPreferencesState,
      | 'aiCommitMessagesEnabled'
      | 'openRouterAPIKey'
      | 'openRouterModel'
      | 'openRouterBaseUrl'
    >
  ) => {
    await setAICommitMessageSettings(
      this.getAICommitMessageSettingsFromState(state)
    )
  }

  private setAICommitMessageSettingsState = (
    settingsState: Pick<
      IAdvancedPreferencesState,
      | 'aiCommitMessagesEnabled'
      | 'openRouterAPIKey'
      | 'openRouterModel'
      | 'openRouterBaseUrl'
    >
  ) => {
    const settings = this.getAICommitMessageSettingsFromState(settingsState)

    this.setState({
      ...settingsState,
      aiCommitMessageSettingsErrors:
        getAICommitMessageSettingsValidationErrors(settings),
      aiCommitMessageTestResult: null,
      aiCommitMessageTestError: null,
    })
  }

  private onReportingOptOutChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ optOutOfUsageTracking: value })
    this.props.onOptOutofReportingChanged(value)
  }

  private onUseExternalCredentialHelperChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.checked

    this.setState({ useExternalCredentialHelper: value })
    this.props.onUseExternalCredentialHelperChanged(value)
  }

  private onRepositoryIndicatorsEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onRepositoryIndicatorsEnabledChanged(event.currentTarget.checked)
  }

  private onUseWindowsOpenSSHChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.props.onUseWindowsOpenSSHChanged(event.currentTarget.checked)
  }

  private onAICommitMessagesEnabledChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const nextState = {
      ...this.state,
      aiCommitMessagesEnabled: event.currentTarget.checked,
    }
    this.setAICommitMessageSettingsState(nextState)
    this.persistAICommitMessageSettings(nextState)
  }

  private onOpenRouterAPIKeyBlur = (apiKey: string) => {
    const nextState = normalizeAICommitMessageSettings(
      this.getAICommitMessageSettingsFromState({
        ...this.state,
        openRouterAPIKey: apiKey,
      })
    )
    const settingsState = {
      ...this.state,
      aiCommitMessagesEnabled: nextState.enabled,
      openRouterAPIKey: nextState.apiKey,
      openRouterModel: nextState.model,
      openRouterBaseUrl: nextState.baseUrl,
    }
    this.setAICommitMessageSettingsState(settingsState)
    this.persistAICommitMessageSettings(settingsState)
  }

  private onOpenRouterAPIKeyChanged = (apiKey: string) => {
    this.setAICommitMessageSettingsState({
      ...this.state,
      openRouterAPIKey: apiKey,
    })
  }

  private onOpenRouterModelChanged = (model: string) => {
    this.setAICommitMessageSettingsState({
      ...this.state,
      openRouterModel: model,
    })
  }

  private onOpenRouterModelBlur = (model: string) => {
    const nextState = normalizeAICommitMessageSettings(
      this.getAICommitMessageSettingsFromState({
        ...this.state,
        openRouterModel: model,
      })
    )
    const settingsState = {
      ...this.state,
      aiCommitMessagesEnabled: nextState.enabled,
      openRouterAPIKey: nextState.apiKey,
      openRouterModel: nextState.model,
      openRouterBaseUrl: nextState.baseUrl,
    }
    this.setAICommitMessageSettingsState(settingsState)
    this.persistAICommitMessageSettings(settingsState)
  }

  private onOpenRouterBaseUrlChanged = (baseUrl: string) => {
    this.setAICommitMessageSettingsState({
      ...this.state,
      openRouterBaseUrl: baseUrl,
    })
  }

  private onOpenRouterBaseUrlBlur = (baseUrl: string) => {
    const nextState = normalizeAICommitMessageSettings(
      this.getAICommitMessageSettingsFromState({
        ...this.state,
        openRouterBaseUrl: baseUrl,
      })
    )
    const settingsState = {
      ...this.state,
      aiCommitMessagesEnabled: nextState.enabled,
      openRouterAPIKey: nextState.apiKey,
      openRouterModel: nextState.model,
      openRouterBaseUrl: nextState.baseUrl,
    }
    this.setAICommitMessageSettingsState(settingsState)
    this.persistAICommitMessageSettings(settingsState)
  }

  private onTestAICommitMessageSettings = async () => {
    const settings = normalizeAICommitMessageSettings(
      this.getAICommitMessageSettingsFromState(this.state)
    )
    const errors = getAICommitMessageSettingsValidationErrors(settings)

    if (
      errors.apiKey !== undefined ||
      errors.model !== undefined ||
      errors.baseUrl !== undefined
    ) {
      this.setState({
        aiCommitMessageSettingsErrors: errors,
        aiCommitMessageTestResult: null,
        aiCommitMessageTestError:
          'Fix the OpenRouter settings above before testing.',
      })
      return
    }

    this.setState({
      isTestingAICommitMessages: true,
      aiCommitMessageTestResult: null,
      aiCommitMessageTestError: null,
    })

    try {
      const provider = createOpenRouterAICommitMessageProvider(settings)
      const message = await provider.generate(OpenRouterConnectionTestPrompt)

      this.setState({
        isTestingAICommitMessages: false,
        aiCommitMessageTestResult: `OpenRouter returned: ${message.summary}`,
      })
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Unable to test OpenRouter settings.'

      this.setState({
        isTestingAICommitMessages: false,
        aiCommitMessageTestError: message,
      })
    }
  }

  private reportDesktopUsageLabel() {
    return (
      <span>
        Help GitHub Desktop improve by submitting{' '}
        <LinkButton uri={SamplesURL}>usage stats</LinkButton>
      </span>
    )
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>Background updates</h2>
          <Checkbox
            label="Show status icons in the repository list"
            value={
              this.props.repositoryIndicatorsEnabled
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onRepositoryIndicatorsEnabledChanged}
            ariaDescribedBy="periodic-fetch-description"
          />
          <div
            id="periodic-fetch-description"
            className="git-settings-description"
          >
            <p>
              These icons indicate which repositories have local or remote
              changes, and require the periodic fetching of repositories that
              are not currently selected.
            </p>
            <p>
              Turning this off will not stop the periodic fetching of your
              currently selected repository, but may improve overall app
              performance for users with many repositories.
            </p>
          </div>
        </div>
        <div className="advanced-section">
          <h2>Usage</h2>
          <Checkbox
            label={this.reportDesktopUsageLabel()}
            value={
              this.state.optOutOfUsageTracking
                ? CheckboxValue.Off
                : CheckboxValue.On
            }
            onChange={this.onReportingOptOutChanged}
          />
        </div>
        {this.renderAICommitMessageSettings()}
        <h2>Network and credentials</h2>
        {this.renderSSHSettings()}
        <div className="advanced-section">
          <Checkbox
            label={'Use Git Credential Manager'}
            value={
              this.state.useExternalCredentialHelper
                ? CheckboxValue.On
                : CheckboxValue.Off
            }
            onChange={this.onUseExternalCredentialHelperChanged}
            ariaDescribedBy="use-external-credential-helper-description"
          />
          <div
            id="use-external-credential-helper-description"
            className="git-settings-description"
          >
            <p>
              Use{' '}
              <LinkButton uri="https://gh.io/gcm">
                Git Credential Manager{' '}
              </LinkButton>{' '}
              for private repositories outside of GitHub.com. This feature is
              experimental and subject to change.
            </p>
          </div>
        </div>
      </DialogContent>
    )
  }

  private renderSSHSettings() {
    if (!this.state.canUseWindowsSSH) {
      return null
    }

    return (
      <div className="advanced-section">
        <Checkbox
          label="Use system OpenSSH (recommended)"
          value={
            this.props.useWindowsOpenSSH ? CheckboxValue.On : CheckboxValue.Off
          }
          onChange={this.onUseWindowsOpenSSHChanged}
        />
      </div>
    )
  }

  private renderAICommitMessageSettingError(
    id: string,
    message: string | undefined
  ) {
    if (message === undefined) {
      return null
    }

    return (
      <div id={id} className="git-settings-description setting-hint-warning">
        {message}
      </div>
    )
  }

  private renderAICommitMessageSettings() {
    const { aiCommitMessageSettingsErrors } = this.state
    const canTestAICommitMessages =
      this.state.aiCommitMessagesEnabled &&
      !this.state.isTestingAICommitMessages

    return (
      <div className="advanced-section">
        <h2>AI commit messages</h2>
        <Checkbox
          label="Enable OpenRouter commit message generation"
          value={
            this.state.aiCommitMessagesEnabled
              ? CheckboxValue.On
              : CheckboxValue.Off
          }
          onChange={this.onAICommitMessagesEnabledChanged}
          ariaDescribedBy="ai-commit-messages-description"
        />
        <div
          id="ai-commit-messages-description"
          className="git-settings-description"
        >
          Generate commit summaries from selected changes only when you click
          the generate button. Review generated messages before committing.
        </div>
        <PasswordTextBox
          label="OpenRouter API key"
          value={this.state.openRouterAPIKey}
          placeholder="sk-or-..."
          onValueChanged={this.onOpenRouterAPIKeyChanged}
          onBlur={this.onOpenRouterAPIKeyBlur}
          disabled={!this.state.aiCommitMessagesEnabled}
          required={this.state.aiCommitMessagesEnabled}
          ariaDescribedBy="openrouter-api-key-error"
        />
        {this.renderAICommitMessageSettingError(
          'openrouter-api-key-error',
          aiCommitMessageSettingsErrors.apiKey
        )}
        <TextBox
          label="OpenRouter model"
          value={this.state.openRouterModel}
          placeholder={DefaultOpenRouterModel}
          onValueChanged={this.onOpenRouterModelChanged}
          onBlur={this.onOpenRouterModelBlur}
          disabled={!this.state.aiCommitMessagesEnabled}
          ariaDescribedBy="openrouter-model-error"
        />
        {this.renderAICommitMessageSettingError(
          'openrouter-model-error',
          aiCommitMessageSettingsErrors.model
        )}
        <TextBox
          label="OpenRouter base URL"
          value={this.state.openRouterBaseUrl}
          placeholder={DefaultOpenRouterBaseUrl}
          onValueChanged={this.onOpenRouterBaseUrlChanged}
          onBlur={this.onOpenRouterBaseUrlBlur}
          disabled={!this.state.aiCommitMessagesEnabled}
          ariaDescribedBy="openrouter-base-url-error"
        />
        {this.renderAICommitMessageSettingError(
          'openrouter-base-url-error',
          aiCommitMessageSettingsErrors.baseUrl
        )}
        <Button
          onClick={this.onTestAICommitMessageSettings}
          disabled={!canTestAICommitMessages}
        >
          {this.state.isTestingAICommitMessages
            ? 'Testing OpenRouter...'
            : 'Test OpenRouter'}
        </Button>
        {this.state.aiCommitMessageTestResult === null ? null : (
          <div className="git-settings-description">
            {this.state.aiCommitMessageTestResult}
          </div>
        )}
        {this.renderAICommitMessageSettingError(
          'openrouter-test-error',
          this.state.aiCommitMessageTestError ?? undefined
        )}
      </div>
    )
  }
}
