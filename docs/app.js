/* ============================================================
   Macone Kitchen Remodel — order form logic
   ============================================================ */

// Backend endpoint (Render web service). Set after deploy.
const API_URL = "https://macone-kitchen-form.onrender.com/submit";

// ---- Line items (id, section, description, optional small note, price, gas flag) ----
const ITEMS = [
  { id: "s1a", sec: 1, desc: "Remove existing cabinets on both walls (≈21 LF) and haul away", price: 1200 },
  { id: "s1b", sec: 1, desc: "Remove & replace the sheetrock behind the cabinets on both walls; tape, mud & finish to paint-ready", price: 2300 },
  { id: "s1c", sec: 1, desc: "Install new Owner-supplied cabinets — uppers & lowers, both walls; set level, plumb, secured, doors/drawers adjusted", price: 4000 },
  { id: "s1d", sec: 1, desc: "Pull out, reset & reconnect the refrigerator and stove; leave correct openings", price: 500 },

  { id: "s2a", sec: 2, desc: "Assemble, set, level & anchor a new Owner-supplied island cabinet base", price: 2000 },

  { id: "s3a", sec: 3, desc: 'Widen one load-bearing wall opening from 42" to 75"; temporary shoring; install engineered header/beam & posts per a NY licensed engineer’s stamped design', price: 4500 },
  { id: "s3b", sec: 3, desc: "Close, tape, mud & finish the wall & ceiling around the new opening to paint-ready", price: 1500 },
  { id: "s3c", sec: 3, desc: "Patch & infill flooring at the widened opening", price: 800 },

  { id: "s4a", sec: 4, desc: "Hang & wire a new Owner-supplied chandelier at the existing ceiling box", note: "new box / relocated wiring by Change Order", price: 350 },
  { id: "s4b", sec: 4, desc: "Licensed gas-fitter reconnect — only if the stove is gas", note: "billed at cost, separate licensed gas-fitter", price: 0, gas: true, priceLabel: "$150–$400" },
];

const BUNDLES = {
  A: ["s1a", "s1b", "s1c", "s1d"],
  C: ["s1a", "s1b", "s1c", "s1d", "s2a"],
  B: ["s1a", "s1b", "s1c", "s1d", "s3a", "s3b", "s3c"],
};

const fmt = (n) => "$" + n.toLocaleString("en-US");

// ---- Render items into their sections (DOM API, no innerHTML) ----
function renderItems() {
  ITEMS.forEach((it) => {
    const wrap = document.getElementById("sec" + it.sec);

    const label = document.createElement("label");
    label.className = "item";
    label.htmlFor = it.id;

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = it.id;
    cb.dataset.price = String(it.price);
    cb.dataset.gas = it.gas ? "1" : "0";

    const desc = document.createElement("span");
    desc.className = "desc";
    desc.appendChild(document.createTextNode(it.desc));
    if (it.note) {
      const small = document.createElement("small");
      small.textContent = " (" + it.note + ")";
      desc.appendChild(small);
    }

    const price = document.createElement("span");
    price.className = "price";
    price.textContent = it.priceLabel || fmt(it.price);

    label.append(cb, desc, price);
    wrap.appendChild(label);
  });
}

// ---- Totals ----
function recalc() {
  const sec = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let gasSelected = false;
  ITEMS.forEach((it) => {
    const cb = document.getElementById(it.id);
    const on = cb.checked;
    cb.closest(".item").classList.toggle("selected", on);
    if (on) {
      sec[it.sec] += it.price;
      if (it.gas) gasSelected = true;
    }
  });
  document.getElementById("t1").textContent = fmt(sec[1]);
  document.getElementById("t2").textContent = fmt(sec[2]);
  document.getElementById("t3").textContent = fmt(sec[3]);
  document.getElementById("t4").textContent = fmt(sec[4]);
  const grand = sec[1] + sec[2] + sec[3] + sec[4];
  document.getElementById("grand").textContent = fmt(grand);
  document.getElementById("deposit").textContent = fmt(Math.round(grand / 2));
  document.getElementById("balance").textContent = fmt(grand - Math.round(grand / 2));
  document.getElementById("gasnote").hidden = !gasSelected;
  syncBundleHighlight();
  return grand;
}

