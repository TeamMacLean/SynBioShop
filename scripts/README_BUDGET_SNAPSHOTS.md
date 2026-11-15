# Portable budget-holder snapshots

Use this when a VPN-connected development machine can fetch the intranet list but
the production VM cannot. Production imports need database access only: no VPN,
LDAP credentials, age identity, intranet request or email delivery is involved.
Live intranet refresh remains available independently.

## First deployment

Before restarting production, merge these fields into root `config.json`:

```json
"budgetHolderRefresh": {
  "enabled": false,
  "notificationsEnabled": false
}
```

`BUDGET_HOLDER_REFRESH_ENABLED` and `BUDGET_HOLDER_NOTIFICATIONS_ENABLED` override
the file. Ensure PM2 does not override either value to true during initial setup.
Automatic fetching now defaults to off if no explicit setting exists. Existing
explicit true settings still take precedence. No extra cron is required.

1. Preserve any uncommitted VM repairs before pulling. In particular, Warp's proxy
   repair changed `lib/budgetHolderSource.js`, `package.json`,
   `test/unit/budgetHolderSource.test.js` and `scripts/README_BUDGET_HOLDERS.md`.
   Stash or commit those specific changes, pull, then restore/reconcile them.
   Never discard them with a reset or include runtime secrets in a commit.
2. Transfer the JSON separately from Git. The export defaults to ignored
   `tmp/budget-holders-latest.json`; it contains intranet directory data and should
   not be published as a repository asset. From the development project directory:

   ```sh
   scp tmp/budget-holders-latest.json deeks@v1335.nbi.ac.uk:budget-holders-latest.json
   ```

3. From the production project directory, preview the destination database and
   reconciliation counts, then apply:

   ```sh
   npm run budget-holders:import -- "$HOME/budget-holders-latest.json"
   npm run budget-holders:import -- "$HOME/budget-holders-latest.json" --apply
   ```

   No package installation is needed solely for these commands; they use existing
   dependencies. The default command is read-only, including on a first deployment
   before directory migration. Apply creates an owner-only JSON backup under
   `tmp/budget-holders-before-import-*.json` and then imports atomically. If the
   saved directory changes after preview/backup, it refuses the write; rerun the
   command. Keep the backup until you have checked the result.

4. Restart the web application with automatic fetching still disabled:

   ```sh
   pm2 restart synbio --update-env
   ```

   Check `/budget`: the last refresh should show an imported snapshot, its source
   fetch timestamp, operator and counts. Set production availability/defaults once
   using the existing drawers. Development's choices are never imported.

5. After checking the page, enable reminders if wanted by setting
   `notificationsEnabled` to true and restarting. Leave `enabled` false to retain
   manual-only fetching. Reminders start after **three calendar months** without
   fresh source data, then monthly; SMTP delivery failures retry after 24 hours.
   No failed fetch is required in this mode. The source fetch date determines age,
   not the date an old file happens to be imported.

If direct access is restored, first verify it without database changes:

```sh
npm run budget-holders:check -- --prompt --direct --save
npm run budget-holders:check
```

Then Refresh now can fetch live. Monthly automatic fetching is a separate opt-in:
set `enabled` to true only when ready; due work can run immediately on restart.

## Exporting a new snapshot

For future updates, on development with intranet/VPN access and saved encrypted
credentials:

```sh
npm run budget-holders:export
```

This fetches and validates the real BH dropdown, stamps the actual fetch time and
writes `tmp/budget-holders-latest.json` with permissions 0600. An unsuccessful fetch
does not overwrite the previous file. No database access or emails are involved.
Use `--out FILE.json` to choose a different location.

For the initial snapshot only, reuse a known successful real fetch already saved
in the development database, without reconnecting to the VPN:

```sh
npm run budget-holders:export -- --from-db
```

This includes all saved holders, including disabled ones, and preserves the last
source fetch time. It refuses a database without a successful refresh or one marked
as fixture data. Older app versions did not mark fixture provenance: only use this
option with a database you know was populated from the real intranet.

## Import rules

- Versioned JSON contains source URL, original fetch timestamp, checksum and raw
  username/description/institute fields. No availability flags, defaults or secrets.
- The checksum catches accidental corruption; it is not a digital signature.
  Transfer the file from a trusted source using your usual SSH connection.
- Existing selections/defaults are preserved. Arrivals inherit the destination
  institute's saved default; new institutes start disabled. Moves count as removal
  plus addition. Empty institute policies are retained.
- Malformed files, unknown source/version, future timestamps, duplicate usernames,
  invalid institute suffixes and availability fields are rejected. The normal 50%
  removal guard also applies. Check a legitimate large change before temporarily
  using `BUDGET_HOLDER_MAX_REMOVAL_FRACTION=1` for that import.
- Older snapshots cannot replace a more recent successful fetch. Re-importing the
  same fetch is a no-op, preserving selections, timestamps, failures and reminders.
  The same timestamp with different data is rejected.
- No import happens at application startup. Import only runs with the explicit
  CLI `--apply`. Invalid files and failed previews do not write to the database;
  failures during an attempted service import are recorded with a sanitised reason.

Tests cover offline validation, reconciliation, replay, old/future files, races,
reminders without automatic fetching, and the real CLI against a disposable DB.
