/* ============================================================
   Macone Kitchen Remodel — full Residential Home Improvement
   Contract generator (NY). Renders the complete multi-page legal
   contract (parties, scope, price, terms, statutory notices) and
   embeds BOTH parties' electronic signatures, dated.

   The clause text lives here so the on-screen contract shown on the
   signing page (contractClauses) and the PDF (buildContractPdf) are
   generated from the SAME source — they can never drift.

   Pure JS (pdf-lib) — no native deps, safe on Render free tier.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const INK = rgb(0x1b / 255, 0x1f / 255, 0x2a / 255);
const ACCENT = rgb(0xb0 / 255, 0x8d / 255, 0x57 / 255);
const MUTED = rgb(0x46 / 255, 0x4c / 255, 0x5a / 255);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 54;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = MARGIN + 36;

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");

function san(s) {
  return String(s == null ? "" : s)
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/[•·]/g, "-")
    .replace(/≈/g, "~")
    .replace(/[×✕]/g, "x")
    .replace(/ /g, " ")
    .replace(/[^\x20-\xFF]/g, "");
}

function loadAsset(name) {
  try {
    return fs.readFileSync(path.join(__dirname, "assets", name));
  } catch {
    return null;
  }
}

function addressLine(d) {
  const p = d.property || {};
  return [p.street, [p.city, p.state].filter(Boolean).join(", "), p.zip]
    .filter(Boolean)
    .join(" ");
}

// The full ordered contract as { title, kind, body } blocks.
// kind: "party" | "clause" | "sub" (lettered) | "note".
function sections(d) {
  const owner = d.homeowner || "Owner";
  const contractor = d.contractor || "Heriberto";
  const addr = addressLine(d) || "________________________";
  const price = Number(d.contract_price != null ? d.contract_price : (d.totals || {}).labor_total || 0);
  const down = Number(d.down_payment != null ? d.down_payment : (d.totals || {}).deposit || Math.round(price / 2));
  const final = Number(d.final_payment != null ? d.final_payment : (d.totals || {}).balance || (price - down));
  const validity = Number(d.validity_days || 180);
  const county = d.venue_county || "Ulster";
  const dateStr = d.contract_date || "the date of the last signature below";

  // Scope items come straight from the finalized order selections, so the
  // contract's scope of work always matches what was actually priced.
  const scopeItems = (d.selections || []).map((s) => san(s.desc));

  const S = [];
  S.push({
    kind: "intro",
    body:
      `This Home Improvement Contract ("Contract") is made on ${dateStr}, between the Parties identified below. ` +
      `Contractor and Owner are each a "Party" and together the "Parties."`,
  });
  S.push({
    kind: "party",
    title: "CONTRACTOR",
    body: `${contractor} ("Contractor") — an individual providing the home-improvement labor described below, in the State of New York.`,
  });
  S.push({
    kind: "party",
    title: "OWNER",
    body: `${owner} ("Owner") — homeowner of the property at ${addr} ("Property").`,
  });

  S.push({
    kind: "clause",
    n: 1,
    title: "SCOPE OF WORK",
    body: "Contractor will furnish the labor, supervision, tools, and equipment to perform the following Work at the Property (\"Work\"):",
    subs: scopeItems,
    after:
      "Exclusions. Any work not expressly listed above is excluded, including but not limited to: wall removal or structural work, " +
      "countertops, backsplash, sink/plumbing, new electrical circuits or wiring beyond resetting the existing chandelier box, flooring, " +
      "painting, and any asbestos, lead, or mold abatement — unless added by a signed written Change Order.",
  });
  S.push({
    kind: "clause",
    n: 2,
    title: "MATERIALS — OWNER-SUPPLIED",
    body:
      "(a) Owner shall purchase and pay for ALL materials directly from The Home Depot (or another supplier of Owner's choosing), in full and in advance of the Work. " +
      "This includes the cabinets, sheetrock and finishing materials, the chandelier/light fixture, filler/trim pieces, fasteners, and any hardware. " +
      "(b) Contractor is not responsible for the cost, price changes, availability, delivery timing, defects, or warranty of Owner-supplied materials. Work delayed by late, insufficient, back-ordered, or defective Owner-supplied materials extends the completion date day-for-day and may be billed as a Change Order for any return trips or remobilization. " +
      "(c) Manufacturer warranties on all materials run to Owner. Contractor warrants only its installation workmanship (see §8). " +
      "(d) Owner shall ensure the required materials are delivered and on site before Work begins.",
  });
  S.push({
    kind: "clause",
    n: 3,
    title: "CONTRACT PRICE — LABOR",
    body:
      `(a) The price for Contractor's labor and services is ${money(price)} ("Contract Price"). This is labor only and does not include materials (§2).\n` +
      `(b) Payment schedule — two equal payments: (1) Down payment of ${money(down)} due at signing, to schedule and commence; (2) Final payment of ${money(final)} due at Substantial Completion (all selected Work installed, site cleaned).\n` +
      "(c) Each payment is due within three (3) days of reaching its milestone. Payments not made when due accrue interest at 1.5% per month and entitle Contractor to suspend Work under §9.",
  });
  S.push({
    kind: "clause",
    n: 4,
    title: "TIME OF PERFORMANCE",
    body:
      "(a) Start: To be determined and confirmed by the Parties in writing — after this Contract is signed, the down payment is received, and the materials are on site.\n" +
      "(b) Substantial Completion: within a commercially reasonable period after start, subject to extension for Change Orders, concealed/unforeseen conditions, and Owner-caused or material-supply delays.\n" +
      `(c) Validity: this Contract and its pricing are valid for ${validity} days from the date of the last signature below. If the Work has not commenced within that period, the Parties will confirm or revise the price and schedule in a signed writing before Work begins.`,
  });
  S.push({
    kind: "clause",
    n: 5,
    title: "CONCEALED / UNFORESEEN CONDITIONS",
    body:
      "Removing old cabinets and sheetrock can reveal hidden conditions (rot, water/pest damage, out-of-square or damaged framing, prior code violations, or hazardous materials). " +
      "If concealed conditions differ from what was reasonably visible when this Contract was priced, Contractor will stop the affected Work and notify Owner; the added scope and cost will be handled by a signed Change Order before proceeding. " +
      "Hazardous-material (asbestos/lead/mold) abatement is excluded and is Owner's responsibility.",
  });
  S.push({
    kind: "clause",
    n: 6,
    title: "CHANGE ORDERS",
    body:
      "Any change to the Work, price, or schedule must be in a written Change Order signed by both Parties before the changed work proceeds. " +
      "Contractor is not obligated to perform extra work without a signed Change Order. Verbal changes are not binding.",
  });
  S.push({
    kind: "clause",
    n: 7,
    title: "OWNER RESPONSIBILITIES",
    body:
      "Owner shall: purchase materials on time; provide site access and utilities; empty the existing cabinets and clear the work area before start; make timely selections and payments; " +
      "remove or secure valuables and keep pets out of the work area; maintain homeowner's property insurance; and disclose known hidden conditions. Owner warrants authority to authorize the Work at the Property.",
  });
  S.push({
    kind: "clause",
    n: 8,
    title: "LIMITED WARRANTY",
    body:
      "Contractor warrants its installation workmanship against defects for one (1) year from Substantial Completion. Contractor's sole obligation is to correct defective workmanship at no labor charge; Owner supplies any replacement materials (materials being Owner-purchased). " +
      "This warranty excludes Owner-supplied material defects (covered by manufacturer), normal wear, settlement/movement, alteration or misuse by Owner or others, lack of maintenance, and damage from conditions outside Contractor's Work. " +
      "This is the only warranty and, to the extent allowed by law, replaces all implied warranties.",
  });
  S.push({
    kind: "clause",
    n: 9,
    title: "SUSPENSION / STOP WORK FOR NON-PAYMENT",
    body:
      "If Owner fails to make any payment when due, or fails to supply materials needed to proceed, Contractor may — after three (3) days' written notice — suspend Work without penalty until paid or cured, " +
      "with the schedule extended accordingly, and recover reasonable remobilization costs.",
  });
  S.push({
    kind: "clause",
    n: 10,
    title: "LIMITATION OF LIABILITY",
    body:
      "Contractor's total liability under this Contract shall not exceed the Contract Price actually paid to Contractor. Contractor is not liable for indirect, incidental, or consequential damages, " +
      "nor for defects or failures arising from Owner-supplied materials, Owner-directed methods, or the acts of trades/contractors not hired by Contractor.",
  });
  S.push({
    kind: "clause",
    n: 11,
    title: "INSURANCE",
    body:
      "Contractor carries general liability insurance and, where it has employees, workers' compensation as required by New York law. Certificates available on request. " +
      "Owner shall maintain property/homeowner's insurance on the structure and contents.",
  });
  S.push({
    kind: "clause",
    n: 12,
    title: "INDEMNIFICATION",
    body:
      "Each Party indemnifies the other for third-party claims of bodily injury or property damage to the extent caused by that Party's negligence. " +
      "Owner indemnifies Contractor for claims arising from Owner-supplied materials and from concealed/undisclosed conditions not caused by Contractor's negligence.",
  });
  S.push({
    kind: "clause",
    n: 13,
    title: "NEW YORK STATUTORY NOTICES",
    body:
      "Mechanic's Lien: \"Contractors and subcontractors who perform work or furnish materials may have the right to file a mechanic's lien against the property if they are not paid.\" " +
      "Trust Funds (Lien Law Art. 3-A): Payments received by Contractor are trust funds to be applied first to the cost of this improvement.",
  });
  S.push({
    kind: "clause",
    n: 14,
    title: "RIGHT TO CANCEL",
    body:
      "Owner may cancel this Contract without penalty within three (3) business days of signing by delivering written notice to Contractor.",
  });
  S.push({
    kind: "clause",
    n: 15,
    title: "TERMINATION",
    body:
      "If either Party materially breaches and fails to cure within ten (10) days of written notice, the other may terminate. " +
      "On termination, Contractor is paid for all Work performed and costs incurred through the termination date.",
  });
  S.push({
    kind: "clause",
    n: 16,
    title: "DISPUTE RESOLUTION & GOVERNING LAW",
    body:
      "The Parties will first negotiate in good faith, then submit any unresolved dispute to mediation, and if still unresolved, to binding arbitration or the courts of " +
      `${county} County, New York. This Contract is governed by the laws of the State of New York. The prevailing party is entitled to reasonable attorneys' fees and costs.`,
  });
  S.push({
    kind: "clause",
    n: 17,
    title: "ENTIRE AGREEMENT",
    body:
      "This Contract, together with any signed Change Orders, is the entire agreement and supersedes all prior discussions. It may be modified only in a writing signed by both Parties. " +
      "If any provision is unenforceable, the remainder stays in effect.",
  });
  return S;
}

// Plain-text clause list for on-screen display (signing page). Each entry:
// { heading: string, paras: string[] }.  No signatures.
function contractClauses(d) {
  const out = [];
  for (const s of sections(d)) {
    let heading;
    if (s.kind === "intro") heading = "";
    else if (s.kind === "party") heading = s.title;
    else heading = `${s.n}. ${s.title}`;
    const paras = [];
    if (s.body) String(s.body).split("\n").forEach((ln) => ln.trim() && paras.push(san(ln.trim())));
    if (s.subs && s.subs.length) s.subs.forEach((x, i) => paras.push(`(${String.fromCharCode(97 + i)}) ${x}`));
    if (s.after) paras.push(san(s.after));
    out.push({ heading, paras });
  }
  return out;
}

async function buildContractPdf(d) {
  const doc = await PDFDocument.create();
  doc.setTitle("Residential Home Improvement Contract — Kitchen Remodel");
  doc.setAuthor(d.contractor || "Heriberto");
  doc.setSubject("Fully executed home improvement contract");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (h) => {
    if (y - h < BOTTOM) newPage();
  };
  const wrap = (txt, f, size, maxW) => {
    const words = san(txt).split(/\s+/);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (f.widthOfTextAtSize(test, size) > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };
  const para = (txt, opts = {}) => {
    const size = opts.size || 9.5;
    const f = opts.bold ? bold : font;
    const color = opts.color || INK;
    const x = MARGIN + (opts.indent || 0);
    const maxW = CONTENT_W - (opts.indent || 0);
    for (const ln of wrap(txt, f, size, maxW)) {
      ensure(size + 3);
      page.drawText(ln, { x, y, size, font: f, color });
      y -= size + 3;
    }
  };

  // ---- Title ----
  const logo = (() => {
    const b = loadAsset("q-logo.png");
    return b;
  })();
  if (logo) {
    const img = await doc.embedPng(logo);
    const lw = 74;
    const lh = (img.height / img.width) * lw;
    page.drawImage(img, { x: MARGIN, y: y - lh, width: lw, height: lh });
  }
  const tX = MARGIN + (logo ? 92 : 0);
  page.drawText("RESIDENTIAL HOME IMPROVEMENT CONTRACT", { x: tX, y: y - 16, size: 13, font: bold, color: INK });
  page.drawText("Kitchen Cabinet Replacement & Remodel", { x: tX, y: y - 32, size: 10, font, color: MUTED });
  y -= 58;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: ACCENT });
  y -= 20;

  // ---- Body ----
  for (const s of sections(d)) {
    if (s.kind === "intro") {
      para(s.body, { size: 9.5, color: MUTED });
      y -= 8;
      continue;
    }
    if (s.kind === "party") {
      ensure(28);
      para(s.title, { bold: true, size: 9.5, color: ACCENT });
      para(s.body, { size: 9.5 });
      y -= 8;
      continue;
    }
    // clause
    ensure(30);
    y -= 4;
    para(`${s.n}. ${s.title}`, { bold: true, size: 10.5, color: INK });
    y -= 2;
    if (s.body) para(s.body, { size: 9.5 });
    if (s.subs && s.subs.length) {
      s.subs.forEach((x, i) => {
        para(`(${String.fromCharCode(97 + i)}) ${x}`, { size: 9.5, indent: 14 });
      });
    }
    if (s.after) {
      y -= 2;
      para(s.after, { size: 9, color: MUTED });
    }
    y -= 8;
  }

  // ---- Signatures ----
  const cust = d.customer_signature || {};
  const contr = d.contractor_signature || {};
  const embedSig = async (src) => {
    if (!src || !src.image) return null;
    try {
      const b64 = String(src.image).replace(/^data:image\/\w+;base64,/, "");
      return await doc.embedPng(Buffer.from(b64, "base64"));
    } catch {
      return null;
    }
  };
  const custImg = await embedSig(cust);
  const contrImg = await embedSig(contr);

  ensure(150);
  y -= 6;
  page.drawText("SIGNATURES", { x: MARGIN, y, size: 10.5, font: bold, color: INK });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.8, color: ACCENT });
  y -= 30;

  const blankDate = "____________________";
  const sigBlock = (roleLabel, printName, dateStr, img) => {
    ensure(70);
    if (img) {
      const maxW = 210,
        maxH = 38;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, { x: MARGIN + 2, y: y + 3, width: img.width * scale, height: img.height * scale });
    }
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + 250, y }, thickness: 0.8, color: INK });
    page.drawText("Date: " + (dateStr || blankDate), { x: MARGIN + 270, y: y + 3, size: 9.5, font, color: INK });
    y -= 13;
    page.drawText(roleLabel, { x: MARGIN, y, size: 7.5, font: bold, color: MUTED });
    y -= 13;
    page.drawText(san(printName || ""), { x: MARGIN, y, size: 10.5, font, color: INK });
    y -= 30;
  };
  sigBlock("CONTRACTOR — Print name", contr.name || d.contractor || "", contr.date, contrImg);
  sigBlock("OWNER — Print name", cust.name || d.homeowner || "", cust.date, custImg);

  // ---- Footer on every page ----
  const poweredBytes = loadAsset("powered-by.png");
  const poweredImg = poweredBytes ? await doc.embedPng(poweredBytes) : null;
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((pg, i) => {
    if (poweredImg) {
      const pw = 88;
      const ph = (poweredImg.height / poweredImg.width) * pw;
      pg.drawImage(poweredImg, { x: MARGIN, y: MARGIN - 20, width: pw, height: ph });
    }
    const label = `Page ${i + 1} of ${total}`;
    const lw = font.widthOfTextAtSize(label, 8);
    pg.drawText(label, { x: PAGE_W - MARGIN - lw, y: MARGIN - 16, size: 8, font, color: MUTED });
    const stamp = d.signed_at ? `Executed ${String(d.signed_at).slice(0, 10)}` : "";
    if (stamp) {
      const sw = font.widthOfTextAtSize(stamp, 7);
      pg.drawText(stamp, { x: PAGE_W / 2 - sw / 2, y: MARGIN - 16, size: 7, font, color: MUTED });
    }
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = { buildContractPdf, contractClauses, addressLine };
