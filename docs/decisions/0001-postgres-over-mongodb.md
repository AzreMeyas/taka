# 1. Postgres, not MongoDB

Date: 2026-08-31 · Status: accepted

## Context

The app needs to store transactions and categories and aggregate them four
ways (day, week, month, year) plus by category.

## Decision

PostgreSQL, accessed through Drizzle ORM.

## Reasoning

The core query is "sum amounts grouped by category over a date range."
In SQL that is `GROUP BY` with `date_trunc` — one statement, computed inside
the database, indexed. In a document store it is an aggregation pipeline that
is harder to read and harder to index.

The data is genuinely relational: entries belong to domains, domains belong to
users, and an entry must not reference a domain that does not exist. A foreign
key enforces that for free; in Mongo it becomes application code that can be
forgotten.

Postgres also gives `CHECK (amount_minor > 0)` and a case-insensitive unique
index on category names — two whole classes of bug prevented by the schema
rather than by remembering to validate.

## Consequences

Schema changes need migrations. That is a feature: the migration file is a
record of how the shape of the data changed, reviewable in a pull request.
