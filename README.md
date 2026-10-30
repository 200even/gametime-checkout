# Gametime Checkout

Fans need to know whether a payment succeeded even when a response disappears or the app restarts. This Expo checkout implements platform-dependent express methods, validated native card input, an asynchronous mock payment API, and a recovery coordinator. Foreground recovery and deterministic reviewer fault controls are included.

## Run

Prerequisites: Node.js and npm, plus Expo Go compatible with SDK 58 or an iOS/Android simulator. Development verification uses Node 26.13.0 and npm 11.20.0. iOS simulator launch requires macOS and Xcode; Android launch requires an Android SDK and a running emulator.

```sh
npm ci --no-audit
npm start
```

Scan the QR code with compatible Expo Go, or launch a simulator directly:

```sh
npm run ios
npm run android
```

On memory-constrained machines, run only one emulator or simulator at a time.

The lockfile fixes dependency resolution. React DOM is installed to satisfy Expo Router's peer dependency and matches React 19.3.0; web is not a target.

## Try the checkout

The default fictional order totals $240 ($220 tickets, $20 mock fees). Device platform comes from `Platform.OS`; wallet readiness is explicitly simulated and defaults to unavailable. Credit card is always available, and Affirm appears above $100.00.

1. Use fake Visa `4242 4242 4242 4242`, a future expiry such as `12/30`, and CVC `123`. Pay stays disabled until all fields are valid. Fake Amex `3782 822463 10005` requires four CID digits.
2. Open **Reviewer controls → Environment simulation** at the top of checkout to simulate iOS/Android and wallet readiness. Apple Pay requires simulated iOS plus Apple Wallet readiness; Google Pay requires simulated Android plus Google readiness. **Device default** restores the actual platform with simulated wallets unavailable.
3. Select an express method to open its mock authorization sheet. Authorize completes checkout directly; Cancel and Simulate provider error return to a retryable checkout. There is no second checkout Pay tap.
4. Try cancellation and card correction before completing a successful payment. The paid demo order stays paid across reloads. Use **Reviewer controls → New demo order** to try another payment while retaining previous mock charges.

The form accepts full-year expiry input such as `12/2030`, displays `12/30`, and keeps the current month valid. Touched fields show errors. Changing Amex to Visa leaves an existing four-digit CID visible but invalid until corrected. Raw card fields live only in React Hook Form; submission revalidates and passes an unrelated synthetic token to the coordinator, then clears the form. **Clear card details** unmounts and recreates the form. Backgrounding alone does not erase it.

The actual operating system is detected with React Native `Platform.OS`. Wallet readiness is simulated and defaults to unavailable; a false simulated value does not prove that the device lacks a provisioned card. Environment switches let reviewers verify eligibility. Actual provisioning detection would require native platform integration and a development build, rather than this Expo Go-compatible mock. The assessment permits stubbed capability checks but also requests real detection by default; the stricter interpretation remains a disclosed limitation. The candidate approved retaining simulated readiness for this assessment.

