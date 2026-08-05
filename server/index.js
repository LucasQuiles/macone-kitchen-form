/* ============================================================
   Macone Kitchen Remodel — submission backend (Render web service)
   Receives the signed order-form JSON and emails it via Resend.
   The Resend API key never leaves the server.
   ============================================================ */
"use strict";

const express = require("express");
const { buildPdf } = require("./pdf");

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL || "al@quiles.studio";
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

app.listen(PORT, () => console.log("listening on", PORT));
