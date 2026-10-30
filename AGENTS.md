# Gametime Checkout: Codex Working Agreement

## Context
This repository is a Staff Mobile Engineer coding assessment for Gametime. Reviewers need to run the application, understand important decisions, and reproduce critical payment scenarios quickly. The assignment and observed implementation are authoritative; do not invent behavior, tests, or candidate decisions.

## How to write
- Write in a direct, concise, human voice. Explain intent before mechanics.
- Connect architecture to the checkout experience and to mobile operating conditions, not generic engineering ideals.
- Prefer concrete nouns and verbs. Name the actual components, methods, states, and failure windows.
- Make tradeoffs explicit. State what the implementation does, what it deliberately doesn't do, and why that boundary is acceptable for this timebox.
- Be confident where evidence supports a claim and candid where it does not. Do not overstate scalability, safety, device support, coverage, or test results.
- Favor short paragraphs and useful headings. Avoid filler, sales language, buzzwords, self-congratulation, and ceremonial explanations.
- Do not use em dashes. Do not use phrases such as "robust and scalable," "seamless experience," "leverages," "enterprise-grade," or "comprehensive solution" unless the repository actually proves the claim and the wording is necessary.
- Write for a technical reviewer who can read the code. Explain non-obvious reasoning, not syntax the code already makes clear.
- Do not fabricate a personal anecdote, decision, validation step, or claim of authorship. Candidate voice is not a license to misrepresent who performed the work.

## Documentation's job
Treat README.md as the reviewer's entry point, not a generic project overview. The top should contain:
1. One-paragraph statement of the checkout problem and what was implemented.
2. Fastest path to launch it, with exact commands and prerequisites.
3. How to reproduce the key behaviors, especially confirm committed but response lost, cold-start recovery, and single-charge protection.
4. Where to look in the code: UI, Zustand presentation state, PaymentCoordinator, typed PaymentAPI, mock backend, persistence, and tests.
5. What is intentionally mocked, what is incomplete, and what would change in production.
6. Actual tests run and observed results, including platform coverage and gaps.
7. Links to DECISIONS.md and AI_USAGE.md.

DECISIONS.md should capture meaningful decisions only: context, choice, alternatives, reasons, consequences, and explicit candidate approval if confirmed. No padded ADRs or retroactive narratives.

AI_USAGE.md must be updated automatically after every Codex milestone. Record Codex's actual contributions, commands actually run, test results actually observed, questions it asked, and candidate review only when explicitly confirmed. Never invent validation or human ownership. Keep a concise, factual log rather than a defensive essay.

## Code comments and tests
- Prefer meaningful names and small interfaces over explanatory comments.
- Write a comment only where the reason is not obvious: for instance, persisting the attempt key *before* createIntent, or treating a timeout as unknown instead of failed.
- Test names should communicate behaviors, not internals. Example: "recovers a committed payment after the confirmation response is lost without charging twice."
- Use integer cents for amounts; name mock assumptions. Never imply local AsyncStorage is a production transactional backend.

## Implementation workflow
- Before each milestone, propose a minimal file plan, invariants, test scenarios, and tradeoffs. Wait for candidate approval before implementation.
- After each milestone, report the changed files, verified behavior, exact tests and commands run, unresolved risks, and focused reviewer questions.
- Ask for approval before new dependencies or scope expansion.
- Preserve the chosen architecture: Expo/React Native/TypeScript, Zustand for presentation state, plain TypeScript PaymentCoordinator, typed in-process mock PaymentAPI with separate mock-backend and client storage, React Hook Form and card-validator, deterministic reconciliation.
- No real payment SDK, remote backend, or extra state framework without a deliberate change to scope.

## Example of the expected voice
Avoid: "The application leverages a robust state management solution to deliver a seamless and resilient checkout experience."
Prefer: "Zustand keeps the checkout screens in sync. The coordinator owns payment recovery because a screen losing focus should not decide whether a charge succeeded."

Avoid: "Extensive testing ensures that duplicate payments can never happen."
Prefer: "The lost-response test confirms that repeating reconciliation does not create a second mock charge. This is a test of the local contract, not a guarantee about a production payment provider."

## Static-analysis planning
Include a minimal static-analysis plan in the foundation milestone proposal. Inspect existing ESLint and TypeScript configuration and reuse installed tooling. Ask before adding dependencies.
Prioritize checks that keep PaymentCoordinator independent of React, React Native, and Zustand; prevent checkout UI and presentation state from calling payment mutation APIs directly; preserve separate mock-backend and client recovery storage; and require explicit promise handling in payment and persistence paths.
Use existing rules and file-specific import restrictions where sufficient. Propose custom rules only for meaningful invariants that cannot be expressed simply. Explain limitations and valid exceptions. Do not introduce unrelated styling conventions or dependencies. Present proposed changes with the milestone plan and wait for approval.

## Milestone verification
After each approved implementation milestone, run applicable lint, typecheck, and behavioral tests. Inspect diagnostics and fix underlying causes. Do not weaken rules, add suppressions, introduce type escapes, or change expected behavior merely to pass checks. Explain necessary exceptions and request approval.
Prefer deriving values during render and handling user actions in event handlers. Use effects for synchronization with external systems. Keep payment orchestration and recovery decisions in PaymentCoordinator. Explain non-obvious lifecycle effects, including cleanup and repeated execution; do not require boilerplate comments before every effect.
Lint success does not prove payment correctness. Verify confirmation committed with its response lost, cold-start recovery with an unresolved attempt, and repeated submission or reconciliation without another mock charge.
Update AI_USAGE.md with actual changes, commands, observed results, and unresolved issues. Record candidate review only when explicitly confirmed.

## Final verification prompt
Review the implementation against the assignment and approved architecture. Check payment API calls outside the coordinator, mixed client/backend persistence, unnecessary effects, unhandled promises, suppressions, and type escapes.
Run available checks and distinguish static-analysis evidence, automated behavioral tests, and manual device verification.
Demonstrate lost-confirmation-response and cold-start recovery. Report the observed mock charge count and remaining gaps. Do not infer production guarantees from the mock.
Ensure README.md has exact launch and reproduction instructions. Update DECISIONS.md and AI_USAGE.md factually, without inventing candidate decisions or validation.
