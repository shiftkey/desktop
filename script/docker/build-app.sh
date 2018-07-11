DIRNAME="$(dirname "$0")"
ROOTDIR="$(dirname $DIRNAME)"
# TODO: this only works for Linux - what about other host OSes?
ROOTPATH="$(readlink --canonicalize $ROOTDIR)"

docker run --rm \
  -v $ROOTPATH:/project \
  shiftkey/github-desktop:trusty \
  /bin/bash -c "cd /project && yarn && yarn lint && yarn validate-changelog && yarn build:prod && yarn test:setup && yarn test"
