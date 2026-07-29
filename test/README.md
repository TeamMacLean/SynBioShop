# Test suite

## Running

```bash
npm test
```

```bash
npm run test:coverage
```

`npm run test:unit` and `npm run test:integration` run one half. All of them read
`.mocharc.json`, so the spec glob, timeout and root hooks stay consistent — pass
extra mocha flags on the command line rather than editing the scripts.

## Requirements

A local RethinkDB on `localhost:28015`. Nothing else: the suite never opens an
SMTP, LDAP or HTTP connection to anything external.

## Database isolation

**The suite never touches the live database.** `test/helpers/setup.js` pins
`DB_NAME` to `synbioshop_test` before any application module loads, which
matters because `lib/thinky.js` reads the database name once at require time.

Two interlocks back that up, both in `setup.js` and `testDb.js`:

- the run aborts if the database name is one of the known live names;
- the run aborts if the database name does not contain `test`.

This is load-bearing. The suite truncates every table between specs, and an
earlier version of these tests ran against the production database — one spec
deleted every order belonging to a real admin account, and each order-creating
test permanently consumed a customer-facing janCode.

## Helpers

`test/helpers/testDb.js`

- `reset()` — truncate every table and reseed. The usual `beforeEach`.
- `seed()` / `truncate()` — the halves, when a spec needs them separately.
- `IDS` — fixed fixture IDs (`type1`, `category`, `db`, `subject`, `document`),
  so specs reference records directly instead of indexing into live data.
- `r` — the raw rethinkdbdash handle, for asserting on stored rows.

`test/helpers/agent.js`

- `signedInAgent(username)` — a cookie-persisting supertest agent, already
  signed in. Defaults to the admin `deeks`; pass `testuser` for a non-admin.
- `anonymousAgent()` — same, without a session.
- `req()` — a bare supertest request with no default headers, for specs that
  need full control (for example, probing CSRF).
- `csrfToken(agent)` — the token issued to that agent's session.

Both agent helpers set an `Origin` header, because CSRF protection rejects
state-changing requests that carry neither a trusted origin nor a token. That
mirrors what a browser sends; a spec that omits it is testing a request no
browser makes.

## Side effects

Email is captured, not sent. `MAIL_TRANSPORT=memory` swaps nodemailer for its
in-memory JSON transport, and `lib/email.js` records each message in
`email.outbox` (`clearOutbox()` to reset). Note that dev mode is *not* enough on
its own — it logs "DEV MODE: Sending email to test address" and then genuinely
delivers over SMTP.

Generated CSVs and uploads go to `test/.tmp/`, not the Brady printer mount.

## Conventions

Assert one outcome. A status list broad enough to accept both success and
rejection — `expect([200, 302, 401, 403]).to.include(res.status)` — passes on a
total authorization bypass, which is how several routes stayed unprotected.

Import the code under test. Several older specs re-implemented the function
they were checking and asserted against the copy, so deleting the real
implementation would not have failed anything.

Use the fixtures. Names like `pTEST001` cannot match incidentally; asserting on
whatever row happened to be first in the database can pass for the wrong reason.

`forbidOnly` is set in `.mocharc.json`, so a stray `.only` fails the run rather
than silently reducing the suite to one test.

## Layout

```
test/
  helpers/     setup.js (root hooks, env pinning), testDb.js, agent.js
  unit/        security, pricingService, thinky, ldap, asyncHandler, utils
  integration/ app, auth, authorization, csrf, cart, orders, content,
               uploads, sockets, errorHandling, badge, premadeExport,
               budgetHolder, orderPlacement, rearrange
```

`authorization.test.js` walks the route table and asserts what anonymous users,
non-admins and admins can each reach. Add a route, add it there.
