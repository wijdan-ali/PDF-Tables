# Landing repo → App deep links (pricing CTAs)

This repo is the **app** (Supabase Auth + Stripe checkout + trial + enforcement).

Your landing repo should **only redirect** users into the app using these deep links.

## Required env (landing repo)

- `NEXT_PUBLIC_APP_URL` = your app base URL (example: `https://app.yourdomain.com`)

## CTA → URL mapping

### Starter (paid)

- **Starter monthly** (“Get started”):
  - `\${NEXT_PUBLIC_APP_URL}/start?intent=checkout&plan=starter&interval=month&returnTo=/tables`

- **Starter annual** (“Get started” when yearly toggle selected):
  - `\${NEXT_PUBLIC_APP_URL}/start?intent=checkout&plan=starter&interval=year&returnTo=/tables`

### Professional (trial first; no card)

- **Professional** (“Start free trial”):
  - `\${NEXT_PUBLIC_APP_URL}/start?intent=trial_pro&returnTo=/tables`

### Optional: buy Professional directly (if you add a “Buy now” CTA)

- **Professional monthly**:
  - `\${NEXT_PUBLIC_APP_URL}/start?intent=checkout&plan=pro&interval=month&returnTo=/tables`

- **Professional annual**:
  - `\${NEXT_PUBLIC_APP_URL}/start?intent=checkout&plan=pro&interval=year&returnTo=/tables`

## Notes

- `returnTo` must be an internal path (starts with `/`). The app validates this to prevent open redirects.
- If the user isn’t logged in, the app automatically redirects them to:
  - `/login?returnTo=<encoded original /start URL>`

