# AI usage

## Preflight, 2026-10-30

The candidate supplied the assessment, build guide, and working agreement and requested a plan without code changes. Codex read `AGENTS.md` and `references/gametime-build-guide.md` using shell reads and extracted all four assessment pages with macOS PDFKit via `swift -module-cache-path /tmp/gametime-swift-cache -e ...`. Poppler and Python PDF libraries were unavailable; the initial sandboxed Swift attempt failed, and the candidate approved the read outside the sandbox.

Codex compared requirements, proposed three milestones, identified the physical-device requirement as guide-only, and distinguished simulated wallet readiness from actual provisioning detection. Codex proposed authoritative order lookup, semantic cancellation, direct dependency omissions, invariants, tests, and static-analysis boundaries. No repository files were changed during preflight.

Codex asked for approval of the plan, dependency set, and Milestone 1. The candidate explicitly approved those and emphasized after-commit timeouts, concurrency tests, separate storage namespaces, and a 75-minute Milestone 1 limit. This is approval of direction and implementation scope, not review of the resulting code.

## Milestone 1, 2026-10-30

Codex authored the Expo shell, typed payment API/domain, coordinator, mock backend, persistence adapters, native composition root, test suite, tooling configuration, lockfile, README, and decision log. The candidate's approved direction supplied the architecture and priorities. Codex's implementation details include atomic pre-confirm cancellation, a shared runtime queue, runtime checks on persisted record shapes, and same-promise coalescing for overlapping coordinator calls.

### Commands and outcomes

Routine inspection used `pwd`, `rg --files`, `cat`, `ls -la`, `git status --short`, `node --version`, and `npm --version`. Node was 26.13.0; npm was 11.20.0. No application or tooling configuration existed at the start.

| Commands actually run | Observed result |
| --- | --- |
| `npm view expo version`; `npm view expo-template-blank-typescript dependencies --json` | Initial sandbox registry lookup failed with ENOTFOUND; approved retry returned Expo 58.0.21, React 19.3.0, React Native 0.88.1. |
| `npm install` | Installed base Expo dependencies. |
| `npx expo install expo-router expo-linking expo-constants react-native-safe-area-context react-native-screens @react-native-async-storage/async-storage expo-crypto` | Installed Expo-compatible native dependencies. |
| `npm install zustand react-hook-form card-validator` | First attempt failed on an automatically resolved React DOM 19.3.1 peer conflict with React 19.3.0. |
| `npx expo install react-dom` | Aligned React DOM to 19.3.0, resolving the peer conflict without force flags. |
| `npm install zustand react-hook-form card-validator` | Retry succeeded. |
| `npx expo install typescript @types/react jest jest-expo @types/jest eslint eslint-config-expo --dev`; `npm install --save-dev typescript-eslint` | Installed approved tooling. npm reported deprecated transitive packages and unapproved optional native install scripts; checks/bundles ran without enabling those scripts. |
| `npm run lint`; `npm run typecheck`; `npm test -- --watchman=false` | Initial behavior suite: 33 passed. Lint found a CommonJS global and type-only import; TypeScript found missing Jest globals. Codex fixed configuration/imports without suppressions or type escapes. A subsequent duplicate-import warning was fixed. |
| `npm run check -- --watchman=false` | 37 passed after lifecycle-boundary additions, but npm warned that the forwarded watchman argument was an unknown npm option. Codex set `watchman: false` in Jest configuration to use Jest's built-in file crawler. |
| `npm run check` | Final code/config run: lint clean, TypeScript clean, 1 suite / 37 tests passed, 0 snapshots, 1.974 seconds. |
| `npx expo install --check` | Dependencies are up to date. |
| `npx expo export --platform ios --platform android` | Both production bundles exported successfully; this is bundling evidence, not Android runtime verification. |
| `npm audit --json` | 14 findings: 11 low, 3 high. Underlying advisories concern transitive deepmerge and zod. Suggested forced remediation includes major Expo/Jest downgrades; no forced fix applied. |
| `xcrun simctl list devices booted`; `xcrun simctl list devices available` | Sandbox blocked simulator services; approved retry listed available devices. `command -v adb` found no executable in PATH. |
| `npx expo start --ios --localhost` | Accepted port 8082 because another project used 8081. Downloaded/installed Expo Go. First openurl timed out and Metro exited. Computer-use screenshot showed a server-connection error; `curl --max-time 10 -sS http://127.0.0.1:8082/status` confirmed no running server. |
| `npx expo start --ios --localhost --port 8082` | Retry succeeded; Metro served the iOS bundle. Computer-use screenshot visibly confirmed the foundation screen on iPhone 18 Pro / iOS 27.0 after dismissing Expo Go's introductory notice. |

Codex also searched source for payment mutation calls, namespace keys, suppressions, and unsafe type casts. Application payment mutation calls are in the coordinator; mock implementations and direct test calls are intentional. No suppression or `as any` was found. Bootstrap seeds the mock order. The shell does not yet call bootstrap.

### Behavioral evidence and limits

The suite covers persisted identity before mutations; lost create/confirm responses; post-commit timeout followed by failed immediate GET and successful fresh-service GET; delayed success/decline after service recreation; rapid taps; concurrent confirmations across backend instances; conflicting keys/payloads; order-level protection; stale totals; provider cancellation; late authorization tokens; storage-write/cleanup failures; corrupt-record rejection; and client-only reset.

Lost-response recovery and concurrent identical confirmation each observed exactly **1 mock charge**. Pre-confirm cancellation and rejected stale totals observed **0 charges**. Decline followed by a fresh successful attempt observed **1 charge**. The native storage adapter is injected in bootstrap; headless tests retain a memory adapter across fresh service instances. They do not prove native process-kill durability or real payment-provider guarantees.

No card form, wallet capability UI, Zustand presentation store, scenario menu, or AppState subscription has been implemented. No physical-device, Android runtime, or native payment-recovery exercise has been performed. The synthetic-data test checks the current payment contract only; form-level sensitive-data validation remains future work.

The iOS shell was visually inspected through Device Hub using computer-use tools. Attempts to find an app named Simulator failed before locating Device Hub. No payment behavior was exercised in that UI. The development server was left running on port 8082 for review. A clean-clone install has not been performed.

Implementation review is pending. Codex has not claimed candidate code review, independent validation, or candidate authorship of generated code. No commit, publication, or submission has been performed. Milestone 2 has not started.
