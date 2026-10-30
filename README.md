# Gametime Checkout

Fans need to know whether a payment succeeded even when a response disappears or the app restarts. Milestone 1 implements the payment boundary, persistent mock backend, and recovery coordinator for an Expo checkout. The app currently shows a foundation screen. Payment controls, card entry, eligibility, and AppState wiring are reserved for subsequent milestones.

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

## Reproduce payment recovery now

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
| `app/index.tsx`, `app/_layout.tsx` | Native foundation screen and Router entry |
| `src/payments/PaymentCoordinator.ts` | Submission, pre-confirm authorization, uncertainty, recovery, and presentation snapshots |
| `src/payments/PaymentAPI.ts`, `types.ts` | Async request/response contract and domain types |
| `src/mock/MockPaymentAPI.ts` | Idempotency, order protection, settlement, and after-commit faults |
| `src/mock/MockBackendStore.ts` | Serialized writes of one backend snapshot |
| `src/storage/ClientRecoveryStore.ts` | Client-only recovery identity |
| `src/bootstrap/createCheckout.ts` | Native storage/UUID injection and demo order initialization; not wired into the shell yet |
| `tests/payments.test.ts` | Payment boundary and restart scenarios |

Zustand, React Hook Form, and card-validator are installed for Milestone 2. There is no presentation store or card form yet. The coordinator has no React, React Native, or Zustand dependency.

## API and lifecycle contract

| Request | Contract |
| --- | --- |
| `getOrder(orderId)` | Returns authoritative order, active/paid intent, and mock charge count. Recovers after client-only reset. |
| `createIntent(orderId, attemptKey)` | Returns the existing intent for identical reuse; rejects reuse on a different order. Captures order version and integer cents. |
| `confirmIntent(intentId, payload, confirmationKey)` | Accepts only synthetic tokens. Identical reuse returns current status; conflicting reuse fails. Stale amount/version returns `ORDER_CHANGED`, not issuer decline. |
| `getIntent(intentId)` | Returns authoritative status and materializes due settlement. |
| `cancelIntent(intentId)` | Atomically cancels only `requires_action`; returns the unchanged authoritative result if confirmation already progressed. |

Only the coordinator calls payment mutations in application orchestration. Bootstrap seeds the mock order; tests exercise the API directly. The backend allows only one active attempt per order and refuses new keys for paid orders.

The coordinator persists the attempt key before create, then the intent ID, then the confirming phase and stable confirmation key before confirm. No provider token enters client recovery storage. Unknown results trigger status recovery rather than a second confirmation. A busy coordinator joins repeated submit/reconcile calls to the same promise. AppState event wiring remains unimplemented.

On cold recovery, `requires_action` is atomically cancelled. This assumes mock authorization cannot finish independently outside the app. A late token cannot confirm a cancelled intent. Real redirected payments would require provider/server status reconciliation before applying this policy. Known processing remains processing; terminal results clear client recovery. A local cleanup failure cannot turn verified success into failure.

## Persistence and limitations

Client storage uses `@client/recovery/v1`; backend storage uses `@mock_backend/database/v1`. Client reset removes only the first key. Wiping all app storage also destroys the simulated backend.

Backend mutations share a queue for the same injected storage adapter within one JavaScript runtime. Each mutation writes one JSON snapshot containing orders, intents, and charges. This avoids separate intent/charge writes in the mock, but AsyncStorage is not a production transaction system. There is no cross-process lock or server durability guarantee. Malformed records fail closed; automated repair is outside this milestone.

Tests use an in-memory key/value adapter with the same async interface, retained across fresh service instances. They do not kill a native process or establish AsyncStorage crash consistency. The synthetic token appears in backend records to validate idempotent payload reuse; real payment tokens and card data must not be handled this way.

Production work would require server-side transactions and order constraints, real provider capability checks and authorization, secure token handling, external settlement/webhooks, and recovery against a backend that survives app data loss.

## Verification

Milestone 1 results: `npm run check` passed lint, TypeScript, and all 37 tests. `npx expo install --check` reported compatible dependencies. `npx expo export --platform ios --platform android` exported both bundles. The foundation screen was visibly verified in Expo Go on an iPhone 18 Pro simulator running iOS 27.0 after retrying an initial simulator-open timeout.

This is a shell-launch observation, not native payment-recovery validation. No physical-device coverage or Android runtime behavior is claimed. A clean-clone `npm ci` run has not yet been performed. Exact commands, initial failures, and limitations are recorded in [AI_USAGE.md](AI_USAGE.md).

`npm audit --json` reported 14 findings (11 low, 3 high) in the resolved Expo/Jest dependency tree, rooted in transitive `deepmerge` and `zod`. The suggested forced remediation downgrades Expo/Jest across major versions. No forced fix or incompatible override was applied. This remains an unresolved dependency risk.

See [DECISIONS.md](DECISIONS.md) for choices and consequences, and [AI_USAGE.md](AI_USAGE.md) for actual Codex contributions and candidate approval status.
