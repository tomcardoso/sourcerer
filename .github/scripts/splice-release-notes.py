#!/usr/bin/env python3
"""Splice generated changelog content into the release note template.

Reads:
  - .github/release-template.md  (the template)
  - /tmp/generated-changelog.md  (output of `gh api releases/generate-notes`)

Writes:
  - /tmp/release-notes.md

Environment variables:
  VERSION  The release version string, e.g. "0.2.0" (without the leading "v").
"""

import os
import sys

version = os.environ.get("VERSION", "")
if not version:
    print("ERROR: VERSION environment variable is not set.", file=sys.stderr)
    sys.exit(1)

template = open(".github/release-template.md").read()
generated = open("/tmp/generated-changelog.md").read().strip()

result = (
    template
    .replace("{version}", version)
    .replace("<!-- Describe changes in this release -->", generated)
)

open("/tmp/release-notes.md", "w").write(result)
