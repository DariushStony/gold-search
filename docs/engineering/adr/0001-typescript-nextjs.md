# ADR-0001: TypeScript end to end, Next.js for the web app

- Status: proposed
- Date: 2026-10-23
- Deciders: Dariush Hadipour (owner, delegated to the builder in D-08)
- Related: D-08; TDD §5 (K-01–K-08)

## Context and problem

The collector, pipeline, search core, API, UI and evaluation harness must share the same parsing, labelling and price math, so a number computed in evaluation is the number shown on screen.

## Decision drivers

- One implementation of each business rule (NFR-12).
- Persian RTL UI with server routes for the API and LLM key.
- Small dependency surface; one person maintains it.

## Considered options

1. TypeScript everywhere; Next.js (App Router) for UI + API routes.
2. Python pipeline and evaluation + TypeScript UI.
3. TypeScript with a separate API server (Fastify) and a static UI.

## Decision and why

Option 1. One language lets the pipeline, API and harness import the same search-core module. Next.js gives server routes (keeps the LLM key server-side) and RTL rendering in one deployable. Node runs TypeScript directly, so scripts and tests need no build step.

## Consequences

- Good: no logic duplicated across languages; the eval harness tests production code.
- Bad: data-science tooling is thinner than Python's; acceptable because the statistics needed are small (Wilson, bootstrap).

## Confirmation

The search-core package has no framework imports, and the evaluation harness imports it directly (checked in CI).
