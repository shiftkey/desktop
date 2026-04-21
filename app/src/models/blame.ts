import { CommitIdentity } from './commit-identity'

/**
 * Metadata about a single commit found in a blame
 */
export interface IBlameCommit {
  readonly sha: string
  readonly author: CommitIdentity
  readonly summary: string
}

/**
 * Information about the blame for a specific line in a file.
 */
export interface IBlameLine {
  /** The SHA of the commit that last changed this line. */
  readonly sha: string
}

/**
 * A collection of blame information for a file, mapping line numbers to
 * commit information.
 */
export interface IBlameProfile {
  /**
   * A map of line numbers (1-indexed) to blame information.
   */
  readonly lines: ReadonlyMap<number, IBlameLine>

  /**
   * A map of SHAs to commit information to avoid duplicating metadata
   * for each line.
   */
  readonly commits: ReadonlyMap<string, IBlameCommit>
}
