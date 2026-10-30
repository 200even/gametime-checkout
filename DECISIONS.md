# Decisions

## 2026-10-30: Coordinator owns payment recovery

The candidate approved the proposed architecture and Milestone 1 implementation in this session. Expo/React Native/TypeScript and Router provide the app shell; a plain TypeScript `PaymentCoordinator` owns payment transitions and recovery. Zustand is reserved for presentation state, and React Hook Form/card-validator for transient card input in Milestone 2.

Keeping recovery in screens would tie charge decisions to rendering and focus. A separate state framework would add scope without improving this small mock contract. The coordinator instead exposes typed snapshots and subscriptions and accepts an injected API, recovery store, and key generator. Native lifecycle wiring still needs to be implemented.

## 2026-10-30: In-process mock with separate storage

The candidate approved an async typed in-process API and explicitly required separate client/backend namespaces. `@client/recovery/v1` holds recovery identity; `@mock_backend/database/v1` holds authoritative mock records. An HTTP server was omitted to keep the assessment runnable within the timebox.

Codex implemented a shared single-runtime queue and one backend JSON snapshot per mutation. This keeps charge and intent updates together under the mock contract. It does not supply cross-process locking, transactional AsyncStorage, or independence from app data deletion. Implementation review is pending.

## 2026-10-30: Unknown results reconcile; paid orders reject new attempts

The candidate explicitly approved durable identity, concurrency tests, and after-commit timeout injection. Attempt identity is saved before create; confirmation identity is saved before confirm. Backend idempotency protects repeated requests, and an order-level active/paid guard protects different keys.

The candidate approved authoritative order lookup to recover after client-only storage reset. A blind confirmation retry would leave an ambiguous result unresolved. GET and atomic pre-confirm cancellation let the mock establish a safe next action without issuing another charge. Timestamp settlement survives service recreation without retaining timers.

## 2026-10-30: Cancellation has a narrow mock boundary

The candidate explicitly approved distinguishing pre-confirm cancellation from post-confirm uncertainty. Codex implemented `cancelIntent` under the backend write queue: only `requires_action` becomes cancelled; processing or terminal results remain authoritative.

Cold recovery cancels incomplete mock authorization because the fake provider cannot finish independently after process death. Production Affirm redirects and wallet flows require external status reconciliation. This is an explicit mock assumption, not a claim about real provider behavior. Implementation review is pending.

## 2026-10-30: Dependency and static-analysis scope

The candidate approved the dependency set, omitting direct Zod/resolver dependencies, and the static-analysis plan. Codex selected Expo SDK 58 using published npm metadata and Expo's compatibility resolver. React DOM 19.3.0 is an Expo Router peer, not a new web target.

ESLint import restrictions enforce direct layer boundaries; typed promise rules require promise handling. Tests and bootstrap have intentional wiring access. Import rules do not detect arbitrary re-export paths or prove idempotency. No custom lint rules, suppressions, or unsafe type casts were added. Expo/Jest's transitive audit findings remain unresolved; forcing major downgrades was not attempted.
