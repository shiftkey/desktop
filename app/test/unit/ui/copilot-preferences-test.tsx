import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'
import { render, screen, fireEvent } from '../../helpers/ui/render'
import { CopilotPreferences } from '../../../src/ui/preferences/copilot'
import {
  DefaultCopilotModel,
  type CopilotFeature,
} from '../../../src/lib/stores/copilot-store'
import type { ModelInfo } from '@github/copilot-sdk'

function makeModel(
  overrides: Partial<ModelInfo> & Pick<ModelInfo, 'id' | 'name'>
): ModelInfo {
  return {
    capabilities: {
      supports: { vision: false, reasoningEffort: false },
      limits: { max_context_window_tokens: 128000 },
    },
    ...overrides,
  }
}

const defaultModel = makeModel({
  id: DefaultCopilotModel,
  name: 'GPT-5 mini',
  billing: { multiplier: 1 },
})

const otherModel = makeModel({
  id: 'claude-sonnet',
  name: 'Claude Sonnet',
  billing: { multiplier: 2 },
})

const models: ReadonlyArray<ModelInfo> = [defaultModel, otherModel]

describe('CopilotPreferences', () => {
  it('shows sign-in message when copilot is not available', () => {
    render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={null}
        copilotAvailable={false}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(
      screen.getByText(
        'Sign in to a GitHub.com account in the Accounts tab to configure Copilot settings.'
      )
    )
    assert.strictEqual(
      screen.queryByRole('combobox'),
      null,
      'Select should not be rendered when not available'
    )
  })

  it('shows loading message when copilot is available but models not yet fetched', () => {
    render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={null}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(screen.getByText('Loading available models…'))
    assert.strictEqual(
      screen.queryByRole('combobox'),
      null,
      'Select should not be rendered while loading'
    )
  })

  it('shows no-models message when fetch completed with empty result', () => {
    render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={[]}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(
      screen.getByText('No models available. Check your Copilot subscription.')
    )
    assert.strictEqual(
      screen.queryByRole('combobox'),
      null,
      'Select should not be rendered when no models are available'
    )
  })

  it('renders the model picker when models are available', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select')
    assert.notStrictEqual(select, null, 'Should render a select element')

    const options = view.container.querySelectorAll('option')
    assert.strictEqual(options.length, 2)
    assert.strictEqual(options[0].textContent, 'GPT-5 mini (default)')
    assert.strictEqual(options[1].textContent, 'Claude Sonnet')
  })

  it('selects the default model when no model is selected for commit-message-generation', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(select.value, DefaultCopilotModel)
  })

  it('selects the specified model when commit-message-generation model is set', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    assert.strictEqual(select.value, 'claude-sonnet')
  })

  it('calls onSelectedCopilotModelChanged with feature and model id on change', () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []

    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'claude-sonnet' } })

    assert.deepStrictEqual(changed, [
      { feature: 'commit-message-generation', model: 'claude-sonnet' },
    ])
  })

  it('calls onSelectedCopilotModelChanged with null when default is re-selected', () => {
    const changed: Array<{ feature: CopilotFeature; model: string | null }> = []

    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{ 'commit-message-generation': 'claude-sonnet' }}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={(f, m) =>
          changed.push({ feature: f, model: m })
        }
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: DefaultCopilotModel } })

    assert.deepStrictEqual(
      changed,
      [{ feature: 'commit-message-generation', model: null }],
      'Selecting default model should emit null'
    )
  })

  it('renders the heading text', () => {
    render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    assert.ok(screen.getByRole('heading', { level: 2 }))
  })

  it('falls back to first option when default model is not in the list', () => {
    const noDefaultModels: ReadonlyArray<ModelInfo> = [
      makeModel({ id: 'model-a', name: 'Model A', billing: { multiplier: 1 } }),
      makeModel({ id: 'model-b', name: 'Model B', billing: { multiplier: 2 } }),
    ]

    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{}}
        copilotModels={noDefaultModels}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    // With no model selected the value falls back to DefaultCopilotModel,
    // which isn't in the list — the browser selects the first option.
    assert.strictEqual(select.value, 'model-a')

    // No option should have the "(default)" suffix
    const options = view.container.querySelectorAll('option')
    for (const opt of options) {
      assert.ok(
        !opt.textContent?.includes('(default)'),
        `Option "${opt.textContent}" should not show (default) suffix`
      )
    }
  })

  it('falls back to first option when persisted model is not in the list', () => {
    const view = render(
      <CopilotPreferences
        selectedCopilotModels={{
          'commit-message-generation': 'deleted-model',
        }}
        copilotModels={models}
        copilotAvailable={true}
        onSelectedCopilotModelChanged={() => {}}
      />
    )

    const select = view.container.querySelector('select') as HTMLSelectElement
    // "deleted-model" is not a valid option, so the browser falls back
    // to the first available option.
    assert.strictEqual(select.value, DefaultCopilotModel)
  })
})
