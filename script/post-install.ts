#!/usr/bin/env ts-node

import * as Path from 'path'
import { spawnSync, SpawnSyncOptions } from 'child_process'

import glob from 'glob'

const root = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: root,
  stdio: 'inherit',
}

function findYarnVersion(callback: (path: string) => void) {
  glob('vendor/yarn-*.js', (error, files) => {
    if (error != null) {
      throw error
    }

    // this ensures the paths returned by glob are sorted alphabetically
    files.sort()

    // use the latest version here if multiple are found
    const latestVersion = files[files.length - 1]

    callback(latestVersion)
  })
}
function isOffline() {
  return process.env.OFFLINE === '1'
}

findYarnVersion(path => {
  let result
  if (isOffline()) {
    result = spawnSync(
      'node',
      [path, '--offline', '--cwd', 'app', 'install', '--force'],
      options
    )
  } else {
    result = spawnSync(
      'node',
      [path, '--cwd', 'app', 'install', '--force'],
      options
    )
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
  if (!isOffline()) {
    result = spawnSync(
      'git',
      ['submodule', 'update', '--recursive', '--init'],
      options
    )
  }

  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
  if (isOffline()) {
    result = spawnSync('node', [path, '--offline', 'compile:tslint'], options)
  } else {
    result = spawnSync('node', [path, '--offline', 'compile:tslint'], options)
  }
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
  if (isOffline()) {
    result = spawnSync('node', [path, '--offline', 'compile:script'], options)
  } else {
    result = spawnSync('node', [path, 'compile:script'], options)
  }
  if (result.status !== 0) {
    process.exit(result.status || 1)
  }
})
