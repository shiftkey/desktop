#!/bin/sh

if [ ! -L $0 ]; then
	# if path is not a symlink, find relatively
	GITHUB_PATH="../../.$(dirname $0)"
else
	if command -v readlink >/dev/null; then
		# if readlink exists, follow the symlink and find relatively
		SYMLINK=$(readlink -f "$0")
		GITHUB_PATH=$(dirname "$(dirname "$(dirname "$(dirname "$SYMLINK")")")")
	else
		# else use the standard install location
		GITHUB_PATH="/opt/GitHub Desktop"
	fi
fi
BINARY_NAME="github-desktop"
ELECTRON="$GITHUB_PATH/$BINARY_NAME"
CLI="$GITHUB_PATH/resources/app/cli.js"

ELECTRON_RUN_AS_NODE=1 "$ELECTRON" "$CLI" "$@"

exit $?