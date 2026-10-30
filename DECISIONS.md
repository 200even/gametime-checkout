# Decisions

## 2026-10-30: Coordinator owns payment recovery

The candidate approved the proposed architecture and Milestone 1 implementation in this session. Expo/React Native/TypeScript and Router provide the app shell; a plain TypeScript `PaymentCoordinator` owns payment transitions and recovery. Zustand is reserved for presentation state, and React Hook Form/card-validator for transient card input in Milestone 2.

Keeping recovery in screens would tie charge decisions to rendering and focus. A separate state framework would add scope without improving this small mock contract. The coordinator instead exposes typed snapshots and subscriptions and accepts an injected API, recovery store, and key generator. Milestone 3 adds native lifecycle synchronization without moving payment decisions into the screen.

## 2026-10-30: In-process mock with separate storage

The candidate approved an async typed in-process API and explicitly required separate client/backend namespaces. `@client/recovery/v1` holds recovery identity; `@mock_backend/database/v1` holds authoritative mock records. An HTTP server was omitted to keep the assessment runnable within the timebox.

Codex implemented a shared single-runtime queue and one backend JSON snapshot per mutation. This keeps charge and intent updates together under the mock contract. It does not supply cross-process locking, transactional AsyncStorage, or independence from app data deletion. The candidate approved proceeding after the foundation report.

## 2026-10-30: Unknown results reconcile; paid orders reject new attempts

The candidate explicitly approved durable identity, concurrency tests, and after-commit timeout injection. Attempt identity is saved before create; confirmation identity is saved before confirm. Backend idempotency protects repeated requests, and an order-level active/paid guard protects different keys.

The candidate approved authoritative order lookup to recover after client-only storage reset. A blind confirmation retry would leave an ambiguous result unresolved. GET and atomic pre-confirm cancellation let the mock establish a safe next action without issuing another charge. Timestamp settlement survives service recreation without retaining timers.

## 2026-10-30: Cancellation has a narrow mock boundary

The candidate explicitly approved distinguishing pre-confirm cancellation from post-confirm uncertainty. Codex implemented `cancelIntent` under the backend write queue: only `requires_action` becomes cancelled; processing or terminal results remain authoritative.

Cold recovery cancels incomplete mock authorization because the fake provider cannot finish independently after process death. Production Affirm redirects and wallet flows require external status reconciliation. The candidate explicitly accepted this mock constraint after the Milestone 1 report and authorized Milestone 2. That acceptance is not a claim about real provider behavior or independently executed tests.

## 2026-10-30: Dependency and static-analysis scope

The candidate approved the dependency set, omitting direct Zod/resolver dependencies, and the static-analysis plan. Codex selected Expo SDK 58 using published npm metadata and Expo's compatibility resolver. React DOM 19.3.0 is an Expo Router peer, not a new web target.

ESLint import restrictions enforce direct layer boundaries; typed promise rules require promise handling. Tests and bootstrap have intentional wiring access. Import rules do not detect arbitrary re-export paths or prove idempotency. No custom lint rules, suppressions, or unsafe type casts were added. Expo/Jest's transitive audit findings remain unresolved; forcing major downgrades was not attempted.

The candidate subsequently directed Codex not to spend time on audit remediation. No dependencies or overrides were added in Milestone 2.

## 2026-10-30: Native form editing and autofill

The candidate prioritized separator deletion, BIN-dependent CVC rules, and platform-specific autofill hints. Codex implemented React Hook Form plus card-validator with digit-relative caret mapping. An explicit selection is supplied only when formatting rewrites the native text. Selection-change notifications update a ref rather than triggering a render that can overwrite later keystrokes. Native checks exposed and informed this correction; a temporary selection-acknowledgment filter was replaced because it interfered with text replacement.

Amex requires four CID digits; Visa/Mastercard require three. Before detection the input permits four. A brand change does not silently rewrite a previously entered CVC: the old value becomes invalid until corrected. Validation is derived on each render and independently repeated at submission; only an opaque synthetic token leaves the form.

