import {
  formatTabLabel,
  shouldShowActivityDot,
  tabStatusIcon,
} from '../../../src/lib/terminal/tab-model'

describe('formatTabLabel', () => {
  it('uses custom title when set', () => {
    expect(
      formatTabLabel({
        shell: '/bin/zsh',
        liveCwd: '/home/u/proj/src',
        homedir: '/home/u',
        title: 'build watcher',
      })
    ).toBe('build watcher')
  })

  it('uses ~/<basename> when liveCwd is inside homedir', () => {
    expect(
      formatTabLabel({
        shell: '/bin/zsh',
        liveCwd: '/home/u/proj/src',
        homedir: '/home/u',
        title: null,
      })
    ).toBe('zsh · ~/src')
  })

  it('uses absolute basename when liveCwd outside homedir', () => {
    expect(
      formatTabLabel({
        shell: '/bin/bash',
        liveCwd: '/tmp/build',
        homedir: '/home/u',
        title: null,
      })
    ).toBe('bash · build')
  })

  it('falls back to shell basename when liveCwd is null', () => {
    expect(
      formatTabLabel({
        shell: '/usr/bin/fish',
        liveCwd: null,
        homedir: '/home/u',
        title: null,
      })
    ).toBe('fish')
  })

  it('keeps full label under 32 chars', () => {
    const label = formatTabLabel({
      shell: '/bin/bash',
      liveCwd: '/very/deep/nested/repository/that/has/extremely/long/names',
      homedir: '/home/u',
      title: null,
    })
    expect(label.length).toBeLessThanOrEqual(32)
    expect(label.endsWith('names')).toBe(true)
  })
})

describe('shouldShowActivityDot', () => {
  it('shows dot when inactive tab has activity flag', () => {
    expect(shouldShowActivityDot({ active: false, hasActivity: true })).toBe(
      true
    )
  })
  it('does not show dot for active tab even with activity', () => {
    expect(shouldShowActivityDot({ active: true, hasActivity: true })).toBe(
      false
    )
  })
  it('does not show dot when no activity', () => {
    expect(shouldShowActivityDot({ active: false, hasActivity: false })).toBe(
      false
    )
  })
})

describe('tabStatusIcon', () => {
  it('returns "running" for an active running session', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: null, isCommand: true })
    ).toBe('running')
  })
  it('returns "ok" for a clean exit (code 0)', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: 0, isCommand: false })
    ).toBe('ok')
  })
  it('returns "fail" for non-zero exit', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: 1, isCommand: false })
    ).toBe('fail')
  })
  it('returns "dead" when the shell itself exited', () => {
    expect(
      tabStatusIcon({ status: 'exited', lastExitCode: 137, isCommand: false })
    ).toBe('dead')
  })
})
