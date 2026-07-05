# Phase 1 PRD — The Notice-Response Copilot (India)

> **Version:** 3.0 — 2026-07-05
> **Author:** @980vermarajput
> **Status:** Phase 1 build spec — supersedes PRD v2.8 (the pre-pivot "search your docs" spec).
> **Read `ROADMAP.md` first** for the strategic rationale. The as-built record of the current
> platform lives in `.github/currentState.md`. v2.8 is retrievable from git history.

---

## 1 — One-line Summary

**Forward a government notice on WhatsApp → get a plain-language explanation and a law-backed,
cited draft reply in minutes — with the deadline tracked and reminders pushed.**

The RAG engine, alert system, WhatsApp channel, and trust stack already exist (Phase 0 complete).
Phase 1 points them at the one job no incumbent owns: handling the rising flood of GST/IT/TDS
notices hitting Indian CAs.

---

## 2 — The Job & Why Now

The tax department now runs automated cross-matching (ITR ↔ AIS/26AS ↔ GST ↔ TDS); any mismatch
auto-fires a notice. Notice volume is rising, every notice is deadline-bound, and responding is
high-stakes, research-heavy work a CA bills **₹2,000–10,000 per reply**. No incumbent owns this
job — Suvit/TaxOne own data entry; generic AI chat owns nothing a CA trusts.

**The demo moment that sells the product** (every decision below serves it):

> A CA forwards a notice photo to our WhatsApp number and gets back, within two minutes, a
> plain-language explanation plus a cited draft reply — and the citations check out.

---

## 3 — Goals & Success Metrics

**North star: notices handled per firm per week (unprompted).**

| # | Metric | Target (first 12 weeks of Phase 1) |
| --- | --- | --- |
| M1 | Activation: signups that forward ≥1 notice in week 1 | ≥ 60% |
| M2 | Notices/firm/week by week 4 (unprompted — the ROADMAP win condition) | ≥ 1 |
| M3 | Time from notice received → draft ready (incl. OCR), P95 | ≤ 5 min |
| M4 | Draft acceptance: replies used with only minor edits (pilot-CA graded) | ≥ 70% |
| M5 | **Citation accuracy on the eval set (hard release gate)** | ≥ 95% |
| M6 | Deadline capture: notices with a tracked deadline / correct date | 100% / ≥ 90% |
| M7 | Pilot → paid conversion | ≥ 20% |

M5 is a **gate, not a goal**: no notice type ships to users until its eval slice passes. A
confidently wrong citation is worse than no product.

**Explicitly killed metrics from v2.8:** queries/user/day, chat-latency-as-headline,
search-engagement anything. Retention here is event-driven (notices arrive), not habit-driven
(searching).

---

## 4 — Target Users

| Persona | Profile | Pain | What Phase 1 does for them |
| --- | --- | --- | --- |
| **Solo CA (primary — 72% of firms)** | 30–50, 40–80 clients, works from phone/WhatsApp | 5–15 notices/month post-AIS-matching; each = hours of statute lookup + drafting | Forward → explained → drafted → deadline tracked. No software to learn. |
| **Small-firm partner (secondary)** | 2–10 staff | Notices routed to juniors, quality varies, deadlines slip | Same flow + team visibility on the notice pipeline & deadlines |
| **The CA's client (indirect)** | Business owner who received the notice | Panic; forwards it to the CA at 11pm | Gets a fast, calm, professional response — makes the CA look good |

The buyer is the CA. The client-facing explanation is a distribution artifact (§12), not a user
surface.

---

## 5 — The Core Flow

```
1. INGEST     CA forwards notice to our WhatsApp number (photo/PDF), or uploads on
              web, or forwards the email. Works BEFORE an account exists (§10).
2. EXTRACT    OCR + parse → notice text, portal ref no., issue date, due date.
3. CLASSIFY   Notice type (ASMT-10, 143(2), …) + severity + statutory deadline rule.
4. EXPLAIN    Plain language: what this is, why it likely fired, what's at stake,
              what's needed, by when. Pushed back on WhatsApp.
5. DRAFT      Law-backed reply grounded in the statutory corpus, with verified
              citations to specific sections/circulars. Reviewed & edited on web.
6. TRACK      Deadline auto-tracked; WhatsApp reminders at T-7/T-3/T-1 (reuses the
              Phase 0 alert push). Status: received → explained → draft_ready →
              replied → closed.
```

