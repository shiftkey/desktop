import { git } from './core'
import { Repository } from '../../models/repository'
import {
  IBlameProfile,
  IBlameLine,
  IBlameCommit,
} from '../../models/blame'
import { CommitIdentity } from '../../models/commit-identity'

/**
 * Get the blame for a file at a specific path.
 *
 * @param repository The repository to run the blame in.
 * @param path       The path to the file, relative to the repository root.
 * @param commitSha  An optional commit SHA to blame at. If not provided, it will
 *                   blame the current working directory version.
 */
export async function getBlame(
  repository: Repository,
  path: string,
  commitSha?: string
): Promise<IBlameProfile> {
  const args = ['blame', '--line-porcelain']
  if (commitSha) {
    args.push(commitSha)
  }
  args.push('--', path)

  const result = await git(args, repository.path, 'getBlame')
  const lines = result.stdout.split(/\r?\n/)

  const commitMap = new Map<string, IBlameCommit>()
  const lineMap = new Map<number, IBlameLine>()

  let currentSha: string | null = null
  let currentAuthorName: string | null = null
  let currentAuthorEmail: string | null = null
  let currentAuthorTime: number | null = null
  let currentAuthorTz: number | null = null
  let currentSummary: string | null = null
  let currentLineNumber: number | null = null

  for (const line of lines) {
    if (line.length === 0) {
      continue
    }

    if (currentSha === null) {
      const parts = line.split(' ')
      if (parts.length >= 4) {
        currentSha = parts[0]
        currentLineNumber = parseInt(parts[2], 10)
      }
      continue
    }

    if (line.startsWith('author ')) {
      currentAuthorName = line.substring(7)
    } else if (line.startsWith('author-mail ')) {
      // Remove < and >
      currentAuthorEmail = line.substring(12).replace(/[<>]/g, '')
    } else if (line.startsWith('author-time ')) {
      currentAuthorTime = parseInt(line.substring(12), 10)
    } else if (line.startsWith('author-tz ')) {
      const tzStr = line.substring(10)
      const tzSign = tzStr.startsWith('-') ? -1 : 1
      const tzHH = parseInt(tzStr.substring(1, 3), 10)
      const tzmm = parseInt(tzStr.substring(3, 5), 10)
      currentAuthorTz = (tzHH * 60 + tzmm) * tzSign
    } else if (line.startsWith('summary ')) {
      currentSummary = line.substring(8)
    } else if (line.startsWith('\t')) {
      // This is the actual line content, which marks the end of a block
      if (
        currentSha &&
        currentLineNumber !== null &&
        currentAuthorName !== null &&
        currentAuthorEmail !== null &&
        currentAuthorTime !== null &&
        currentAuthorTz !== null &&
        currentSummary !== null
      ) {
        if (!commitMap.has(currentSha)) {
          const author = new CommitIdentity(
            currentAuthorName,
            currentAuthorEmail,
            new Date(currentAuthorTime * 1000),
            currentAuthorTz
          )
          commitMap.set(currentSha, {
            sha: currentSha,
            author,
            summary: currentSummary,
          })
        }

        lineMap.set(currentLineNumber, { sha: currentSha })
      }

      // Reset for next line
      currentSha = null
      currentAuthorName = null
      currentAuthorEmail = null
      currentAuthorTime = null
      currentAuthorTz = null
      currentSummary = null
      currentLineNumber = null
    }
  }

  return {
    lines: lineMap,
    commits: commitMap,
  }
}
