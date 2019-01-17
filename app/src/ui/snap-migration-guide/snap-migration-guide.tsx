import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'
import { ButtonGroup } from '../lib/button-group'
import { Button } from '../lib/button'

interface ISnapMigrationGuideProps {
  readonly onDismissed: () => void
}

export class SnapMigrationGuide extends React.Component<
  ISnapMigrationGuideProps,
  {}
> {
  public render() {
    const commands = `$ snap uninstall github-desktop
$ snap install --beta github-desktop`

    return (
      <Dialog
        id="snap-migration"
        title="Snap Channel Migration Needed"
        dismissable={false}
        onDismissed={this.props.onDismissed}
        type="warning"
      >
        <DialogContent>
          <p>
            The Snap version of GitHub Desktop needs to be upgraded manually as
            migrating from using the <Ref>strict</Ref> enclosure to the{' '}
            <Ref>classic</Ref> enclosure requires your consent. You will need to
            run these commands to upgrade manually to the beta channel which has
            the change of confinement.
          </p>
          <pre className="commands">{commands}</pre>
          <p>
            As this channel will not be getting any further updates while we
            perform this transition,{' '}
            <strong>we recomend upgrading as soon as possible</strong> to get
            the latest Desktop builds.
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup destructive={true}>
            <Button onClick={this.props.onDismissed}>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
