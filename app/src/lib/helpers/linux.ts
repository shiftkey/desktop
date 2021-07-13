export function isFlatpakBuild() {
  return __LINUX__ && process.env.FLATPAK_HOST === '1'
}
