/** Line-level stats for the working directory diff. */
export interface IWorkingDirectoryStats {
  /** Total number of changed files. */
  readonly files: number

  /** Number of added lines across all changed files. */
  readonly additions: number

  /** Number of deleted lines across all changed files. */
  readonly deletions: number
}
