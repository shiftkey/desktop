import * as React from 'react'
import { shallow } from 'enzyme'
import { ChangeSummaryBadge } from '../../src/ui/changes/change-summary-badge'

describe('ChangeSummaryBadge', () => {
  it('renders stats', () => {
    const stats = { files: 12, additions: 248, deletions: 67 }
    const wrapper = shallow(<ChangeSummaryBadge stats={stats} />)
    expect(wrapper.text()).toContain('12 files')
    expect(wrapper.text()).toContain('+248')
    expect(wrapper.text()).toContain('-67')
  })

  it('renders nothing when stats is null', () => {
    const wrapper = shallow(<ChangeSummaryBadge stats={null} />)
    expect(wrapper.isEmptyRender()).toBe(true)
  })

  it('renders nothing when files is 0', () => {
    const wrapper = shallow(
      <ChangeSummaryBadge stats={{ files: 0, additions: 0, deletions: 0 }} />
    )
    expect(wrapper.isEmptyRender()).toBe(true)
  })

  it('uses singular file label for one file', () => {
    const wrapper = shallow(
      <ChangeSummaryBadge stats={{ files: 1, additions: 5, deletions: 2 }} />
    )
    expect(wrapper.text()).toContain('1 file')
    expect(wrapper.text()).not.toContain('files')
  })
})
