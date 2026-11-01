**Bulk email verifier and email validator for Apify.** Paste a list of addresses, or pipe in a dataset from any scraper, and get one row per email: a `safe`, `risky`, `invalid` or `unknown` verdict, catch-all and disposable flags, role and free-provider detection, typo suggestions and a 0–100 quality score. Check whether an email is valid without sending anything. No API key, no extra account, no setup.

[![How to verify emails in bulk on Apify](https://img.youtube.com/vi/JLFtUm_f4F0/hqdefault.jpg)](https://www.youtube.com/watch?v=JLFtUm_f4F0)

## What does this email verifier do?

It runs each address through syntax, MX and live SMTP checks, then tells you whether the mailbox can receive mail. Use it to clean an email list before a campaign, validate scraped leads before they reach your CRM, or score contacts by quality. The verification engine is built by Verifox.

- **Real SMTP checks**, not just a syntax or MX lookup.
- **Catch-all deep check** on accept-all Gmail and Microsoft domains. In realtime mode the Actor waits for it and retries a `risky` catch-all once.
- **Disposable and role detection** to drop temp-mail addresses and shared inboxes such as `info@` or `sales@`.
- **0–100 quality score** to rank and threshold a list.
- **Reliable by default**: automatic retry and backoff on rate limits and temporary errors, and every address gets a row.
- **Up to 100,000 emails** in one bulk job.

## How to verify emails in bulk

1. Click **Try for free**.
2. Paste your emails into the **Emails** field, or map an email field from another Actor's dataset.
3. Click **Start**.
4. Download the results as CSV, Excel or JSON, or read them through the API.

Duplicates are removed before verification, so each unique address is checked once. Run time depends on list size and on how many domains are catch-all.

## How much does email verification cost?

**From $4.00 per 1,000 results ($0.004 per email)**, with lower prices on higher Apify plans:

| Apify plan | Price per 1,000 results |
|------------|-------------------------|
| Free, Starter | $4.00 |
| Scale | $3.50 |
| Business | $3.00 |

Each run also has an Actor start event of $0.00005. There are no platform compute charges on top, so the cost is list size × rate. You can cap any run with **Maximum cost per run**.

Each address produces one result. A row where an address could not be checked (`ok: false`) is still a result and is charged the same way.

Apify's free plan includes $5 of monthly usage, which covers about 1,250 emails at this price.

## What data do you get?

| Field | Meaning |
|-------|---------|
| `email` | The address checked |
| `reachable` | Deliverability verdict: `safe`, `risky`, `invalid` or `unknown` |
| `isValid` | Passes syntax, MX and SMTP |
| `score` | Quality score from 0 to 100 |
| `syntax` | Address format is valid |
| `smtp` | `hostExists`, `deliverable`, `catchAll`, `fullInbox`, `disabled` |
| `isDisposable` | Throwaway or temp-mail provider |
| `isRole` | Role address such as `info@` or `sales@` |
| `isFree` | Free provider such as Gmail or Yahoo |
| `hasGravatar` | Address has a Gravatar profile |
| `suggestion` | Typo fix (`gmial.com` → `gmail.com`), or `null` |
| `domain`, `source`, `verifiedAt` | Domain, result source, ISO timestamp |
| `ok`, `error` | `false` plus a reason if an address could not be checked |

A run summary with counts by verdict is saved to the key-value store as `OUTPUT`.

### Output example

```json
{
  "email": "support@stripe.com",
  "reachable": "safe",
  "isValid": true,
  "score": 85,
  "syntax": true,
  "smtp": { "hostExists": true, "deliverable": true, "catchAll": false, "fullInbox": false, "disabled": false },
  "isDisposable": false,
  "isRole": true,
  "isFree": false,
  "hasGravatar": true,
  "suggestion": null,
  "domain": "stripe.com",
  "source": "verifox",
  "verifiedAt": "2026-10-31T10:38:32.308Z",
  "ok": true
}
```

## Input

| Field | Required | Description |
|-------|----------|-------------|
| `emails` | Yes | List of email addresses to verify |
| `mode` | No | `auto` (default), `realtime` or `bulk` |
| `concurrency` | No | Parallel checks in realtime mode, 1–20 (default 5) |

### Verification modes

| Mode | How it works | Best for |
|------|--------------|----------|
| **Auto** (default) | Bulk above 500 emails, realtime otherwise | Most runs |
| **Realtime** | One request per email, streamed as each finishes, with the catch-all deep check and retry | Small and medium lists |
| **Bulk** | Submits the whole list as one job, then collects the results when the job completes | Large lists, up to 100,000 |

## Use it as an email verification API

Call the Actor from your own code with the Apify API. This request runs it and returns the results:

```bash
curl -X POST "https://api.apify.com/v2/acts/verifox~verifox-apify/run-sync-get-dataset-items?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emails": ["jane@example.com", "sales@example.org"]}'
```

- **Chain it after a scraper**: map the email field of any lead scraper dataset into `emails`.
- **Automate it**: schedule runs, or connect it to Make, n8n, Zapier and other tools through Apify's integrations.
- **Use it from an AI agent**: call it through the Apify MCP server in Claude, Cursor and other MCP clients.

## Use cases

- **Clean an email list** before importing it into a CRM or outreach tool.
- **Protect sender reputation** by removing invalid and disposable addresses before a cold email campaign.
- **Validate scraped leads** from LinkedIn, Google Maps or directory scrapers.
- **Score and segment** contacts with the 0–100 quality score.

## FAQ

**How do I check if an email address is valid?**
Paste it into the Emails field and start the run. The `reachable` field tells you whether the address is `safe`, `risky`, `invalid` or `unknown`, and `isValid` gives a yes or no.

**Does verification send an email?**
No. The checks stop before any message is sent, so the person never receives anything.

**What is a catch-all email?**
A catch-all domain accepts mail for any address, so a plain SMTP check cannot tell whether one mailbox exists. The `smtp.catchAll` field flags these domains. In realtime mode the Actor runs a deep check on them to reach a firmer verdict; a result can still stay `risky`.

**What is the difference between an email verifier and an email validator?**
Most people use the terms interchangeably. Validation usually means format and domain checks, while verification also tests the mailbox over SMTP. This Actor does both.

**Do I need an API key or a separate account?**
No. You only need an Apify account. Verification is fully managed.

**How many emails can I verify at once?**
Up to 100,000 in one bulk job. Above 500 emails, auto mode switches to bulk.

**What happens if an address can't be checked?**
You still get a row, with `ok: false` and the reason, so nothing is dropped from your list.

**Something isn't working. What should I do?**
Open an issue on the **Issues** tab with the run ID and we will look into it.
