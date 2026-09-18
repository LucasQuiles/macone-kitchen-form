/* Create a countersign envelope for the Macone kitchen contract.
   Requires the deployed store.js; run under: ENVELOPE_REPO=... with-github-env node.
   Usage: node create_envelope.cjs <custDefaultEmail|-> <contractorDefaultEmail|->
   Prints the two signing links. Contract terms are reconciled to the finalized order. */
"use strict";
const crypto = require("crypto");
const path = require("path");
const store = require(path.join("/home/q/LAB/macone-kitchen-form/server/store.js"));

const BASE = process.env.SIGN_BASE || "https://macone-kitchen-form.onrender.com";
const custEmail = process.argv[2] && process.argv[2] !== "-" ? process.argv[2] : "";
const contrEmail = process.argv[3] && process.argv[3] !== "-" ? process.argv[3] : "";

const selections = [
  { section: 1, desc: "Remove existing cabinets on both walls (≈21 LF) and haul away", priceLabel: "$1,200", price: 1200 },
  { section: 1, desc: "Remove & replace the sheetrock behind the cabinets on both walls; tape, mud & finish to paint-ready", priceLabel: "$2,300", price: 2300 },
  { section: 1, desc: "Install new Owner-supplied cabinets — uppers & lowers, both walls; set level, plumb, secured, doors/drawers adjusted", priceLabel: "$4,000", price: 4000 },
  { section: 1, desc: "Pull out, reset & reconnect the refrigerator and stove; leave correct openings", priceLabel: "$500", price: 500 },
  { section: 4, desc: "Hang & wire a new Owner-supplied chandelier at the existing ceiling box", priceLabel: "$350", price: 350 },
];
const totals = { section1: 8000, section2: 0, section3: 0, section4: 350, labor_total: 8350, deposit: 4175, balance: 4175 };

const id = "env_" + crypto.randomBytes(6).toString("hex");
const tokens = { customer: crypto.randomBytes(24).toString("hex"), contractor: crypto.randomBytes(24).toString("hex") };

const env = {
  id,
  created_at: new Date().toISOString(),
  mode: "countersign",
  contract: {
    homeowner: "Charles Macone",
    contractor: "Heriberto",
    property: { street: "Prospect Street", city: "Kingston", state: "NY", zip: "12401" },
    estimate_date: "2026-08-07",
    selections,
    totals,
    contract_price: 8350,
    down_payment: 4175,
    final_payment: 4175,
    validity_days: 180,
    venue_county: "Ulster",
  },
  tokens,
  signers: {
    customer: { default_name: "Charles Macone", default_email: custEmail },
    contractor: { default_name: "Heriberto", default_email: contrEmail },
  },
  status: "sent",
  final_sent: false,
};

(async () => {
  await store.put(id, env);
  console.log("ENVELOPE", id);
  console.log("CUSTOMER_LINK " + BASE + "/sign?e=" + id + "&t=" + tokens.customer);
  console.log("CONTRACTOR_LINK " + BASE + "/sign?e=" + id + "&t=" + tokens.contractor);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
