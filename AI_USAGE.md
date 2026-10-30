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

## Milestone 2, 2026-10-30

The candidate explicitly accepted the documented cold-recovery cancellation assumption and authorized Milestone 2's detailed plan and implementation. They prioritized caret behavior, dynamic CVC length/validity, and autofill hints, and directed Codex not to address npm audit findings. Codex clarified that native hints do not guarantee password-manager support. No dependency was added or audit remediation attempted.

Codex authored `src/checkout/` (screen, form, validation, formatting, eligibility, input hints), `src/providers/` (capability stub, authorization state, native sheet), `src/state/checkoutStore.ts`, bootstrap/Router wiring, and `tests/checkout.test.ts`. It updated README and DECISIONS. PaymentCoordinator and the backend contract were preserved. Startup recovery is wired; foreground AppState recovery and backend scenario controls remain pending.

### Reference and verification work

- Read installed card-validator and React Native declarations/implementations, plus the official React Native TextInput documentation for supported hints and selection events.
- Attempted the approved Canva shortlink through web access and `curl -IL --max-time 15 'https://www.canva.com/d/9RYPnQ8Pgx52mDk'`. Sandbox DNS failed; approved retry reached a 403 access challenge. The candidate then supplied three screenshots, which Codex inspected directly and used for the dark/lime native layout. No screenshots were embedded as app UI.
- Ran `npm ls react-test-renderer @types/react-test-renderer` while inspecting installed test tooling. A renderer was not installed and no new renderer dependency was added.
- Ran `npm run check` repeatedly after implementation and corrections. Initial TypeScript failures concerned the native input instance ref type and narrowing a test callback's captured value. Codex corrected the types without escapes or suppressions. Subsequent runs passed 82 tests across two suites with lint and TypeScript clean; final verification is appended below.
- Ran `npx expo export --platform ios --platform android`; both native bundles exported successfully. Re-exported after final input corrections as part of final verification.
- Used source searches to inspect payment mutation calls and suppressions. UI/presentation files do not directly call create/confirm/cancel APIs; application mutations remain in PaymentCoordinator. No unsafe type casts or lint/type suppressions were added.

### Native observations

Computer-use testing ran in Expo Go on iPhone 18 Pro / iOS 27.0. The tool intermittently returned accessibility/window errors; Codex refreshed targets and reset the computer-use session. These interruptions limited coverage and are not claimed as successful actions.

Observed: $240 order pricing; Affirm visible with default wallets unavailable; invalid card Pay disabled; Visa and Amex detection; Amex four-digit CID label and maxLength; three CID digits invalid for Amex; four digits enabling valid Amex submission; changing to Visa retaining four digits but marking them invalid; Visa entry capped at three CVC digits; full-year expiry input becoming `12/30`; backspace over the card separator and expiry slash, followed by correction at the same edit position; the form visible above the keyboard after the scrolling fix; and a complete fake Visa checkout reaching Payment confirmed with intent ID `04960467-507e-4a75-84a7-a29335f7a35f`.

Native testing found two issues: expiry could be hidden below the keyboard, and rendering native selection notifications back into the input caused dropped/reordered replacement text. Codex added focus/keyboard-show scrolling and revised selection handling to observe native events without rendering them back. Full Visa replacement was observed intact after the final strategy. Earlier separator and expiry interaction checks were observed during this iteration; the entire matrix was not repeated on both platforms after every change.

No actual password-manager autofill, Android runtime, physical-device, native express authorization, native lost-response, or native kill/relaunch recovery was verified. Express authorize/cancel/error and no-second-submit behavior were exercised headlessly through the real mock provider and coordinator. Automated tests also cover eligibility boundaries, card validation and editing, and absence of fake card values in payment persistence. A complete clean-clone install remains Milestone 3 work.

### Commits and repository

The candidate requested clean commits while Milestone 2 was in progress. Codex staged Milestone 1 separately, preserving its original foundation screen/bootstrap in the index without reverting working UI files. It checked the staged snapshot via `git checkout-index --all --prefix=/tmp/gametime-m1-review/`, linked the installed dependencies, and ran `npm --prefix /tmp/gametime-m1-review run check`: lint/typecheck clean, 37 tests passed. This is staged-source verification, not a fresh dependency install.

Codex asked for the missing Git identity; the candidate supplied Scott Ferguson / esfergus@gmail.com. Codex set repository-local Git configuration. The candidate performed `gh auth login` themselves. Sandbox `gh auth status` initially reported an invalid token; verification outside the sandbox succeeded for account `200even`.

The candidate authorized GitHub creation/sync, then explicitly requested public visibility. The interrupted private-creation command did not create a commit. Codex ran `git commit -m "Build checkout payment foundation with durable mock recovery"` and `gh repo create gametime-checkout --public --source=. --remote=origin --push`. Foundation commit **b98a605** was pushed to **https://github.com/200even/gametime-checkout**. `references/`, generated bundles, node_modules, and local artifacts remain excluded. Only a trailing blank line was removed from the supplied AGENTS.md; its instructions were unchanged.

Milestone 2 implementation review is pending. Candidate approval of direction and mock assumptions is recorded; no candidate execution of tests or detailed code review is asserted.

Final verification command: `npm run check && npx expo export --platform ios --platform android`. Result: lint clean, TypeScript clean, **2 suites / 83 tests passed**, zero snapshots (1.238 seconds); Android and iOS bundles both exported. The previously verified 37 payment-boundary tests remain included. Documentation changes after this run record these observations and do not change application behavior.

