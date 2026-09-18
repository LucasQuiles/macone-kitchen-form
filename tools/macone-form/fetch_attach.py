#!/usr/bin/env python3
"""Fetch the latest 'Kitchen selections' email from lab@ and save its attachments."""
import email, imaplib, os, subprocess, sys

USER = "lab@quiles.studio"
env = dict(os.environ)
env.setdefault("DBUS_SESSION_BUS_ADDRESS", f"unix:path=/run/user/{os.getuid()}/bus")
pw = subprocess.run(["secret-tool", "lookup", "service", "porkbun-email", "user", "Lab@quiles.studio"],
                    capture_output=True, text=True, env=env).stdout
if not pw:
    sys.exit("no keyring pw")

M = imaplib.IMAP4_SSL("imap.porkbun.com", 993, timeout=30)
M.login(USER, pw)
M.select("INBOX", readonly=True)
typ, data = M.uid("search", None, "SUBJECT", "Kitchen")
uids = data[0].split() if data and data[0] else []
if not uids:
    sys.exit("no matching message")
uid = uids[-1]
typ, d = M.uid("fetch", uid, "(RFC822)")
msg = email.message_from_bytes(d[0][1])
print("UID", uid.decode(), "| Subject:", msg["Subject"], "| Date:", msg["Date"])
for part in msg.walk():
    fn = part.get_filename()
    cd = str(part.get("Content-Disposition", ""))
    ct = part.get_content_type()
    if fn or "attachment" in cd:
        payload = part.get_payload(decode=True) or b""
        out = f"/tmp/dl_{fn or 'noname'}"
        with open(out, "wb") as f:
            f.write(payload)
        print(f"  [{ct}] {fn}  {len(payload)} bytes  -> {out}")
M.logout()
