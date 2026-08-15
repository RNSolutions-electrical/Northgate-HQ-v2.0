# Deploy — rnsolutions.net/northgate

Two Netlify sites, one proxy rule. Deploys stay independent: the app ships
constantly, the landing page rarely, and neither redeploys the other.

```
rnsolutions.net                 → Site A (landing page)
rnsolutions.net/northgate/*     → proxied to Site B (this app)
```

## Site A — the landing page

Publishes the single `index.html`. Add this to its `netlify.toml`:

```toml
[[redirects]]
  from = "/northgate"
  to = "https://YOUR-APP-SITE.netlify.app/"
  status = 200
  force = true

[[redirects]]
  from = "/northgate/*"
  to = "https://YOUR-APP-SITE.netlify.app/:splat"
  status = 200
  force = true
```

`status = 200` is a rewrite, not a redirect — the browser URL stays
`rnsolutions.net/northgate/jobs`. `force = true` makes it win over the
landing site's own SPA rules.

Replace `YOUR-APP-SITE` with this app's Netlify subdomain.

## Site B — this app

`netlify.toml` is already configured. Set these environment variables in the
Netlify UI (same values as v2.0):

```
VITE_CLERK_PUBLISHABLE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

`VITE_BASE_PATH=/northgate` is already set in `netlify.toml`.

## Why the paths line up

The app builds with `base: '/northgate/'`, so `index.html` asks for
`/northgate/assets/index-abc.js`.

1. Browser requests `rnsolutions.net/northgate/assets/index-abc.js`
2. Site A's rule strips `/northgate/` and proxies to `app.netlify.app/assets/index-abc.js`
3. That file physically exists in `dist/assets/` — served correctly

And for a route:

1. Browser requests `rnsolutions.net/northgate/jobs`
2. Proxied to `app.netlify.app/jobs`
3. No such file → SPA fallback serves `index.html`
4. React Router reads `basename="/northgate"` and renders Jobs

## Clerk — do this or auth breaks

Add `https://rnsolutions.net` to **allowed origins** in the Clerk dashboard.
Sign-in and sign-up redirect URLs should point at `/northgate`.

The app is served from `rnsolutions.net`, not the `.netlify.app` subdomain, so
that is the origin Clerk sees.

## Verify after deploy

- [ ] `rnsolutions.net` shows the landing page
- [ ] `rnsolutions.net/northgate` loads the app (no 404, no blank page)
- [ ] Browser URL stays on `rnsolutions.net` — no redirect to `.netlify.app`
- [ ] Sign-in completes and lands on `/northgate/dashboard`
- [ ] Refreshing on `/northgate/inventory` does not 404
- [ ] Devtools Network shows no 404s on `/northgate/assets/*`
- [ ] v2.0 still reachable at its old address

## Alternative — one site

If the proxy is more trouble than it's worth: publish a single folder with the
landing `index.html` at root and the app build in a `northgate/` subdirectory.
Simpler, but every app deploy redeploys the landing page and both live in one
repo. The proxy is worth the five minutes.
