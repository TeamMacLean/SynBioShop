# Budget-holder refresh and availability

Budget holders come from the intranet cost-centres page. Administrators manage
availability at `/budget`; manual add, rename and delete routes have been removed.

Automatic fetching is now opt-in (`budgetHolderRefresh.enabled: false` by default).
For the portable export/import workflow and independent reminders, see
[Portable budget-holder snapshots](README_BUDGET_SNAPSHOTS.md).

## Admin page

- Institute drawers are ordered TSL, JIC, then alphabetically, with Unknown last.
- Empty institutes are hidden; their defaults remain saved for future arrivals.
- Each drawer shows its enabled count, a Displays / Does not display status,
  Enable all, Disable all, and a New budget holders enabled by default checkbox.
  An institute displays at checkout when at least one current holder is enabled.
- Enable all / Disable all sets current availability and the institute's default.
  Mixed selections require confirmation before individual exceptions are replaced.
- Changing the default alone affects future arrivals, not existing holders.
- Individual checkboxes set exceptions. Changes stay local until Save changes;
  Discard restores the page's saved state. Leaving or refreshing warns about
  unsaved changes. Save failures preserve the unsaved form.
- Saves show a counted success toast. Whole-institute operations count institutes;
  changes within them are not also counted as individual changes.
- A stale page receives a conflict instead of overwriting a newer save/refresh.
  Reload and review its selections before retrying.
- Disabled or removed holders cannot be submitted at checkout. Historical orders
  are not modified.

## Checkout

Where payment details are shown, first select an institute, then an enabled holder
from that institute. Only institutes with at least one enabled holder are offered,
regardless of their default for new arrivals. Changing institute clears the holder
selection. Place Order stays disabled until both are selected; the server rechecks
the pair against the current directory on submission.

Legacy local test records can appear under TEST or Unknown before the first
successful refresh. `budget-holders:check` only checks the source; use Refresh now
on `/budget` to import it and remove obsolete memberships.
Duplicate legacy memberships are consolidated during migration or when an older
directory is loaded. If duplicates disagree, disabled takes precedence. Existing
institute defaults and refresh history are preserved; a page opened before repair
must reload before saving.

## Refreshes and reconciliation

When automatic fetching is enabled, the server checks for work immediately after
startup, then hourly. A new directory
is due for its first fetch immediately. Subsequent scheduled attempts are on the
first of each month at 03:00 UTC (03:00 UK winter / 04:00 UK summer), within an hour
of the due time. Due work is caught up after restarts. No administrator needs to
visit a page. Refresh now makes an additional immediate attempt without postponing
a future scheduled attempt.

The request uses `lookupBudget.url` and the credentials described below.
It has a 20-second timeout, a 2 MB response limit, and
rejects redirects/login pages, invalid entries, duplicate usernames and empty lists.
The HTML source is `select[name="BH"] option`, excluding its placeholder. The
institute comes from the last parenthesised suffix, supporting both
`Name (TSL)` and `Name [Department (Group) (TSL)]`; unrecognised suffixes use Unknown.

A successful fetch is reconciled with the latest saved state by username + institute.
Existing availability survives; newcomers inherit their institute's saved default;
new institutes default to disabled. Departures are removed. Institute moves are a
removal and addition, so the destination default applies. Institute defaults persist
even when no holders currently belong to that institute.

A failed fetch leaves the previous list and selections intact. As a guard against
partial or unexpectedly changed source pages, removing more than 50% of the existing
memberships fails the entire refresh. After checking a legitimate large change,
`BUDGET_HOLDER_MAX_REMOVAL_FRACTION=1` allows it; restore the normal limit afterwards.
The same rule applies to large-scale institute moves.

The page shows the last successful refresh (including change counts), the next
scheduled refresh, and the total failed attempts since the last success. The three
most recent failures appear initially; Show more reveals up to ten in total, newest
first. Older attempts remain stored and included in the total. Each displayed
failure includes its time, reason, and automatic/manual trigger plus admin username.
Credentials and raw responses are never included in the log. A subsequent success
starts a new failure history. Interrupted attempts are recovered after the five-minute
refresh lease expires, on the next maintenance check or manual refresh.

