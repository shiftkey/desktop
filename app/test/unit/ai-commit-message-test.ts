import {
  buildAICommitMessagePrompt,
  createOpenRouterAICommitMessageProvider,
  parseAICommitMessageResponse,
} from '../../src/lib/ai/commit-message'
import {
  DiffHunk,
  DiffHunkExpansionType,
  DiffHunkHeader,
} from '../../src/models/diff/raw-diff'
import { DiffLine, DiffLineType } from '../../src/models/diff/diff-line'
import { DiffSelection, DiffSelectionType } from '../../src/models/diff'
import { DiffType, ITextDiff } from '../../src/models/diff/diff-data'

function createTextDiff(text: string): ITextDiff {
  const hunk = new DiffHunk(
    new DiffHunkHeader(1, 2, 1, 2),
    [
      new DiffLine('@@ -1,2 +1,2 @@', DiffLineType.Hunk, 1, null, null),
      new DiffLine('-old line', DiffLineType.Delete, 2, 1, null),
      new DiffLine('+new line', DiffLineType.Add, 3, null, 1),
    ],
    1,
    3,
    DiffHunkExpansionType.None
  )

  return {
    kind: DiffType.Text,
    text,
    hunks: [hunk],
    maxLineNumber: 3,
    hasHiddenBidiChars: false,
  }
}

describe('AI commit message generation', () => {
  it('builds a prompt from selected text diffs', () => {
    const prompt = buildAICommitMessagePrompt([
      {
        path: 'app/src/example.ts',
        selection: DiffSelection.fromInitialSelection(DiffSelectionType.All),
        diff: createTextDiff(
          'diff --git a/example.ts b/example.ts\n-old\n+new'
        ),
      },
    ])

    expect(prompt).toContain('app/src/example.ts')
    expect(prompt).toContain('-old')
    expect(prompt).toContain('+new')
    expect(prompt).toContain('"summary"')
  })

  it('includes only selected changed lines for partial selections', () => {
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withLineSelection(3, true)

    const prompt = buildAICommitMessagePrompt([
      {
        path: 'app/src/example.ts',
        selection,
        diff: createTextDiff('ignored full text'),
      },
    ])

    expect(prompt).toContain('+new line')
    expect(prompt).not.toContain('-old line')
  })

  it('caps large prompts', () => {
    const prompt = buildAICommitMessagePrompt(
      [
        {
          path: 'big.ts',
          selection: DiffSelection.fromInitialSelection(DiffSelectionType.All),
          diff: createTextDiff(`+${'x'.repeat(500)}`),
        },
      ],
      200
    )

    expect(prompt.length).toBeLessThanOrEqual(200)
    expect(prompt).toContain('[diff truncated]')
  })

  it('parses JSON commit message responses', () => {
    const result = parseAICommitMessageResponse(
      '{"summary":"Add tests","description":"Covers AI commit message parsing."}'
    )

    expect(result).toEqual({
      summary: 'Add tests',
      description: 'Covers AI commit message parsing.',
    })
  })

  it('requests OpenRouter chat completions', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"summary":"Update docs","description":"Adds guide."}',
            },
          },
        ],
      }),
    })

    const provider = createOpenRouterAICommitMessageProvider({
      apiKey: 'sk-or-test',
      model: 'openrouter/auto',
      baseUrl: 'https://openrouter.ai/api/v1',
      fetcher,
    })

    const result = await provider.generate('prompt text')

    expect(result.summary).toEqual('Update docs')
    expect(fetcher).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-test',
          'Content-Type': 'application/json',
        }),
      })
    )
  })
})
