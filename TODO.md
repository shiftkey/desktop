# Desktop Catch-up TODO

## Goal

Catch this Linux fork up with high-value GitHub Desktop and GitHub platform
workflows while keeping changes test-driven and shipped in small E2E slices.

## Shortlisted Catch-up Items

- [x] Organization visibility/access diagnostics and organization-aware repo
      browsing.
- [x] Finish AI commit message polish: Preferences tests, better error UX,
      provider/model validation, and optional per-repo control.
- [x] Filter changed files in the Changes view.
- [ ] Git hooks support with hook output, skip/bypass controls, and clear errors.
- [ ] Multi-domain account support audit and missing-flow fixes.
- [ ] Lightweight security alert surfacing for Dependabot/code scanning/secret
      scanning, linking to GitHub for details.
- [ ] Issues/Projects/Codespaces browser shortcuts where local management is too
      large for a first pass.
- [x] Manual Linux release workflow for `.deb`, `.rpm`, `.AppImage`, and
      checksum artifacts.

## Current Slice: AI Commit Messages

- [x] Map the existing commit summary/description UI and dispatcher/store flow.
- [x] Find the app settings/persistence pattern used by Preferences.
- [x] Add unit tests for AI commit prompt creation and diff truncation.
- [x] Add unit tests for OpenRouter response parsing and error handling.
- [x] Add AI commit settings: enabled flag, API key, model ID, optional base URL.
- [x] Store secrets using the existing secure credential path if available.
- [x] Implement an OpenRouter chat-completions client behind a provider-neutral
      AI commit message service.
- [x] Add a generate button to the commit message box.
- [x] Disable generation when no selected changes exist or settings are missing.
- [x] Show loading and recoverable error states.
- [x] Insert generated summary/body into the existing commit message fields.
- [x] Add UI tests or component tests for missing-key, loading, success, and
      failure states where practical.
- [x] Add optional per-repository AI commit message control.
- [x] Run targeted unit tests.
- [x] Run `yarn lint` or the smallest relevant lint command.

## Current Slice: Organization Diagnostics

- [x] Map existing account, clone, publish, and organization API paths.
- [x] Add unit tests for organization diagnostics and empty/missing org states.
- [x] Implement organization diagnostics helper.
- [x] Add an Accounts/Preferences organization status section.
- [x] Show visible organizations per signed-in account.
- [x] Explain likely missing-organization causes: OAuth app restrictions, SSO,
      missing membership, or insufficient repository permissions.
- [x] Link to GitHub organization OAuth app approval/request documentation.
- [x] Run targeted unit tests.
- [x] Run `yarn lint` and compile check.

## Current Slice: Filter Changed Files

- [x] Add unit tests for changed-file path filtering.
- [x] Implement case-insensitive multi-term path filtering.
- [x] Add a search field above the changed-file list.
- [x] Preserve file selection behavior while filtered.
- [x] Run targeted unit tests.
- [x] Run `yarn lint` and compile check.

## Current Slice: Manual Linux Releases

- [x] Add a unit test for the manual Linux package workflow.
- [x] Add `workflow_dispatch` inputs for branch/tag/SHA builds.
- [x] Keep `.deb`, `.rpm`, `.AppImage`, and `.sha256` artifact uploads.
- [x] Allow optional draft GitHub Release creation from manual runs.
- [x] Update README to remove stale package-feed-first installation guidance.
- [x] Run targeted unit tests.
- [x] Run `yarn lint` and compile check.

## Notes

- Default provider: OpenRouter.
- Default endpoint: `https://openrouter.ai/api/v1/chat/completions`.
- Suggested model default: `openrouter/auto`; allow users to enter any model ID.
- Keep generation manual only; never auto-generate or auto-commit.
- Do not add AI attribution trailers automatically.
- Cap prompt size before sending diffs to the model.
