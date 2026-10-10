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

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
