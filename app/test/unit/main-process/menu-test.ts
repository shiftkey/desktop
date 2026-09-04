import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ensureItemIds } from '../../../src/main-process/menu'

describe('main-process menu', () => {
  describe('ensureItemIds', () => {
    it('leaves explicitly specified ids', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'File', id: 'foo' },
      ]

      ensureItemIds(template)

      assert.equal(template[0].id, 'foo')
    })

    it('assigns ids to items which lack it', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'File' },
      ]

      ensureItemIds(template)

      assert.equal(template[0].id, '@.File')
    })

    it('assigns ids recursively', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: 'File',
          id: 'foo',
          submenu: [
            { label: 'Open' },
            { label: 'Close' },
            {
              label: 'More',
              submenu: [{ label: 'Even more' }],
            },
          ],
        },
      ]

      ensureItemIds(template)

      assert.equal(template[0].id, 'foo')

      const firstSubmenu = template[0]
        .submenu as Electron.MenuItemConstructorOptions[]

      assert.equal(firstSubmenu[0].id, 'foo.Open')
      assert.equal(firstSubmenu[1].id, 'foo.Close')
      assert.equal(firstSubmenu[2].id, 'foo.More')

      const secondSubmenu = firstSubmenu[2]
        .submenu as Electron.MenuItemConstructorOptions[]

      assert.equal(secondSubmenu[0].id, 'foo.More.Even more')
    })

    it('handles duplicate generated ids', () => {
      const template: Electron.MenuItemConstructorOptions[] = [
        { label: 'foo' },
        { label: 'foo' },
      ]

      ensureItemIds(template)

      assert.equal(template[0].id, '@.foo')
      assert.equal(template[1].id, '@.foo1')
    })
  })
})
