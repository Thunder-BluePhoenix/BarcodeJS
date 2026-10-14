"""Decode images written by cases.mjs with zxing-cpp. Usage: python check.py <dir>"""
import json, sys
import numpy as np
import zxingcpp

d = sys.argv[1]
failed = 0
for m in json.load(open(f"{d}/meta.json")):
    head, px = open(f"{d}/{m['i']}.pgm", "rb").read().split(b"\n", 1)
    _, w, h, _ = head.split()
    img = np.frombuffer(px, dtype=np.uint8).reshape(int(h), int(w))
    got = [r.text for r in zxingcpp.read_barcodes(img)]
    ok = any(t in m["expect"] for t in got)
    failed += not ok
    print("ok  " if ok else "FAIL", m["format"], repr(m["value"]), "" if ok else f"{m.get('opts') or ''} -> {got!r}")
print(f"{failed} failed")
sys.exit(1 if failed else 0)
