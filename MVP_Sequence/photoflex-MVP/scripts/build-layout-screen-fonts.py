"""Losslessly compress the Layout fonts used by CSS; requires fonttools[woff]."""
from pathlib import Path
import re
import json
import base64
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
css = root / "src/styles/layout-fonts.css"
paths = list(dict.fromkeys(re.findall(r'\.\./assets/fonts/([^"\)]+\.(?:ttf|woff2))', css.read_text(encoding="utf-8"))))
glyphs, profiles = {}, {}
for path in paths:
    source = root / "src/assets/fonts" / path.replace(".woff2", ".ttf")
    target = source.with_suffix(".woff2")
    font = TTFont(source, recalcTimestamp=False)
    font.flavor = "woff2"
    if not target.exists() or source.stat().st_mtime > target.stat().st_mtime:
        font.save(target)
    compressed = TTFont(target)
    assert font.getBestCmap() == compressed.getBestCmap()
    assert font["hmtx"].metrics == compressed["hmtx"].metrics
    ranges = []
    for point in sorted(font.getBestCmap()):
        if ranges and point == ranges[-1][1] + 1:
            ranges[-1][1] = point
        else:
            ranges.append([point, point])
    encoded, previous = bytearray(), 0
    for start, end in ranges:
        for value in (start - previous, end - start):
            while value >= 128:
                encoded.append((value & 127) | 128)
                value >>= 7
            encoded.append(value)
        previous = start
    payload = base64.b64encode(encoded).decode("ascii")
    profile = next((key for key, value in profiles.items() if value == payload), str(len(profiles)))
    profiles[profile] = payload
    glyphs[path.replace(".woff2", ".ttf")] = profile
    print(f"{source.name}: {source.stat().st_size} -> {target.stat().st_size}", flush=True)
    font.close()
    compressed.close()
assets = (root / "src/platform/browser/layoutPdfFontAssets.ts").read_text(encoding="utf-8")
variables = dict(re.findall(r'import (\w+) from "\.\./\.\./assets/fonts/([^"?]+)\?url"', assets))
families = {}
for family, faces in re.findall(r'"([a-z-]+)": \{ ([^}]+) \}', assets):
    families[family] = {style: variables[name] for style, name in re.findall(r'(\w+): (\w+)', faces)}
(root / "src/assets/fonts/layout-font-coverage.json").write_text(json.dumps({"families": families, "glyphs": glyphs, "profiles": profiles}, separators=(",", ":")), encoding="utf-8")
