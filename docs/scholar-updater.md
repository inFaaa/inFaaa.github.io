# Daily Google Scholar count

The homepage reads `data/scholar-stats.json` from GitHub's raw `main` branch. A
per-user Mac LaunchAgent fetches the public Scholar profile and publishes only
that JSON file. GitHub-hosted requests received HTTP 403, so the GitHub Actions
workflow is manual-only for future diagnostics.

The manual workflow attempts a fresh fetch. If Google returns HTTP 403 or 429,
it accepts the existing JSON only after validating the profile identity, count,
and a timestamp no more than 48 hours old and not in the future. Its warning and
run summary explicitly report **“Fetch blocked; validated cached result”** with
the cached count and original fetch time. It does not rewrite the cache or
claim that a new fetch succeeded. Missing, invalid, or older cached data and
all other fetch/parser errors still fail the workflow. The Mac's daily job
does not enable this fallback: its fetch must succeed before publishing data.

The job runs at **08:23 in the Mac's local time zone** (currently
`America/Los_Angeles`) and when the agent loads at login. The Mac must be awake
and online with this user logged in. A calendar run missed during sleep runs
after wake. A machine that is shut down cannot run the job; login/load provides
a catch-up run. Changing the Mac's time zone also changes the schedule.

## Installed files

- Agent: `~/Library/LaunchAgents/io.github.infaaa.scholar-updater.plist`
- Trusted scripts: `~/Library/Application Support/JinfaScholarUpdater/`
- Dedicated checkout: `~/Library/Application Support/JinfaScholarUpdater/repository/`
- Logs: `~/Library/Application Support/JinfaScholarUpdater/logs/stdout.log` and
  `stderr.log`

The installed scripts are local copies of the reviewed repository scripts.
Fetching `main` never replaces or executes those scripts. The job resets only
its dedicated checkout, commits only `data/scholar-stats.json`, and uses a normal
push. It never uses the development checkout or its staged changes. Launchd
runs at most one instance of this job at a time. Network or parse failures
preserve the last published count. A concurrent update to `main` causes the
push to fail safely; the next run starts from the new `main`.

## Install or update the local copies

From this repository, run:

```sh
python3 scripts/install_scholar_launchd.py
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.github.infaaa.scholar-updater.plist"
```

Bootstrap starts one immediate run. When replacing an existing loaded agent,
disable it first with the command below, then install and bootstrap again.
The job uses the Mac user's existing Git credentials; no tokens are stored in
the plist or these scripts.

## Inspect or run now

```sh
launchctl print "gui/$(id -u)/io.github.infaaa.scholar-updater"
launchctl kickstart "gui/$(id -u)/io.github.infaaa.scholar-updater"
tail -n 40 "$HOME/Library/Application Support/JinfaScholarUpdater/logs/stdout.log"
tail -n 40 "$HOME/Library/Application Support/JinfaScholarUpdater/logs/stderr.log"
```

## Disable

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/io.github.infaaa.scholar-updater.plist"
```

To keep it disabled after the next login, move or remove the plist after
bootout. The installed scripts, logs, and dedicated clone can be retained for
later use. The homepage continues to show the last successful count.
