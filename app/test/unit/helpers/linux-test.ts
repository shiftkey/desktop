import {
  convertToFlatpakPath,
  formatWorkingDirectoryForFlatpak,
} from '../../../src/lib/helpers/linux'
import { describe, it } from 'node:test'
import assert from 'node:assert'

describe('convertToFlatpakPath()', () => {
  if (__LINUX__) {
    it('converts /usr paths', () => {
      const path = '/usr/bin/subl'
      const expectedPath = '/var/run/host/usr/bin/subl'
      assert.equal(convertToFlatpakPath(path), expectedPath)
    })

    it('preserves /opt paths', () => {
      const path = '/opt/slickedit-pro2018/bin/vs'
      assert.equal(convertToFlatpakPath(path), path)
    })
  }

  if (__WIN32__) {
    it('returns same path', () => {
      const path = 'C:\\Windows\\System32\\Notepad.exe'
      assert.equal(convertToFlatpakPath(path), path)
    })
  }

  if (__DARWIN__) {
    it('returns same path', () => {
      const path = '/usr/local/bin/code'
      assert.equal(convertToFlatpakPath(path), path)
    })
  }
})

describe('formatWorkingDirectoryForFlatpak()', () => {
  if (__LINUX__) {
    it('escapes string', () => {
      const path = '/home/test/path with space'
      const expectedPath = '/home/test/path with space'
      assert.equal(formatWorkingDirectoryForFlatpak(path), expectedPath)
    })
    it('returns same path', () => {
      const path = '/home/test/path_wthout_spaces'
      assert.equal(formatWorkingDirectoryForFlatpak(path), path)
    })
  }
})