Autofill uses iOS `textContentType` and Android `autoComplete` hints on all three fields. These are OS hints, not a guarantee that a password manager offers values. See the [React Native TextInput reference](https://reactnative.dev/docs/textinput.html).

## Reproduce payment recovery

Open the green **Reviewer controls** panel at the top of checkout. It contains **Environment simulation**, **Payment scenarios**, and **Recovery and diagnostics**. Its charge counter is for the current order. Environment controls are disabled while payment is unresolved or checkout is busy; changing an environment never resets a payment.

1. **Lost response after commit:** choose **Force network drop**, collapse the panel, and pay with a fake card or authorize Affirm. The backend records success, then drops the confirmation response and fails the first recovery read. The client remains `checking` while **Mock charges: 1** is visible. New payments stay blocked.
2. **Foreground recovery:** background the app and return. AppState immediately requests reconciliation for `checking` or `processing`; success appears with the same one charge. **Simulate foreground return** invokes the same status-check entry point without a native lifecycle transition.
3. **Cold recovery:** on a new order, repeat the lost-response scenario, then choose **Simulate cold start**. Services are recreated over retained storage and GET recovers success. This button does not kill the native process. To exercise actual relaunch, close and reopen the app with its storage retained and Metro available.
4. **Client storage loss:** repeat on another new order and choose **Clear client recovery only**. Authoritative order lookup recovers the paid order and one charge. Do not clear all Expo Go/app data: that also deletes the mock backend.
5. **Delayed settlement:** select **Process for 15 seconds**, pay, background the app, wait 15 seconds, and return. GET materializes the stored settlement deadline. You can also use **Check status**. There is no background polling timer.
6. **Decline/cancel/eligibility:** select **Issuer decline** for a definitive failure and retry with Success. The express sheet has Cancel and provider-error controls. Amount buttons exercise $99.99, $100.00, and $100.01; Affirm appears only above $100.00.

Scenarios can change only while checkout is retryable. **New demo order** is blocked while payment is unresolved and retains the previous order ledger. Scenario selection resets to Success on a real app restart; persisted settlement outcomes do not change.

```sh
npm run check
npm test -- --testNamePattern='confirmation response|cold start|concurrent|client-only reset|network-drop'
```

Automated after-commit loss, fresh-service recovery, repeated reconciliation, and 20 concurrent identical confirmations each assert **1 mock charge**. These verify the local contract, not production provider guarantees.

## Review path

| File | Responsibility |
| --- | --- |
| `app/index.tsx`, `app/_layout.tsx` | Router entry |
| `src/checkout/CheckoutScreen.tsx`, `CardForm.tsx` | Native checkout, status screens, card fields, and environment controls |
| `src/checkout/card.ts`, `formatting.ts`, `inputHints.ts`, `eligibility.ts` | Validation, caret mapping, autofill hints, and eligibility |
| `src/providers/` | Simulated readiness and authorization sheet/token lifecycle |
| `src/state/checkoutStore.ts` | Zustand presentation snapshots, selection, readiness, and busy state |
| `src/payments/PaymentCoordinator.ts` | Submission, pre-confirm authorization, uncertainty, recovery, and presentation snapshots |
| `src/payments/PaymentAPI.ts`, `types.ts` | Async request/response contract and domain types |
| `src/mock/MockPaymentAPI.ts` | Idempotency, order protection, settlement, and after-commit faults |
| `src/mock/MockBackendStore.ts` | Serialized writes of one backend snapshot |
| `src/storage/ClientRecoveryStore.ts` | Client-only recovery identity |
| `src/bootstrap/createCheckout.ts`, `foregroundRecovery.ts` | Native composition, startup/foreground recovery, reviewer session controls |
| `src/checkout/ReviewerControls.tsx` | Visible deterministic fault and recovery controls |
| `tests/payments.test.ts` | Payment boundary and restart scenarios |
| `tests/checkout.test.ts` | Card edits, validation, eligibility, and provider/coordinator integration |
| `tests/lifecycle.test.ts`, `reviewer-session.test.ts` | Foreground boundaries, recreated services, client wipe, and debug controls |

Zustand mirrors coordinator status and holds display state. It does not decide whether payment succeeded. React Hook Form holds transient card fields and card-validator checks network metadata, Luhn, expiry, and CVC. The coordinator has no React, React Native, or Zustand dependency.

## API and lifecycle contract

| Request | Contract |
| --- | --- |
| `getOrder(orderId)` | Returns authoritative order, active/paid intent, and mock charge count. Recovers after client-only reset. |
| `createIntent(orderId, attemptKey)` | Returns the existing intent for identical reuse; rejects reuse on a different order. Captures order version and integer cents. |
| `confirmIntent(intentId, payload, confirmationKey)` | Accepts only synthetic tokens. Identical reuse returns current status; conflicting reuse fails. Stale amount/version returns `ORDER_CHANGED`, not issuer decline. |
| `getIntent(intentId)` | Returns authoritative status and materializes due settlement. |
| `cancelIntent(intentId)` | Atomically cancels only `requires_action`; returns the unchanged authoritative result if confirmation already progressed. |

Only the coordinator calls payment mutations in application orchestration. Bootstrap seeds demo orders and changes their amounts through explicit reviewer controls; tests exercise the API directly. The backend allows only one active attempt per order and refuses new keys for paid orders.

The coordinator persists the attempt key before create, then the intent ID, then the confirming phase and stable confirmation key before confirm. No provider token enters client recovery storage. Unknown results trigger status recovery rather than a second confirmation. A busy coordinator joins repeated submit/reconcile calls to the same promise. Startup reconciles before enabling checkout. AppState transitions from background/inactive to active trigger reconciliation only for processing or unknown (`checking`) payments. A foreground request arriving during an existing operation is queued until it completes. The subscription is removed on screen cleanup. An unresolved status screen also offers **Check status**.

On cold recovery, `requires_action` is atomically cancelled. This assumes mock authorization cannot finish independently outside the app. A late token cannot confirm a cancelled intent. Real redirected payments would require provider/server status reconciliation before applying this policy. Known processing remains processing; terminal results clear client recovery. A local cleanup failure cannot turn verified success into failure.

## Persistence and limitations

Client storage uses `@client/recovery/v1`; backend storage uses `@mock_backend/database/v1`. Client reset removes only the first key. Wiping all app storage also destroys the simulated backend.

Backend mutations share a queue for the same injected storage adapter within one JavaScript runtime. Each mutation writes one JSON snapshot containing orders, intents, and charges. This avoids separate intent/charge writes in the mock, but AsyncStorage is not a production transaction system. There is no cross-process lock or server durability guarantee. Malformed records fail closed; automated repair is outside this milestone.

Tests use an in-memory key/value adapter with the same async interface, retained across fresh service instances. They do not kill a native process or establish AsyncStorage crash consistency. The synthetic token appears in backend records to validate idempotent payload reuse; real payment tokens and card data must not be handled this way.

Production work would require server-side transactions and order constraints, real provider capability checks and authorization, secure token handling, external settlement/webhooks, and recovery against a backend that survives app data loss.

## Verification

The final reviewer-control correction passed `npm run typecheck`, `npm run lint`, and `npm test -- --no-cache --coverage=false`: **107 tests across four suites**, with `git diff --check` clean. The nine added cases cover environment edits and their restrictions; existing payment and card tests remain included. The consolidated native layout has not yet been manually verified.

Milestone 3: `npm run check` passed lint, TypeScript, and **98 tests across four suites**, including all 37 foundation payment tests. `npx expo export --platform ios --platform android` exported both native bundles. Exact commands and earlier failures are recorded in [AI_USAGE.md](AI_USAGE.md).

Codex-observed iOS simulator behavior on iPhone 18 Pro / iOS 27.0: fake Visa/Amex detection, number-separator deletion and correction, full-year expiry normalization, slash deletion and correction, four-digit Amex CID versus three-digit Visa CVC, invalid/valid Pay state, keyboard-visible form positioning, and fake-card checkout reaching authoritative confirmation. Native event races found during these checks were corrected before the Milestone 2 commit. A later candidate screenshot still showed expiry/CVC obscured on iOS. A follow-up adds viewport-layout repositioning and extra bottom scroll space; its native visual retest is pending.

An isolated source copy at `/tmp/gametime-m3-clean` passed `npm ci --no-audit`, `npm run check` (98 tests), and both native bundle exports. This verifies a fresh dependency install; it is not a native launch from a fresh clone.

The candidate completed a clean clone on a separate host and manually verified the Android runtime. They confirmed that the Android software keyboard does not overlap the form and that native AppState background-to-foreground reconciliation recovers the payment state. This candidate verification closes the Android runtime, keyboard layout, and foreground lifecycle gaps from Codex’s earlier local emulator attempts. These observations establish those Android checks, not every native behavior.

The candidate also reported physical iPhone testing that exposed difficulty finding the wallet switches at the bottom of checkout. That prompted consolidation into the top reviewer panel. This report does not verify the final iOS keyboard correction, express-sheet backgrounding, or native force-quit/relaunch recovery. Actual password-manager autofill also remains unverified. Android uses resize with no KeyboardAvoidingView behavior; iOS uses padding and scrollable content. Bundle export does not produce an APK. Service-recreation tests are not native crash-durability evidence.

The three user-supplied Canva screenshots guided the dark background, lime action, order summary, and distinct checking/confirmation states. Decorative images, team logos, and a ticket-delivery flow were omitted. The UI explicitly identifies demo pricing and does not claim real ticket issuance or production payment security.

The Milestone 1 audit reported 14 findings (11 low, 3 high) in the resolved Expo/Jest dependency tree. No forced fix or incompatible override was applied. The candidate explicitly deferred audit remediation as outside assessment scope; it was not pursued in Milestone 2.

See [DECISIONS.md](DECISIONS.md) for choices and consequences, and [AI_USAGE.md](AI_USAGE.md) for actual Codex contributions and candidate approval status.