The human is always in the loop: **we never file or send anything to the department.** The CA
reviews, edits, and submits. This is a hard product boundary, not a v1 limitation.

---

## 6 — Scope

### ✅ In scope (Phase 1)

| Priority | Feature |
| --- | --- |
| P0 | **Notice ingestion** via WhatsApp media (Phase 0 webhook hook), web upload, email forward |
| P0 | **OCR pipeline** — notices are mostly phone photos & scans; hard dependency, not a fallback |
| P0 | **Notice classification** — top ~14 types (§7), confidence-gated (unknown → generic explain + human flag) |
| P0 | **Statutory corpus v0** — versioned, scoped to what the top notice types need (§8) |
| P0 | **Eval harness** — golden set of real notices, CA-graded, regression-gated releases (§9) |
| P0 | Explanation + **cited draft reply** with citation verification |
| P0 | Deadline auto-track + WhatsApp reminders (reuse alert engine + `compliance_alert` template) |
| P1 | Pre-account WhatsApp funnel — explanation free before signup (§10) |
| P1 | Web notice-pipeline view (status board) + draft review/edit (compose from dashboard/drafts UI) |
| P1 | Hybrid retrieval: exact figures/dates/section numbers via structured lookup; narrative via vector search |
| P2 | Per-notice-type SEO explainer pages generated from the same corpus (distribution, §12) |

### ❌ Out of scope (Phase 1)

- Tally / books integration (Phase 2 — prevention), portal scraping (Phase 3)
- Auto-filing or auto-sending anything to the department (**permanent** boundary)
- Full statute coverage beyond the notice types in §7 — narrow and current beats broad and stale
- GST computation, return prep, data entry (Suvit's turf — never fight there)
- New investment in legacy surfaces: Telegram features, platform-admin expansion, keyword-sync
  polish, session-management UI. **Frozen** until the wedge ships.

---

## 7 — Notice Types (launch coverage)

Chosen by frequency × automatability. Each ships only when its eval slice passes M5.

| Wave | Type | What it is |
| --- | --- | --- |
| 1 (GST) | ASMT-10 | Scrutiny of returns — discrepancy notice (the highest-volume wedge) |
| 1 (GST) | DRC-01A / DRC-01 | Intimation / show-cause for tax demand |
| 1 (GST) | GSTR-3A | Non-filer notice |
| 1 (GST) | REG-17 | Show-cause for registration cancellation |
| 2 (IT) | 143(1) | Intimation with adjustments (very high volume, semi-mechanical) |
| 2 (IT) | 139(9) | Defective return |
| 2 (IT) | 143(2) / 142(1) | Scrutiny / inquiry |
| 2 (IT) | 148 / 148A | Reassessment (income escaping assessment) |
| 2 (IT) | 156 / 245 | Demand notice / refund adjustment |
| 3 (TDS) | 200A intimation, TRACES defaults | Short-deduction / late-fee demands |

Wave 1 alone is a sellable product. Classifier confidence below threshold → honest "we don't
fully recognise this notice yet" + generic guidance + internal flag (that queue drives wave
prioritisation).

---

## 8 — The Statutory Corpus (the moat)

**Principles:** global (shared across firms — *not* firm-scoped like `chunks`), versioned
(cite law as it stood **on the notice date**), narrow (only what §7 needs), and operationally
fresh (circulars/notifications change constantly; stale law = wrong replies = dead product).

**Sourcing v0:** CGST Act + rules and relevant CBIC circulars/notifications (cbic.gov.in) for
wave 1; Income Tax Act sections + CBDT circulars (incometaxindia.gov.in) for wave 2; TDS
provisions for wave 3. Manual-assisted ingestion first; a monitored scraper is an optimisation,
not a prerequisite.

**Data model (new tables, global — no `firmId`):**

- `corpus_sources` — one row per legal text: kind (act_section / rule / circular /
  notification), citation id ("Section 61, CGST Act"), title, source_url, `effective_from`,
  `effective_to`, `supersedes_id`, ingested_at, checksum
- `corpus_chunks` — chunked + embedded (reuse chunker/embedder), FK to source, section-path
  metadata enabling **structured lookup by citation id** (the hybrid-retrieval path)
- `notice_type_playbooks` — per §7 type: statutory basis, deadline rule, required reply
  structure, the corpus slice to retrieve from, escalation notes

