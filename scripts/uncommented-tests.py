"""List tests with no comment immediately above them."""
import re, sys, pathlib

files = sorted(pathlib.Path("tests").glob("*.test.js"))
total = missing = 0
report = {}

for f in files:
    lines = f.read_text().splitlines()
    gaps = []
    for i, line in enumerate(lines):
        if not re.match(r"^test(\.(only|skip|todo))?\(", line):
            continue
        total += 1
        # Walk back over blank lines to whatever precedes the test.
        j = i - 1
        while j >= 0 and not lines[j].strip():
            j -= 1
        above = lines[j].strip() if j >= 0 else ""
        if not (above.startswith("//") or above.startswith("*") or above.startswith("*/")):
            gaps.append((i + 1, line.strip()[:72]))
    if gaps:
        report[f.name] = gaps
        missing += len(gaps)

for name, gaps in sorted(report.items(), key=lambda kv: -len(kv[1])):
    print(f"{len(gaps):4}  {name}")
    if "-v" in sys.argv:
        for ln, text in gaps:
            print(f"        {ln}: {text}")

print(f"\n{missing} of {total} tests have no comment above them")
