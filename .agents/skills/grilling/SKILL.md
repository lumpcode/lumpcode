---
name: grilling
description: Grill the user relentlessly about a plan or design until interfaces are precise. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases.
---

# Grilling

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase instead.

Do not enact the plan until I confirm we have reached a shared understanding.

## Precise interfaces

When possible, drive toward the most precise interfaces during grilling and in the final shared understanding. Prefer concrete artifacts over prose:

- TypeScript types and function signatures
- Zod schemas
- JSON schemas
- GraphQL schemas
- Other formal contracts when they fit the surface (OpenAPI, protobuf, etc.)

Use these to pin down inputs, outputs, invariants, and boundaries. If a decision affects a contract, sketch or refine the relevant artifact in the question or recommendation — not only after agreement.

When summarizing the final shared understanding, include the agreed interfaces (or deltas from existing ones) alongside behavioral decisions.