iOS receives textContentType hints, Android autoComplete hints. The candidate requested autofill parity; Codex clarified that these hints cannot guarantee password-manager availability. No actual password-manager autofill was observed. Keyboard show/focus synchronization scrolls the form into the reduced viewport; the listener is removed on unmount.

## 2026-10-30: UI reference and mock scope

After Canva shortlink access failed, the candidate supplied three screenshots. Codex used the dark/lime palette, $240 demo order, and distinct checkout/checking/confirmed layouts. Decorative art and ticket delivery were omitted under the candidate's instruction to keep polish utilitarian. Demo labels replace unproven production-security or real-ticket claims.

The native mock authorization sheet offers authorize, cancel, and provider error. Express selection starts the flow and authorization calls confirmation without another checkout submit. Platform overrides and simulated wallet readiness controls are included now; Milestone 3 adds amount/fault controls and foreground AppState wiring.

## 2026-10-30: Foreground recovery and reviewer controls

The candidate approved Milestone 3 and requested AppState reconciliation and visible fault controls. Background/inactive to active transitions request GET recovery for processing or checking states; repeated active events do not. A busy session queues the foreground request. Screen cleanup removes the listener. PaymentCoordinator still decides recovery outcomes.

The network-drop scenario commits first, loses the response, and rejects one immediate status read so the reviewer can observe uncertainty. Service recreation and client-only reset retain the backend namespace. The cold-start button is explicitly a simulation, not evidence of OS process-kill durability. A new demo order preserves the prior ledger and is blocked during unresolved payment.

## 2026-10-30: Keyboard and autofill verification scope

The candidate requested iOS-only KeyboardAvoidingView padding, a nested ScrollView with keyboardShouldPersistTaps="handled", and Android resize behavior to avoid double padding. These are implemented without adding a keyboard dependency. The existing focus/keyboard-show scrolling remains. The initial implementation did not use extra bottom space. After the candidate supplied an iOS screenshot showing the lower fields obscured, Codex added 300 points of iOS bottom scroll space, explicit ScrollView flex, and repositioning after viewport layout. KeyboardAvoidingView is retained; this correction still needs native visual verification.

Both textContentType and autoComplete mappings remain explicit. The candidate directed Codex to document simulator autofill limits instead of populating a simulator keychain; actual password-manager suggestions are unverified. They also required running only one virtual device at a time because of local memory limits.

## 2026-10-30: Candidate verification and submission acceptance

The candidate reported completing a clean clone on a separate host and manually verifying the Android runtime. They confirmed that the software keyboard does not overlap the form and that native AppState background-to-foreground reconciliation recovers the payment state. This closes the Android runtime, keyboard layout, and native foreground lifecycle verification limitations caused by the original host constraints. These observations are candidate-reported, not Codex-observed.

The candidate accepted Milestone 3 after reporting the Android checks above and authorized finalizing the assessment for submission. This acceptance does not establish verification of every native behavior. This documentation update changes no application code. The verification does not extend the mock into a production payment guarantee or establish native process-kill durability.

## 2026-10-30: Retain capability stubs and consolidate reviewer controls

The candidate explicitly approved retaining simulated wallet readiness after review of the assessment and native integration options. React Native detects the actual OS; both wallet flags default to unavailable. A false stub result is not evidence that a device lacks a provisioned card. Review overrides exercise the eligibility rules. Actual wallet provisioning detection would require native platform integration and a development build instead of the Expo Go-compatible mock. The assessment expressly permits capability stubs but also asks for real detection by default; the stricter interpretation is a disclosed limitation. No payment SDK or dependency was added.

The candidate's physical iPhone testing exposed that the bottom environment controls were difficult to find. The existing platform and wallet controls now share the top Reviewer controls panel with payment scenarios and recovery diagnostics. Environment edits remain restricted to ready, non-busy, retryable checkout states and do not change payment or persistence. This improves discoverability without changing eligibility rules or payment orchestration.
