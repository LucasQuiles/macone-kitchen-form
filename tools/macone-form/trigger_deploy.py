#!/usr/bin/env python3
"""Trigger a fresh deploy of current main. Usage: with-render-env python3 trigger_deploy.py"""
import os, json, urllib.request
KEY = os.environ["RENDER_API_KEY"]
svc = "srv-d9psa5710e5c738e5h5g"
req = urllib.request.Request(
    f"https://api.render.com/v1/services/{svc}/deploys",
    data=json.dumps({"clearCache": "clear"}).encode(),
    method="POST",
    headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as r:
    d = json.loads(r.read().decode())
    print("triggered deploy:", d.get("id"), d.get("status"), "commit", (d.get("commit") or {}).get("id", "")[:8])
