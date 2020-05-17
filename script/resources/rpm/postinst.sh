#!/bin/bash

PROFILE_D_FILE="/etc/profile.d/github-desktop.sh"
INSTALL_DIR="/usr/lib/github-desktop"
CLI_DIR="$INSTALL_DIR/resources/app/static"

# add executable permissions for CLI interface
chmod +x "$CLI_DIR"/github || :

# check if this is a dev install or standard
if [ -f "$INSTALL_DIR/github-desktop-dev" ]; then
  BINARY_NAME="github-desktop-dev"
else
  BINARY_NAME="github-desktop"
fi

# create symbolic links to /usr/bin directory
ln -f -s "$CLI_DIR"/github /usr/bin || :

exit 0
