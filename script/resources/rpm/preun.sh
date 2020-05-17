#!/bin/bash

BASE_FILE="/usr/bin/github"

# remove symbolic links in /usr/bin directory
test -f ${BASE_FILE} && unlink ${BASE_FILE}
test -f ${BASE_FILE}-desktop && unlink ${BASE_FILE}-desktop
test -f ${BASE_FILE}-desktop-dev && unlink ${BASE_FILE}-desktop-dev

exit 0
