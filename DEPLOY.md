# fifa-rivals — Deployment Guide

Site is **100% static** (HTML + JS + JSON, no build, no node runtime).
Follows the projectlabs VPS pattern: Caddy serves directly, **no PM2, no port**.

```
Caddy (:80/:443)
  └── fifa-rivals.projectlabs.id ──→ file_server /var/www/fifa-rivals
```

## 1. DNS

| Name | Type | Value |
|---|---|---|
| `fifa-rivals` | A | `<VPS IP>` (`curl ifconfig.me`) |

## 2. Clone repo

```bash
git clone git@github.com:rans0/fifa-rivals.git /var/www/fifa-rivals
```

## 3. Caddy

```bash
sudo nano /etc/caddy/Caddyfile
```

Add block:

```
fifa-rivals.projectlabs.id {
    root * /var/www/fifa-rivals
    file_server
}
```

```bash
sudo systemctl reload caddy
```

## 4. Deploy / update

From the projectlabs-id repo root:

```bash
bash deploy.sh fifa-rivals
```

Pure static: only `git pull`, no install/build/PM2. Live instantly.

Manual is also enough:

```bash
cd /var/www/fifa-rivals && git pull
```

## Updating match data (daily flow)

1. Open GitHub (phone app is fine) → repo `fifa-rivals` → `data.json` → edit
2. Add a new match / player row
3. Commit
4. SSH into the VPS → `cd /var/www/fifa-rivals && git pull`
5. Refresh `https://fifa-rivals.projectlabs.id`

> ponytail: auto-pull via a GitHub webhook can be added later if the SSH step gets tedious — not needed yet.
