import { Actor } from 'apify';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const apiKey = process.env.VERIFOX_API_KEY;
const concurrency = Math.max(1, Math.min(Number(input.concurrency) || 5, 20));
const apiBaseUrl = 'https://api.verifox.ai';
const mode = ['auto', 'realtime', 'bulk'].includes(input.mode) ? input.mode : 'auto';

let raw = input.emails ?? [];
if (typeof raw === 'string') raw = raw.split(/[\n,;]+/);
if (!Array.isArray(raw)) raw = [];
const emails = [...new Set(raw.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

if (emails.length === 0) {
  await Actor.setStatusMessage('No emails provided — nothing to verify.');
  await Actor.exit();
}

if (!apiKey) {
  await Actor.pushData({
    email: emails[0],
    ok: false,
    error: 'Actor is not configured yet (missing VERIFOX_API_KEY). The owner must set it in Actor Settings → Environment variables.',
  });
  await Actor.setStatusMessage('Actor not configured — VERIFOX_API_KEY is not set.');
  await Actor.exit();
}

const headers = { 'content-type': 'application/json', 'x-api-key': apiKey };
const singleUrl = `${apiBaseUrl}/v1/email-validation`;
const bulkUrl = `${apiBaseUrl}/v1/email-validation/bulk`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt) => Math.min(1000 * 2 ** attempt, 15000);

const summary = {
  total: emails.length,
  verified: 0,
  failed: 0,
  reachable: { safe: 0, risky: 0, invalid: 0, unknown: 0 },
};

async function fetchWithRetry(url, options = {}, retries = 3) {
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      if (attempt >= retries) throw err;
      await sleep(backoff(attempt++));
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
      attempt += 1;
      continue;
    }
    return res;
  }
}

async function readFinalSSEResult(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastResult = null;
  let errorMessage = null;

  const handleEvent = (block) => {
    let name = 'message';
    const data = [];
    for (const rawLine of block.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length === 0) return;
    const payload = data.join('\n');
    if (name === 'result') {
      try {
        lastResult = JSON.parse(payload);
      } catch {
        /* superseded by a later event */
      }
    } else if (name === 'error') {
      try {
        errorMessage = JSON.parse(payload)?.error ?? payload;
      } catch {
        errorMessage = payload;
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      handleEvent(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
    }
  }
  if (buffer.trim()) handleEvent(buffer);

  if (lastResult) {
    const { deepCheckPending, ...result } = lastResult;
    return { result };
  }
  return { error: errorMessage ?? 'Stream ended without a result.' };
}

function assertAuthAndCredits(status) {
  if (status === 401 || status === 403) {
    throw new Error('Verification is temporarily unavailable (auth error). Please try again later.');
  }
  if (status === 402) {
    throw new Error('Verification is temporarily unavailable (capacity). Please try again later.');
  }
}

async function record(row) {
  if (row.ok) {
    summary.verified += 1;
    const r = String(row.reachable ?? 'unknown');
    if (r in summary.reachable) summary.reachable[r] += 1;
    else summary.reachable.unknown += 1;
  } else {
    summary.failed += 1;
  }
  await Actor.pushData(row);
}

const useBulk = mode === 'bulk' || (mode === 'auto' && emails.length > 500);

try {
  if (useBulk) await runBulk();
  else await runRealtime();
  await Actor.setValue('OUTPUT', summary);
  await Actor.setStatusMessage(
    `Done — ${summary.verified} verified (safe ${summary.reachable.safe}, risky ${summary.reachable.risky}, invalid ${summary.reachable.invalid}), ${summary.failed} failed.`,
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  await Actor.setValue('OUTPUT', { ...summary, error: message });
  await Actor.fail(`Run failed: ${message}`);
}

await Actor.exit();

async function runRealtime() {
  let cursor = 0;
  let done = 0;
  const total = emails.length;

  async function verifyOne(email, refresh = false) {
    const url = refresh ? `${singleUrl}?refresh=true` : singleUrl;
    try {
      const res = await fetchWithRetry(url, {
        method: 'POST',
        headers: { ...headers, accept: 'text/event-stream' },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(150000),
      });
      assertAuthAndCredits(res.status);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { email, ok: false, statusCode: res.status, error: text.slice(0, 300) };
      }
      if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        const final = await readFinalSSEResult(res);
        if (final.result) return { email, ok: true, ...final.result };
        return { email, ok: false, error: final.error };
      }
      return { email, ok: true, ...(await res.json()) };
    } catch (err) {
      if (err instanceof Error && /temporarily unavailable/.test(err.message)) throw err;
      return { email, ok: false, error: String(err?.message ?? err) };
    }
  }

  async function worker() {
    while (cursor < total) {
      const email = emails[cursor++];
      let row = await verifyOne(email);
      if (row.ok && row.reachable === 'risky' && row.smtp?.catchAll) {
        const fresh = await verifyOne(email, true);
        if (fresh.ok) row = fresh;
      }
      await record(row);
      done += 1;
      if (done % 25 === 0 || done === total) {
        await Actor.setStatusMessage(`Verified ${done}/${total}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
}

async function runBulk() {
  const submit = await fetchWithRetry(bulkUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input: emails, list_name: 'Apify run' }),
  });
  assertAuthAndCredits(submit.status);
  if (!submit.ok) {
    const text = await submit.text().catch(() => '');
    throw new Error(`Bulk submit failed (${submit.status}): ${text.slice(0, 300)}`);
  }
  const { jobId, totalEmails } = await submit.json();
  if (!jobId) throw new Error('Bulk submit returned no jobId.');
  await Actor.setStatusMessage(`Bulk job ${jobId} submitted (${totalEmails ?? emails.length}). Verifying…`);

  const TERMINAL = new Set(['completed', 'failed', 'stopped']);
  const deadline = Date.now() + 6 * 60 * 60 * 1000;
  let status = 'processing';
  while (!TERMINAL.has(status)) {
    if (Date.now() > deadline) throw new Error(`Bulk job ${jobId} did not finish within 6h.`);
    await sleep(5000);
    const p = await fetchWithRetry(`${bulkUrl}/${jobId}/progress`, { headers });
    if (!p.ok) continue;
    const pd = await p.json().catch(() => ({}));
    if (typeof pd.status === 'string') status = pd.status;
    const processed = pd.processedRecords ?? pd.processed ?? '?';
    const totalRec = pd.totalRecords ?? totalEmails ?? emails.length;
    await Actor.setStatusMessage(`Bulk ${jobId}: ${status} (${processed}/${totalRec})`);
  }
  if (status === 'failed') throw new Error(`Bulk job ${jobId} failed.`);

  let cursor = 0;
  let pushed = 0;
  while (cursor !== null && cursor !== undefined) {
    const r = await fetchWithRetry(`${bulkUrl}/${jobId}/results?cursor=${cursor}&limit=1000`, { headers });
    if (!r.ok) break;
    const rd = await r.json().catch(() => ({}));
    const rows = Array.isArray(rd.results) ? rd.results : [];
    for (const row of rows) await record({ ok: true, ...row });
    pushed += rows.length;
    cursor = rd.next_cursor ?? null;
    await Actor.setStatusMessage(`Fetched ${pushed} result(s)…`);
    if (rows.length === 0) break;
  }
}
