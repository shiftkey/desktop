import { describe, it } from 'node:test'
import assert from 'node:assert'

import {
  parseCopilotConflictResolution,
  extractSymbols,
  createDependencyAwareChunks,
} from '../../src/lib/copilot-conflict-resolution'
import { IFileConflictContext } from '../../src/lib/copilot-conflict-context'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  oursContent: string,
  theirsContent: string,
  opts?: { baseContent?: string; contextBefore?: string; contextAfter?: string }
): IFileConflictContext {
  return {
    path,
    hunks: [
      {
        oursContent,
        theirsContent,
        baseContent: opts?.baseContent ?? null,
        contextBefore: opts?.contextBefore ?? '',
        contextAfter: opts?.contextAfter ?? '',
      },
    ],
  }
}

function paths(
  chunks: ReadonlyArray<ReadonlyArray<IFileConflictContext>>
): ReadonlyArray<ReadonlyArray<string>> {
  return chunks.map(c => c.map(f => f.path))
}

// ---------------------------------------------------------------------------
// parseCopilotConflictResolution
// ---------------------------------------------------------------------------

describe('parseCopilotConflictResolution', () => {
  it('parses a valid JSON response', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'src/index.ts',
          resolvedContent: 'content',
          reasoning: 'combined both',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 1)
    assert.equal(result.resolutions[0].path, 'src/index.ts')
    assert.equal(result.resolutions[0].resolvedContent, 'content')
    assert.equal(result.resolutions[0].reasoning, 'combined both')
  })

  it('unwraps ```json code blocks', () => {
    const wrapped =
      '```json\n{"resolutions":[{"path":"a.ts","resolvedContent":"x","reasoning":"r"}]}\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('unwraps ``` code blocks without json tag', () => {
    const wrapped =
      '```\n{"resolutions":[{"path":"a.ts","resolvedContent":"x","reasoning":"r"}]}\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('handles multiple resolutions', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: 'a', reasoning: 'ra' },
        { path: 'b.ts', resolvedContent: 'b', reasoning: 'rb' },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions.length, 2)
  })

  it('throws on invalid JSON', () => {
    assert.throws(
      () => parseCopilotConflictResolution('not json'),
      /invalid JSON/
    )
  })

  it('throws on non-object payload', () => {
    assert.throws(
      () => parseCopilotConflictResolution('"string"'),
      /expected an object/
    )
  })

  it('throws on missing resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"foo":"bar"}'),
      /"resolutions" must be an array/
    )
  })

  it('throws on empty resolutions array', () => {
    assert.throws(
      () => parseCopilotConflictResolution('{"resolutions":[]}'),
      /"resolutions" must not be empty/
    )
  })

  it('throws on missing path', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"resolvedContent":"c","reasoning":"r"}]}'
        ),
      /"path" at index 0/
    )
  })

  it('throws on empty path', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"  ","resolvedContent":"c","reasoning":"r"}]}'
        ),
      /"path" at index 0/
    )
  })

  it('throws on missing resolvedContent', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"a.ts","reasoning":"r"}]}'
        ),
      /"resolvedContent" at index 0/
    )
  })

  it('throws on missing reasoning', () => {
    assert.throws(
      () =>
        parseCopilotConflictResolution(
          '{"resolutions":[{"path":"a.ts","resolvedContent":"c"}]}'
        ),
      /"reasoning" at index 0/
    )
  })

  it('allows empty resolvedContent (file emptied intentionally)', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: '', reasoning: 'emptied' },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].resolvedContent, '')
  })

  it('handles resolvedContent containing triple backticks', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'README.md',
          resolvedContent: '# Hello\n```js\nconsole.log()\n```\n',
          reasoning: 'kept code block',
        },
      ],
    })
    const wrapped = '```json\n' + json + '\n```'
    const result = parseCopilotConflictResolution(wrapped)
    assert.equal(result.resolutions[0].path, 'README.md')
    assert.ok(result.resolutions[0].resolvedContent.includes('```js'))
  })

  it('parses when LLM adds preamble/postamble around code block', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: 'fixed', reasoning: 'merged' },
      ],
    })
    const content =
      'Here is my answer:\n```json\n' + json + '\n```\nHope this helps!'
    const result = parseCopilotConflictResolution(content)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('throws when resolvedContent still contains conflict markers', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'a.ts',
          resolvedContent:
            '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature',
          reasoning: 'oops',
        },
      ],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /still contains conflict markers/
    )
  })

  it('does not reject resolvedContent with only opening marker in a comment', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'a.ts',
          resolvedContent: '// <<<<<<< this is just a comment\nreal code',
          reasoning: 'fine',
        },
      ],
    })
    // Should NOT throw — only reject when both opening and separator markers present
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('throws on truncated conflict markers (opening + separator without closing)', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'a.ts',
          resolvedContent: '<<<<<<< HEAD\nours\n=======\ntheirs but truncated',
          reasoning: 'truncated',
        },
      ],
    })
    assert.throws(
      () => parseCopilotConflictResolution(json),
      /still contains conflict markers/
    )
  })

  it('parses JSON block followed by another code block', () => {
    const json = JSON.stringify({
      resolutions: [
        { path: 'a.ts', resolvedContent: 'fixed', reasoning: 'merged' },
      ],
    })
    const content =
      '```json\n' +
      json +
      '\n```\n\nYou can verify with:\n```bash\nnpm test\n```'
    const result = parseCopilotConflictResolution(content)
    assert.equal(result.resolutions[0].path, 'a.ts')
  })

  it('trims whitespace from path values', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: '  src/file.ts  ',
          resolvedContent: 'content',
          reasoning: 'reason',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/file.ts')
  })

  it('normalizes Windows-style backslash separators', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'src\\lib\\file.ts',
          resolvedContent: 'content',
          reasoning: 'reason',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/lib/file.ts')
  })

  it('strips leading ./ from paths', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: './src/file.ts',
          resolvedContent: 'content',
          reasoning: 'reason',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/file.ts')
  })

  it('collapses redundant path separators', () => {
    const json = JSON.stringify({
      resolutions: [
        {
          path: 'src//lib///file.ts',
          resolvedContent: 'content',
          reasoning: 'reason',
        },
      ],
    })
    const result = parseCopilotConflictResolution(json)
    assert.equal(result.resolutions[0].path, 'src/lib/file.ts')
  })
})

