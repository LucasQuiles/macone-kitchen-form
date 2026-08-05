# Macone Kitchen Remodel — Order Form

Fillable, signable kitchen-remodel estimate/order form.

- **Frontend** (`docs/`) — static site on **GitHub Pages**. Homeowner checks line items, the total auto-calculates, and they sign with a mouse/finger (open-source [`signature_pad`](https://github.com/szimek/signature_pad), MIT).
- **Backend** (`server/`) — small Node/Express service on **Render** that receives the signed submission and emails it via **Resend** to `al@quiles.studio`. The Resend API key stays server-side.

## Flow
1. Homeowner opens the Pages URL, selects work, signs, submits.
2. Browser `POST`s JSON (selections + totals + signature PNG) to the Render `/submit` endpoint.
3. Backend renders an HTML summary, attaches the signature PNG + raw `submission.json`, and sends via Resend.

## Configure (Render env vars)
| Var | Value |
|-----|-------|
| `RESEND_API_KEY` | (secret) |
| `TO_EMAIL` | `al@quiles.studio` |
| `FROM_EMAIL` | `Macone Kitchen Form <noreply@quiles.studio>` |
| `ALLOWED_ORIGIN` | `https://lucasquiles.github.io` |

`FROM_EMAIL` must be on a Resend-verified domain (`quiles.studio`).

## Local dev
```bash
cd server && npm install
RESEND_API_KEY=... TO_EMAIL=al@quiles.studio node index.js
# POST a sample payload to http://localhost:3000/submit
```

Pricing/scope of the line items mirrors the current `macone-kitchen-order-form.pdf`.
