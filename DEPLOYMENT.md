# Deployment

This app is **not serverless-friendly**: the API runs BullMQ workers in-process
and a daily scheduler, and it depends on an always-on Redis (the JWT blacklist is
fail-closed). So the backend wants a persistent host, not Lambda/Vercel functions.

Recommended, genuinely-$0 topology:

| Piece                          | Where                                   |
| ------------------------------ | --------------------------------------- |
| Postgres (pgvector) + Redis    | Oracle Cloud Always-Free VM (Docker)    |
| API + background workers       | same VM (Docker)                        |
| Public HTTPS, no open ports    | Cloudflare Tunnel (Docker)              |
| Frontend (Next.js)             | Vercel (recommended) or Netlify         |

Only unavoidable running cost is OpenAI, already capped per firm.

---

## Part A — Backend on an Oracle Always-Free VM

### 1. Provision + install Docker
Create an **Ampere (ARM) Always-Free** VM (Ubuntu 22.04). Then:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER   # re-login after this
git clone https://github.com/980vermarajput/ai-accounting.git
cd ai-accounting
```

### 2. Configure environment
```bash
cp .env.prod.example .env.prod
# generate secrets:
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('hex'))"
```
Fill in `.env.prod`: DB password, the two secrets, `OPENAI_API_KEY`, Google OAuth,
and your public hostnames (`CORS_ORIGIN`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`,
`GOOGLE_REDIRECT_URI`).

### 3. Create the Cloudflare Tunnel
You need a domain whose nameservers point at Cloudflare (free plan is fine).

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**
   → *Cloudflared* → name it → copy the **token** into `CLOUDFLARE_TUNNEL_TOKEN`
   in `.env.prod`.
2. Under the tunnel's **Public Hostnames**, add:
   - `api.yourdomain.com` → service `http://api:4000`
   - `app.yourdomain.com` → service `http://web:3000` *(skip if frontend is on Vercel)*

No inbound ports are ever opened on the VM.

### 4. Migrate + launch
```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
```

`https://api.yourdomain.com/api/health` should return ok.

### 5. (Optional) Turn on enforced RLS
Defence-in-depth beyond the app-level `firmId` filtering. **Validate first:**
```bash
bash apps/api/prisma/rls/verify.sh            # proves isolation locally
```
Then on the VM: create the role, point the app at it, and route the privileged
flows (auth/workers/platform-admin) through `prismaAdmin`. Full steps and caveats
in [apps/api/prisma/rls/README.md](apps/api/prisma/rls/README.md).

---

## Part B — Frontend on Vercel (recommended)

1. Import the GitHub repo in Vercel.
2. **Root Directory → `apps/web`** (Vercel detects the pnpm workspace and the
   committed [`apps/web/vercel.json`](apps/web/vercel.json) handles install/build,
   building `@ai-accounting/shared` first).
3. Env var: `NEXT_PUBLIC_API_URL = https://api.yourdomain.com`.
4. Deploy. Point `app.yourdomain.com` at it (Vercel → Domains), and drop the
   `web` service from the compose file if you don't need it on the VM.

### Or Netlify
Import the repo — [`netlify.toml`](netlify.toml) sets the build + Next plugin.
Set `NEXT_PUBLIC_API_URL` in Site settings → Environment variables. (Vercel is the
smoother path for Next.js.)

---

## Part C — Wire up Google + Telegram

- **Google OAuth** (console.cloud.google.com/apis/credentials): add the redirect
  URI `https://api.yourdomain.com/api/auth/google/callback` and your frontend
  origin. Scopes: gmail.readonly, drive.readonly, gmail.compose, userinfo.email,
  userinfo.profile.
- **Telegram** (optional): set the webhook to
  `https://api.yourdomain.com/api/webhooks/telegram` with your
  `TELEGRAM_WEBHOOK_SECRET`.

---

## Post-deploy checklist
- [ ] `GET https://api.yourdomain.com/api/health` is ok
- [ ] Sign in with Google works end-to-end
- [ ] A document sync → extraction → chat answer round-trips
- [ ] `docker compose ... logs api` shows the 5 workers started
- [ ] `OPENAI_API_KEY` set and per-firm token caps in place
- [ ] Backups: snapshot the `postgres_data` volume (or use managed Neon/Supabase)

## Notes
- **Backups:** the VM path stores data in the `postgres_data` Docker volume — set
  up a periodic `pg_dump` or VM snapshot. To offload this, swap Postgres for a
  managed **Neon**/**Supabase** (both have pgvector) and point `DATABASE_URL` at it.
- **Updates:** `git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`.