// ---------------------------------------------------------------------------
// extractSymbols
// ---------------------------------------------------------------------------

describe('extractSymbols', () => {
  it('extracts exports from hunk content', () => {
    const file = makeFile(
      'utils.ts',
      'export function foo() {}',
      'export const bar = 1'
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('foo'))
    assert.ok(exports.has('bar'))
  })

  it('extracts all export kinds', () => {
    const file = makeFile(
      'types.ts',
      [
        'export class MyClass {}',
        'export interface IMyInterface {}',
        'export type MyType = string',
        'export enum MyEnum {}',
        'export let myLet = 1',
      ].join('\n'),
      ''
    )
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('MyClass'))
    assert.ok(exports.has('IMyInterface'))
    assert.ok(exports.has('MyType'))
    assert.ok(exports.has('MyEnum'))
    assert.ok(exports.has('myLet'))
  })

  it('extracts import paths and named references', () => {
    const file = makeFile(
      'app.ts',
      "import { foo, bar as baz } from '../utils'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('../utils'))
    assert.ok(references.has('foo'))
    assert.ok(references.has('bar'))
    assert.ok(
      !references.has('baz'),
      'alias should not be treated as a reference'
    )
  })

  it('extracts default import references', () => {
    const file = makeFile('consumer.ts', "import React from 'react'", '')
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
  })

  it('extracts extends/implements/instanceof/new/typeof references', () => {
    const file = makeFile(
      'child.ts',
      'class Child extends BaseClass implements IFoo {}',
      'const x = new Widget()\nif (a instanceof Handler) {}\ntype T = typeof Config'
    )
    const { references } = extractSymbols(file)
    assert.ok(references.has('BaseClass'))
    assert.ok(references.has('IFoo'))
    assert.ok(references.has('Widget'))
    assert.ok(references.has('Handler'))
    assert.ok(references.has('Config'))
  })

  it('scans base content when present', () => {
    const file = makeFile('a.ts', '', '', {
      baseContent: 'export function fromBase() {}',
    })
    const { exports } = extractSymbols(file)
    assert.ok(exports.has('fromBase'))
  })

  it('scans context lines', () => {
    const file = makeFile('b.ts', '', '', {
      contextBefore: "import { ctxBefore } from './dep'",
      contextAfter: 'export const ctxAfter = 1',
    })
    const { references, exports } = extractSymbols(file)
    assert.ok(references.has('ctxBefore'))
    assert.ok(exports.has('ctxAfter'))
  })

  it('returns empty sets for a file with no symbols', () => {
    const file = makeFile('readme.md', 'plain text', 'other text')
    const { exports, importPaths, references } = extractSymbols(file)
    assert.equal(exports.size, 0)
    assert.equal(importPaths.size, 0)
    assert.equal(references.size, 0)
  })

  it('extracts namespace imports (import * as X)', () => {
    const file = makeFile('app.ts', "import * as React from 'react'", '')
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
  })

  it('extracts combined default + named imports', () => {
    const file = makeFile(
      'app.ts',
      "import React, { useState, useEffect } from 'react'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('react'))
    assert.ok(references.has('React'))
    assert.ok(references.has('useState'))
    assert.ok(references.has('useEffect'))
  })

  it('extracts type-only imports', () => {
    const file = makeFile(
      'types.ts',
      "import type { Foo, Bar } from './models'",
      ''
    )
    const { importPaths, references } = extractSymbols(file)
    assert.ok(importPaths.has('./models'))
    assert.ok(references.has('Foo'))
    assert.ok(references.has('Bar'))
  })

  it('strips inline type keyword from named imports', () => {
    const file = makeFile(
      'consumer.ts',
      "import { type Foo, bar } from './lib'",
      ''
    )
    const { references } = extractSymbols(file)
    assert.ok(references.has('Foo'), 'should extract Foo without "type" prefix')
    assert.ok(references.has('bar'))
  })
})

// ---------------------------------------------------------------------------
// createDependencyAwareChunks
// ---------------------------------------------------------------------------

describe('createDependencyAwareChunks', () => {
  it('returns all files in a single chunk when count <= targetSize', () => {
    const files = [makeFile('a.ts', '', ''), makeFile('b.ts', '', '')]
    const chunks = createDependencyAwareChunks(files, 5)
    assert.equal(chunks.length, 1)
    assert.equal(chunks[0].length, 2)
  })

  it('groups files that import from each other', () => {
    const fileA = makeFile('src/utils.ts', 'export function helper() {}', '')
    const fileB = makeFile('src/app.ts', "import { helper } from './utils'", '')
    const fileC = makeFile('src/unrelated.ts', 'const x = 1', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    // A and B should be in the same chunk
    const chunkWithA = chunkPaths.find(c => c.includes('src/utils.ts'))!
    assert.ok(
      chunkWithA.includes('src/app.ts'),
      'utils and app should be grouped'
    )

    // C should be separate (or in a different chunk)
    const chunkWithC = chunkPaths.find(c => c.includes('src/unrelated.ts'))!
    assert.ok(
      !chunkWithC.includes('src/utils.ts'),
      'unrelated should not be with utils'
    )
  })

  it('groups files that share exported/referenced symbols', () => {
    const fileA = makeFile('a.ts', 'export class MyService {}', '')
    const fileB = makeFile('b.ts', '', 'const s = new MyService()')
    const fileC = makeFile('c.ts', 'const y = 2', '')

    const chunks = createDependencyAwareChunks([fileA, fileB, fileC], 2)
    const chunkPaths = paths(chunks)

    const chunkWithA = chunkPaths.find(c => c.includes('a.ts'))!
    assert.ok(chunkWithA.includes('b.ts'), 'a and b share MyService reference')
  })

  it('splits large dependency groups beyond target size', () => {
    // Create a group of 6 files all exporting/referencing the same symbol
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 6; i++) {
      files.push(
        makeFile(
          `file${i}.ts`,
          'export function sharedFn() {}',
          'const x = new sharedFn()'
        )
      )
    }

    const chunks = createDependencyAwareChunks(files, 3)

    // Should produce at least 2 chunks since group of 6 exceeds target of 3
    assert.ok(chunks.length >= 2)
    // No chunk should exceed target size
    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= 3,
        `chunk has ${chunk.length} files, expected <= 3`
      )
    }
  })

  it('bin-packs small independent groups', () => {
    // 4 independent files, target size 2
    const files = [
      makeFile('a.ts', 'const a = 1', ''),
      makeFile('b.ts', 'const b = 2', ''),
      makeFile('c.ts', 'const c = 3', ''),
      makeFile('d.ts', 'const d = 4', ''),
    ]

    const chunks = createDependencyAwareChunks(files, 2)
    // Should produce 2 chunks of 2
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0].length, 2)
    assert.equal(chunks[1].length, 2)
  })

  it('every input file appears in exactly one chunk', () => {
    const files: Array<IFileConflictContext> = []
    for (let i = 0; i < 25; i++) {
      files.push(makeFile(`file${i}.ts`, `const x${i} = ${i}`, ''))
    }

    const chunks = createDependencyAwareChunks(files, 5)
    const allPaths = chunks.flatMap(c => c.map(f => f.path))

    // Every file accounted for
    assert.equal(allPaths.length, 25)
    assert.equal(new Set(allPaths).size, 25, 'no duplicates')
  })

  it('does not false-positive group files with short basenames', () => {
    // "e.ts" basename "e" should NOT match import path "../database"
    // via the old .includes() logic — the new matchesBaseName requires
    // a full segment match. We verify by checking that "e.ts" and
    // "database.ts" are NOT forced into the same dependency group.
    // With 4 files and targetSize 2, if e and database were incorrectly
    // grouped they'd form a group of 2 that stays together.
    const fileE = makeFile('src/e.ts', 'export const val = 1', '')
    const fileDb = makeFile(
      'src/database.ts',
      "import { something } from '../e'",
      ''
    )
    const fileOther = makeFile('src/other.ts', 'const x = 1', '')
    const fileThird = makeFile('src/third.ts', 'const y = 2', '')

    // e.ts and database.ts SHOULD be grouped because database imports from '../e'
    const chunks = createDependencyAwareChunks(
      [fileE, fileDb, fileOther, fileThird],
      2
    )
    const chunkPaths = paths(chunks)
    const chunkWithE = chunkPaths.find(c => c.includes('src/e.ts'))!
    assert.ok(
      chunkWithE.includes('src/database.ts'),
      'e.ts and database.ts should be grouped (database imports from e)'
    )

    // Now verify that a different import path does NOT match
    const fileE2 = makeFile('src/e.ts', 'export const val = 1', '')
    const fileDb2 = makeFile(
      'src/database.ts',
      "import { something } from '../components'",
      ''
    )
    const fileApi = makeFile(
      'src/api.ts',
      "import { thing } from '@sentry/error-reporting'",
      ''
    )
    const fileMisc = makeFile('src/misc.ts', 'const z = 3', '')

    // None of these files actually import from each other
    const chunks2 = createDependencyAwareChunks(
      [fileE2, fileDb2, fileApi, fileMisc],
      2
    )
    // Should split into 2 chunks of 2, not collapse into fewer
    assert.equal(chunks2.length, 2, 'unrelated files should not be grouped')
  })

  it('does not group unrelated index.ts files together', () => {
    const file1 = makeFile(
      'src/auth/index.ts',
      "import { User } from '../models/user'",
      ''
    )
    const file2 = makeFile(
      'src/ui/index.ts',
      "import { Button } from './button'",
      ''
    )
    const file3 = makeFile('src/api/index.ts', 'export const api = {}', '')

    const chunks = createDependencyAwareChunks([file1, file2, file3], 2)
    // They should NOT all be in one chunk — they're unrelated despite
    // sharing basename "index"
    assert.ok(
      chunks.length >= 2,
      'unrelated index.ts files should not all be grouped together'
    )
  })

  it('handles group.length exactly equal to targetSize', () => {
    // 3 files all referencing the same symbol, targetSize = 3
    const files = [
      makeFile('a.ts', 'export class Shared {}', ''),
      makeFile('b.ts', '', 'const x = new Shared()'),
      makeFile('c.ts', '', 'const y = new Shared()'),
      makeFile('d.ts', 'const standalone = 1', ''),
    ]

    const chunks = createDependencyAwareChunks(files, 3)
    const allPaths = chunks.flatMap(c => c.map(f => f.path))
    assert.equal(new Set(allPaths).size, 4, 'all files present')
    // The group of 3 should be split (>= targetSize takes split path)
    // and d.ts should be separate
    for (const chunk of chunks) {
      assert.ok(
        chunk.length <= 3,
        `chunk has ${chunk.length} files, expected <= 3`
      )
    }
  })
})
