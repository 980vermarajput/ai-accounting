AI Assistant for Accountants — MVP Gap Analysis & Improvements

Version: 2.2
Based on PRD v2.1 Review
Date: 2026-02-26
Owner: Engineering + Product

1. Critical Improvements Before Pilot

These items should be prioritized before or during pilot phase to increase trust, accuracy, and cost control.

1.1 Add Answer Confidence Scoring
Problem

Users currently receive answers with citations but no indication of reliability level.
In financial contexts, perceived certainty matters as much as correctness.

Solution

Add computed confidence field in /api/chat response:

"confidence": {
  "level": "high | medium | low",
  "score": 0.82
}

Suggested Formula
confidence_score =
  (avg_similarity × 0.6)
  + (context_coverage_ratio × 0.3)
  + (recency_weight_avg × 0.1)


Mapping:

Score Range	Level
> 0.75	High
0.55–0.75	Medium
< 0.55	Low
UI Display

🟢 High Confidence — Based on 3 recent documents

🟡 Medium Confidence — Based on older records

🔴 Low Confidence — Limited supporting documents

Impact

Builds trust

Reduces blind reliance

Improves pilot feedback quality

1.2 Gmail Thread-Level Modeling
Problem

Currently storing Gmail messages individually via source_id.
Accountants think in threads, not isolated messages.

Required Changes

Add to documents:

gmail_thread_id VARCHAR(255)

Improvements

Aggregate embeddings per thread

Add endpoint: POST /api/chat/thread-summary

Allow "Summarize latest communication with XYZ"

Impact

Better communication summaries

More coherent RAG context

Higher perceived intelligence

1.3 Semantic Query Caching (Cost Control)
Problem

Repeated queries will increase OpenAI costs rapidly during demos and pilots.

Solution

Add query fingerprinting:

hash = SHA256(firm_id + normalized_query + client_id + filters)


If identical query exists within 24 hours → return cached response.

Cache Storage

Redis (fast path)

Optional persistent table query_cache

Expected Impact

30–50% reduction in chat costs

Lower latency

More stable infra costs

1.4 Structured Spreadsheet Processing
Problem

Raw XLSX → text embeddings degrade semantic quality.

Improvement Strategy

Instead of embedding raw rows:

Convert rows into structured semantic sentences:

Example:

Invoice INV-2025-007 | Amount ₹45,000 | Due 2026-03-10 | Status Unpaid


Then embed that.

Additional Enhancements

Preserve sheet names

Preserve column headers

Detect invoice-like schema automatically

Impact

Much higher retrieval precision

Better financial query accuracy

Reduced hallucination risk

1.5 Clarify Data Visibility Model
Problem

Unclear if data is:

User-scoped

Or firm-wide shared

Decision Required

Choose explicitly:

Option A:

Firm-level knowledge base. All synced content visible to firm members.

Option B:

User-level siloed data.

Recommendation

Use Firm-level knowledge base with clear consent messaging.

Impact

Prevent confusion

Avoid internal trust issues

Clear compliance positioning

2. High-Impact Product Additions

These features significantly increase daily usage and retention.

2.1 Client Snapshot API
New Endpoint
GET /api/clients/:id/summary

Response Should Include

Last communication date

Outstanding invoice count

Pending compliance items

Last sync timestamp

Recent documents

Risk indicator

Purpose

Accountants want:

“Give me a 30-second client briefing.”

Impact

High daily usage driver
Improves perceived intelligence of product

2.2 Predefined Compliance Query Templates

Add quick action chips in UI:

Outstanding invoices

Pending TDS certificates

GST filing status

Latest communication summary

Why This Matters

Indian CAs prefer structured queries.
Reduces typing friction.
Improves adoption among non-technical users.

2.3 WhatsApp-Formatted Output Mode

Add export option:

Copy formatted summary for WhatsApp

Condensed, clean, mobile-friendly format

Reason

Large percentage of CA-client communication happens on WhatsApp.

Impact

Immediate usability boost

Increases real-world relevance

Improves stickiness

3. Accuracy & Retrieval Improvements
3.1 Avoid Low Similarity Fallback

Current fallback:

Primary threshold: 0.55
Fallback: 0.35

Risk

0.35 similarity may retrieve irrelevant context.

Recommendation

If no chunks above 0.55:
Return:

"I don't have enough information..."

Accuracy > Recall for financial systems.

3.2 Consider Hybrid Search (Future)

At scale, move to:

Vector search (pgvector)

Keyword/BM25 search

Hybrid ranking

Improves precision for invoice numbers, GSTIN, IDs.

3.3 Upgrade Index Type (Future Scaling)

Currently:

ivfflat (lists = 100)


At scale consider:

HNSW index (better recall + performance)

4. Structured Data Evolution (v3 Direction)
4.1 Extract Financial Entities

Move from pure RAG to hybrid structured system.

Extract and store:

Invoice number

GSTIN

Amount

Due date

Status

Compliance type

Store in relational tables.

Then queries like:

“Show unpaid invoices for ABC”

Can use structured SQL + RAG fallback.

4.2 Client Risk Scoring

Automatically detect:

No communication in 90 days

Repeated unpaid invoices

Missing compliance docs

Frequent deadline extensions

Return:

"client_risk": "low | medium | high"

4.3 Proactive Alerts (Long-Term)

Shift from reactive to proactive.

Examples:

Invoice due in 3 days

No GST filing found for current quarter

Client inactive for 60 days

This increases dependency on product.

5. Cost & Scaling Optimizations
5.1 Aggressive Query Caching

Cache repeated queries

Cache common summaries

Cache embeddings of frequently referenced documents

5.2 Token Guardrails

Implement:

Max context token limit enforcement

Dynamic chunk truncation

Cost alerting per firm

5.3 Embedding Cost Optimization (Future)

At 100+ firms consider:

Self-hosted embedding model (e.g., BGE)

Hybrid embed + keyword retrieval

6. UX Trust Enhancements
6.1 Display Retrieval Metadata

Show:

Documents searched

Documents used

Last updated timestamp

Confidence level

Transparency increases adoption.

6.2 Explicit "Not Enough Information" UX

Instead of plain message:

Display:

Why information is missing

Suggested follow-up queries

Button: “Expand search range”

7. Pilot-Phase Execution Strategy
Before Pilot

Implement confidence scoring

Add query caching

Clarify data visibility

Harden similarity threshold

During Pilot

Track:

Avg queries per user

Repeated query patterns

Low confidence frequency

Cost per firm

Conduct weekly feedback calls

After Pilot

Add Client Snapshot

Add Compliance Templates

Improve XLSX semantic parsing

8. Strategic Positioning Insight

Do not position as:

“AI for accountants”

Position as:

“Search your firm’s brain in 3 seconds.”

Accountants pay for:

Time savings

Risk reduction

Audit defensibility

Context recall

Not AI novelty.

9. Priority Matrix
Must Do Before Scaling

Confidence scoring

Query caching

Gmail thread modeling

Remove low similarity fallback

High ROI Additions

Client snapshot

Compliance templates

WhatsApp export

Future Strategic Upgrades

Structured invoice database

Client risk scoring

Proactive alerts

Hybrid search