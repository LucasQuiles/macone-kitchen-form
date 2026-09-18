#!/usr/bin/env python3
"""Poll the latest Render deploy until terminal. Usage: with-render-env python3 poll_deploy.py <serviceId>"""
import os, sys, json, time, urllib.request, urllib.error

KEY = os.environ["RENDER_API_KEY"]
svc = sys.argv[1]
TERMINAL = {"live", "build_failed", "update_failed", "canceled", "deactivated", "pre_deploy_failed"}

def get():
    req = urllib.request.Request(
        f"https://api.render.com/v1/services/{svc}/deploys?limit=1",
        headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())[0]["deploy"]

for _ in range(60):  # up to ~10 min
    d = get()
    st = d["status"]
    print(st, flush=True)
    if st in TERMINAL:
        print("FINAL:", st)
        sys.exit(0 if st == "live" else 1)
    time.sleep(10)
print("FINAL: timeout")
sys.exit(2)
