# 2. Money stored as integer poisha

Date: 2026-08-31 · Status: accepted

## Context

Amounts need a storage type.

## Decision

`bigint` holding poisha (1/100 taka). ৳40.50 is stored as `4050`.

## Reasoning

Binary floating point cannot represent 0.1 exactly. `0.1 + 0.2` is
`0.30000000000000004` in every IEEE-754 language, JavaScript included.
Summing thousands of float amounts accumulates error, and a ledger whose
totals drift is not a ledger.

`bigint` rather than `integer` because `integer` caps near ৳21 million, which
is fine now and embarrassing later. The extra bytes cost nothing.

## Consequences

Every display converts. All conversion lives in `lib/money.ts`, and no other
file is permitted to divide by 100.
