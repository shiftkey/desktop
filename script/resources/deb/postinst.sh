#!/bin/bash

set -e

INSTALL_DIR="/usr/lib/github-desktop"

case "$1" in
    configure)
      # Match the Electron WM_CLASS so GNOME associates the running window
      # with its desktop entry and displays the packaged application icon.
      if command -v desktop-file-edit >/dev/null 2>&1; then
        desktop-file-edit \
          --set-key=StartupWMClass \
          --set-value="GitHub Desktop" \
          /usr/share/applications/github-desktop.desktop
      fi
      gtk-update-icon-cache -q -f /usr/share/icons/hicolor || :
    ;;

    abort-upgrade|abort-remove|abort-deconfigure)
    ;;

    *)
      echo "postinst called with unknown argument \`$1'" >&2
      exit 1
    ;;
esac

exit 0
