# AS ANAMUL URL Shortener

A full-stack URL shortener starter project inspired by common link-shortening services. It includes user registration/login, short-link creation, custom aliases, click counts, a Continue/ad page, admin tools for first-party ads, settings, and a private API key.

## Requirements
- Node.js 20+
- npm

## Run locally
1. Extract this ZIP.
2. Copy `.env.example` to `.env`.
3. Set `SESSION_SECRET` to a long random value.
4. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (password must be at least 12 characters).
5. Install dependencies and start:

```bash
npm install
npm start
```

Open `http://localhost:3000`. The admin account is created on first startup if the email does not already exist and `ADMIN_PASSWORD` is at least 12 characters. If the admin user already exists, changing the environment password will not automatically reset it.

## Important configuration
- `BASE_URL`: public base URL, e.g. `https://links.example.com`
- `COOKIE_SECURE=true` when served behind HTTPS in production.
- `SESSION_SECRET`: change it before deployment.
- `AD_NETWORK_SCRIPT_URL`: optional HTTPS script URL, only for a network that explicitly authorizes this placement. Some networks require a code snippet rather than a script URL; integrate only according to the network's instructions and policy.

## API
After logging in, find your API key in the dashboard.

```bash
curl -X POST http://localhost:3000/api/v1/shorten \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: YOUR_API_KEY' \
  -d '{"url":"https://example.com/some-long-path","title":"Example"}'
```

Response includes `short_url` and `code`.

## Routes
- `/` homepage
- `/:code` redirects to `/go/:code`
- `/go/:code` records a click and displays the ad/Continue page
- `/out/:code` redirects to the stored destination
- `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`
- `/api/links`, `/api/me`, `/api/analytics`
- `/api/v1/shorten` API-key protected
- `/api/admin/*` admin-only endpoints

## Production deployment checklist
- Deploy to a Node.js host that supports a persistent filesystem, or migrate SQLite to managed PostgreSQL before horizontal scaling.
- Use HTTPS and set `COOKIE_SECURE=true`.
- Use a strong `SESSION_SECRET` and unique admin password.
- Back up `data/app.db` securely.
- Add CSRF protection, account email verification, password reset, privacy/terms pages, and abuse reporting before opening registration to the public.
- Consider link scanning, phishing/malware prevention, custom domain verification, quotas, and stronger audit logging.
- Never store third-party ad-network secrets in frontend JavaScript.
- Follow the ad provider's rules. Do not ask users to click ads, incentivize clicks, obscure ads, or place deceptive Continue buttons. Network ads may not be allowed on intermediary redirect pages; confirm written policy approval first.

## Limitations of this starter
- This is a runnable starter, not a hosted/production-certified service.
- Click tracking stores timestamp, referrer and user-agent; avoid collecting more personal data than needed and publish a privacy policy.
- SQLite is suitable for a small single-instance deployment. For a large production service, use managed database/session infrastructure.
- Ad network integration is a placeholder until a provider is selected and approved. The app's own ads are managed from the admin panel.
