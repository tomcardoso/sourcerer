#!/usr/bin/env python3
"""Extract the 'What's new' section from a GitHub PR body.

Reads the PR body from stdin. Prints the content of the first
'## What's new' section, stopping at the next heading, horizontal
rule, or the Claude Code attribution line. Exits with no output if
the section is not found.
"""

import re
import sys

body = sys.stdin.read()
m = re.search(
    r"(?i)##\s+What.s\s+new\s*\n(.*?)(?=\n##|\n---|\Z)",
    body,
    re.DOTALL,
)
if not m:
    sys.exit(0)

# Strip trailing boilerplate (e.g. "🤖 Generated with [Claude Code](...)")
content = m.group(1).strip()
content = re.sub(r"\n*🤖.*$", "", content, flags=re.DOTALL).strip()
if content:
    print(content)
