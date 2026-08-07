/* ============================================================
   Macone Kitchen Remodel — submission backend (Render web service)
   Receives the signed order-form JSON and emails it via Resend.
   The Resend API key never leaves the server.
   ============================================================ */
"use strict";

const express = require("express");
const crypto = require("crypto");
const { buildPdf } = require("./pdf");
const { buildContractPdf, contractClauses } = require("./contract");
const store = require("./store");

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL || "al@quiles.studio";
// Optional copy recipients (comma-separated), e.g. the contractor. Sent as Cc.
const CC_EMAIL = (process.env.CC_EMAIL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const FROM_EMAIL = process.env.FROM_EMAIL || "Macone Kitchen Form <noreply@quiles.studio>";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const app = express();
app.use(express.json({ limit: "5mb" })); // signature PNG data URL can be large

// ---- CORS ----
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Vary", "Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- Health / warm-up ----
app.get("/", (_req, res) => res.type("text/plain").send("Macone kitchen form backend — OK"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");
const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function buildHtml(d) {
  const p = d.property || {};
  const addr = [p.street, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join(" · ");
  const t = d.totals || {};
  const rows = (d.selections || [])
    .map(
      (s) =>
        `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(s.desc)}</td>` +
        `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-weight:600">${esc(s.priceLabel || money(s.price))}</td></tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1B1F2A;max-width:640px">
    <h2 style="margin:0 0 4px">Kitchen Remodel — Signed Selections</h2>
    <p style="color:#464C5A;margin:0 0 16px">Submitted ${esc(d.signed_at || "")}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr><td style="padding:4px 0;color:#464C5A">Homeowner</td><td style="padding:4px 0;font-weight:600">${esc(d.homeowner)}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Homeowner email</td><td style="padding:4px 0">${esc(d.homeowner_email) || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Property</td><td style="padding:4px 0">${esc(addr) || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Contractor</td><td style="padding:4px 0;font-weight:600">${esc(d.contractor)}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Estimate date</td><td style="padding:4px 0">${esc(d.estimate_date) || "—"}</td></tr>
    </table>

    <h3 style="margin:0 0 6px">Selected work (labor)</h3>
    <table style="width:100%;border-collapse:collapse;border-top:2px solid #1B1F2A">${rows}</table>

    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr><td style="padding:4px 10px;color:#464C5A">Section 1 — Cabinets</td><td style="padding:4px 10px;text-align:right">${money(t.section1)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Section 2 — Island</td><td style="padding:4px 10px;text-align:right">${money(t.section2)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Section 3 — Widen opening</td><td style="padding:4px 10px;text-align:right">${money(t.section3)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Section 4 — Add-ons</td><td style="padding:4px 10px;text-align:right">${money(t.section4)}</td></tr>
      <tr style="background:#1B1F2A;color:#fff"><td style="padding:8px 10px;font-weight:700">LABOR TOTAL</td><td style="padding:8px 10px;text-align:right;font-weight:700">${money(t.labor_total)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Deposit (50%)</td><td style="padding:4px 10px;text-align:right">${money(t.deposit)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Balance (50%)</td><td style="padding:4px 10px;text-align:right">${money(t.balance)}</td></tr>
    </table>

    <h3 style="margin:18px 0 6px">Signature</h3>
    <p style="margin:0 0 6px"><strong>${esc(d.signature && d.signature.name)}</strong> — signed ${esc(d.signature && d.signature.date)}</p>
    <img src="cid:signature" alt="signature" style="border:1px solid #D8D2C6;border-radius:6px;max-width:360px;background:#fff" />
    <p style="color:#8a8f99;font-size:11px;margin-top:14px">Audit: ${esc(d.user_agent || "")}</p>
  </div>`;
}

// Send an email via Resend. Returns the message id. Throws on failure.
async function sendResendEmail({ to, cc, subject, html, attachments, replyTo }) {
  const body = {
    from: FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    attachments,
  };
  if (cc && cc.length) body.cc = cc;
  if (replyTo) body.reply_to = replyTo;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error("resend failed");
    err.detail = out;
    err.status = r.status;
    throw err;
  }
  return out.id;
}

// Build the fully-executed attachments for a finalized contract object `d`:
//   1. the full Residential Home Improvement Contract (primary legal doc)
//   2. the itemized signed order-form receipt
//   3. submission.json (machine-readable record)
async function buildAttachments(d) {
  const owner = d.homeowner || "Homeowner";
  const slug = String(owner).replace(/[^A-Za-z0-9]+/g, "-");

  let contractB64 = null;
  try {
    contractB64 = (await buildContractPdf(d)).toString("base64");
  } catch (e) {
    console.error("contract pdf build failed", e);
  }
  let receiptB64 = null;
  try {
    receiptB64 = (await buildPdf(d)).toString("base64");
  } catch (e) {
    console.error("receipt pdf build failed", e);
  }

  const contractName = `Home-Improvement-Contract-${slug}-executed.pdf`;
  const receiptName = `Kitchen-Order-Form-${slug}-signed.pdf`;
  const attachments = [
    { filename: "submission.json", content: Buffer.from(JSON.stringify(d, null, 2)).toString("base64") },
  ];
  if (receiptB64) attachments.unshift({ filename: receiptName, content: receiptB64 });
  if (contractB64) attachments.unshift({ filename: contractName, content: contractB64 });
  return { attachments, contractB64, receiptB64, contractName, receiptName };
}

app.post("/submit", async (req, res) => {
  try {
    if (!RESEND_API_KEY) return res.status(500).json({ error: "email not configured" });
    const d = req.body || {};
    if (!d.selections || !d.selections.length) return res.status(400).json({ error: "no selections" });
    if (!d.signature || !d.signature.image) return res.status(400).json({ error: "no signature" });

    const b64 = String(d.signature.image).replace(/^data:image\/png;base64,/, "");
    const owner = d.homeowner || "Homeowner";
    const total = money(d.totals && d.totals.labor_total);

    // Completed, signed PDF of the order form (selections + totals + signature on the line)
    let pdfB64 = null;
    try {
      const pdfBuf = await buildPdf(d);
      pdfB64 = pdfBuf.toString("base64");
    } catch (e) {
      console.error("pdf build failed", e);
    }
    const pdfName = `Kitchen-Order-Form-${String(owner).replace(/[^A-Za-z0-9]+/g, "-")}-signed.pdf`;

    const attachments = [
      { filename: "signature.png", content: b64, content_id: "signature" },
      { filename: "submission.json", content: Buffer.from(JSON.stringify(d, null, 2)).toString("base64") },
    ];
    if (pdfB64) attachments.unshift({ filename: pdfName, content: pdfB64 });

    const emailBody = {
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `Kitchen selections — ${owner} — ${total} labor`,
      html: buildHtml(d) + (pdfB64 ? "" : "<p style=\"color:#b00\">(PDF generation failed — see JSON attachment.)</p>"),
      attachments,
    };
    if (CC_EMAIL.length) emailBody.cc = CC_EMAIL;
    if (d.homeowner_email) emailBody.reply_to = d.homeowner_email;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(emailBody),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Resend error", r.status, out);
      return res.status(502).json({ error: "email failed", detail: out });
    }
    console.log("Sent", out.id, "for", owner, total);
    return res.json({ ok: true, id: out.id });
  } catch (e) {
    console.error("submit error", e);
    return res.status(500).json({ error: "server error" });
  }
});

/* ============================================================
   Two-party countersign flow
   An "envelope" (created out-of-band, stored in the GitHub-backed
   store) holds the finalized contract + one signing token per party.
   Each party opens /sign?e=<id>&t=<token>, reviews the contract,
   enters their email + signature. When BOTH have signed, the fully
   executed & dated PDF is emailed to both parties (+ the office copy).
   ============================================================ */

const ROLES = { customer: "Homeowner", contractor: "Contractor" };
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const todayISO = () => new Date().toISOString().slice(0, 10);

// A complete street line has a house number (a leading digit). The finalized
// order only captured "Prospect Street", so the homeowner supplies the full
// address at signing time.
function hasStreetNumber(contract) {
  const street = ((contract || {}).property || {}).street || "";
  return /\d/.test(street);
}

function roleForToken(env, t) {
  if (!t || !env.tokens) return null;
  if (env.tokens.customer === t) return "customer";
  if (env.tokens.contractor === t) return "contractor";
  return null;
}

// Contract object for PDF/email once both parties have signed.
function finalizedContract(env) {
  const c = env.contract || {};
  const cust = env.signers.customer || {};
  const contr = env.signers.contractor || {};
  const signedAt = env.completed_at || new Date().toISOString();
  return {
    ...c,
    homeowner: cust.name || c.homeowner,
    homeowner_email: cust.email || c.homeowner_email,
    // Party reference on the contract stays as configured (e.g. "Heriberto");
    // the printed signature name is whatever the contractor typed.
    contractor: c.contractor || contr.name,
    contract_date: signedAt.slice(0, 10),
    customer_signature: { name: cust.name, date: cust.signed_date, image: cust.image },
    contractor_signature: { name: contr.name, date: contr.signed_date, image: contr.image },
    signed_at: signedAt,
    fully_executed: true,
  };
}

function finalHtml(d, env) {
  const p = d.property || {};
  const addr = [p.street, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join(" · ");
  const t = d.totals || {};
  const rows = (d.selections || [])
    .map((s) =>
      `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(s.desc)}</td>` +
      `<td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-weight:600">${esc(s.priceLabel || money(s.price))}</td></tr>`)
    .join("");
  const cust = env.signers.customer || {};
  const contr = env.signers.contractor || {};
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#1B1F2A;max-width:640px">
    <h2 style="margin:0 0 4px">Kitchen Remodel — Fully Signed Contract</h2>
    <p style="color:#1a7f37;margin:0 0 16px;font-weight:600">Executed by both parties. The countersigned, dated PDF is attached.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr><td style="padding:4px 0;color:#464C5A">Homeowner</td><td style="padding:4px 0;font-weight:600">${esc(cust.name || d.homeowner)}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Property</td><td style="padding:4px 0">${esc(addr) || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#464C5A">Contractor</td><td style="padding:4px 0;font-weight:600">${esc(contr.name || d.contractor)}</td></tr>
    </table>
    <h3 style="margin:0 0 6px">Selected work (labor)</h3>
    <table style="width:100%;border-collapse:collapse;border-top:2px solid #1B1F2A">${rows}</table>
    <table style="width:100%;border-collapse:collapse;margin-top:12px">
      <tr style="background:#1B1F2A;color:#fff"><td style="padding:8px 10px;font-weight:700">LABOR TOTAL</td><td style="padding:8px 10px;text-align:right;font-weight:700">${money(t.labor_total)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Deposit (50%)</td><td style="padding:4px 10px;text-align:right">${money(t.deposit)}</td></tr>
      <tr><td style="padding:4px 10px;color:#464C5A">Balance (50%)</td><td style="padding:4px 10px;text-align:right">${money(t.balance)}</td></tr>
    </table>
    <h3 style="margin:18px 0 6px">Signatures</h3>
    <p style="margin:0 0 4px"><strong>Homeowner:</strong> ${esc(cust.name)} — signed ${esc(cust.signed_date)}</p>
    <p style="margin:0 0 4px"><strong>Contractor:</strong> ${esc(contr.name)} — signed ${esc(contr.signed_date)}</p>
  </div>`;
}

// ---- JSON: fetch envelope for the signing page ----
app.get("/api/envelope", async (req, res) => {
  try {
    if (!store.enabled()) return res.status(500).json({ error: "store not configured" });
    const { e, t } = req.query;
    const { data: env } = await store.get(e);
    if (!env) return res.status(404).json({ error: "not found" });
    const role = roleForToken(env, t);
    if (!role) return res.status(403).json({ error: "invalid link" });
    const me = env.signers[role] || {};
    const other = env.signers[role === "customer" ? "contractor" : "customer"] || {};
    res.json({
      role,
      role_label: ROLES[role],
      already_signed: Boolean(me.signed_at),
      default_name: me.name || me.default_name || "",
      default_email: me.email || me.default_email || "",
      other_signed: Boolean(other.signed_at),
      status: env.status,
      contract: env.contract,
      contract_terms: contractClauses(env.contract),
      need_address: role === "customer" && !hasStreetNumber(env.contract),
    });
  } catch (err) {
    console.error("envelope error", err);
    res.status(500).json({ error: "server error" });
  }
});

// ---- Accept a signature ----
app.post("/api/sign", async (req, res) => {
  try {
    if (!store.enabled()) return res.status(500).json({ error: "store not configured" });
    if (!RESEND_API_KEY) return res.status(500).json({ error: "email not configured" });
    const { e, t, name, email, image, address } = req.body || {};
    const nm = String(name || "").trim();
    const em = String(email || "").trim();
    const addr = String(address || "").trim();
    if (!nm) return res.status(400).json({ error: "name required" });
    if (!emailRe.test(em)) return res.status(400).json({ error: "valid email required" });
    if (typeof image !== "string" || !/^data:image\/png;base64,/.test(image) || image.length < 200)
      return res.status(400).json({ error: "signature required" });
    if (image.length > 2_000_000) return res.status(400).json({ error: "signature too large" });

    const probe = await store.get(e);
    if (!probe.data) return res.status(404).json({ error: "not found" });
    const role = roleForToken(probe.data, t);
    if (!role) return res.status(403).json({ error: "invalid link" });
    if (role === "customer" && !hasStreetNumber(probe.data.contract) && !hasStreetNumber({ property: { street: addr } }))
      return res.status(400).json({ error: "address required", message: "Please enter the full property street address (including house number)." });
    if (probe.data.signers[role].signed_at)
      return res.status(409).json({ error: "already_signed", message: "This copy has already been signed." });

    // Atomically record this party's signature.
    const updated = await store.update(e, (env) => {
      const s = env.signers[role];
      s.name = nm;
      s.email = em;
      s.image = image;
      s.signed_date = todayISO();
      s.signed_at = new Date().toISOString();
      // Capture the full property address supplied at signing when the stored
      // street is still incomplete. The field collects the complete line
      // (house number + street + city/state/zip), so store it as the street and
      // clear the separate parts — otherwise contract/receipt address rendering
      // would append and duplicate city/state/zip.
      if (addr && !hasStreetNumber(env.contract)) {
        env.contract.property = { street: addr, city: "", state: "", zip: "" };
      }
      const both = env.signers.customer.signed_at && env.signers.contractor.signed_at;
      env.status = both ? "signed_both" : "partial";
      return env;
    });

    const bothSigned = updated.signers.customer.signed_at && updated.signers.contractor.signed_at;
    if (!bothSigned) {
      return res.json({ ok: true, complete: false, message: "Signed. You'll receive the fully-signed copy once the other party signs." });
    }
    if (updated.final_sent) {
      return res.json({ ok: true, complete: true, already: true });
    }

    // Both signed — assemble the fully-executed PDF and email both parties.
    const d = finalizedContract({ ...updated, completed_at: new Date().toISOString() });
    const { attachments } = await buildAttachments(d);
    const recipients = [...new Set([
      updated.signers.customer.email,
      updated.signers.contractor.email,
      TO_EMAIL,
    ].filter(Boolean))];
    const owner = d.homeowner || "Homeowner";
    const total = money(d.totals && d.totals.labor_total);
    const emailId = await sendResendEmail({
      to: recipients,
      subject: `Fully signed — Kitchen Remodel — ${owner} — ${total} labor`,
      html: finalHtml(d, updated),
      attachments,
    });

    await store.update(e, (env) => {
      env.final_sent = true;
      env.final_email_id = emailId;
      env.status = "complete";
      env.completed_at = d.signed_at;
      return env;
    });

    console.log("Envelope complete", e, "emailed", emailId, "->", recipients.join(", "));
    return res.json({ ok: true, complete: true, sent_to: recipients });
  } catch (err) {
    console.error("sign error", err, err.detail || "");
    return res.status(500).json({ error: "server error" });
  }
});

// ---- Signing page (client builds the DOM with textContent — no innerHTML) ----
app.get("/sign", (_req, res) => res.type("html").send(SIGN_PAGE));

const SIGN_PAGE = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>Sign — Kitchen Remodel Contract</title>
<style>
  :root{--ink:#1B1F2A;--muted:#464C5A;--accent:#B08D57;--hair:#D8D2C6;--bg:#F7F5F0}
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:var(--ink);background:var(--bg)}
  .wrap{max-width:680px;margin:0 auto;padding:20px 16px 60px}
  h1{font-size:20px;margin:6px 0 2px}
  .sub{color:var(--muted);margin:0 0 18px;font-size:14px}
  .card{background:#fff;border:1px solid var(--hair);border-radius:12px;padding:18px 18px;margin-bottom:16px}
  .row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #f0ede6;font-size:14px}
  .row:last-child{border-bottom:none}
  .row .amt{font-weight:600;white-space:nowrap}
  .sec{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);font-weight:700;margin:12px 0 2px}
  .tot{display:flex;justify-content:space-between;background:var(--ink);color:#fff;padding:10px 12px;border-radius:8px;font-weight:700;margin-top:12px}
  .split{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;padding:4px 2px}
  label{display:block;font-size:12px;color:var(--muted);margin:12px 0 4px;font-weight:600}
  input[type=text],input[type=email]{width:100%;padding:11px 12px;border:1px solid var(--hair);border-radius:8px;font-size:16px}
  canvas{width:100%;height:180px;border:1px dashed var(--accent);border-radius:8px;background:#fff;touch-action:none}
  .padrow{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
  .clear{background:none;border:none;color:var(--muted);font-size:13px;text-decoration:underline;cursor:pointer}
  button.sign{width:100%;margin-top:16px;padding:14px;border:none;border-radius:10px;background:var(--ink);color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  button.sign:disabled{opacity:.5;cursor:default}
  .note{font-size:12px;color:var(--muted);margin-top:10px}
  .msg{padding:14px;border-radius:10px;margin-top:14px;font-size:15px}
  .ok{background:#e7f5ec;color:#1a7f37}
  .err{background:#fdecea;color:#b3261e}
  .badge{display:inline-block;font-size:12px;padding:3px 8px;border-radius:20px;background:#eef;color:#3b3f8a;margin-left:8px}
  .hide{display:none}
  details.fullc{padding:0}
  details.fullc summary{cursor:pointer;padding:16px 18px;font-weight:700;font-size:15px;list-style:none}
  details.fullc summary::-webkit-details-marker{display:none}
  details.fullc summary::after{content:"▸";float:right;color:var(--accent)}
  details.fullc[open] summary::after{content:"▾"}
  details.fullc[open] summary{border-bottom:1px solid var(--hair)}
  .clauses{max-height:52vh;overflow:auto;padding:6px 18px 16px}
  .clause-h{font-size:12px;font-weight:700;color:var(--ink);margin:14px 0 4px;letter-spacing:.02em}
  .clause-p{font-size:12.5px;line-height:1.5;color:var(--muted);margin:0 0 6px}
  .intro-p{font-size:12.5px;line-height:1.5;color:var(--muted);margin:2px 0 8px}
</style></head>
<body><div class="wrap">
  <h1>Kitchen Remodel — Contract</h1>
  <p class="sub" id="sub">Loading…</p>
  <div id="app" class="hide">
    <div class="card" id="contract"></div>
    <details class="card fullc" id="fullwrap">
      <summary>View the full contract</summary>
      <div class="clauses" id="fulltext"></div>
    </details>
    <div class="card">
      <h3 style="margin:0 0 4px">Your signature <span class="badge" id="rolebadge"></span></h3>
      <p class="note" style="margin:0 0 6px">Review the contract above, then sign to accept.</p>
      <label for="name">Full name</label>
      <input type="text" id="name" autocomplete="name"/>
      <label for="email">Your email (your signed copy is sent here)</label>
      <input type="email" id="email" autocomplete="email" inputmode="email"/>
      <div id="addrwrap" class="hide">
        <label for="address">Property street address (house number + street)</label>
        <input type="text" id="address" autocomplete="street-address" placeholder="e.g. 123 Prospect Street, Kingston, NY 12401"/>
      </div>
      <label>Draw your signature</label>
      <canvas id="pad"></canvas>
      <div class="padrow"><span class="note">Sign with mouse or finger</span><button class="clear" id="clear" type="button">Clear</button></div>
      <button class="sign" id="signbtn" type="button">Sign &amp; Accept</button>
      <div id="msg"></div>
    </div>
  </div>
  <div id="done" class="hide"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js"></script>
<script>
(function(){
  var qs=new URLSearchParams(location.search), E=qs.get("e"), T=qs.get("t");
  var $=function(id){return document.getElementById(id)};
  var money=function(n){return "$"+Number(n||0).toLocaleString("en-US")};
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function clear(node){while(node.firstChild)node.removeChild(node.firstChild)}
  function twoCol(a,b,amt){var r=el("div","row");r.appendChild(el("span",null,a));r.appendChild(el("span",amt?"amt":null,b));return r}
  function setMsg(box,cls,text){clear(box);box.appendChild(el("div","msg "+cls,text))}
  function fail(t){var s=$("sub");clear(s);var span=el("span",null,t);span.style.color="#b3261e";s.appendChild(span)}
  function renderContract(c){
    var box=$("contract");clear(box);
    var p=c.property||{}, t=c.totals||{};
    var addr=[p.street,[p.city,p.state].filter(Boolean).join(", "),p.zip].filter(Boolean).join(" · ");
    box.appendChild(twoCol("Homeowner",c.homeowner||"—"));
    box.appendChild(twoCol("Property",addr||"—"));
    box.appendChild(twoCol("Contractor",c.contractor||"—"));
    box.appendChild(el("div","sec","Selected work (labor)"));
    (c.selections||[]).forEach(function(s){box.appendChild(twoCol(s.desc,s.priceLabel||money(s.price),true))});
    var tot=el("div","tot");tot.appendChild(el("span",null,"LABOR TOTAL"));tot.appendChild(el("span",null,money(t.labor_total)));box.appendChild(tot);
    var d1=el("div","split");d1.appendChild(el("span",null,"Deposit due at start (50%)"));d1.appendChild(el("span",null,money(t.deposit)));box.appendChild(d1);
    var d2=el("div","split");d2.appendChild(el("span",null,"Balance at completion (50%)"));d2.appendChild(el("span",null,money(t.balance)));box.appendChild(d2);
  }
  function renderFull(terms){
    var box=$("fulltext");clear(box);
    (terms||[]).forEach(function(sec){
      if(sec.heading){box.appendChild(el("div","clause-h",sec.heading))}
      (sec.paras||[]).forEach(function(p){box.appendChild(el("div",sec.heading?"clause-p":"intro-p",p))});
    });
  }
  var pad;
  function setupPad(){
    var c=$("pad"); var ratio=Math.max(window.devicePixelRatio||1,1);
    c.width=c.offsetWidth*ratio; c.height=c.offsetHeight*ratio;
    c.getContext("2d").scale(ratio,ratio);
    pad=new SignaturePad(c,{penColor:"#1B1F2A",minWidth:0.7,maxWidth:2.2});
  }
  function finishBox(strongText,restText){
    var done=$("done");clear(done);done.classList.remove("hide");
    var box=el("div","msg ok");var st=el("strong",null,strongText);box.appendChild(st);box.appendChild(document.createElement("br"));box.appendChild(document.createTextNode(restText));done.appendChild(box);
  }
  if(!E||!T){fail("This signing link is missing its code. Ask for a fresh link.");return}
  fetch("/api/envelope?e="+encodeURIComponent(E)+"&t="+encodeURIComponent(T))
   .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
   .then(function(x){
     if(!x.ok){fail(x.j.error==="invalid link"?"This signing link isn't valid.":(x.j.error||"Could not load the contract."));return}
     var d=x.j;
     if(d.status==="complete"){$("sub").textContent="This contract is already fully signed. Check your email for the countersigned copy.";return}
     if(d.already_signed){$("sub").textContent="You've already signed this contract. You'll receive the final copy once the other party signs.";return}
     $("sub").textContent="Review the finalized details, then sign below as the "+d.role_label+".";
     $("rolebadge").textContent=d.role_label;
     $("name").value=d.default_name||"";
     $("email").value=d.default_email||"";
     renderContract(d.contract);
     renderFull(d.contract_terms);
     if(d.need_address){
       $("addrwrap").classList.remove("hide");
       var cp=(d.contract&&d.contract.property)||{};
       var pre=[cp.street,[cp.city,cp.state].filter(Boolean).join(", "),cp.zip].filter(Boolean).join(", ");
       $("address").value=pre;
     }
     $("app").classList.remove("hide");
     setupPad();
     $("clear").onclick=function(){pad.clear()};
     $("signbtn").onclick=function(){
       clear($("msg"));
       var nm=$("name").value.trim(), em=$("email").value.trim();
       var needAddr=!$("addrwrap").classList.contains("hide");
       var addr=needAddr?$("address").value.trim():"";
       if(!nm){setMsg($("msg"),"err","Please enter your full name.");return}
       if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(em)){setMsg($("msg"),"err","Please enter a valid email.");return}
       if(needAddr&&!/\\d/.test(addr)){setMsg($("msg"),"err","Please enter the full property address, including the house number.");return}
       if(pad.isEmpty()){setMsg($("msg"),"err","Please draw your signature.");return}
       var btn=$("signbtn"); btn.disabled=true; btn.textContent="Submitting…";
       fetch("/api/sign",{method:"POST",headers:{"Content-Type":"application/json"},
         body:JSON.stringify({e:E,t:T,name:nm,email:em,address:addr,image:pad.toDataURL("image/png")})})
        .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
        .then(function(x){
          if(!x.ok){btn.disabled=false;btn.textContent="Sign & Accept";setMsg($("msg"),"err",x.j.message||x.j.error||"Something went wrong.");return}
          $("app").classList.add("hide");
          if(x.j.complete){finishBox("Done — both parties have signed.","The fully signed & dated contract is on its way to "+em+".")}
          else{finishBox("Signed. Thank you, "+nm+".","When the other party signs, the fully signed copy will be emailed to "+em+".")}
        })
        .catch(function(){btn.disabled=false;btn.textContent="Sign & Accept";setMsg($("msg"),"err","Network error — please try again.")});
     };
   })
   .catch(function(){fail("Could not reach the server. Please try again in a moment.")});
})();
</script>
</body></html>`;

app.listen(PORT, () => console.log("listening on", PORT));
