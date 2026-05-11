import { LinkedWorkTree } from './repository'

/** A worktree entry with its change count */
export interface IWorktreeEntry extends LinkedWorkTree {
  /** Number of uncommitted changes in this worktree */
  readonly changesCount: number
}
