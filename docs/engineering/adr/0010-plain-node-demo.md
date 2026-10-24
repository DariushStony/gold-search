# ADR-0010: Plain Node HTTP server for the first demo

- Status: accepted
- Date: 2026-10-24
- Deciders: Dariush Hadipour
- Related: D-34; ADR-0001; API contract v0.4; TDD K-04

## Context and problem

The owner cut the goal to a first working demo (D-34). ADR-0001 chose Next.js for the web app. A framework, build step and React components are the slowest part left, and nothing in the demo needs them.

## Decision drivers

- A working demo soon, with the least new code.
- Keep the frozen API contract, so the later app can reuse the same endpoints.

## Considered options

1. Next.js app, as in ADR-0001.
2. One Node HTTP server (`node:http`) serving one HTML page and the API endpoints, calling the same search core.

## Decision and why

Option 2. It runs with `npm run demo` and no build. It serves the API contract's endpoints, so a Next.js front end can replace the page later without changing the core or the API. ADR-0001 still holds for the full product.

## Consequences

- Good: one file for the server, one for the page; the search core and its 120 tests are unchanged.
- Bad: no server-side rendering or component reuse; the page is plain JavaScript.

## Confirmation

`test/server/app.test.ts` runs parse, search and product detail against a built snapshot.
