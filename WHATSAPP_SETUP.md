# WhatsApp (AiSensy) — Setup Guide

Phase 0 wires WhatsApp as the primary notification channel via **AiSensy** (a BSP over
Meta's WhatsApp Cloud API). The integration is provider-swappable: all of it lives in
`apps/api/src/lib/whatsapp.ts` behind a Telegram-shaped interface.

> **Long pole:** Meta template approval + business verification (~1–3 business days).
> Start there. Linking + inbound work as soon as the webhook is reachable; **proactive
> sends (alerts, briefings) won't deliver until the templates are approved.**

## 1. Account, business verification & number
1. Sign up at **aisensy.com**, create a project.
2. Connect a dedicated WhatsApp number (must NOT already be active on the consumer
   WhatsApp / WhatsApp Business app). AiSensy links it to a Meta WABA.
3. Complete **Meta Business verification** (raises messaging limits; needed before scale).
4. Record the number in international form, digits only → `WHATSAPP_BUSINESS_NUMBER`
   (e.g. `919812345678`).

## 2. API key
AiSensy dashboard → **Manage → API Key** → copy the JWT → `AISENSY_API_KEY`.

## 3. Templates (the critical part)
A proactive send = an AiSensy **Campaign** bound to a Meta-**approved template**. Create
the template, get it approved, then create a **Live API Campaign** with the *exact* name
below. Prefer the **Utility** category for compliance messaging (cheaper, better fit).

| Campaign name (env)        | Body vars (order matters)                 | Suggested body text                 |
| -------------------------- | ----------------------------------------- | ----------------------------------- |
| `compliance_alert`         | `{{1}}` severity·type, `{{2}}` title, `{{3}}` body | `*{{1}}*\n\n*{{2}}*\n\n{{3}}` |
| `daily_briefing`           | `{{1}}` summary                           | `Your daily briefing:\n\n{{1}}`     |
| `session_reply`            | `{{1}}` text                              | `{{1}}`                             |

**Gotchas:** the `{{n}}` count must equal the `templateParams` length the code sends
(3 / 1 / 1) or AiSensy rejects the call; template and Live API Campaign are separate
steps; `session_reply` is optional (only powers the dynamic in-window link-confirmation
reply).

## 4. Inbound webhook
1. Point AiSensy's incoming-message webhook at:
   `https://YOUR_API_HOST/api/webhooks/whatsapp?secret=YOUR_SECRET`
2. Generate the secret → `WHATSAPP_WEBHOOK_SECRET`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   (route checks `?secret=` query param or `X-Webhook-Secret` header)
3. Local dev: tunnel port 4000 (`ngrok http 4000` / `cloudflared`) and use that HTTPS URL.

> AiSensy's inbound payload shape is undocumented, so `parseInbound` is tolerant of both
> AiSensy's flat shape and raw Meta `entry/changes/value/messages`. If linking doesn't
> fire on a real message, log `req.body` once in `apps/api/src/routes/whatsapp.ts` and
> adjust the parser.

## 5. Env (`apps/api/.env`)
```
AISENSY_API_KEY=<JWT from step 2>
WHATSAPP_BUSINESS_NUMBER=919812345678
WHATSAPP_WEBHOOK_SECRET=<secret from step 4>
# defaults below are correct unless you named campaigns differently:
WHATSAPP_TEMPLATE_ALERT=compliance_alert
WHATSAPP_TEMPLATE_BRIEFING=daily_briefing
WHATSAPP_TEMPLATE_SESSION=session_reply
```

## 6. Test the loop
1. `pnpm dev` → app → **Settings → WhatsApp → Generate Link Code**.
2. WhatsApp the business number: `/link <CODE>`.
3. Expect `✅ You're linked` + a `whatsapp_links` row (`pnpm db:studio`).
4. Verify a template send (200 + a received message = key + template good):
   ```bash
   curl -X POST https://backend.aisensy.com/campaign/t1/api/v2 \
     -H "Content-Type: application/json" \
     -d '{"apiKey":"<KEY>","campaignName":"daily_briefing","destination":"919812345678","userName":"Test","templateParams":["hello from AiSensy"]}'
   ```
   A 400 usually means param-count mismatch or the campaign isn't Live.

---

## Follow-ups (not yet built)

- [ ] **In-app WhatsApp test send** — add `POST /api/admin/whatsapp/test` (admin-only) that
      fires the `daily_briefing` template to the caller's linked number, so step 6.4 can be
      done from the app instead of curl. Small: reuse `whatsapp.sendTemplate` +
      `requireAuth`/admin guard + the caller's `WhatsAppLink.waId`.
- [ ] Backfill `Client.lastActivityAt` from the ingest paths (gmail/drive/extraction
      workers, upload route) so active-client counting stops falling back to a document
      scan. Today it's set on client creation only; the counter compensates with an
      OR-on-documents query.
