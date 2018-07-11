DIRNAME="$(dirname "$0")"
ROOTDIR="$(dirname $DIRNAME)"
ROOTPATH="$(readlink --canonicalize $ROOTDIR)"

if command -v docker ; then
  docker run --rm \
    -v $ROOTPATH:/project \
    shiftkey/github-desktop:trusty \
    /bin/bash -c "cd /project && yarn && yarn build:prod && yarn run package"
else
  echo "docker not found on PATH, which is required"
  exit -1
fi
