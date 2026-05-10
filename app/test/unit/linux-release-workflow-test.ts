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
    expect(workflow).toContain('default: linux')
  })

  it('uploads Debian package and checksum artifacts', () => {
    expect(workflow).toContain('dist/*.deb')
    expect(workflow).toContain('dist/*.deb.sha256')
  })

  it('publishes a GitHub release from the Debian artifacts', () => {
    expect(workflow).toContain('softprops/action-gh-release')
    expect(workflow).toContain('artifacts/**/*.deb')
    expect(workflow).toContain('artifacts/**/*.deb.sha256')
  })
})
