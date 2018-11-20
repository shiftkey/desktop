# [GitHub Desktop](https://desktop.github.com) - The Linux Fork

[![Travis](https://img.shields.io/travis/desktop/desktop.svg?style=flat-square&label=Travis+CI)](https://travis-ci.org/desktop/desktop)
[![CircleCI](https://img.shields.io/circleci/project/github/desktop/desktop.svg?style=flat-square&label=CircleCI)](https://circleci.com/gh/desktop/desktop)
[![AppVeyor Build Status](https://img.shields.io/appveyor/ci/github-windows/desktop/development.svg?style=flat-square&label=AppVeyor&logo=appveyor)](https://ci.appveyor.com/project/github-windows/desktop/branch/development)
[![Azure DevOps Pipelines Build Status](https://dev.azure.com/github/Desktop/_apis/build/status/Continuous%20Integration)](https://dev.azure.com/github/Desktop/_build/latest?definitionId=3)
[![license](https://img.shields.io/github/license/desktop/desktop.svg?style=flat-square)](https://github.com/desktop/desktop/blob/development/LICENSE)
![90+% TypeScript](https://img.shields.io/github/languages/top/desktop/desktop.svg?style=flat-square&colorB=green)

GitHub Desktop is an open source [Electron](https://electron.atom.io)-based
GitHub app. It is written in [TypeScript](http://www.typescriptlang.org) and
uses [React](https://facebook.github.io/react/).

![GitHub Desktop screenshot - Windows](https://cloud.githubusercontent.com/assets/359239/26094502/a1f56d02-3a5d-11e7-8799-23c7ba5e5106.png)

## What is this repository for?

This repository contains specific patches on top of the upstream
`desktop/desktop` repository to support Linux usage.

It also hosts preview packages for various Linux distributions:

 - AppImage (`.AppImage`)
 - Debian (`.deb`)
 - RPM (`.rpm`)
 - Snap (`.snap`) - also available from [snapcraft.io](https://snapcraft.io/github-desktop)

Check out the [latest releases](https://github.com/shiftkey/desktop/releases) to
help out with testing on your distribution.

If you install the Snap package, ensure you also connect it to your password
manager:

```shellsession
$ sudo snap connect github-desktop:password-manager-service
```

Without this, GitHub Desktop cannot store or retrieve account details it
requires in the user's keychain.

## Other Distributions

Arch Linux users can install GitHub Desktop from the
[AUR](https://aur.archlinux.org/packages/github-desktop/).

## More information

Please check out the [README](https://github.com/desktop/desktop#github-desktop)
on the upstream [GitHub Desktop project](https://github.com/desktop/desktop) and
[desktop.github.com](https://desktop.github.com) for more product-oriented
information about GitHub Desktop.

## License

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo
designs. GitHub reserves all trademark and copyright rights in and to all
GitHub trademarks. GitHub's logos include, for instance, the stylized
Invertocat designs that include "logo" in the file title in the following
folder: [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's
Trademarks or registered Trademarks. When using GitHub's logos, be sure to
follow the GitHub [logo guidelines](https://github.com/logos).
