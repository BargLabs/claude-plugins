# Barg Labs plugins for Claude

The Claude plugin marketplace for [Barg Labs](https://barglabs.ai).

## Plugins

| Plugin | What it does |
| --- | --- |
| [cejel](plugins/cejel) | Scores a repository's engineering-trust signals offline and returns a certificate with cited evidence. |
| [dunstan](plugins/dunstan) | Checks a coding agent's declared handback against the pull request's own GitHub record before it says done. |

## Install

In Claude Code:

```
/plugin marketplace add BargLabs/claude-plugins
/plugin install cejel@barglabs
/plugin install dunstan@barglabs
```

Source: [BargLabs/cejel](https://github.com/BargLabs/cejel) and [BargLabs/dunstan](https://github.com/BargLabs/dunstan). This repository holds only the plugin packaging.

## Updating a plugin

Each `plugins/<name>/` here is a copy of `plugins/<name>/` in the plugin's source repository, listed in [`scripts/plugin-sources.json`](scripts/plugin-sources.json). To update one, copy `plugins/<name>/` from the source repository at the new release tag (`v<version>`), keep this copy's `## Install` section in its `README.md`, and keep `.claude-plugin/icon.png`. CI (`pnpm run check`) compares every copy with its source at the tag its `plugin.json` version names, and fails on any difference or when it cannot read the source.

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
