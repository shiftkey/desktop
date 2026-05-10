# Feature Proposals — GitHub Desktop Linux Fork

Implementation-ready plans for the four highest-value additions to this fork. Each
proposal is self-contained: scope, architecture, file layout, test strategy, risks,
and a phased delivery plan.

| # | Feature | Status | Effort | Risk | Priority |
|---|---|---|---|---|---|
| [01](./01-integrated-terminal.md) | Integrated Terminal (Warp-class responsiveness) | **Implemented (P1–5)** | 2 weeks | High (native deps, perf) | P0 |
| [02](./02-pr-review.md) | In-app Pull Request Review | **Implemented (v1)** | 2 weeks | Medium (API surface) | P1 |
| [03](./03-stash-manager.md) | Git Stash Manager | **Implemented (P1–4)** | 1 week | Low (local git only) | P2 |
| [04](./04-repo-health-dashboard.md) | Repository Health Dashboard | **Implemented (v1)** | 1.5 weeks | Low–Medium | P3 |

## Sequencing rationale

1. **Stash Manager first** when implementing — smallest, lowest-risk, validates
   sidebar-panel UX patterns that the Terminal will reuse.
2. **Integrated Terminal next** — highest user value, but high technical risk
   (native PTY rebuild against Electron ABI). Land the Stash sidebar pattern
   first so the Terminal panel slots into a proven shell.
3. **PR Review** — large API surface, can ship behind a feature flag.
4. **Repo Health Dashboard** — depends on no other feature; ship last, smallest
   churn risk.

Above ordering is for **implementation**. The user-stated priority places the
Terminal first; the implementation-order rationale is purely engineering risk.

## Cross-cutting standards

All four follow the same conventions:

- **Architecture**: AppStore + Dispatcher + IPC (existing pattern, see
  `app/src/lib/stores/app-store.ts` and `app/src/ui/dispatcher/dispatcher.ts`).
- **State**: new fields added to `IAppState` in
  `app/src/lib/app-state.ts`; reducers live in dedicated stores under
  `app/src/lib/stores/`.
- **Tests**: Jest, mirroring source layout under `app/test/unit/`. New test
  files use the pattern `[module]-test.ts`. Coverage gate: 95%+ on new code,
  measured by `jest --coverage`.
- **Feature flags**: each feature lands behind a flag in
  `app/src/lib/feature-flag.ts` so it can be merged before it is exposed.
- **Docs**: each proposal lists the docs that must be updated (typically
  `docs/contributing/setup.md`, the user-facing `docs/learn-more/`, and
  CLAUDE.md memory files).
- **Telemetry**: opt-in usage stats added through `stats-store.ts`. No new
  telemetry without explicit user consent (the app already honors
  `optOutOfUsageTracking`).

## How to read each proposal

Every proposal has the same sections so you can skim consistently:

1. **Goal & non-goals** — what success looks like, what's explicitly out of scope.
2. **User stories** — concrete scenarios driving the design.
3. **Architecture** — diagram + data flow + process model.
4. **File layout** — every new/modified file, with one-line purpose.
5. **Data model** — new types added to `app/src/models/` or `app/src/lib/`.
6. **APIs / IPC** — every new IPC channel and dispatcher method.
7. **UX spec** — wireframe-level layout, keyboard shortcuts, edge cases.
8. **Testing strategy** — what gets unit-tested, integration-tested, and
   manually verified. Coverage targets per module.
9. **Risks & mitigations** — explicit, ranked.
10. **Phased delivery** — atomic phases, each independently shippable.
11. **Open questions** — decisions deferred to implementation time.
