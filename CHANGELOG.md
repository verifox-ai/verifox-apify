# Changelog

## 0.3.4
- Security: removed the `apiBaseUrl` input. It let a run send the Actor's Verifox
  key to any URL. The API base is now fixed.
- Pricing: Store discounts added, $3.50 per 1,000 on Scale and $3.00 on Business.
- Store listing: new title, description and README. Pricing copy now says every
  result row is charged, including `ok: false` rows.

## 0.3.3
- Align to the live pay-per-result pricing ($0.004 per email checked). Removed the
  no-op `email-verified` charge call (Apify meters the default-dataset item event
  automatically); updated README/description to match.

## 0.3.2
- Catch-all retry: in realtime mode, a "risky" verdict on a catch-all domain now
  triggers one fresh deep check (?refresh=true) before it's accepted, since a
  stale cache or an unresolved first probe often resolves to safe/invalid on the
  second attempt.

## 0.3.1
- Realtime mode now verifies over SSE, so catch-all Gmail/Microsoft addresses get
  the server's deep-check upgrade (risky → safe/invalid) instead of the tighter
  40s non-streaming budget that leaves them stuck at "risky". Bulk mode already
  runs the catch-all enhancement server-side.

## 0.3.0
- Fully managed: removed the user-facing API key. Verification now runs on a
  Verifox key set by the owner as a secret env var (`VERIFOX_API_KEY`) — users
  paste only emails.
- Monetization: pay-per-event billing — each successfully verified email is
  metered via `Actor.charge('email-verified')`. Failed/unverifiable rows are free.
- Docs updated for the no-key, pay-per-result model.

## 0.2.0
- Reliability: automatic retry with backoff on rate-limits (429), transient 5xx,
  and network errors — for both realtime and bulk paths.
- Run summary written to the key-value store as `OUTPUT` (counts by verdict).
- Cleaner status messages and end-of-run summary.
- World-class README (features, output example, use cases, integrations, FAQ).

## 0.1.0
- Initial release: realtime + bulk verification, auto mode, BYO Verifox API key,
  full-field dataset output with a labelled table view.
