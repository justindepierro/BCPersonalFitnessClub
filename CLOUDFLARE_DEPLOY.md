# Cloudflare Setup

This app is ready for Cloudflare Pages with a simple admin/athlete login.

## Logins

- Admin username: `admin`
- Admin password: `goeagles2026`
- Athlete username: `athlete`
- Athlete password: `pfceagles2026`

The default password hashes are already in the Cloudflare Function code. For a production deploy, set a unique session secret in Cloudflare:

```sh
npx wrangler pages secret put AUTH_SESSION_SECRET --project-name lifting-club
```

Optional password hash overrides:

```sh
printf 'admin:goeagles2026' | shasum -a 256 | awk '{print $1}'
printf 'athlete:pfceagles2026' | shasum -a 256 | awk '{print $1}'

npx wrangler pages secret put AUTH_ADMIN_PASSWORD_SHA256 --project-name lifting-club
npx wrangler pages secret put AUTH_ATHLETE_PASSWORD_SHA256 --project-name lifting-club
```

## Shared Data Storage

This repo is already configured with the KV namespace created for this Cloudflare account:

- Binding name: `LIFTING_CLUB_KV`
- Namespace id: `a37bbced560c447998fc114228203145`

To recreate it on another Cloudflare account, create a KV namespace and bind it to the Pages project as `LIFTING_CLUB_KV`:

```sh
npx wrangler kv namespace create lifting_club_data
```

Copy the returned namespace id into `wrangler.toml` by uncommenting the `[[kv_namespaces]]` block, or add the same binding in the Cloudflare Pages dashboard:

- Binding name: `LIFTING_CLUB_KV`
- Namespace: the `lifting_club_data` namespace

## Deploy

```sh
./scripts/deploy-cloudflare.sh
```

After deploy, log in as admin, import/edit data in the dashboard, then click `Publish Cloud Data`. Athlete logins are read-only and will see the published data after reload.