// ---- Bundles ----
function applyBundle(key) {
  const set = new Set(key === "clear" ? [] : BUNDLES[key]);
  ITEMS.forEach((it) => {
    document.getElementById(it.id).checked = set.has(it.id);
  });
  recalc();
}
function syncBundleHighlight() {
  const checked = ITEMS.filter((it) => document.getElementById(it.id).checked).map((i) => i.id).sort().join(",");
  document.querySelectorAll(".bundle").forEach((b) => {
    const key = b.dataset.bundle;
    const match = BUNDLES[key] && [...BUNDLES[key]].sort().join(",") === checked;
    b.classList.toggle("active", !!match);
  });
}

// ---- Signature pad ----
let sigPad;
function initSignature() {
  const canvas = document.getElementById("sigpad");
  const resize = () => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const data = sigPad && !sigPad.isEmpty() ? sigPad.toData() : null;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    if (sigPad) { sigPad.clear(); if (data) sigPad.fromData(data); }
  };
  sigPad = new SignaturePad(canvas, { penColor: "#1B1F2A", backgroundColor: "rgba(255,255,255,0)" });
  window.addEventListener("resize", resize);
  resize();
  document.getElementById("sigclear").addEventListener("click", () => sigPad.clear());
}

// ---- Submit ----
function sum(s) {
  return ITEMS.filter((it) => it.sec === s && document.getElementById(it.id).checked).reduce((a, b) => a + b.price, 0);
}
async function submit() {
  const btn = document.getElementById("submitBtn");
  const status = document.getElementById("status");
  const setStatus = (msg, cls) => { status.textContent = msg; status.className = "status " + cls; };

  const grand = recalc();
  if (grand === 0) { setStatus("Please select at least one line item.", "err"); return; }
  if (sigPad.isEmpty()) { setStatus("Please add your signature before submitting.", "err"); return; }
  const signName = document.getElementById("sign_name").value.trim();
  if (!signName) { setStatus("Please type your full name to sign.", "err"); return; }

  const selections = ITEMS.filter((it) => document.getElementById(it.id).checked)
    .map((it) => ({ id: it.id, section: it.sec, desc: it.desc, price: it.price, priceLabel: it.priceLabel || fmt(it.price) }));

  const payload = {
    homeowner: document.getElementById("homeowner").value.trim(),
    homeowner_email: document.getElementById("homeowner_email").value.trim(),
    contractor: document.getElementById("contractor").value.trim(),
    property: {
      street: document.getElementById("addr_street").value.trim(),
      city: document.getElementById("addr_city").value.trim(),
      state: document.getElementById("addr_state").value.trim(),
      zip: document.getElementById("addr_zip").value.trim(),
    },
    estimate_date: document.getElementById("est_date").value,
    selections,
    totals: {
      section1: sum(1), section2: sum(2), section3: sum(3), section4: sum(4),
      labor_total: grand, deposit: Math.round(grand / 2), balance: grand - Math.round(grand / 2),
    },
    signature: { name: signName, date: document.getElementById("sign_date").value, image: sigPad.toDataURL("image/png") },
    signed_at: new Date().toISOString(),
    user_agent: navigator.userAgent,
  };

  btn.disabled = true;
  setStatus("Submitting…", "work");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    setStatus("✓ Sent. Heriberto has your selections — thank you, " + (payload.homeowner.split(" ")[0] || "") + "!", "ok");
  } catch (e) {
    setStatus("Could not send (" + e.message + "). The server may be waking up — wait ~30s and try again.", "err");
    btn.disabled = false;
  }
}

// ---- Init ----
document.addEventListener("DOMContentLoaded", () => {
  renderItems();
  initSignature();
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("est_date").value = today;
  document.getElementById("sign_date").value = today;
  document.querySelectorAll(".items input[type=checkbox]").forEach((cb) => cb.addEventListener("change", recalc));
  document.querySelectorAll(".bundle").forEach((b) => b.addEventListener("click", () => applyBundle(b.dataset.bundle)));
  document.getElementById("submitBtn").addEventListener("click", submit);
  recalc();
});
