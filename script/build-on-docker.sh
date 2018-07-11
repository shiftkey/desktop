DIRNAME="$(dirname "$0")"
ROOTDIR="$(dirname $DIRNAME)"
ROOTPATH="$(readlink --canonicalize $ROOTDIR)"

if command -v docker ; then
  # build the custom container for Desktop
  docker build -t desktop/linux $ROOTPATH/script/docker/linux

  # mount the repository and build and test the package
  docker run --rm \
    -v $ROOTPATH:/project desktop/linux \
    /bin/bash -c "cd /project && yarn && yarn build:prod && yarn test && yarn run package"
else
  echo "docker not found on PATH, which is required"
  exit -1
fi
