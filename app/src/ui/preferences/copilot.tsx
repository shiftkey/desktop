import * as React from 'react'
import { DialogContent } from '../dialog'
import { Select } from '../lib/select'
import type { ModelInfo } from '@github/copilot-sdk'
import {
  DefaultCopilotModel,
  type CopilotFeature,
  type CopilotModelSelections,
} from '../../lib/stores/copilot-store'

interface ICopilotPreferencesProps {
  readonly selectedCopilotModels: CopilotModelSelections
  readonly copilotModels: ReadonlyArray<ModelInfo> | null
  readonly copilotAvailable: boolean
  readonly onSelectedCopilotModelChanged: (
    feature: CopilotFeature,
    model: string | null
  ) => void
}

export class CopilotPreferences extends React.Component<ICopilotPreferencesProps> {
  private onCommitMessageModelChanged = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const value = event.currentTarget.value
    this.props.onSelectedCopilotModelChanged(
      'commit-message-generation',
      value === DefaultCopilotModel ? null : value
    )
  }

  public render() {
    return (
      <DialogContent>
        <div className="copilot-section">
          <h2 id="copilot-model-heading">
            {__DARWIN__ ? 'Language Models' : 'Language models'}
          </h2>
          {this.renderModelPicker()}
        </div>
      </DialogContent>
    )
  }

  private renderModelPicker() {
    if (!this.props.copilotAvailable) {
      return (
        <p>
          Sign in to a GitHub.com account in the Accounts tab to configure
          Copilot settings.
        </p>
      )
    }

    const { copilotModels, selectedCopilotModels } = this.props
    const selectedModel =
      selectedCopilotModels['commit-message-generation'] ?? null

    if (copilotModels === null) {
      return <p>Loading available models…</p>
    }

    if (copilotModels.length === 0) {
      return <p>No models available. Check your Copilot subscription.</p>
    }

    return (
      <Select
        label={
          __DARWIN__ ? 'Commit Message Generation' : 'Commit message generation'
        }
        value={selectedModel ?? DefaultCopilotModel}
        onChange={this.onCommitMessageModelChanged}
      >
        {copilotModels.map(m => (
          <option key={m.id} value={m.id}>
            {m.id === DefaultCopilotModel ? `${m.name} (default)` : m.name}
          </option>
        ))}
      </Select>
    )
  }
}
