#!/usr/bin/env python3
"""Create the Render web service for the Macone form backend.
Reads RENDER_API_KEY and RESEND_API_KEY from env (set by nested wrappers).
Never prints secrets.
Usage: with-render-env with-resend-env python3 create_service.py
"""
import os, sys, json, urllib.request, urllib.error

RENDER = os.environ["RENDER_API_KEY"]
RESEND = os.environ["RESEND_API_KEY"]
OWNER = "tea-d3nfunm3jp1c73bsdi0g"

payload = {
    "type": "web_service",
    "name": "macone-kitchen-form",
    "ownerId": OWNER,
    "repo": "https://github.com/LucasQuiles/macone-kitchen-form",
    "branch": "main",
    "autoDeploy": "yes",
    "rootDir": "server",
    "serviceDetails": {
        "env": "node",
        "region": "oregon",
        "plan": "free",
        "envSpecificDetails": {
            "buildCommand": "npm install",
            "startCommand": "node index.js",
        },
    },
    "envVars": [
        {"key": "TO_EMAIL", "value": "al@quiles.studio"},
        {"key": "FROM_EMAIL", "value": "Macone Kitchen Form <noreply@quiles.studio>"},
        {"key": "ALLOWED_ORIGIN", "value": "https://lucasquiles.github.io"},
        {"key": "RESEND_API_KEY", "value": RESEND},
    ],
}

req = urllib.request.Request(
    "https://api.render.com/v1/services",
    data=json.dumps(payload).encode(),
    method="POST",
    headers={
        "Authorization": f"Bearer {RENDER}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    },
)
try:
    with urllib.request.urlopen(req) as r:
        d = json.loads(r.read().decode())
        svc = d.get("service", d)
        print("id:", svc.get("id"))
        print("url:", svc.get("serviceDetails", {}).get("url") or svc.get("url"))
        print("dashboard:", svc.get("dashboardUrl"))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
