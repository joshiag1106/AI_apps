# Deploying Kautilya to a VPS

A living runbook, not a dated artifact — steps 5 to 7 are re-run on every deploy, so fix
this file when reality disagrees with it rather than writing a new one.

Assumes a small KVM VPS (1 vCPU / 4 GB is enough) running a current Ubuntu LTS, with root
SSH access. It does not assume a control panel, and you should not install one: cPanel and
CyberPanel bring their own web server and PHP stack and will fight everything below.

**Read `README.md` → "What production needs" first.** It explains what the three required
settings are and how each one fails without it. This runbook covers what the README does
not: the server itself.

**The app never builds on the server.** You build locally and ship the standalone output.
That keeps the VPS doing nothing but serving, ingesting and cron, and it means a failed
build never takes the site down.

---

## 0. What to have in hand

- The server's IP, and root SSH access to it.
- The production domain. Below it is written `example.com` throughout — **do not commit the
  real one to this repository**, which is published publicly.
- A `CRON_SECRET` you have generated (`openssl rand -hex 32`).
- Optionally `ANTHROPIC_API_KEY`, and `SMTP_PASS` for alert mail.

---

## 1. A non-root user and a firewall

Everything after this runs as `kautilya`, never as root.

```bash
ssh root@SERVER_IP
adduser --disabled-password --gecos "" kautilya
install -d -o kautilya -g kautilya -m 700 /home/kautilya/.ssh
cp /root/.ssh/authorized_keys /home/kautilya/.ssh/
chown kautilya:kautilya /home/kautilya/.ssh/authorized_keys
chmod 600 /home/kautilya/.ssh/authorized_keys

ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Port 3000 is deliberately NOT opened. The app binds to loopback and is reachable only
through the proxy in front of it.

Confirm `ssh kautilya@SERVER_IP` works in a second terminal **before** you close the root
session, then consider disabling root login and password auth in `/etc/ssh/sshd_config`
(`PermitRootLogin no`, `PasswordAuthentication no`, then `systemctl restart ssh`).

---

## 2. Node, pinned

Install Node for the `kautilya` user via nvm rather than an apt repository. It works
identically on any Ubuntu release, so the distro version stops mattering, and an OS upgrade
cannot silently move you to a different major version.

```bash
su - kautilya
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
. ~/.nvm/nvm.sh
nvm install 24
node -v            # expect v24.x
command -v node    # NOTE THIS ABSOLUTE PATH — systemd needs it in step 6
```

systemd does not read your shell profile, so the unit file must name Node by absolute path.

---

## 3. Where things live

```bash
sudo install -d -o kautilya -g kautilya /srv/kautilya      # the app, replaced each deploy
sudo install -d -o kautilya -g kautilya /var/lib/kautilya  # the database, NEVER replaced
sudo install -d -o kautilya -g kautilya /var/backups/kautilya
```

The separation is the whole point. `/srv/kautilya` is disposable and overwritten by every
deploy; `/var/lib/kautilya` holds accounts, plans and watchlists and is never touched by a
deploy. Getting this wrong is the single most expensive mistake available here — see
"What will bite you" at the end.

---

## 4. The environment file

```bash
sudo install -o kautilya -g kautilya -m 600 /dev/null /etc/kautilya.env
sudo -u kautilya nano /etc/kautilya.env
```

```ini
KAUTILYA_ORIGIN=https://example.com
KAUTILYA_DB=/var/lib/kautilya/kautilya.db
CRON_SECRET=<the value you generated>
HOSTNAME=127.0.0.1
PORT=3000
NODE_ENV=production

