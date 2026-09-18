#!/usr/bin/env python3
"""Confirm the forwarded 'Kitchen selections' email in lhquiles@ carries the PDF.
Lists attachments of the newest match and saves the PDF to /tmp. Read-only.
"""
import json, os, base64, urllib.parse, urllib.request

CRED = "/home/q/.google_workspace_mcp/credentials/lhquiles@gmail.com.json"
d = json.load(open(CRED))
tok = json.load(urllib.request.urlopen(urllib.request.Request(
    d["token_uri"],
    data=urllib.parse.urlencode({
        "client_id": d["client_id"], "client_secret": d["client_secret"],
        "refresh_token": d["refresh_token"], "grant_type": "refresh_token"}).encode(),
), timeout=20))["access_token"]
H = {"Authorization": f"Bearer {tok}"}


def api(path):
    return json.load(urllib.request.urlopen(urllib.request.Request(
        "https://gmail.googleapis.com/gmail/v1/users/me/" + path, headers=H), timeout=30))


q = urllib.parse.quote('subject:"Kitchen selections" newer_than:1d')
lst = api(f"messages?q={q}&maxResults=1")
mid = lst["messages"][0]["id"]
msg = api(f"messages/{mid}?format=full")
hdrs = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
print("Newest forwarded message in lhquiles@gmail.com:")
print("  Subject:", hdrs.get("Subject"))
print("  From:   ", hdrs.get("From"))
print("  To:     ", hdrs.get("To"))
print("  Cc:     ", hdrs.get("Cc"))
print("  Delivered-To:", hdrs.get("Delivered-To"))
print("  Date:   ", hdrs.get("Date"))
print("  Attachments:")


def walk(part):
    fn = part.get("filename")
    body = part.get("body", {})
    if fn:
        size = body.get("size", 0)
        print(f"    - {fn}  [{part.get('mimeType')}]  {size} bytes")
        if part.get("mimeType") == "application/pdf" and body.get("attachmentId"):
            att = api(f"messages/{mid}/attachments/{body['attachmentId']}")
            data = base64.urlsafe_b64decode(att["data"])
            out = "/tmp/gmail_" + fn
            open(out, "wb").write(data)
            print(f"        saved -> {out}  ({len(data)} bytes)")
    for child in part.get("parts") or []:
        walk(child)


walk(msg["payload"])
