#!/bin/sh

if [[ ! -z "$LINT_ONLY" ]]; then
  echo "LINT_ONLY has been set - running subset of build process"
  yarn lint
elif [[ ! -z "${BUILD_AND_TEST_ONLY}" ]]; then
  echo "BUILD_AND_TEST_ONLY has been set - running subset of build process"
  yarn build:prod && yarn test:setup && yarn test
else
  yarn lint && yarn build:prod && yarn test:setup && yarn test
fi