# Optional. See .env.example for what each one does and how it fails.
# ANTHROPIC_API_KEY=
# SMTP_USER=
# SMTP_PASS=
```

Mode 0600 matters: this file holds your cron secret and, later, live Stripe keys.

**Do not set `KAUTILYA_AUTO_INGEST` here.** Step 8 uses cron instead, and nothing in the
app stops the two overlapping.

---

## 5. Build locally, ship the output

Run this on your own machine, from the repo root, not on the server.

```bash
npm run build
cp -r .next/static .next/standalone/.next/static
```

That `cp` is required and easy to forget: the standalone bundle does not include the static
assets, and without it the site renders unstyled. This repo has no `public/` directory, so
there is nothing else to copy.

**Check the bundle before shipping it**, because a build made on macOS can contain things
that cannot run on Linux, and things that should never leave your laptop:

```bash
find .next/standalone -name '*.node'        # native binaries — must be none, or Linux-only
ls .next/standalone/kautilya.db 2>/dev/null # your LOCAL database, if the build traced it in
```

Both have happened. `next build` traced `kautilya.db` into the bundle — the full corpus and
a real user row, email and password hash — and `@img/sharp-darwin-x64` is a macOS binary
that Next includes even though nothing here imports `next/image`.

```bash
rsync -az --delete \
  --exclude='kautilya.db' \
  --exclude='node_modules/@img/*darwin*' \
  --exclude='node_modules/@img/*libvips-darwin*' \
  .next/standalone/ kautilya@SERVER_IP:/srv/kautilya/
```

`--delete` keeps a stale file from a previous release out of the new one, and is safe here
precisely because the database lives outside this directory.

**The `kautilya.db` exclusion is not tidiness.** If that file ships and `KAUTILYA_DB` is
ever unset, the app finds it and quietly serves a frozen corpus and a stale account table —
working perfectly, with month-old data and the wrong users. A silent wrong answer is worse
than a crash.

---

## 6. Run it under systemd

```bash
sudo nano /etc/systemd/system/kautilya.service
```

```ini
[Unit]
Description=Kautilya
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kautilya
WorkingDirectory=/srv/kautilya
EnvironmentFile=/etc/kautilya.env
ExecStart=/home/kautilya/.nvm/versions/node/v24.x.x/bin/node /srv/kautilya/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/var/lib/kautilya

[Install]
WantedBy=multi-user.target
```

Replace `v24.x.x` with the real path from step 2. `ReadWritePaths` is what lets the app
write its database while `ProtectSystem=full` keeps the rest of the filesystem read-only.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kautilya
sudo systemctl status kautilya
curl -I http://127.0.0.1:3000/          # expect 200
```

---

## 7. TLS

Caddy, because it obtains and renews certificates by itself.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

If that repository has no packages for your Ubuntu release yet, take the static binary from
Caddy's GitHub releases instead; nothing else changes.

```bash
sudo nano /etc/caddy/Caddyfile
```

