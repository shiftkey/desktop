import { ICommitMessage } from '../../models/commit-message'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
  DiffLineType,
  IDiff,
  ITextDiff,
  ILargeTextDiff,
} from '../../models/diff'

const DefaultMaxPromptLength = 12000

export interface IAICommitMessageDiff {
  readonly path: string
  readonly selection: DiffSelection
  readonly diff: IDiff
}

export interface IOpenRouterAICommitMessageProviderOptions {
  readonly apiKey: string
  readonly model: string
  readonly baseUrl: string
  readonly fetcher?: typeof fetch
}

export interface IAICommitMessageProvider {
  generate(prompt: string): Promise<ICommitMessage>
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '')
}

function getOpenRouterErrorMessage(json: any): string | null {
  const message = json?.error?.message || json?.message
  return typeof message === 'string' && message.trim().length > 0
    ? message.trim()
    : null
}

function formatSelectedTextDiff(
  diff: ITextDiff | ILargeTextDiff,
  selection: DiffSelection
): string {
  if (selection.getSelectionType() === DiffSelectionType.All) {
    return diff.text
  }

  const lines = new Array<string>()

  for (const hunk of diff.hunks) {
    let hunkHasSelectedLine = false
    const selectedLines = new Array<string>()

    for (const [index, line] of hunk.lines.entries()) {
      const lineNumber = hunk.unifiedDiffStart + index

      if (line.type === DiffLineType.Hunk) {
        continue
      }

      if (!line.isIncludeableLine() || selection.isSelected(lineNumber)) {
        selectedLines.push(line.text)
      }

      if (line.isIncludeableLine() && selection.isSelected(lineNumber)) {
        hunkHasSelectedLine = true
      }
    }

    if (hunkHasSelectedLine) {
      lines.push(hunk.header.toDiffLineRepresentation(), ...selectedLines)
    }
  }

  return lines.join('\n')
}

function formatDiffForPrompt(change: IAICommitMessageDiff): string | null {
  const { diff, selection } = change

  if (selection.getSelectionType() === DiffSelectionType.None) {
    return null
  }

  if (diff.kind === DiffType.Text || diff.kind === DiffType.LargeText) {
    const text = formatSelectedTextDiff(diff, selection).trim()
    return text.length > 0 ? text : null
  }

  if (diff.kind === DiffType.Binary) {
    return '[binary file changed]'
  }

  if (diff.kind === DiffType.Image) {
    return '[image file changed]'
  }

  if (diff.kind === DiffType.Submodule) {
    return `[submodule changed: ${diff.oldSHA || 'none'} -> ${
      diff.newSHA || 'none'
    }]`
  }

  return '[diff unavailable]'
}

export function buildAICommitMessagePrompt(
  changes: ReadonlyArray<IAICommitMessageDiff>,
  maxLength: number = DefaultMaxPromptLength
): string {
  const formattedChanges = changes
    .map(change => {
      const diff = formatDiffForPrompt(change)
      return diff === null ? null : `File: ${change.path}\n${diff}`
    })
    .filter((change): change is string => change !== null)
    .join('\n\n')

  const prefix =
    'Write a concise Git commit message for the selected changes below.\n' +
    'Return only JSON with "summary" and "description" string fields.\n' +
    'Use imperative mood. Keep the summary under 72 characters.\n\n' +
    'Selected changes:\n'

  const prompt = `${prefix}${formattedChanges}`

  if (prompt.length <= maxLength) {
    return prompt
  }

  const truncationNotice = '\n\n[diff truncated]'
  return `${prompt.substring(
    0,
    maxLength - truncationNotice.length
  )}${truncationNotice}`
}

export function parseAICommitMessageResponse(content: string): ICommitMessage {
  let parsed: any
  const trimmed = content.trim()
  const jsonText = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed

  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error('The AI provider returned an invalid commit message.')
  }

  if (typeof parsed.summary !== 'string') {
    throw new Error('The AI provider did not return a commit summary.')
  }

  const summary = parsed.summary.trim()
  const description =
    typeof parsed.description === 'string' &&
    parsed.description.trim().length > 0
      ? parsed.description.trim()
      : null

  if (summary.length === 0) {
    throw new Error('The AI provider returned an empty commit summary.')
  }

  return { summary, description }
}

export function createOpenRouterAICommitMessageProvider(
  options: IOpenRouterAICommitMessageProviderOptions
): IAICommitMessageProvider {
  return {
    async generate(prompt: string): Promise<ICommitMessage> {
      const fetcher = options.fetcher || fetch
      const response = await fetcher(
        `${normalizeBaseUrl(options.baseUrl)}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            temperature: 0.2,
            max_tokens: 300,
            messages: [
              {
                role: 'system',
                content:
                  'You write accurate Git commit messages from diffs. Return JSON only.',
              },
              { role: 'user', content: prompt },
            ],
          }),
        }
      )

      if (!response.ok) {
        let providerMessage: string | null = null

        try {
          providerMessage = getOpenRouterErrorMessage(await response.json())
        } catch (e) {
          providerMessage = null
        }

        const statusMessage = `OpenRouter request failed with ${response.status}.`
        throw new Error(
          providerMessage === null
            ? statusMessage
            : `${statusMessage} ${providerMessage}`
        )
      }

      const json = await response.json()
      const content = json?.choices?.[0]?.message?.content

      if (typeof content !== 'string') {
        throw new Error('OpenRouter did not return a commit message.')
      }

      return parseAICommitMessageResponse(content)
    },
  }
}
