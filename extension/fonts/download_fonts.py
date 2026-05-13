import urllib.request, re

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req) as r:
        return r.read().decode()

entries = [
    ("spectral-400", "https://fonts.googleapis.com/css2?family=Spectral:wght@400&display=swap"),
    ("spectral-600", "https://fonts.googleapis.com/css2?family=Spectral:wght@600&display=swap"),
    ("spectral-700", "https://fonts.googleapis.com/css2?family=Spectral:wght@700&display=swap"),
    ("jbm-400",      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap"),
    ("jbm-500",      "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap"),
]

css_lines = []

for name, url in entries:
    css = fetch(url)
    comments = re.findall(r'/\*([^*]*)\*/', css)
    blocks = re.split(r'/\*[^*]*\*/', css)
    for comment, block in zip(comments, blocks[1:]):
        if comment.strip() == 'latin':
            match = re.search(r'url\((https://[^)]+\.woff2)\)', block)
            if match:
                woff_url = match.group(1)
                fname = name + ".woff2"
                print(f"Downloading {fname}...")
                req2 = urllib.request.Request(woff_url, headers={"User-Agent": UA})
                with urllib.request.urlopen(req2) as r2:
                    data = r2.read()
                with open(fname, 'wb') as f:
                    f.write(data)
                print(f"  saved {len(data):,} bytes")

                weight_m = re.search(r'font-weight:\s*(\d+)', block)
                family_m = re.search(r"font-family:\s*'([^']+)'", block)
                weight = weight_m.group(1) if weight_m else '400'
                family = family_m.group(1) if family_m else name

                css_lines.append(f"@font-face {{")
                css_lines.append(f"  font-family: '{family}';")
                css_lines.append(f"  font-style: normal;")
                css_lines.append(f"  font-weight: {weight};")
                css_lines.append(f"  font-display: swap;")
                css_lines.append(f"  src: url('fonts/{fname}') format('woff2');")
                css_lines.append(f"}}")
                css_lines.append("")

print("\nGenerated @font-face rules:")
print("\n".join(css_lines))
