import { spawnSync } from 'child_process'

// example of matching string in stdout:
// `github-desktop  1.6.0-linux1  40   edge      snapcrafters  private`
const snapInstallRe = /github-desktop\s*([\.0-9\-]*[0-9a-z]*)\s*\d{1,}\s*(edge)\s*snapcrafters.*/

export async function detectSnapInstall(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    try {
      const result = spawnSync('snap', ['list', 'github-desktop'])

      if (result.error != null) {
        resolve(false)
        return
      }

      const lines = result.stdout
      const match = snapInstallRe.exec(lines)
      if (match === null) {
        resolve(false)
        return
      }

      const channel = match[2]

      resolve(channel === 'edge')
    } catch {
      resolve(false)
    }
  })
}
