#!/usr/bin/env python3
import json
import re

with open("/tmp/en_to_es_map.json") as f:
    en_es_map = json.load(f)

# Load existing translations if any
try:
    with open("/tmp/zh_manual.json") as f:
        manual_map = json.load(f)
except Exception:
    manual_map = {}

print(f"Total keys to map: {len(en_es_map)}")