```
example.com, www.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Certificates are issued on the first request, which means **DNS must point here first** —
so do step 8 now, then come back and check.

HTTPS is not optional: session cookies are `secure` in production, so over plain HTTP a
sign-in silently never sticks.

---

## 8. DNS cutover

**Two things will make a correct DNS edit look like it did nothing. Both have happened
here, and both cost an hour.**

**First, disable the host's CDN for this domain.** While Hostinger's CDN is enabled it
manages the records itself and overrides whatever you set: the domain keeps resolving to
their edge, which proxies to the old site. The tell is a root that returns **two or more
rotating IPs** and responses carrying `server: hcdn`. Turn the CDN off before editing
anything.

**Second, delete any stale `AAAA` record.** Let's Encrypt prefers IPv6 when one exists, so
an AAAA still pointing at the old host makes every certificate challenge fail against the
wrong server — while your A record is perfectly correct and the error says nothing about
DNS. The log line to recognise is a challenge failing against an address you do not
recognise. Delete the AAAA, or point it at the VPS's own IPv6 only if you can verify that
address is reachable from outside.

Then, in hPanel, change the **A record only**:

- `@` → `SERVER_IP`
- `www` → usually a `CNAME` to the root, in which case it follows automatically and you
  change nothing. If it is a CNAME to a CDN hostname, delete that first.

**Diagnose with the authoritative nameserver, never a public resolver.** This is the single
query that separates "the edit did not save" from "it is still propagating":

```bash
dig +norecurse @<your-ns> example.com A +noall +answer
```

If the authoritative server still shows the old address, nothing is propagating — the edit
did not take, and waiting will not help.

**Leave the MX records alone.** They point at Hostinger's mail servers, and web traffic
follows A while mail follows MX — so the cutover does not disturb the alerts mailbox. If
your mailbox is bundled with a web-hosting plan, do not cancel that plan until you have
confirmed the mailbox survives on its own.

Propagation is usually minutes. Check with `dig +short example.com` until it returns the
new IP, then reload the site and confirm the padlock.

---

## 9. Cron

```bash
sudo -u kautilya crontab -e
```

```
0 * * * * . /etc/kautilya.env && curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron >/dev/null 2>&1
```

Sourcing the env file keeps the secret out of the crontab, which is world-readable to
anyone who can run `crontab -l` as that user and ends up in backups of `/var/spool`.

Hourly is sensible: every cycle hits 73 live publisher feeds for real. A full cycle takes
about **10 seconds on 1 vCPU**.

**Expect one or two feeds to fail from a datacenter IP that succeed from your laptop.**
Some publishers block hosting ranges outright — two returned `HTTP 403` on the first
production run. The ingest reports them and carries on; it is not a misconfiguration.

---

## 10. Nightly database backup

The VPS provider's weekly snapshots are a floor, not a backup strategy — a week of lost
signups is a week of lost signups.

```bash
sudo apt install -y sqlite3
sudo -u kautilya nano /home/kautilya/backup-db.sh
```

```bash
#!/usr/bin/env bash
cd /home/kautilya          # cron and sudo can start this in a directory the user cannot read
set -euo pipefail
dest="/var/backups/kautilya/kautilya-$(date +%F).db"
sqlite3 /var/lib/kautilya/kautilya.db ".backup '$dest'"
gzip -f "$dest"
find /var/backups/kautilya -name '*.db.gz' -mtime +30 -delete
```

```bash
chmod +x /home/kautilya/backup-db.sh
# add to the same crontab:
# 30 3 * * * /home/kautilya/backup-db.sh
```

**Use `.backup`, never `cp`.** Copying a live SQLite file can capture a torn write and give
you a backup that only fails when you need it. `.backup` takes a consistent snapshot of a
database that is being written to.

Copy these off the server periodically. A backup that lives only on the machine it protects
is not a backup.

---

## 11. Verify, with the probes that have caught real bugs

These are the exact checks that were run against the production build on 2026-09-11, and
each one corresponds to a bug that existed before that date.

```bash
curl -sI https://example.com/ | head -1                    # 200
curl -sI https://example.com/_next/image?url=x&w=1&q=1     # 400 — the open image proxy is closed
curl -s  -o /dev/null -w '%{http_code}\n' https://example.com/api/cron   # 401/403 without the secret
curl -s  -X POST https://example.com/api/analyse   # see the note below before reading this one
curl -s https://example.com/pricing | grep -ci stripe      # 0 — no env var names leak to visitors
```

**The `/api/analyse` probe cannot be read until `ANTHROPIC_API_KEY` is set.** Without a key
the route returns `{"unavailable":"no_key"}` with **HTTP 200**, and that check sits ABOVE the
sign-in check in `app/api/analyse/route.ts` — so a 200 here means "feature off", not "gate
open", and the 401 you actually want to see is unreachable. **Re-run this probe the moment
you add the key**, and confirm it returns 401 signed out: that gate is what stands between an
anonymous visitor and your Anthropic bill. Set the workspace spend limit before the key goes
on the server, not after.

Then in a browser: sign up, confirm the session persists across a reload (this is what
proves HTTPS and the cookie settings are right), and check that a checkout attempt redirects
to your real domain rather than `localhost` — that was the bug `KAUTILYA_ORIGIN` exists to
fix.

---

## Deploying an update

Steps 5 and 6 only:

```bash
rm -rf .next                               # deploy only from a build made from scratch — see below
npm test && npm run build
cp -r .next/static .next/standalone/.next/static
rsync -az --delete \
  --exclude='*.db' --exclude='*.db-*' \
  --exclude='node_modules/@img/*darwin*' \
  --exclude='node_modules/@img/*libvips-darwin*' \
  .next/standalone/ kautilya@SERVER_IP:/srv/kautilya/
