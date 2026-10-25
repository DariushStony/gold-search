# ADR-0003: Immutable SQLite snapshot per run; SQLite events log

- Status: accepted in part (2026-10-25): one immutable SQLite snapshot per run is implemented; events go to a JSONL file or the log, not SQLite, and the server keeps only the current snapshot
- Date: 2026-10-23
- Deciders: Dariush Hadipour
- Related: data model §2–§3; DM-06; NFR-05, NFR-13

## Context and problem

The server needs a read-only catalogue that changes twice a day, a history across runs, and a small append-only events log. The catalogue is about 10³ products (evidence README, 2026-10-22 run).

## Decision drivers

- Reproducible answers: same request + same snapshot ⇒ same ranking (NFR-05).
- Lowest cost and fewest moving parts.
- Easy to publish from the owner's machine and to roll back.

## Considered options

1. One SQLite file per run (`node:sqlite`, built into Node), loaded into memory; events in a separate SQLite file on persistent disk.
2. Managed Postgres.
3. JSON files.

## Decision and why

Option 1. A file per run is immutable, versioned (`schema_version`, `pipeline_version`) and can be swapped or rolled back atomically. The server keeps the active file and the 2 before it; a request pinned to an older one gets `410 snapshot-expired` (data model §3). Built-in `node:sqlite` adds no native dependency. Postgres adds cost and operations for data that fits in memory; JSON lacks indexes for history queries.

## Consequences

- Good: rollback = point to the previous file; evaluation can pin a snapshot.
- Bad: the events file needs persistent disk on the host (ADR-0004).

## Confirmation

A test loads two snapshots and checks that switching is atomic and that the previous one keeps serving if the new file fails validation.
