#!/usr/bin/env python3
"""Set one env var on the Render service (triggers redeploy).
Usage: with-render-env python3 set_env.py <serviceId> <KEY> <VALUE>"""
import os, sys, json, urllib.request, urllib.error

KEY = os.environ["RENDER_API_KEY"]
svc, k, v = sys.argv[1], sys.argv[2], sys.argv[3]
req = urllib.request.Request(
    f"https://api.render.com/v1/services/{svc}/env-vars/{k}",
    data=json.dumps({"value": v}).encode(),
    method="PUT",
    headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json", "Content-Type": "application/json"},
)
try:
    with urllib.request.urlopen(req) as r:
        d = json.loads(r.read().decode())
        print("set", k, "->", d.get("envVar", d).get("value"))
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
