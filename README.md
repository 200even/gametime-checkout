# Gametime Checkout

Fans need to know whether a payment succeeded even when a response disappears or the app restarts. This Expo checkout implements platform-dependent express methods, validated native card input, an asynchronous mock payment API, and a recovery coordinator. Milestones 1 and 2 are implemented. Foreground AppState wiring and interactive backend fault controls remain for Milestone 3.

## Run

Prerequisites: Node.js and npm, plus Expo Go compatible with SDK 58 or an iOS/Android simulator. Development verification uses Node 26.13.0 and npm 11.20.0. iOS simulator launch requires macOS and Xcode; Android launch requires an Android SDK and a running emulator.

```sh
npm ci
npm start
```

Scan the QR code with compatible Expo Go, or launch a simulator directly:

```sh
npm run ios
npm run android
```

The lockfile fixes dependency resolution. React DOM is installed to satisfy Expo Router's peer dependency and matches React 19.3.0; web is not a target.

## Try the checkout

The default fictional order totals $240 ($220 tickets, $20 mock fees). Device platform comes from `Platform.OS`; wallet readiness is explicitly simulated and defaults to unavailable. Credit card is always available, and Affirm appears above $100.00.

1. Use fake Visa `4242 4242 4242 4242`, a future expiry such as `12/30`, and CVC `123`. Pay stays disabled until all fields are valid. Fake Amex `3782 822463 10005` requires four CID digits.
2. Open **Review environment** below the form to simulate iOS/Android and wallet readiness. Apple Pay requires simulated iOS plus Apple Wallet readiness; Google Pay requires simulated Android plus Google readiness. **Device default** restores the actual platform with simulated wallets unavailable.
3. Select an express method to open its mock authorization sheet. Authorize completes checkout directly; Cancel and Simulate provider error return to a retryable checkout. There is no second checkout Pay tap.
4. Try cancellation and card correction before completing a successful payment. The paid demo order stays paid across reloads. A new-order/reset control is not implemented yet.

The form accepts full-year expiry input such as `12/2030`, displays `12/30`, and keeps the current month valid. Touched fields show errors. Changing Amex to Visa leaves an existing four-digit CID visible but invalid until corrected. Raw card fields live only in React Hook Form; submission revalidates and passes an unrelated synthetic token to the coordinator, then clears the form. **Clear card details** unmounts and recreates the form. Backgrounding alone does not erase it.