**Freshness ops (this is a job, not a feature):** weekly source-check cadence; every corpus
change reruns the eval suite before deploy; a visible "law current as of <date>" stamp on every
draft. Budget recurring founder/ops time for this.

**RLS note:** corpus tables are intentionally exempt from firm-scoping — document this
explicitly in `.claude/docs/architectural_patterns.md` so the "always filter by firmId" rule
isn't mis-applied to them.

---

## 9 — Eval Harness (build BEFORE the drafting feature)

1. **Golden set:** 25–50 real, anonymised notices collected from pilot CAs (the ask is itself a
   sales touch). Each labelled: type, key facts, correct deadline, reference reply graded by a
   practicing-CA partner.
2. **Grading rubric per generated draft:** classification correct? deadline correct? every
   citation exists and actually supports the point? factual grounding (no invented figures)?
   tone/structure professional? Overall: accept / minor-edit / reject.
3. **Citation verifier runs in prod, not just eval:** every cited id in a draft is resolved
   against `corpus_sources`; failures regenerate or downgrade the output to explanation-only.
4. **Regression gate:** every prompt, corpus, or retrieval change reruns the suite; M5 (≥95%
   verified-citation accuracy) blocks release per notice type. Scores tracked over time.
5. **Prod feedback loop:** CA edits to drafts are diffed and folded into the golden set monthly.

---

## 10 — Funnel & Activation (WhatsApp-first)

The Google-OAuth-with-Gmail-scopes front door is wrong for this wedge (scary consent screen,
irrelevant to the job). New funnel:

1. **Anonymous value first:** anyone can WhatsApp a notice to our number → gets the
   plain-language **explanation** free, no account. (Rate-limited per phone number; unknown
   numbers get a lightweight provisional record.)