## Intranet source and credentials

The removed scraper (commit `4c94a69`, November 2024) used the budget-holder dropdown
`select[name="BH"]`, not the authorised-signatories dropdown. The supplied HTML
attachment uses that same selector and successfully parses into 220 holders across
eight institutes, with no Unknown institutes. It is not included in the test fixtures.

The confirmed source is
`https://intranet.nbi.ac.uk/infoserv/cgi-bin/costcentres/`.
`https://intranet.nbi.ac.uk/cms/3777` is the supplied entry page; whether it contains
the dropdown itself or links/embeds the cost-centres page has not been checked.
The working direct cost-centres URL remains configured.

On 12 November 2026 George's Mac mini VPN check succeeded with fresh Basic
username/password credentials and no browser cookie: 220 holders parsed in 650 ms
(TSL 15, JIC 77, EI 30, NBIP 18, QIB 76, QIBX 2, GSO 1, TSN 1). The command used
environment proxy settings and saved the verified credentials to local configuration.
The old saved authentication had returned HTTP 401. The production VM remains
untested; the Mac result confirms the source and authentication method work there.

### Shared encrypted storage on macOS and Linux

Both development and production use [age](https://github.com/FiloSottile/age) with
the same application code. No Keychain or systemd-specific credential integration
is required. Install `age` and `age-keygen` on each host and make them available to
the account running the app. On macOS:

```sh
brew install age
```

For the Linux VM, use the distro package if available or the official release
binaries matching its architecture, following the upstream installation instructions.
Run credential setup as the same Unix account that will run Node/PM2.

| Item | Default location on either OS |
| --- | --- |
| Encrypted username/password and permitted source origin | `<repo>/secrets/budget-holders.age` (Git-ignored) |
| Private decryption identity | `~/.config/synbioshop/budget-holders.key` (outside the repo) |
| Non-secret settings | `config.json`: URL, username, proxy mode and file paths |

Each host creates its own key. The key directory must be owned by the app account
with permissions 0700; the key must be a regular, non-symlink file with permissions
0600. Setup creates these permissions. It refuses a key inside the repository,
including paths resolving there through a symlink. Do not include the identity
with the application checkout or its backups. Preserve it separately if retaining
the encrypted credentials; otherwise recreate the credentials with a fresh prompt.

To migrate the password already saved in your local `config.json`:

```sh
npm run budget-holders:check -- --migrate
```

This works offline. It creates/reuses the host key, encrypts the existing credential,
verifies a real decryption round trip, writes the encrypted file, then removes the
budget-holder password and old auth/cookie from `config.json`. Other configuration
is preserved. Migration failures retain the original config. No network request,
database update or email is made. Restart the app after success, then verify the
encrypted source without prompting for a password:

```sh
npm run budget-holders:check
```

For a new host or a password change, use the same setup command on either OS:

```sh
npm run budget-holders:check -- --prompt --save
```

Enter the NBI username and password in your terminal; the password is hidden.
This command fetches and validates the BH dropdown before saving encrypted
credentials. It reuses the host identity when changing the password. The password
is sent to age through stdin, never through shell arguments or an intermediate
plaintext credential file. Omit `--save` to check without changing configuration.
The app decrypts credentials into memory only when a refresh needs them, and does
not place them in process environment variables or PM2 configuration. Missing keys,
corrupt files and origin mismatches fail the refresh; they never trigger a fallback
to a saved plaintext password or cookie. Existing holder data remains intact.

Encryption protects a copied/readable config or checkout; it cannot prevent someone
who controls the app's Unix account or has root access from using its key. The
unattended app must have access to that key. Existing plaintext copies in historical
backups are not removed by migration. Production should ideally use an NBI service
account rather than George's personal LDAP credentials, with a separate password
and host key from development.

The DEV MODE banner concerns local web-app sign-in only; this probe still authenticates
against the real intranet using the password entered at the prompt.

Authentication uses HTTPS Basic without a browser cookie. Legacy plaintext settings
remain readable only for hosts which have not yet been migrated. Never pass passwords
as command arguments or paste them into logs/chat.

Useful diagnostic alternatives:

```sh
# Test the supplied entry page explicitly
npm run budget-holders:check -- --prompt --url https://intranet.nbi.ac.uk/cms/3777

# Compare direct VPN access with the environment's HTTP(S) proxy
npm run budget-holders:check -- --prompt --direct
```

Failures distinguish rejected authentication, DNS, connection, timeout and TLS
problems without logging request headers. Redirects are not followed with credentials.
Do not disable certificate verification to resolve a trust error.

| Environment variable | Configuration equivalent | Purpose |
| --- | --- | --- |
| `BUDGET_HOLDER_URL` | `lookupBudget.url` | Page containing the BH dropdown |
| `BUDGET_HOLDER_CREDENTIALS_FILE` | `lookupBudget.credentialsFile` | Encrypted `.age` file; relative paths resolve from the repo |
| `BUDGET_HOLDER_IDENTITY_FILE` | `lookupBudget.identityFile` | Host key outside the repo; use an absolute path |
| `BUDGET_HOLDER_AGE_BIN` | — | Path to `age` if it is not on the app/PM2 PATH |
| `BUDGET_HOLDER_AGE_KEYGEN_BIN` | — | Path to `age-keygen` for setup only |
| `BUDGET_HOLDER_USERNAME` | `lookupBudget.username` | Username hint, or legacy plaintext credentials |
| `BUDGET_HOLDER_PASSWORD` | `lookupBudget.password` | Legacy only; superseded by a configured encrypted file |
| `BUDGET_HOLDER_PROXY_MODE` | `lookupBudget.proxyMode` | `auto` uses environment proxy settings; `direct` bypasses them |
| `BUDGET_HOLDER_AUTHORIZATION` | `lookupBudget.headers.authorization` | Legacy authentication header |
| `BUDGET_HOLDER_COOKIE` | `lookupBudget.headers.cookie` | Legacy browser cookie |

Environment settings override file paths and ordinary config. When an encrypted
file is configured, its username/password take precedence over all plaintext
settings. For production, confirm with NBI whether a
dedicated service account with access to this page is available, then test from the
VM under the same environment as PM2. A successful Mac VPN check does not establish
that the VM's DNS, routing, proxy or account access works. No separate cron is required:
refresh and overdue-email scheduling are both part of the running application.

## Repeatable local demo

The two included HTML snapshots contain fictional holders and match the supplied
dropdown structure. Both also contain a separate signatories dropdown to check that
only BH is parsed. Fixture mode reads these files instead of making a network request;
it is refused in production and is never a fallback after a failed live request.

With local RethinkDB running:

1. Run `npm run dev:budget:before`, sign in as a local admin and visit `/budget`.
2. Click Refresh now to load the eight fictional holders. Set TSL's arrival default
   to enabled, leave one TSL holder disabled, and enable an individual JIC holder.
   Save the changes.
3. Stop the app and run `npm run dev:budget:after`, using the same database. Click
   Refresh now again, then inspect the choices and change counts.
4. Refresh the same snapshot again: the change counts should all be zero. Switch
   back to `dev:budget:before` to exercise removals and the reverse institute move.

Both commands use the separate `synbioshop_budget_demo` database, capture mail in
memory, and disable automatic refreshes. The page displays a fixture banner.
`DB_HOST` and `DB_PORT` can be set if RethinkDB is not on the default local port.
The demo deliberately starts with an empty directory; first-discovered institutes
default disabled. Do not seed it using the legacy holder scripts.

| Change from before to after | Expected result |
| --- | --- |
| Existing holders | Saved checkboxes preserved, including individual exceptions |
| Existing TSL holder renamed | Description updated; saved checkbox preserved |
| New TSL and JIC holders | Each inherits the destination institute's default |
| Holder moves from JIC to TSL | Old membership removed; new membership inherits TSL's default |
| JIC holder departs | Removed from the current list |
| QIBX appears for the first time | New institute and holder start disabled |
| Refresh summary | 4 added, 2 removed, 1 updated; 10 holders in total |

The same snapshots can be parsed without a database or running server:

```sh
NODE_ENV=test BUDGET_HOLDER_FIXTURE=before npm run budget-holders:check
NODE_ENV=test BUDGET_HOLDER_FIXTURE=after npm run budget-holders:check
```

## Overdue emails

When reminders are enabled, after three calendar months without fresh source data
the hourly check emails `deeks@nbi.ac.uk`, even if no fetch attempts were made.
Before the first success, the
clock starts when the directory is first initialised. Reminders follow once per
calendar month while the source remains overdue. A fresh fetch/import resets this
cycle; a replayed snapshot does not. Snapshot age is measured from its source fetch
date, not its import date.
Failed email delivery is shown on the page and retried after 24 hours.
The existing email transport is reused. Tests capture email in memory.

## Deployment and storage

- Automatic refresh defaults to off and must be enabled explicitly.
  `BUDGET_HOLDER_REFRESH_ENABLED=true|false` overrides the config file; the test
  environment always prevents starting the scheduler. Confirm this setting on the
  production PM2 process. The server must be running for checks and emails to occur.
- Optional `config.json` settings: `budgetHolderRefresh.enabled`,
  `budgetHolderRefresh.notificationsEnabled` and
  `budgetHolderRefresh.maxRemovalFraction`. Environment variables take precedence.
  `BUDGET_HOLDER_NOTIFICATIONS_ENABLED` controls reminders independently; when
  unspecified, reminders follow the automatic-fetch setting.
- Cheerio is declared directly, using the version already in `yarn.lock`.
- On first access, the existing `BudgetHolder` table is copied to one `current`
  document in `BudgetHolderDirectory`. Existing holders start enabled; existing
  institute defaults reflect their initial availability. Unknown source institutes
  default disabled when first discovered later.
- The new directory becomes authoritative. Its holders, defaults, schedule and
  refresh history are stored together so list replacement and selection saves are
  atomic. Optimistic version checks protect concurrent saves. A persisted lease
  prevents duplicate refreshes/emails across workers and restarts.
- The legacy table is retained unchanged for rollback/reference. The old seed and
  cleanup scripts affect only that table; do not use them to manage an initialised
  directory. Back up `BudgetHolderDirectory` with the rest of the application DB.
- No live intranet fetch or SMTP delivery is needed during installation or testing.

## Verification

```sh
# Parsing, grouping and calendar rules; no database or network needed
node_modules/.bin/mocha --no-config --exit test/unit/budgetHolder*.test.js

# Database, route, refresh and notification checks (isolated test database)
node_modules/.bin/mocha --no-config --require test/helpers/setup.js --timeout 20000 --exit test/integration/budgetHolder.test.js test/integration/budgetHolders.test.js

# Complete regression suite, including the browser interaction checks
npm test

# Browser interactions only, using the project-local headless shell
npm run test:budget:browser:install  # Once per Playwright version
npm run test:budget:browser
```

The integration suite needs local RethinkDB. Browser tests need Playwright Chromium
(or `PLAYWRIGHT_CHANNEL=chrome`). The test bootstrap pins the test database and
in-memory mail transport. Source requests are stubbed or use the fixed HTML snapshots;
no live intranet request is made by these tests. Tests cover repeated fixture changes,
preserving exceptions and defaults, institute moves, stale saves, overlapping
refreshes, failed imports, scheduling, three-month escalation and monthly reminders.
The browser suite covers drawer controls, confirmations, save/discard, toast counts,
and retaining edits after a conflict. The real authenticated fetch has passed on
the Mac over VPN; it still needs checking from the production VM using the diagnostic
command under the same environment as PM2.

The dedicated budget browser command uses local RethinkDB and the disposable
`synbioshop_budget_browser_test` database, and starts its own web server. The
headless browser is installed locally, but macOS sandbox permissions blocked its
launch in the restricted agent session on 13 November 2026. Run these tests
from your normal Terminal. George did so on the same date: all seven passed in
11 seconds against local RethinkDB. Browser interaction verification is complete
for these cases. See `test/README.md` for the launch diagnosis and recorded result.

The encryption tests use real age binaries and disposable credentials/keys under
the system temporary directory. Install age to run them; they are explicitly
skipped when the tools are missing. They cover migration, password rotation,
permission checks, keys outside the repo, incorrect keys, damaged ciphertext,
source-origin binding and preserving the original config after a setup failure.