Autofill uses iOS `textContentType` and Android `autoComplete` hints on all three fields. These are OS hints, not a guarantee that a password manager offers values. See the [React Native TextInput reference](https://reactnative.dev/docs/textinput.html).

## Reproduce payment recovery

These are headless integration tests, not interactive app controls:

```sh
npm test -- --testNamePattern='confirmation response|cold start GET'
npm test -- --testNamePattern='cold start materializes'
npm test -- --testNamePattern='concurrent|rapid submit|client-only reset'
npm run check
```

The lost-response scenario writes a successful intent and charge, then throws a simulated network timeout. Another test also rejects the immediate GET, constructs fresh backend/coordinator instances over the retained storage, and recovers success by GET. Repeated reconciliation and submission leave the mock charge count at **1**. Concurrent identical confirmations likewise leave **1** charge. Delayed settlement stores its deadline and outcome; advancing the injected clock after recreation lets GET materialize success or decline without a live timer.

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
| `src/bootstrap/createCheckout.ts` | Native storage/UUID injection, startup recovery, and presentation binding |
| `tests/payments.test.ts` | Payment boundary and restart scenarios |
| `tests/checkout.test.ts` | Card edits, validation, eligibility, and provider/coordinator integration |

Zustand mirrors coordinator status and holds display state. It does not decide whether payment succeeded. React Hook Form holds transient card fields and card-validator checks network metadata, Luhn, expiry, and CVC. The coordinator has no React, React Native, or Zustand dependency.

## API and lifecycle contract

| Request | Contract |
| --- | --- |
| `getOrder(orderId)` | Returns authoritative order, active/paid intent, and mock charge count. Recovers after client-only reset. |
| `createIntent(orderId, attemptKey)` | Returns the existing intent for identical reuse; rejects reuse on a different order. Captures order version and integer cents. |
| `confirmIntent(intentId, payload, confirmationKey)` | Accepts only synthetic tokens. Identical reuse returns current status; conflicting reuse fails. Stale amount/version returns `ORDER_CHANGED`, not issuer decline. |
| `getIntent(intentId)` | Returns authoritative status and materializes due settlement. |
| `cancelIntent(intentId)` | Atomically cancels only `requires_action`; returns the unchanged authoritative result if confirmation already progressed. |

Only the coordinator calls payment mutations in application orchestration. Bootstrap seeds the mock order; tests exercise the API directly. The backend allows only one active attempt per order and refuses new keys for paid orders.

The coordinator persists the attempt key before create, then the intent ID, then the confirming phase and stable confirmation key before confirm. No provider token enters client recovery storage. Unknown results trigger status recovery rather than a second confirmation. A busy coordinator joins repeated submit/reconcile calls to the same promise. Startup reconciles before enabling checkout. AppState foreground event wiring remains unimplemented; an unresolved status screen offers **Check status**.

On cold recovery, `requires_action` is atomically cancelled. This assumes mock authorization cannot finish independently outside the app. A late token cannot confirm a cancelled intent. Real redirected payments would require provider/server status reconciliation before applying this policy. Known processing remains processing; terminal results clear client recovery. A local cleanup failure cannot turn verified success into failure.

## Persistence and limitations

Client storage uses `@client/recovery/v1`; backend storage uses `@mock_backend/database/v1`. Client reset removes only the first key. Wiping all app storage also destroys the simulated backend.

Backend mutations share a queue for the same injected storage adapter within one JavaScript runtime. Each mutation writes one JSON snapshot containing orders, intents, and charges. This avoids separate intent/charge writes in the mock, but AsyncStorage is not a production transaction system. There is no cross-process lock or server durability guarantee. Malformed records fail closed; automated repair is outside this milestone.

Tests use an in-memory key/value adapter with the same async interface, retained across fresh service instances. They do not kill a native process or establish AsyncStorage crash consistency. The synthetic token appears in backend records to validate idempotent payload reuse; real payment tokens and card data must not be handled this way.

Production work would require server-side transactions and order constraints, real provider capability checks and authorization, secure token handling, external settlement/webhooks, and recovery against a backend that survives app data loss.

## Verification

Milestone 2: `npm run check` passed lint, TypeScript, and **83 tests across two suites**, including all 37 foundation payment tests. `npx expo export --platform ios --platform android` exported both native bundles. Exact commands and earlier failures are recorded in [AI_USAGE.md](AI_USAGE.md).

Manual iOS observations on iPhone 18 Pro / iOS 27.0: fake Visa/Amex detection, number-separator deletion and correction, full-year expiry normalization, slash deletion and correction, four-digit Amex CID versus three-digit Visa CVC, invalid/valid Pay state, keyboard-visible form positioning, and fake-card checkout reaching authoritative confirmation. Native event races found during these checks were corrected before the Milestone 2 commit.

Native express-sheet interaction, real autofill suggestions, Android runtime, physical devices, and native kill/relaunch payment recovery remain unverified. A clean-clone `npm ci` run has not yet been performed. Service-recreation tests are not native crash-durability evidence.

The three user-supplied Canva screenshots guided the dark background, lime action, order summary, and distinct checking/confirmation states. Decorative images, team logos, and a ticket-delivery flow were omitted. The UI explicitly identifies demo pricing and does not claim real ticket issuance or production payment security.

The Milestone 1 audit reported 14 findings (11 low, 3 high) in the resolved Expo/Jest dependency tree. No forced fix or incompatible override was applied. The candidate explicitly deferred audit remediation as outside assessment scope; it was not pursued in Milestone 2.

See [DECISIONS.md](DECISIONS.md) for choices and consequences, and [AI_USAGE.md](AI_USAGE.md) for actual Codex contributions and candidate approval status.