2. **Conversion moment:** "Want the drafted reply + deadline tracking? Create your account" →
   phone-number-first signup (OTP), name + firm. **Google OAuth becomes optional** ("connect
   Gmail later to auto-import notice emails"), not the gate.
3. **Retention loop:** deadline reminders + daily briefing on WhatsApp keep the channel warm;
   the next notice goes to the same number.

Engineering deltas: OTP auth path alongside Google OAuth; provisional → full account merge on
signup; per-number rate limits and abuse guards on the anonymous tier.

---

## 11 — Pricing (hypotheses to test in pilot — not final)

Anchors: a CA bills ₹2–10k per notice reply; Suvit ≈ ₹10k/yr/firm for data entry.

| Tier | Price | Includes |
| --- | --- | --- |
| **Solo (free)** | ₹0 | ≤ 5 active clients, unlimited notice **explanations**, 2 drafted replies/mo, deadline tracking |
| **Practice** | **₹999/mo** (₹9,990/yr) | ≤ 25 active clients, unlimited replies, WhatsApp reminders, priority OCR |
| **Firm** | **₹2,499/mo** | ≤ 100 active clients, team seats, notice pipeline board |
| Add-on to test | ₹199/notice | Overage beyond the free-tier reply quota — tests per-event willingness to pay |

Subscription with an active-client allowance (Phase 0 scaffolding: `Firm.clientAllowance`,
`client-usage.ts`), not metered billing. The pilot runs free, but the pricing page is live from
day one so conversion intent is measured, not guessed. Stripe enforcement stays deferred until
retention is proven (the ROADMAP gate).

---

## 12 — Distribution v0

- **Lead magnet = the product:** the free WhatsApp notice-explainer is inherently shareable in
  CA WhatsApp groups. Seed 3–5 groups via pilot CAs.
- **SEO from the corpus:** one explainer page per §7 notice type ("How to reply to GST
  ASMT-10") generated from the same corpus + playbooks. High-intent queries, low competition,
  every page ends in the WhatsApp CTA.
- **The client-facing artifact carries the brand:** the explanation a CA forwards to *their*
  client is branded; the reply filed to the department is **never** branded.
- **ICAI branch events + GST practitioner meetups:** the two-minute demo (§2) is the pitch.
- **Referral:** free month per referred CA who activates (M1).

---

## 13 — Trust, Data & Compliance (claims must survive scrutiny)

- **Current truth:** data stored in India (planned Mumbai deploy); **inference via OpenAI (US
  processing)**. Until that changes, marketing says "stored in India, processed via encrypted
  AI APIs" — never "your data never leaves India."
- **Target for GA:** India-region inference (e.g. Azure OpenAI, Central India) — evaluate
  cost/latency during the pilot. The LLM-provider abstraction makes this a config change.
- **DPDP posture:** notices contain client PII/financials → document data flows, retention
  policy, the deletion path, and the anonymisation step for the eval set.
- **Professional-liability framing:** every draft is labelled "Draft for professional review —
  not legal advice"; the CA is the filer of record, always.
- The existing stack (firmId isolation + RLS backstop, AES-256-GCM, audit log, JWT hardening,
  token caps) carries forward unchanged — and stays a *selling point*.

---

## 14 — Architecture Deltas (reuse-first)

**Reused as-is:** extraction→chunk→embed pipeline, `rag.ts` retrieval, `drafts.ts` generation
patterns, alert engine + scheduler + WhatsApp push (Phase 0), deadline calendar/ICS, the whole
auth/trust stack, cost controls.

**New:**

| Component | Notes |
| --- | --- |
| `Notice` model | firmId, clientId?, channel (whatsapp/upload/email), waId (pre-account), type, portalRefNo, issueDate, dueDate, status enum (§5), mediaS3Key, extractedText, explanation, draftId, deadlineId |
| OCR worker | New BullMQ worker; images + scanned PDFs → text. Evaluate managed OCR vs tesseract on real notice photos — accuracy on stamps/tables/rubber-stamped scans is what matters |
| Classifier | LLM + heuristics over extracted text → (type, confidence); below threshold → generic path + flag |
| Corpus tables + ingestion | §8 — global scope, versioned |
| Citation verifier | Post-generation: resolve every cited id against `corpus_sources`, check quoted support; failures regenerate or downgrade to explanation-only |
| Hybrid retrieval | Structured lookup by section/citation id + effective date, merged with vector search for narrative, before generation |
| OTP auth + provisional accounts | §10 funnel |
| Notice pipeline UI | Status board + draft review/edit (compose from existing dashboard/drafts components) |

---

## 15 — Milestones (8 weeks, gate-driven)

| Weeks | Deliverable | Gate to proceed |
| --- | --- | --- |
| 1–2 | Notice ingestion E2E (WhatsApp media → OCR → text), `Notice` model, classifier v0. **Collect 25+ real notices from pilot CAs.** | ≥80% of golden-set notices extract & classify correctly |
| 2–4 | Corpus v0 for **wave 1 (GST)** + eval harness + grading with partner CA | Eval green on explanation quality |
| 4–6 | Cited draft replies + citation verifier + web review/edit | **M5: ≥95% citation accuracy on the wave-1 slice** |
| 6–8 | Deadline tracking + reminders wired; pre-account funnel; pricing page; 10 pilot CAs live | M1 ≥60%, M4 ≥70% on pilot traffic |
| 8+ | Wave 2 (IT) corpus + types; SEO pages; scale pilot outreach | M2 ≥1 notice/firm/week unprompted |

**Do not start Phase 2 (Tally) until M2 and M7 hold** — the ROADMAP's own rule, now with
numbers attached.

---

## 16 — Risks

| Risk | Mitigation |
| --- | --- |
| Corpus staleness → wrong law cited | Freshness cadence + eval regression gate + "current as of" stamp (§8) |
| A bad draft reaches the department | Citation verifier in prod, human-in-loop always, confidence gating, liability labelling (§13) |
| OCR quality on phone photos | Test managed OCR early on the real golden set; "please retake the photo" UX fallback |
| WhatsApp template/policy friction | Templates identified in Phase 0 (`WHATSAPP_SETUP.md`); keep utility category; BSP relationship |
| Suvit / ClearTax add notice features | Speed to wave 1 + eval-proven quality + corpus depth; they must retrofit trust |
| Solo-founder bandwidth | The freeze list (§6) is the mitigation — one wedge, nothing else |

---

## 17 — Open Questions (decide during weeks 1–4)

1. OCR vendor: managed API vs self-hosted tesseract — decide on golden-set accuracy, not price.
2. Partner CA for eval grading: retainer or revenue-share advisor?
3. Anonymous-tier abuse limits: per-number caps enough, or OTP-before-explain once abused?
4. Hindi/regional output for the *client-facing* explanation (the filed reply stays English)?
5. India-region inference timing: pilot on OpenAI with disclosure, or block GA on Azure India?
