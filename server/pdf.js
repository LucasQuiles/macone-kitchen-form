/* ============================================================
   Macone Kitchen Remodel — server-side signed-PDF builder.
   Renders the homeowner's actual selections, totals, dates and
   embeds their electronic signature on the signature line.
   Pure JS (pdf-lib) — no native deps, safe on Render free tier.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// ---- Brand palette ----
const INK = rgb(0x1b / 255, 0x1f / 255, 0x2a / 255);
const ACCENT = rgb(0xb0 / 255, 0x8d / 255, 0x57 / 255);
const MUTED = rgb(0x46 / 255, 0x4c / 255, 0x5a / 255);
const HAIR = rgb(0.85, 0.83, 0.78);
const WHITE = rgb(1, 1, 1);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM = MARGIN + 40; // leave room for footer

const SECTION_NAMES = {
  1: "Cabinets & appliances",
  2: "Kitchen island",
  3: "Widen wall opening",
  4: "Add-ons",
};

const money = (n) => "$" + Number(n || 0).toLocaleString("en-US");

// Standard Helvetica (WinAnsi) can't encode many typographic/Unicode chars.
// Normalise smart punctuation to ASCII and drop anything still non-encodable.
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
    .replace(/[^\x20-\xFF]/g, ""); // final backstop: strip remaining non-WinAnsi
}

function loadAsset(name) {
  try {
    return fs.readFileSync(path.join(__dirname, "assets", name));
  } catch {
    return null;
  }
}

function wrapText(text, font, size, maxWidth) {
  const words = san(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function buildPdf(d) {
  const doc = await PDFDocument.create();
  doc.setTitle("Kitchen Remodel — Signed Order Form");
  doc.setAuthor(d.contractor || "Heriberto Quiles");
  doc.setSubject("Signed labor order form");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoBytes = loadAsset("q-logo.png");
  const poweredBytes = loadAsset("powered-by.png");
  const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
  const powered = poweredBytes ? await doc.embedPng(poweredBytes) : null;

  // Homeowner signature (customer_signature preferred; falls back to legacy single-sign `signature`)
  const homeSig = d.customer_signature || d.signature || {};
  const contractorSig = d.contractor_signature || {};
  const embedSig = async (src) => {
    if (!src || !src.image) return null;
    try {
      const b64 = String(src.image).replace(/^data:image\/\w+;base64,/, "");
      return await doc.embedPng(Buffer.from(b64, "base64"));
    } catch {
      return null;
    }
  };
  const sigImg = await embedSig(homeSig);
  const contractorImg = await embedSig(contractorSig);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (h) => {
    if (y - h < BOTTOM) newPage();
  };
  const text = (s, x, yy, size, f, color) =>
    page.drawText(san(s), { x, y: yy, size, font: f, color });
  const rightText = (s, xRight, yy, size, f, color) => {
    const str = san(s);
    const w = f.widthOfTextAtSize(str, size);
    page.drawText(str, { x: xRight - w, y: yy, size, font: f, color });
  };

  // ---- Header ----
  if (logo) {
    const lw = 84;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: MARGIN, y: y - lh, width: lw, height: lh });
  }
  const titleX = MARGIN + 108;
  text("KITCHEN REMODEL", titleX, y - 22, 15, bold, INK);
  text("Labor Order Form — Signed", titleX, y - 38, 10, font, MUTED);
  y -= 64;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1.5, color: ACCENT });
  y -= 22;

  // ---- Parties / property grid ----
  const p = d.property || {};
  const addr = [p.street, [p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join("  ");
  const rows = [
    ["Homeowner", d.homeowner || "—"],
    ["Property", addr || "—"],
    ["Contractor", d.contractor || "—"],
    ["Estimate date", d.estimate_date || "—"],
  ];
  if (d.homeowner_email) rows.push(["Homeowner email", d.homeowner_email]);
  for (const [label, val] of rows) {
    ensure(16);
    text(label.toUpperCase(), MARGIN, y, 8, bold, MUTED);
    const lines = wrapText(val, font, 10.5, CONTENT_W - 120);
    lines.forEach((ln, i) => text(ln, MARGIN + 120, y - i * 13, 10.5, font, INK));
    y -= Math.max(16, lines.length * 13 + 3);
  }
  y -= 6;

  // ---- Band helper ----
  const band = (title) => {
    ensure(26);
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 18, color: INK });
    text(title, MARGIN + 8, y - 13, 9.5, bold, WHITE);
    y -= 26;
  };

  // ---- Selected work grouped by section ----
  band("SELECTED WORK  (LABOR)");
  const selections = Array.isArray(d.selections) ? d.selections : [];
  const bySection = {};
  for (const s of selections) {
    const sec = s.section || 0;
    (bySection[sec] = bySection[sec] || []).push(s);
  }
  const secKeys = Object.keys(bySection).map(Number).sort((a, b) => a - b);
  for (const sec of secKeys) {
    ensure(18);
    text((SECTION_NAMES[sec] || "Other").toUpperCase(), MARGIN, y, 8.5, bold, ACCENT);
    y -= 14;
    for (const s of bySection[sec]) {
      const priceLabel = s.priceLabel || money(s.price);
      const boxX = MARGIN;
      const textX = MARGIN + 18;
      const priceRight = PAGE_W - MARGIN;
      const descW = CONTENT_W - 18 - 70; // room for price column
      const lines = wrapText(s.desc, font, 9.5, descW);
      const blockH = Math.max(14, lines.length * 12 + 4);
      ensure(blockH);
      // checked checkbox
      page.drawRectangle({
        x: boxX,
        y: y - 9,
        width: 10,
        height: 10,
        borderColor: ACCENT,
        borderWidth: 1,
        color: WHITE,
      });
      page.drawLine({ start: { x: boxX + 1.6, y: y - 4.2 }, end: { x: boxX + 4, y: y - 7.5 }, thickness: 1.4, color: ACCENT });
      page.drawLine({ start: { x: boxX + 4, y: y - 7.5 }, end: { x: boxX + 8.6, y: y - 1 }, thickness: 1.4, color: ACCENT });
      lines.forEach((ln, i) => text(ln, textX, y - i * 12, 9.5, font, INK));
      rightText(priceLabel, priceRight, y, 9.5, bold, INK);
      y -= blockH;
    }
    y -= 4;
  }
  y -= 4;

  // ---- Totals ----
  const t = d.totals || {};
  const totalLine = (label, val, opts = {}) => {
    const h = opts.big ? 22 : 15;
    ensure(h);
    if (opts.big) {
      page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 18, color: INK });
      text(label, MARGIN + 8, y - 11, 10.5, bold, WHITE);
      rightText(money(val), PAGE_W - MARGIN - 8, y - 11, 11.5, bold, WHITE);
      y -= h;
    } else {
      text(label, MARGIN + 8, y - 10, 9.5, font, MUTED);
      rightText(money(val), PAGE_W - MARGIN - 8, y - 10, 9.5, font, INK);
      y -= h;
    }
  };
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: INK });
  y -= 6;
  if (t.section1) totalLine("Cabinets & appliances", t.section1);
  if (t.section2) totalLine("Kitchen island", t.section2);
  if (t.section3) totalLine("Widen wall opening", t.section3);
  if (t.section4) totalLine("Add-ons", t.section4);
  totalLine("LABOR TOTAL", t.labor_total, { big: true });
  y -= 2;
  totalLine("Deposit due at start (50%)", t.deposit);
  totalLine("Balance due at completion (50%)", t.balance);
  y -= 10;

  // ---- Authorization / signatures ----
  band("AUTHORIZATION");
  const note =
    "By signing below, the homeowner approves the scope of labor selected above and the labor total shown. " +
    "Materials and appliances are Owner-supplied unless noted. Any added work is by written Change Order.";
  wrapText(note, font, 9, CONTENT_W).forEach((ln) => {
    ensure(12);
    text(ln, MARGIN, y, 9, font, MUTED);
    y -= 12;
  });
  y -= 14;

  // Signature blocks: homeowner (signed) left, contractor right
  ensure(96);
  const colW = (CONTENT_W - 30) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + 30;
  const lineY = y - 46;

  // Signature image sits just above its line
  const drawSig = (img, x) => {
    if (!img) return;
    const maxW = colW - 10;
    const maxH = 40;
    let sw = img.width;
    let sh = img.height;
    const scale = Math.min(maxW / sw, maxH / sh);
    sw *= scale;
    sh *= scale;
    page.drawImage(img, { x: x + 2, y: lineY + 3, width: sw, height: sh });
  };
  drawSig(sigImg, leftX);
  drawSig(contractorImg, rightX);
  // signature lines
  page.drawLine({ start: { x: leftX, y: lineY }, end: { x: leftX + colW, y: lineY }, thickness: 0.8, color: INK });
  page.drawLine({ start: { x: rightX, y: lineY }, end: { x: rightX + colW, y: lineY }, thickness: 0.8, color: INK });

  const blankDate = "______________________";
  text("HOMEOWNER SIGNATURE", leftX, lineY - 12, 7.5, bold, MUTED);
  text(homeSig.name || d.homeowner || "", leftX, lineY - 26, 10.5, font, INK);
  text("Date: " + (homeSig.date || (sigImg ? d.estimate_date : "") || blankDate), leftX, lineY - 40, 9, font, MUTED);

  text("CONTRACTOR SIGNATURE", rightX, lineY - 12, 7.5, bold, MUTED);
  text(contractorSig.name || d.contractor || "Heriberto Quiles", rightX, lineY - 26, 10.5, font, INK);
  text("Date: " + (contractorSig.date || blankDate), rightX, lineY - 40, 9, font, MUTED);
  y = lineY - 52;

  // ---- Footer on every page (powered-by + page numbers) ----
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((pg, i) => {
    if (powered) {
      const pw = 96;
      const ph = (powered.height / powered.width) * pw;
      pg.drawImage(powered, { x: MARGIN, y: MARGIN - 18, width: pw, height: ph });
    }
    const label = `Page ${i + 1} of ${total}`;
    const lw = font.widthOfTextAtSize(label, 8);
    pg.drawText(label, { x: PAGE_W - MARGIN - lw, y: MARGIN - 14, size: 8, font, color: MUTED });
    const stamp = d.signed_at ? `Signed ${d.signed_at}` : "";
    if (stamp) pg.drawText(stamp, { x: PAGE_W / 2 - font.widthOfTextAtSize(stamp, 7) / 2, y: MARGIN - 14, size: 7, font, color: HAIR });
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = { buildPdf };
