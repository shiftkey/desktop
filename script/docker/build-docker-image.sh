#!/bin/sh

DIRNAME="$(dirname "$0")"

docker build -t shiftkey/github-desktop:trusty $DIRNAME/linux