## Milestone 3, 2026-10-30

The candidate authorized lifecycle recovery, visible fault controls, Android verification, and the specified keyboard layout adjustments. They explicitly deferred real autofill setup and audit remediation, then required only one virtual device at a time because of host memory constraints. No dependencies were added. Milestone 2 commit `a59d747` had been pushed to the public repository before this work.

Codex implemented `foregroundRecovery.ts`, the AppState subscription and cleanup in CheckoutScreen, queued foreground checks in createCheckout, and Android resize with iOS-only KeyboardAvoidingView padding. ScrollView retains keyboardShouldPersistTaps="handled". No fixed-padding fallback was needed during implementation; Android runtime layout remains unverified.

Codex added ReviewerControls, scenario/display state, mock status-read fault injection after confirmation commit, latest-demo-order lookup, new-order controls, amount boundaries, service recreation, and client-only storage reset. The UI labels service recreation as a simulation. Payment mutations remain in PaymentCoordinator; bootstrap has explicit mock setup/amount controls. Codex added lifecycle and reviewer-session test suites and updated README and DECISIONS with reproduction steps and limitations.

### Commands and observed results

| Command | Result |
| --- | --- |
| `npm run check` | Final source run: lint clean, TypeScript clean, 4 suites / 98 tests passed, zero snapshots, 2.045 seconds. |
| `npm run check && npx expo export --platform ios --platform android` | Earlier Milestone 3 run passed 94 tests and exported both bundles before the four reviewer-session tests were added. |
| Python source copy to `/tmp/gametime-m3-clean`, then `npm ci --no-audit` | Fresh install succeeded: 1272 packages. Existing transitive deprecation/install-script warnings were not remediated. No audit was run. |
| `npm run check && npx expo export --platform ios --platform android` in that isolated copy | Lint/typecheck clean, 4 suites / 98 tests passed, zero snapshots, 3.077 seconds. iOS and Android bundles exported successfully. The copy contains final application source and tooling, not linked dependencies. |
| `xcrun simctl shutdown BFD9E375-CA21-419F-BC9B-9D2B26234809`; `xcrun simctl list devices booted` | iOS shutdown confirmed before the subsequent Android launch. Sandboxed simulator-service access failed; authorized verification outside the sandbox succeeded. |
| `/Users/scott/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_37.0 -no-snapshot-load` | Emulator warned that 8 GB host memory is below its suggested 16 GB. Repeated `adb devices` checks showed emulator-5554 offline. No app interaction was verified. |
| `/Users/scott/Library/Android/sdk/platform-tools/adb -s emulator-5554 emu kill` | Returned OK; stopped the stalled emulator to free memory. |
| PDFKit extraction of the assessment; source searches; `git diff --check` | Rechecked scope and direct payment calls. No UI create/confirm/cancel calls or lint/type suppressions were found. Client/backend namespaces remain separate. |

Earlier Android verification attempted Expo Go installation through the running Metro server; the install did not complete before the device disconnected. The candidate started an emulator during that work. After the memory constraint was given, Codex confirmed iOS was shut down before starting Android again. Computer-use inventory/window attempts did not yield a usable Android target. No successful Android checkout or keyboard observation is claimed.

### Evidence and remaining gaps

The automated lost-response scenario displays checking with one charge, then foreground recovery reaches success with one charge. Service recreation and client-only reset recover the same paid order. Delayed settlement, repeated lifecycle events, ignored terminal/authorizing transitions, rejected recovery promises, new-order ledger retention, amount changes, and decline-then-success are covered. Existing 20-concurrent-confirmation tests remain included. Tests use a memory-backed AsyncStorage mock and do not establish native crash consistency.

No Milestone 3 native lifecycle/fault-control interaction or native kill/relaunch recovery was verified. iOS form/payment observations remain those recorded in Milestone 2. Android keyboard clipping, actual autofill, physical devices, and native APK compilation remain gaps. Both platform JavaScript bundles exported. The simulator keychain was not populated, as directed.

Candidate approval of Milestone 3 scope is explicit. Final implementation review and disclosure review remain pending; no independent candidate test execution or detailed code review is asserted.

## Post-milestone iOS keyboard correction, 2026-10-30

The candidate supplied a screenshot showing expiry/CVC obscured by the iOS keyboard. This supersedes any inference that the earlier form-positioning observations established complete keyboard usability. Codex inspected CheckoutScreen and found that focus/keyboard-show scrolling had no follow-up when the viewport resized and could be clamped before layout completed.

Codex added explicit ScrollView flex, an onLayout retry while the keyboard is visible, and 300 points of bottom scroll space on iOS so lower controls can be scrolled above the keyboard. Keyboard listeners track visibility and are removed on cleanup. KeyboardAvoidingView remains iOS-only; Android layout is unchanged. No dependency or behavioral test mirroring styles was added.

`npm run check` passed lint, TypeScript, and 98 tests across four suites (1.115 seconds). These checks do not verify keyboard geometry. `adb devices` showed no Android device. `xcrun simctl list devices booted` encountered a CoreSimulator version change, then reported no booted devices. Device Hub computer-use access timed out. The previous Metro endpoint was not reachable in the sandbox; a subsequent listener check showed processes on ports 8081 and 8082. No native visual retest succeeded, and no new simulator/emulator was launched. Candidate verification after reloading remains pending.
