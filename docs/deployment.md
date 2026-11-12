# Deploying ListingWatch

ListingWatch runs as one Docker container. It listens on `127.0.0.1:8095`
and is meant to sit behind an HTTPS reverse proxy:

```
browser → your authentication → reverse proxy (HTTPS) → 127.0.0.1:8095 → container
```

HTTPS isn't optional: push notifications and the installable app need it.

**ListingWatch has no sign-in of its own.** Anyone who can reach it can use
it, including the eBay credentials it holds. Don't expose it to a network you
don't trust without putting your own authentication in front: for example
your reverse proxy's authentication, an identity-aware proxy, or a VPN.

The examples use `listings.example.com` for the hostname and `~/listingwatch`
for the stack folder. Use your own.

## How the image is built

The server that runs ListingWatch never builds it. CI
(`.github/workflows/ci.yml`) typechecks, tests and audits every push. On a
push to `main` it then builds the image and publishes it to the GitHub
Container Registry with two tags:

- `latest`: the ordinary deploy;
- the commit SHA: for rolling back, and for checking a deploy against the
  commit (`/api/health` reports it as `revision`).

`deploy/compose.yaml` names the image. If the package is private, sign the
server in to the registry once, with a token that can only read packages:

```bash
echo '<token>' | docker login ghcr.io -u <github-user> --password-stdin
```

## 1. The stack

Copy `deploy/compose.yaml` and `deploy/.env.example` from this repository
into `~/listingwatch`, rename the latter to `.env`, and fill it in: the
comments in it explain each setting. Then:

```bash
cd ~/listingwatch
docker compose pull && docker compose up -d
curl -s http://127.0.0.1:8095/api/health    # {"ok":true,"revision":"<sha>",…}
```

A configuration problem stops the container at start with the variable named:
`docker compose logs listingwatch`.

Everything the app keeps is in `~/listingwatch/data`: the database, Chromium's
profile (Vinted cookies), logs and the uploaded sound.

## 2. Reverse proxy

Any reverse proxy that terminates HTTPS works. With nginx, the event stream
needs its own location, because it stays open and must not be buffered:

```nginx
server {
    listen 443 ssl;
    server_name listings.example.com;
    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    client_max_body_size 20m;   # backup restore and sound upload

    location / {
        proxy_pass http://127.0.0.1:8095;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Live updates: a server-sent event stream that stays open.
    location = /api/events {
        proxy_pass http://127.0.0.1:8095;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
```

Add your authentication to this server block, or in front of it. Make sure
every route in reaches it: for example, devices on your home network that
resolve the hostname straight to the server would otherwise skip an
authentication layer that only sits on the internet-facing path.

## 3. First run

1. Open `https://listings.example.com`.
2. **Settings › eBay API**: enter the Client ID and Secret from the eBay
   developer portal (production keys), then Save and test.
3. Add searches, or **Settings › Backup › Restore from a file** to bring back
   a backup.
4. **Settings › Notifications › Turn on**, on each device:
   - **Android and desktop:** works in the browser, or install the app.
   - **iPhone:** add it to the home screen first (Share › Add to Home
     Screen), open it from there, then turn notifications on.

## Updating

Once CI has finished for the commit:

```bash
cd ~/listingwatch
docker inspect --format '{{.Image}}' listingwatch   # note what you're on, in case
docker compose pull && docker compose up -d
curl -s http://127.0.0.1:8095/api/health            # revision = the commit you expect
```

The database schema migrates itself on start.

**To roll back**, change the `image:` tag in `compose.yaml` from `latest` to
the previous commit's SHA, then `docker compose pull && docker compose up -d`.
Put `latest` back when you're ready to move forward again.

## Backups

`~/listingwatch/data/listingwatch.db` holds everything that matters. Copy it
with SQLite's online backup while the app runs:

```bash
sqlite3 ~/listingwatch/data/listingwatch.db ".backup '/tmp/listingwatch.db'"
```

**Settings › Backup › Download backup** in the app is lighter: searches, match
lists and settings only. It never includes the eBay credentials, favourites or
the feed.
