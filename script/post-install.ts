#!/usr/bin/env ts-node
/* eslint-disable no-sync */

import * as Fs from 'fs'
import * as Path from 'path'
import { spawnSync, SpawnSyncOptions } from 'child_process'

import glob from 'glob'
import { forceUnwrap } from '../app/src/lib/fatal-error'

const root = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: root,
  stdio: 'inherit',
}

/**
 * Some packaging containers (notably the Ubuntu 20.04-based image used by
 * `shiftkey/desktop-ubuntu-amd64-packaging`) ship g++ 9, which only knows
 * `-std=gnu++2a` and refuses `-std=gnu++20`. node-pty's binding.gyp asks
 * for the latter even though the source doesn't actually require any
 * C++20 features. Rewrite the flag in-place after install so the
 * subsequent gyp rebuild succeeds.
 */
function patchNodePtyBindingGyp() {
  const gyp = Path.join(root, 'app', 'node_modules', 'node-pty', 'binding.gyp')
  if (!Fs.existsSync(gyp)) {
    return
  }
  const original = Fs.readFileSync(gyp, 'utf8')
  const patched = original.replace(/-std=gnu\+\+20/g, '-std=gnu++17')
  if (patched !== original) {
    Fs.writeFileSync(gyp, patched)
    console.log('[post-install] patched node-pty binding.gyp -> gnu++17')
  }
}

function rebuildNodePty() {
  const ptyDir = Path.join(root, 'app', 'node_modules', 'node-pty')
  if (!Fs.existsSync(ptyDir)) {
    return
  }
  // Re-run node-pty's install script (`prebuild || node-gyp rebuild`) now
  // that binding.gyp is patched. `npm rebuild` resolves node-gyp without
  // needing to know where it lives in the hoisted tree.
  const result = spawnSync('npm', ['rebuild', 'node-pty'], {
    cwd: Path.join(root, 'app'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
}

/** Check if the caller has set the OFFLINe environment variable */
function isOffline() {
  return process.env.OFFLINE === '1'
}

/** Format the arguments to ensure these work offline */
function getYarnArgs(baseArgs: Array<string>): Array<string> {
  const args = baseArgs

  if (isOffline()) {
    args.splice(1, 0, '--offline')
  }

  return args
}

function findYarnVersion(callback: (path: string) => void) {
  glob('vendor/yarn-*.js', (error, files) => {
    if (error != null) {
      throw error
    }

    // this ensures the paths returned by glob are sorted alphabetically
    files.sort()

    // use the latest version here if multiple are found
    callback(forceUnwrap('Missing vendored yarn', files.at(-1)))
  })
}

findYarnVersion(path => {
  // First pass: install dependencies WITHOUT running their lifecycle scripts,
  // so we can patch native modules (e.g. node-pty's binding.gyp) before any
  // gyp rebuild is invoked.
  const skipScripts = getYarnArgs([
    path,
    '--cwd',
    'app',
    'install',
    '--force',
    '--ignore-scripts',
  ])
  let result = spawnSync('node', skipScripts, options)
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }

  patchNodePtyBindingGyp()
  rebuildNodePty()

  // Second pass: full install with scripts. node-pty is already built, so
  // its install script will be a no-op. Other packages get their lifecycle
  // hooks fired normally.
  const installArgs = getYarnArgs([path, '--cwd', 'app', 'install', '--force'])
  result = spawnSync('node', installArgs, options)
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }

  if (!isOffline()) {
    result = spawnSync(
      'git',
      ['submodule', 'update', '--recursive', '--init'],
      options
    )

    if (result.status !== 0) {
      process.exit(result.status || 1)
    }
  }

  result = spawnSync('node', getYarnArgs([path, 'compile:script']), options)

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }

  if (process.platform === 'linux') {
    result = spawnSync('node', getYarnArgs([path, 'patch-package']), options)

    if (result.status !== 0) {
      process.exit(result.status || 1)
    }
  }
})
