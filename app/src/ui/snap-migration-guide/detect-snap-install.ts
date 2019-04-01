// example of matching string in executable path:
// `/snap/github-desktop/52/app/github-desktop`
const snapExecPathRe = /^\/snap\/github-desktop\/(\d*)\/app\/github-desktop$/

function isInstalledSnap() {
  const match = snapExecPathRe.exec(process.execPath)
  return match !== null && match.length === 2
}

export async function detectSnapInstall(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    try {
      const installedSnap = isInstalledSnap()

      const hasDisableGPUCompositing =
        process.argv.indexOf('--disable-gpu-compositing') >= 0

      resolve(installedSnap && hasDisableGPUCompositing)
    } catch {
      resolve(false)
    }
  })
}
