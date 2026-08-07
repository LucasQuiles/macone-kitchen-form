/* ============================================================
   Envelope store for the two-party countersign flow.
   Backed by a PRIVATE GitHub repo (durable, survives Render free-tier
   cold starts / redeploys). One JSON file per envelope under
   envelopes/<id>.json. Optimistic concurrency via the blob SHA.
   Env: GITHUB_TOKEN (repo scope), ENVELOPE_REPO ("owner/name").
   ============================================================ */
"use strict";

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.ENVELOPE_REPO; // "LucasQuiles/macone-envelopes"
const API = "https://api.github.com";

function headers() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "macone-countersign",
  };
}

function enabled() {
  return Boolean(TOKEN && REPO);
}

function pathFor(id) {
  return `envelopes/${String(id).replace(/[^A-Za-z0-9_-]/g, "")}.json`;
}

// Returns { data, sha } or { data: null, sha: null } when absent.
async function get(id) {
  const url = `${API}/repos/${REPO}/contents/${pathFor(id)}`;
  const r = await fetch(url, { headers: headers() });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error(`store.get ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const raw = Buffer.from(j.content || "", "base64").toString("utf8");
  return { data: JSON.parse(raw), sha: j.sha };
}

// Create or update. Pass sha (from a prior get) to update; omit to create.
async function put(id, data, sha) {
  const url = `${API}/repos/${REPO}/contents/${pathFor(id)}`;
  const body = {
    message: `envelope ${id} — ${data.status || "update"}`,
    content: Buffer.from(JSON.stringify(data, null, 2), "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`store.put ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.content && j.content.sha;
}

// Read-modify-write with a small retry on SHA conflict (409/422).
async function update(id, mutate, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const { data, sha } = await get(id);
    if (!data) throw new Error(`envelope ${id} not found`);
    const next = await mutate(JSON.parse(JSON.stringify(data)));
    try {
      await put(id, next, sha);
      return next;
    } catch (e) {
      lastErr = e;
      if (!/ 409:| 422:/.test(String(e.message))) throw e;
      await new Promise((res) => setTimeout(res, 150 * (i + 1)));
    }
  }
  throw lastErr || new Error("store.update exhausted retries");
}

module.exports = { enabled, get, put, update };
