import {
  terminalScrollbackKey,
  loadTerminalScrollback,
  saveTerminalScrollback,
  clearTerminalScrollback,
} from '../../../src/lib/terminal/scrollback'

describe('terminal/scrollback', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('terminalScrollbackKey', () => {
    it('namespaces the session id under a versioned prefix', () => {
      expect(terminalScrollbackKey('abc')).toBe('terminal-scrollback-v1:abc')
    })

    it('produces distinct keys per session', () => {
      expect(terminalScrollbackKey('one')).not.toBe(
        terminalScrollbackKey('two')
      )
    })
  })

  describe('save/load round-trip', () => {
    it('persists and reads back the payload', () => {
      saveTerminalScrollback('s1', 'hello world')
      expect(loadTerminalScrollback('s1')).toBe('hello world')
    })

    it('returns null for an unknown session', () => {
      expect(loadTerminalScrollback('missing')).toBeNull()
    })

    it('keeps sessions isolated from one another', () => {
      saveTerminalScrollback('s1', 'first')
      saveTerminalScrollback('s2', 'second')
      expect(loadTerminalScrollback('s1')).toBe('first')
      expect(loadTerminalScrollback('s2')).toBe('second')
    })
  })

  describe('saveTerminalScrollback', () => {
    it('removes the key when given an empty payload', () => {
      saveTerminalScrollback('s1', 'something')
      saveTerminalScrollback('s1', '')
      expect(loadTerminalScrollback('s1')).toBeNull()
      expect(localStorage.getItem(terminalScrollbackKey('s1'))).toBeNull()
    })

    it('overwrites a previous payload', () => {
      saveTerminalScrollback('s1', 'old')
      saveTerminalScrollback('s1', 'new')
      expect(loadTerminalScrollback('s1')).toBe('new')
    })
  })

  describe('clearTerminalScrollback', () => {
    it('removes a stored payload', () => {
      saveTerminalScrollback('s1', 'data')
      clearTerminalScrollback('s1')
      expect(loadTerminalScrollback('s1')).toBeNull()
    })

    it('is a no-op for an absent session', () => {
      expect(() => clearTerminalScrollback('missing')).not.toThrow()
    })
  })
})
