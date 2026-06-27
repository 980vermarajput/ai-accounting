# Product Strategy & Roadmap

> **Read this before the PRD.** The PRD describes what was *built* (an AI search assistant over a
> CA's Gmail/Drive). This document describes where the product is *going* and why. Where the two
> conflict, this document reflects the current strategic direction.

---

## 0. The one-liner

**We are the AI that handles government notices for Indian CAs today — and prevents them tomorrow.**

Not "chat with your documents." That's the engine, not the product.

---

## 1. Why we're changing direction (the short version)

We built a well-engineered, secure tool that reads a CA's inbox and answers questions about it. The
engineering is strong. The *positioning* is weak, for four reasons backed by the market:

1. **We index the wrong data.** A CA's financial truth lives in **Tally and the government portals
   (GST, AIS/26AS, TRACES)** — not in email. Grounding financial answers on email is the one place
   most likely to be wrong, which undercuts our own "never hallucinate" promise.
2. **"Search your docs" is now a commodity.** Every tool has it. It is not a reason to buy or a moat.
3. **We're priced above the incumbent for less work.** Suvit / Vyapar TaxOne already does the *real*
   work (Tally automation, GST reconciliation, client chat) for **~₹10,000/year per firm** with
   **30,000+ CAs**. Our plan — **₹499/seat/month (~₹6,000/user/year)** — costs a 4-person firm more
   (~₹24k/yr) to do *less*.
4. **We bet on a daily-search habit that won't form.** The PRD targets "≥5 useful queries/user/day."
   Searching email is occasional, not daily. The high-value moments in a CA's day are **event-driven**
   (a notice lands, a deadline nears, a mismatch appears) — i.e. *push*, not *pull*.

### The market in three numbers

- **~100,000 CA firms** in India; **~72% are solo / single-partner**. Our buyer is mostly a one-person shop.
- **Notices are exploding** — the tax department now runs **AI that cross-matches ITR ↔ AIS/26AS ↔ GST ↔ TDS**; any mismatch auto-fires a notice. This pain is large, rising, deadline-bound, and **unowned**.
- **Suvit: 30,000+ CAs at ~₹10k/firm/year** — the incumbent already owns "do the work." We must not
  fight them on data-entry; we win on a job they underserve.

_Sources: ICAI 2025 member/firm data; Suvit/Vyapar TaxOne site & pricing; 2025–26 reporting on rising
AI-driven tax/GST scrutiny. See git history of this file for links._

---

## 2. Positioning

### What we ARE
- The **notice-response and compliance-prevention copilot** for Indian CAs.
- **Push-first**: we tell the CA what needs action before they have to ask.
- **Grounded in real sources**: the actual notice + a curated, current library of Indian tax law —
  and later, the client's actual books.

### What we are NOT
- ❌ "Chat with your inbox" (that's plumbing, never the headline).
- ❌ A data-entry / bookkeeping automation tool (that fight is lost to Suvit — do not pick it).
- ❌ A per-seat search subscription.

### Positioning statement
> For small Indian CA firms drowning in rising government notices and compliance deadlines, **[Product]**
> is the AI copilot that reads notices, drafts law-backed replies, and catches the mismatches that cause
> notices *before* they land — unlike generic "AI chat" tools or data-entry automators, it is grounded
> in actual Indian tax law and the client's own books, with privacy and citations built in.

### The strategic shifts (apply to everything below)
| From | To |
| --- | --- |
| Search (pull) | Alerts & actions (push) |
| Email as the source of truth | Statutory law + books as the source of truth |
| React to notices | **Prevent** notices |
| Per-seat pricing | Per-client pricing (+ free/cheap solo tier) |
| Telegram | **WhatsApp** |
| RAG as the product | RAG as the engine under a workflow |

---

## 3. Roadmap

Three phases. Each phase must stand on its own as a reason to pay. **Do not start Phase 2 until Phase 1
has paying, retained users.**

### Phase 0 — Re-platform the positioning (weeks, not months)
Cheap, high-leverage changes that unblock everything.
- [ ] **WhatsApp** as the primary conversational/notification channel (Telegram → legacy). Most CA
      clients live on WhatsApp; Telegram penetration is ~zero.
- [ ] **Re-price per active client**, with a free/cheap **solo tier** (72% of firms are solo).
- [ ] Reframe the existing alert/deadline features around **push** ("here's what needs you today").
- [ ] Update marketing/landing copy from "search your docs" → "handle your notices."

**Reuses:** existing alert engine (`alert-detector.ts`), deadline extraction, Telegram code (adapt to WhatsApp).

---

### Phase 1 — The Notice-Response Copilot 🎯 (the beachhead)
**Goal:** Own the single most painful, rising, unowned job in a CA's week. **No integrations required.**

**The flow:** CA forwards / uploads a notice (GST ASMT-10, DRC, IT §143(2)/142(1), etc.)
→ AI explains it in plain language → drafts a proper, **law-backed, cited reply** → tracks the deadline.

**The moat is the corpus, not the retrieval code.** Build a **curated, versioned library of Indian
tax law** (GST Act, Income Tax Act, ICAI standards, and — critically — *current* circulars &
notifications). This is what competitors can't trivially copy, and it turns RAG from "search my mail"
into a genuine research copilot.

- [ ] Notice ingestion (upload + WhatsApp + email forward) and notice-type classification.
- [ ] **Statutory corpus pipeline** — ingest, version, and keep current (circulars/notifications change constantly).
- [ ] Notice → explanation + drafted reply, grounded in the corpus, with citations to specific sections.
- [ ] Deadline auto-tracked; reminders pushed.
- [ ] **Hybrid retrieval**: route exact figures/dates to structured lookup, narrative to vector search.
      (Cosine similarity over `"Column: value"` rows is a precision trap for the numbers that matter.)

**Reuses:** `rag.ts` (retrieval engine), `drafts.ts` (reply generation), alert/deadline tracking,
the entire trust/security stack (citations, audit log, Mumbai residency, encryption).

**Why first:** Highest pain × rising volume × no incumbent × perfect fit for what we already built ×
needs **no Tally, no portal access, no new OAuth scopes** — fits inside the lightweight, privacy-first
scope the PRD already committed to.

**Win condition:** CAs forward us notices without being asked. Retention driven by event frequency, not a search habit.

---

### Phase 2 — Tally: from *react* to *prevent* (the moat-deepener)
**Goal:** Become impossible to remove by seeing the client's actual books — and using them to **prevent
notices before they happen.**

> **The trap to avoid:** Do NOT integrate Tally to copy Suvit's data-entry automation. That's their
> strongest feature and a fight we'd lose. Integrate Tally to do what they *underdo*: **mismatch
> detection and prevention.**

What the books unlock:
- [ ] **Truthful financial answers** — questions answered from the actual ledgers, killing hallucination risk.
- [ ] **Reconciliation** — books vs GST returns vs bank vs TDS (the core monthly billable work).
- [ ] **Notice prevention radar** — detect the mismatches that cause notices (GSTR-1 vs 3B, ITC vs 2B,
      GST-vs-ITR receipts) and warn the CA *first*. This is the killer differentiator: **"we stop the
      notice before it lands."**

**Technical posture:** read-only sync from Tally (desktop/on-prem; connector is fiddly — budget for
support burden). Read-only keeps us inside our trust-first story.

**Reuses:** Phase 1 corpus + reconciliation logic feeds the same alert/notice surfaces.

---

### Phase 3 — Portal data (later, carefully)
**Goal:** Complete the prevention loop by seeing the *department's* side (GST portal, AIS/26AS, TRACES).

A notice is born from a gap between **books (Tally)** and **portal (department)**. Phase 2 gives us
the books; this gives us the other half. But portal access is the hardest part — no clean official APIs,
legal/ToS grey areas, sensitive credentials. Only attempt after trust is firmly established.

---

## 4. What we keep (none of the current build is wasted)
The pivot is **positioning + corpus**, not a rewrite. The following are real assets and the substrate
for everything above:
- Security, multi-tenancy (firmId isolation + RLS backstop), cost controls — better than most rivals.
- Citation / anti-hallucination discipline.
- Alert detection, deadline extraction/calendar, email drafting — the push-first primitives.
- RAG retrieval engine (`rag.ts`) — repointed at notices + statutory law + books.

## 5. Pricing
- **Per active client**, not per seat (value scales with clients managed, not headcount).
- **Free / cheap solo tier** — 72% of the market is single-partner; per-seat is meaningless there.
- Notice-handling and prevention command higher willingness-to-pay than search ever could.

## 6. Risks to watch
- **Statutory corpus freshness** — circulars/notifications change constantly; stale law = wrong replies. This is operational, not optional.
- **Tally connector support cost** — desktop/on-prem integration is a real support burden; scope read-only.
- **Suvit / Vyapar TaxOne** — well-funded incumbent; avoid their turf (data entry), win on notices + prevention.
- **Trust** — we handle clients' financials; keep residency/encryption/audit/citations front and centre as a selling point.

## 7. Success metrics by phase
| Phase | Leading signal | Lagging signal |
| --- | --- | --- |
| 0 | WhatsApp opt-in rate; solo-tier signups | Activation rate |
| 1 | Notices forwarded per firm / week (unprompted) | Paid conversion; retention |
| 2 | Tally connections; mismatches surfaced before a notice | Notices *prevented*; expansion revenue |
| 3 | Portal links established | Full prevention-loop coverage |

---

**Bottom line:** Notices get us in the door with no integration risk. **Tally is what makes us
impossible to remove** — used for *prevention*, not the data-entry war. Start light, earn trust, go deep.
