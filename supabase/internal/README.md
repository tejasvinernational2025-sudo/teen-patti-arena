# Internal backend work — not deployed

`core-turns.sql` is a candidate replacement for the captured game action RPC.
It is deliberately outside `supabase/migrations`: nothing here is automatically
applied to a hosted database. Do not run it on the live project.

Run `npm ci` then `npm test`. Tests create an in-memory PostgreSQL database with
PGlite and synthetic tables/users; no Supabase URL or credentials are used.
The legacy settlement fixture is retained solely to verify EXECUTE restrictions.

Covered: null actions/turns, 321 action isolation, expired/paused turns, pending
Side Show, Seen timer abuse, insufficient funds, normal chaal/turn advancement,
and denial of direct settlement calls for guest/authenticated roles.

Not yet verified: the full production schema and triggers, all variants and tie
payouts, multi-connection concurrency/deadlocks, Realtime delivery, reconnect,
or two-device gameplay. PGlite tests do not replace these checks. Direct profile
wallet-update permissions also remain a separate unresolved backend issue.

Before deployment: recompare the current server function, run full-schema
integration tests in an isolated environment, review security advisors, generate
a migration with the Supabase CLI, and obtain explicit live-change approval.
