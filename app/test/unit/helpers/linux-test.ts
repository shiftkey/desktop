import {
  cleanSpawnEnv,
  convertToFlatpakPath,
  formatWorkingDirectoryForFlatpak,
} from '../../../src/lib/helpers/linux'

describe('convertToFlatpakPath()', () => {
  if (__LINUX__) {
    it('converts /usr paths', () => {
      const path = '/usr/bin/subl'
      const expectedPath = '/var/run/host/usr/bin/subl'
      expect(convertToFlatpakPath(path)).toEqual(expectedPath)
    })

    it('preserves /opt paths', () => {
      const path = '/opt/slickedit-pro2018/bin/vs'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }

  if (__WIN32__) {
    it('returns same path', () => {
      const path = 'C:\\Windows\\System32\\Notepad.exe'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }

  if (__DARWIN__) {
    it('returns same path', () => {
      const path = '/usr/local/bin/code'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  }
})

describe('cleanSpawnEnv()', () => {
  it('strips loader-hijacking variables', () => {
    const cleaned = cleanSpawnEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      LD_PRELOAD: '/opt/ghd/libffmpeg.so',
      LD_LIBRARY_PATH: '/opt/ghd',
      LD_AUDIT: '/opt/ghd/audit.so',
    })
    expect(cleaned.LD_PRELOAD).toBeUndefined()
    expect(cleaned.LD_LIBRARY_PATH).toBeUndefined()
    expect(cleaned.LD_AUDIT).toBeUndefined()
  })

  it('preserves variables the spawned terminal needs', () => {
    const cleaned = cleanSpawnEnv({
      PATH: '/usr/bin',
      HOME: '/home/user',
      DISPLAY: ':0',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
      LD_PRELOAD: '/opt/ghd/libffmpeg.so',
    })
    expect(cleaned.PATH).toEqual('/usr/bin')
    expect(cleaned.HOME).toEqual('/home/user')
    expect(cleaned.DISPLAY).toEqual(':0')
    expect(cleaned.DBUS_SESSION_BUS_ADDRESS).toEqual(
      'unix:path=/run/user/1000/bus'
    )
  })

  it('does not mutate the source environment', () => {
    const source = { LD_PRELOAD: '/opt/ghd/libffmpeg.so' }
    cleanSpawnEnv(source)
    expect(source.LD_PRELOAD).toEqual('/opt/ghd/libffmpeg.so')
  })
})

describe('formatWorkingDirectoryForFlatpak()', () => {
  if (__LINUX__) {
    it('escapes string', () => {
      const path = '/home/test/path with space'
      const expectedPath = '/home/test/path with space'
      expect(formatWorkingDirectoryForFlatpak(path)).toEqual(expectedPath)
    })
    it('returns same path', () => {
      const path = '/home/test/path_wthout_spaces'
      expect(formatWorkingDirectoryForFlatpak(path)).toEqual(path)
    })
  }
})
