#!/bin/bash

PROFILE_D_FILE="/etc/profile.d/github-desktop.sh"
BASE_FILE="/usr/bin/github"

# cleanup profile file
echo "#!/bin/sh" > "${PROFILE_D_FILE}";
. "${PROFILE_D_FILE}";
rm "${PROFILE_D_FILE}";

# remove symbolic links in /usr/bin directory
test -f ${BASE_FILE} && unlink ${BASE_FILE}
test -f ${BASE_FILE}-desktop && unlink ${BASE_FILE}-desktop
test -f ${BASE_FILE}-desktop-dev && unlink ${BASE_FILE}-desktop-dev

exit 0
