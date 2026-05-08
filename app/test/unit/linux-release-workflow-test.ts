import * as Fs from 'fs'
import * as Path from 'path'

describe('Linux release workflow', () => {
  const workflowPath = Path.resolve(
    __dirname,
    '../../../.github/workflows/ci-linux.yml'
  )

  let workflow = ''

  beforeAll(async () => {
    workflow = await Fs.promises.readFile(workflowPath, 'utf8')
  })

  it('can be started manually for user-downloadable Linux packages', () => {
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('ref:')
    expect(workflow).toContain('publish_release:')
    expect(workflow).toContain('default: false')
  })

  it('uploads AppImage, Debian, RPM, and checksum artifacts', () => {
    expect(workflow).toContain('dist/*.AppImage')
    expect(workflow).toContain('dist/*.deb')
    expect(workflow).toContain('dist/*.rpm')
    expect(workflow).toContain('dist/*.sha256')
  })
})
