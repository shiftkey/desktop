import { convertToFlatpakPath } from '../../../src/lib/helpers/linux'

if (__LINUX__) {
  describe('convertToFlatpakPath()', () => {
    it('converts /usr paths', () => {
      const path = '/usr/bin/subl'
      const expectedPath = '/var/run/host/usr/bin/subl'
      expect(convertToFlatpakPath(path)).toEqual(expectedPath)
    })

    it('preserves /opt paths', () => {
      const path = '/opt/slickedit-pro2018/bin/vs'
      expect(convertToFlatpakPath(path)).toEqual(path)
    })
  })
}
