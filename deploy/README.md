# Hosting Project Duet

Use one Linux server with Docker Compose, a domain pointing at it, and ports 80/443 open. The site is not deployed by downloading this archive.

From this directory:

```sh
export DUET_DOMAIN=duet.your-domain.example
docker compose up -d --build
```

Caddy obtains HTTPS certificates. Gunicorn serves the application; SQLite lives in the persistent `duet-data` volume. A separate `duet-backups` volume holds up to thirty verified daily snapshots. Failed snapshots retry after one minute. Check `docker compose logs backup` for errors. The passphrase is 229; configure a different server-side phrase if desired. Do not use `docker compose down -v`: it deletes the data volumes.

To migrate existing local notes, stop the local server and create a snapshot with `backup.py`. Start the stack once, stop the `duet` and `backup` services, copy the snapshot into the backup volume through a temporary container, and run the restore command below before restarting. Never replace a live SQLite file.

## Backup and restore

Force a snapshot:

```sh
docker compose exec backup python backup.py --directory /backups
```

Copy snapshots off the host regularly (both Docker volumes are still on the same machine):

```sh
docker compose cp backup:/backups ./exported-backups
```

Restore a selected snapshot:

```sh
docker compose stop duet backup
docker compose run --rm backup python backup.py --restore /backups/duet-TIMESTAMP.sqlite3 --server-stopped
docker compose up -d duet backup
```

For upgrades, take a backup first, then run `docker compose up -d --build`. Keep the same project directory/name so Compose reuses the volumes. The bundled stack configuration is validated; its application server and backup logic were tested locally. HTTPS certificate issuance and Docker networking need verification on the actual host.

## First deployment checklist

Install Docker Engine with the Compose plugin on the host. Upload and extract `project-duet.zip`. Set the domain's A record to the host IPv4 address; publish an AAAA record only if IPv6 is configured. Allow inbound TCP 80/443. From `project-duet/deploy`, persist the domain for future shell sessions:

```sh
printf 'DUET_DOMAIN=duet.yourdomain.com\n' > .env
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 duet caddy backup
curl -fsS https://duet.yourdomain.com/healthz
```

Open the HTTPS URL, enter 229, and test one note from each identity. Check the other browser receives it. Avoid additional application replicas: this configuration uses one local SQLite volume. Static-only hosting cannot run this backend.

## Import a local database

Create a consistent snapshot with `python3 backup.py --directory backups` in the local project. Transfer the selected snapshot to the server's `deploy/import.sqlite3`, then:

```sh
docker compose stop duet backup
docker compose run --rm -v "$PWD/import.sqlite3:/tmp/import.sqlite3:ro" backup python backup.py --restore /tmp/import.sqlite3 --server-stopped
docker compose up -d duet backup
```

The snapshot file must be readable by container user 10001. This restores the snapshot, rather than merging it with existing server notes; the old database is retained by the restore tool. Imported sessions are included. Keep a current server backup first.

## Updates, speed and recovery

The posting browser displays a note as soon as storage confirms it. Other visible browsers poll incrementally every five seconds; this is near-realtime polling, not server push. SQLite data stays on the host disk, avoiding a separate database network round trip. Actual latency depends on the host and network. Server-sent events would be a separate enhancement; no realtime service is required by this release.

After replacing source files, take a backup and run `docker compose up -d --build`. Volumes survive container replacement. Never delete volumes or use `down -v`. Backups on the same host do not protect against host loss: export them and copy them elsewhere. Restore instructions above also apply on a replacement host after importing the snapshot. Verify the chosen snapshot contains the expected notes before resuming use.

If entry fails, inspect `docker compose logs duet caddy`, confirm the domain resolves to this host, and confirm HTTPS is working (production cookies require HTTPS). After ten incorrect passphrase attempts, wait ten minutes. Both users share the proxy's rate-limit bucket. Clear stale environment passphrase overrides if 229 is unexpectedly rejected.