ssh root@SERVER_IP 'systemctl restart kautilya'
```

**Exclude `*.db` and `*.db-*`, not one filename, and build from an empty `.next`.** An earlier version
excluded only `kautilya.db`. On a machine whose working folder is synced by iCloud (the Desktop, if
"Desktop & Documents" is on), the sync leaves conflict copies — `kautilya 2.db`, `server 2.js` — and
restores older versions of files, and a `.next` that has lived there for a while is full of them. A
duplicate database inside the bundle would have slipped past the one-name exclusion and put the local
corpus and a real user row's email and password hash on the server. After the transfer, check the server:
`find /srv/kautilya \( -name '*.db*' -o -name '* 2*' -o -name '* 3*' \)` must print nothing.

**Keep the three `--exclude` lines.** An earlier version of this section omitted them, and
copied as written it would ship your local `kautilya.db` — the whole corpus and a real user
row, email and password hash — into the release directory. The build traces that file into
the bundle every time; only the exclusion keeps it off the server. Before the first real
transfer, add `-n --itemize-changes` to the rsync and confirm `kautilya.db` and `darwin` do not
appear in the output.

**The restart runs as root, not as `kautilya`.** `kautilya` is a service user with no sudo
rights, so `ssh kautilya@… 'sudo systemctl restart kautilya'` stops at a password prompt that
nobody can answer. Use root, or whichever account administers the box. Follow it with the
probes in step 11: a build that passes its tests and starts cleanly can still be wrong on the
live host, and the only way to know is to ask the live host.

The database is untouched because it was never in that directory.

---

## What will bite you

- **Do not put the rsync `--exclude` flags in a shell variable.** On macOS the shell is zsh, which does
  not word-split an unquoted `$VAR`, so rsync receives ONE mangled pattern and every exclusion silently
  stops working: the 2026-09-20 dry run planned to send `kautilya.db` (with a real user row) and the
  macOS binaries. Write each `--exclude='…'` out, as the block above does. And always read the dry run:
  `bad=$(grep -c -i -E '\.db|darwin| [23]([. /]|$)' plan.txt || true)` and stop unless it is `0` — the
  `|| true` matters, because `grep -c` exits 1 when it counts zero and silently breaks an `&&` chain.
- **An unset `KAUTILYA_DB` destroys accounts on the next deploy.** The standalone server
  changes directory into its own folder at startup, so the default `./kautilya.db` lands in
  the directory `rsync --delete` replaces. In production that file is not the rebuildable
  cache the local notes call it — it holds accounts, plans and watchlists.
- **Never run `next dev` on this server.** It deletes `.next/standalone` on startup. The
  shared-`.next` trap cuts both ways: a build breaks a running dev server, and starting dev
  wipes a build.
- **Do not run cron and `KAUTILYA_AUTO_INGEST` together.** Nothing serialises them.
- **`npm run ingest` on the server reads only what its shell exports**, not the service's
  environment. Export the same settings first, or its alert mail will link to localhost.
- **Set a spend limit on the Anthropic workspace** before `ANTHROPIC_API_KEY` goes in.
  `/api/analyse` spends real credit per call; it requires a signed-in reader, but nothing
  else caps the bill.
- **Without `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID`, production closes checkout** and says
  subscriptions are not open yet. That is a supported state — launching free is fine — not
  a broken one.
- **A build made on macOS ships a macOS binary and your local database.** Both exclusions in
  step 5 exist because both actually happened on the first deploy.
- **A host CDN silently overrides your DNS edits**, and a stale `AAAA` silently redirects
  certificate validation to the old server. Neither announces itself; both look like
  propagation delay. Query the authoritative nameserver directly — see step 8.
- **Only `systemd` knows where Node is.** It does not read the shell profile, so the unit
  file names the nvm binary by absolute path. An `nvm install` of a new major version moves
  that path and the service will not start until the unit is updated to match.
