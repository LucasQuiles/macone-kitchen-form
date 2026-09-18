#!/usr/bin/env python3
"""Show env vars + latest deploys for the service."""
import os, json, urllib.request
KEY = os.environ["RENDER_API_KEY"]
svc = "srv-d9psa5710e5c738e5h5g"
def get(path):
    req = urllib.request.Request(f"https://api.render.com/v1/services/{svc}{path}",
        headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())
print("== env vars ==")
for e in get("/env-vars"):
    ev = e.get("envVar", e)
    print(" ", ev.get("key"), "=", ev.get("value"))
print("== last 3 deploys ==")
for e in get("/deploys?limit=3"):
    d = e.get("deploy", e)
    print(" ", d.get("id"), d.get("status"), "created", d.get("createdAt"), "finished", d.get("finishedAt"),
          "| trigger", (d.get("trigger") or {}))
