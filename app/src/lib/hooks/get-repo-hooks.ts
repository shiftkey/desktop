import { exec } from 'dugite'
import { access, constants, readdir } from 'fs/promises'
import { basename, join, resolve } from 'path'

const isExecutable = (path: string) =>
  access(path, constants.X_OK)
    .then(() => true)
    .catch(() => false)

const knownHooks = [
  'applypatch-msg',
  'pre-applypatch',
  'post-applypatch',
  'pre-commit',
  'pre-merge-commit',
  'prepare-commit-msg',
  'commit-msg',
  'post-commit',
  'pre-rebase',
  'post-checkout',
  'post-merge',
  'pre-push',
  'pre-receive',
  'update',
  'proc-receive',
  'post-receive',
  'post-update',
  'reference-transaction',
  'push-to-checkout',
  'pre-auto-gc',
  'post-rewrite',
  'sendemail-validate',
  'fsmonitor-watchman',
  'p4-changelist',
  'p4-prepare-changelist',
  'p4-post-changelist',
  'p4-pre-submit',
  'post-index-change',
]

/**
 * Returns the names of executable Git hooks found in the given repository.
 *
 * @param path   The file system path to the Git repository (root of working
 *               directory).
 * @param filter An optional array of hook names to filter the results.
 *               Including '*' will return all hooks.
 */
export async function* getRepoHooks(path: string, filter?: string[]) {
  const { exitCode, stdout } = await exec(
    ['config', '-z', '--get', 'core.hooksPath'],
    path
  )

  const hooksPath =
    exitCode === 0
      ? resolve(path, stdout.split('\0')[0])
      : join(path, '.git', 'hooks')

  const files = await readdir(hooksPath, { withFileTypes: true })
    .then(entries => entries.filter(x => x.isFile()))
    .catch(() => [])

  const matchAll = filter?.includes('*')

  for (const file of files) {
    const hookName = basename(file.name, '.exe')

    if (matchAll || filter?.includes(hookName) === false) {
      continue
    }

    if (!knownHooks.includes(hookName)) {
      continue
    }

    if (__WIN32__) {
      // On Windows we have to assume that any valid hook name is executable
      // because the executable bit is not used there. Git looks for a shebang
      // but that seems expensive to check here :shrug:
      yield hookName
    } else if (await isExecutable(join(file.parentPath, file.name))) {
      yield hookName
    }
  }
}
