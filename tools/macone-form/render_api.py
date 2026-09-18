#!/usr/bin/env python3
"""Render API helper. Reads the API token from env (set by with-render-env).
Usage: with-render-env python3 render_api.py <GET|POST|PATCH> <path> [json_body_file]
"""
import os, sys, json, urllib.request, urllib.error

KEY = os.environ["RENDER_API_KEY"]
method = sys.argv[1]
path = sys.argv[2]
body = None
if len(sys.argv) > 3:
    with open(sys.argv[3], "rb") as f:
        body = f.read()

req = urllib.request.Request(
    "https://api.render.com/v1" + path,
    data=body, method=method,
    headers={
        "Authorization": f"Bearer {KEY}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    },
)
try:
    with urllib.request.urlopen(req) as r:
        print(r.read().decode())
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read().decode()}", file=sys.stderr)
    sys.exit(1)
