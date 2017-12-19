#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null && pwd )"
ROOT="$( dirname $DIR )"

# this script performs the additional setup for packaging Desktop inside the
# default Snap container, so running this outside of that context is not
# suppported currently

# first round of dependencies
apt -qq install --yes curl gnupg

curl -sL https://deb.nodesource.com/setup_8.x | bash -
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list

# add custom tools for electron-packager
apt -qq update
apt -qq install --yes \
  apt-transport-https \
  nodejs \
  yarn \
  fakeroot \
  dpkg \
  rpm \
  xz-utils \
  xorriso \
  zsync

yarn run package
