# Cejel for Claude

Cejel scores a repository's engineering-trust signals (tests, secrets, isolation,
claim-vs-reality, and CI discipline) against a published rubric and returns a trust
certificate with cited evidence. This plugin gives Claude the Cejel `scan` tool and a skill
that tells Claude when to run a scan and how to read the certificate.

A Cejel score is evidence for your own judgment. It is not an audit, a certification, or a
guarantee that code is correct or secure.

## Install

In Claude Code:

```
/plugin marketplace add BargLabs/claude-plugins
/plugin install cejel@barglabs
```

The MCP server runs locally with `npx -y @cejel/cejel@0.6.11 mcp`, so Node.js 18 or later must be on your path.

## What the plugin contains

- **MCP server `cejel`**: started by `npx` from the `@cejel/cejel` npm package, pinned to
  the exact version this plugin release names in its `.mcp.json`. It
  exposes one tool, `scan` (read-only, non-destructive, idempotent, no network), and two
  resources: the HTML certificate and the SVG badge from the most recent scan.
- **Skill `cejel-scan`**: when to run a scan, how to read the scores, verdict, findings and
  scan limitations, and how to describe a result without overstating it.

## What it runs, sends and fetches

- **Scanning is offline.** The `scan` tool reads the repository at the path you give it and
  returns the certificate. It makes no network calls, sends no telemetry, calls no model, and
  writes no files. It runs your local `git` binary through one hardened subprocess with
  network transports disabled.
- **Starting the server fetches the package once.** The first time the server starts, `npx`
  downloads `@cejel/cejel` at the pinned version from the npm registry and caches it. That is a
  one-time install by `npx`, not part of the scan.
- **Remote repositories are cloned by Claude, not by Cejel.** If you ask about a repository
  that is not on your machine, the skill tells Claude to ask before making a full `git clone`
  into a temporary directory and scanning that.

## Example prompts

- "Clone https://github.com/BargLabs/cejel into a temporary folder and give me its Cejel
  trust score."
- "Scan https://github.com/BargLabs/cejel with Cejel and explain the top findings and the
  criteria they come from."
- "Run Cejel on https://github.com/BargLabs/cejel and save its trust badge to
  ./cejel-badge.svg."

## Changes since 0.6.8

0.6.9 to 0.6.11, in brief (full notes in the
[Cejel changelog](https://github.com/BargLabs/cejel/blob/main/CHANGELOG.md)). v17 stays the default
rubric throughout.

- **0.6.11:** `cejel issue` reproduces a certificate with the attested scan's own date; the GitHub
  Action no longer reads the calling repository's `package.json` to set up pnpm; Cejel is a GitLab
  CI/CD Catalog component, and a score change on the same line keeps its GitLab Code Quality
  fingerprint.
- **0.6.10:** a plain-language first page on the certificate; under the default rubric, a scan whose
  git history Cejel could not read gives no score and no verdict.
- **0.6.9:** history scanning of large repositories is time-bounded and keeps its evidence (#586,
  #567); the GitHub Action gains an optional `rubric-pin` input.

The MCP server's tool is unchanged (`scan`).

## Changes since 0.6.3

0.6.4 to 0.6.8 include these security and robustness fixes (full notes in the
[Cejel changelog](https://github.com/BargLabs/cejel/blob/main/CHANGELOG.md)):

- **0.6.8:** a certificate could print a credential taken from a CI command (#553); some
  repository lines could stall a scan.
- **0.6.7:** a scanned checkout could redirect where a scan writes its output (#508).
- **0.6.6:** a repository could stall a scan with a regular expression or a workspace glob (#502).

The MCP server's tool is unchanged (`scan`).

## Known issues

- **Fixed in 0.6.3:** Cejel's certificate for its own repository no longer cites strings in its own
  detector source, tests and review notes as evidence for the B6 review gate, the B6 fail-closed
  check or the A3 error boundary (certificates from 0.6.2 and earlier still do); see the
  2026-10-09 entry in
  [`leaderboard/RUBRIC_CHANGELOG.md`](https://github.com/BargLabs/cejel/blob/main/leaderboard/RUBRIC_CHANGELOG.md).
- **Inside a checkout of the Cejel repository itself,** `npx @cejel/cejel@<version>` may run
  whichever `cejel` is on your `PATH` instead of the pinned version. From 0.6.4, Cejel prints a
  warning when npx ran a different cejel than it resolved, where it can tell which version was
  asked for. The warning comes from the `cejel` that ran, so one older than 0.6.4 on your `PATH`
  prints nothing. Run it from another directory. Tracked in
  [#436](https://github.com/BargLabs/cejel/issues/436).

## Support, privacy and terms

- Support: [GitHub issues](https://github.com/BargLabs/cejel/issues)
- Privacy policy: https://barglabs.ai/privacy
- Terms: https://barglabs.ai/terms
- Source and full documentation: https://github.com/BargLabs/cejel

Cejel is licensed under AGPL-3.0-only.
