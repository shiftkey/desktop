import { spawn } from 'child_process'

export function isGitOnPath(): Promise<boolean> {
  // Modern versions of macOS ship with a Git shim that guides you through
  // the process of setting everything up. We trust this is available, so
  // don't worry about looking for it here.
  if (__DARWIN__) {
    return Promise.resolve(true)
  }

  // adapted from http://stackoverflow.com/a/34953561/1363815  
  if (__LINUX__) {
    return new Promise<boolean>((resolve, reject) => {
      const process = spawn('which', ['git'])

      // `which` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      process.on('close', function (code) {
        resolve(code === 0)
      })
    })
  }

  if (__WIN32__) {
    return new Promise<boolean>((resolve, reject) => {
      const process = spawn('where', ['git'])

      // `where` will return 0 when the executable
      // is found under PATH, or 1 if it cannot be found
      process.on('close', function (code) {
        resolve(code === 0)
      })
    })
  }

  return Promise.resolve(false)
}
