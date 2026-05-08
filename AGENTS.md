# Repository Guidelines

## Project Structure & Module Organization

This repository is the Linux fork of GitHub Desktop, a TypeScript/Electron app.
Application code lives in `app/src`: UI components are under `app/src/ui`, shared
logic under `app/src/lib`, models under `app/src/models`, and Electron main
process code under `app/src/main-process`. Styles are in `app/styles`, static
assets in `app/static`, and documentation in `docs/`. Build, release, and
maintenance scripts live in `script/`. Tests are in `app/test`, with unit tests
in `app/test/unit`, helpers in `app/test/helpers`, mocks in `app/test/__mocks__`,
and Git fixture repositories in `app/test/fixtures`.

## Build, Test, and Development Commands

Use Yarn 1.x and Node 20.x, as described in `docs/contributing/setup.md`.

- `yarn` installs root and app dependencies.
- `yarn build:dev` compiles a development build.
- `yarn start` launches the development app with background recompilation.
- `yarn compile:dev` runs the development webpack compilation only.
- `yarn test` runs unit tests and script tests.
- `yarn test:unit -- <pattern>` runs matching Jest unit tests.
- `yarn test:script` runs tests for repository scripts.
- `yarn lint` checks Prettier formatting and ESLint rules.
- `yarn lint:fix` applies Prettier and ESLint autofixes.

## Coding Style & Naming Conventions

Write TypeScript using the repository ESLint and Prettier configuration. Use
camelCase for methods and variables, PascalCase for classes and React
components, and JSDoc `/** ... */` comments for public or non-obvious APIs. In
application code, prefer asynchronous Node APIs; synchronous variants should be
rare and named with a `Sync` suffix. Script code may favor synchronous APIs for
readability.

## Testing Guidelines

Jest is the primary test framework. Add unit tests beside related areas under
`app/test/unit`, mirroring `app/src` when practical. New test files should use
the pattern `[app-module]-test.ts`. Keep unit tests focused on one module or
function, and use `app/test/fixtures` for repository state needed by Git tests.
Run `yarn test:unit` before submitting application changes; run `yarn test` when
touching shared behavior or scripts.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often with scoped prefixes for
automation such as `build(deps): bump ...`. Keep commits focused and mention PR
or issue numbers when relevant. Open draft PRs for work in progress, include a
clear description, link related issues, and add screenshots or recordings for UI
changes. Expect review iteration; mark the PR ready only after tests and linting
that match the change have passed.
