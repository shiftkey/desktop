# GitHub Desktop for Linux

[![Linux Packages](https://github.com/tommyqhoang/github-desktop-linux/actions/workflows/ci-linux.yml/badge.svg)](https://github.com/tommyqhoang/github-desktop-linux/actions/workflows/ci-linux.yml)

This repository maintains a Linux-focused fork of
[GitHub Desktop](https://desktop.github.com/), the open-source
[Electron](https://www.electronjs.org/) app written in
[TypeScript](https://www.typescriptlang.org) and [React](https://reactjs.org/).

The previous Linux fork went quiet for several years. This project is taking
over maintenance with a practical goal: keep GitHub Desktop usable on Linux,
catch up important Windows/macOS Desktop features where possible, and ship
installable Linux packages directly from GitHub.

## Current Focus

- Keep the Linux app building and installable.
- Continue catching up high-value Desktop workflows such as Git hooks,
  multi-domain account flows, security status links, and GitHub browser
  shortcuts.
- Prefer small, tested, end-to-end feature slices over large rewrites.
- Publish user-installable `.deb`, `.rpm`, and `.AppImage` artifacts from
  GitHub Actions.

See [TODO.md](TODO.md) for the active catch-up roadmap.

## Linux Catch-up Features

This fork includes Linux-focused catch-up work on top of the upstream GitHub
Desktop codebase:

- **AI commit messages**: generate commit summaries and descriptions from the
  currently selected changes. Configure OpenRouter in Preferences, choose the
  model and base URL, and optionally disable generation per repository in
  Repository Settings.

  [![Commit AI preferences](https://i.ibb.co/hFKFv2BV/Screenshot-From-2026-05-08-23-14-30.png)](https://ibb.co/4RjRx48p)

  [![Commit AI generation](https://i.ibb.co/p7zh9yY/Screenshot-From-2026-05-08-23-15-33.png)](https://ibb.co/tGsLWXV)

- **Integrated terminal**: a repo-scoped terminal panel docked at the bottom of
  the window, toggled with `` Ctrl+` ``. It runs real shell sessions
  (`node-pty` + `xterm.js`) with multiple tabs, split panes, command-block
  markers, and per-repository session persistence.
- **Repository health dashboard**: a cross-repository status view showing
  uncommitted files, ahead/behind counts, open pull request count,
  default-branch CI status, and a per-repository attention score, with sorting,
  filtering, and refresh.
- **In-app pull request review**: review a pull request without leaving the
  app — load its review threads, draft line comments, set a verdict (approve,
  request changes, or comment), and submit the review in one shot.
- **Stash management**: a Stashes tab listing every stash entry — created by
  Desktop or the Git CLI — with apply and create-with-message actions.
- **Worktrees view**: a Worktrees tab listing the repository's linked worktrees
  with each one's checked-out branch, uncommitted-change count, and
  locked/prunable state.
- **Working-directory change summary**: the Changes tab shows aggregate
  added/removed line counts next to the changed-file count.
- **Changed-file filtering**: filter the Changes view by path using one or more
  case-insensitive search terms while keeping the existing file selection flow.
- **Organization diagnostics**: see visible organizations for each signed-in
  GitHub.com or GitHub Enterprise account in Preferences, with guidance for
  common missing-organization causes such as OAuth app restrictions, SAML SSO,
  private membership, and repository permissions.
- **Manual Linux release builds**: maintainers can run the `CI / Linux`
  workflow manually for a branch, tag, or SHA and produce `.AppImage`, `.deb`,
  `.rpm`, and `.sha256` artifacts, with optional draft GitHub Release creation.

## Download and Install

Packages are distributed through GitHub Actions artifacts and GitHub Releases.
Package-manager feeds from older Linux forks are no longer the primary
distribution path for this project.

1. Open the
   [CI / Linux workflow](https://github.com/tommyqhoang/github-desktop-linux/actions/workflows/ci-linux.yml).
2. Choose the latest successful run, or a tagged draft release when available.
3. Download the artifact for your architecture:
   - `ubuntu-amd64-artifacts`
   - `ubuntu-arm64-artifacts`
   - `ubuntu-arm-artifacts`
4. Extract the artifact and install one package:
   - Debian/Ubuntu: `sudo apt install ./GitHubDesktop-linux-*.deb`
   - Fedora/RHEL/openSUSE: install the `.rpm` with your package manager.
   - Any supported Linux distribution: mark the `.AppImage` executable and run
     it.

Example AppImage install:

```sh
chmod +x GitHubDesktop-linux-*.AppImage
./GitHubDesktop-linux-*.AppImage
```

Example Debian package install:

```sh
sudo apt install ./GitHubDesktop-linux-*.deb
```

## Manual Release Builds

Maintainers build Linux packages with the `CI / Linux` GitHub Actions workflow.
Use **Run workflow**, choose the branch/tag/SHA to build, and leave
`publish_release` disabled for artifact-only validation builds.

To create a draft GitHub Release, run the same workflow with:

- `publish_release`: enabled
- `release_tag`: a tag such as `release-3.4.9-linux1`

The workflow builds `.AppImage`, `.deb`, `.rpm`, and `.sha256` files for the
supported Linux architectures. Users can download these files directly from the
workflow artifacts or from the draft release after it is reviewed and published.

## Development

This repository uses Yarn 1.x and Node `20.17.0`.

```sh
yarn
yarn build:dev
yarn start
```

Useful checks:

```sh
yarn test
yarn lint
yarn compile:dev
```

For contributor and agent guidance, see [AGENTS.md](AGENTS.md) and
[CLAUDE.md](CLAUDE.md).

## Known Issues

Linux-specific issues and workarounds are tracked in
[docs/known-issues.md](docs/known-issues.md#linux). Some older documentation in
`docs/` still refers to the previous fork and upstream release process; prefer
this README and `TODO.md` for current project direction.

## Relationship to Upstream

This project is based on GitHub Desktop but is not an official GitHub product
release channel. We will continue to reference upstream
[`desktop/desktop`](https://github.com/desktop/desktop) for architecture,
bugfixes, and feature parity, while maintaining Linux packaging and Linux-first
fixes here.

## License

**[MIT](LICENSE)**

The MIT license grant is not for GitHub's trademarks, which include the logo
designs. GitHub reserves all trademark and copyright rights in and to all GitHub
trademarks. GitHub's logos include, for instance, the stylized Invertocat
designs that include "logo" in the file title in [logos](app/static/logos).

GitHub® and its stylized versions and the Invertocat mark are GitHub's
trademarks or registered trademarks. When using GitHub's logos, follow the
GitHub [logo guidelines](https://github.com/logos).
