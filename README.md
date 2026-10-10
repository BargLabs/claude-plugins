# Barg Labs plugins for Claude

The Claude plugin marketplace for [Barg Labs](https://barglabs.ai).

## Plugins

| Plugin | What it does |
| --- | --- |
| [dunstan](plugins/dunstan) | Checks a coding agent's declared handback against the pull request's own GitHub record before it says done. |

## Install

In Claude Code:

```
/plugin marketplace add BargLabs/claude-plugins
/plugin install dunstan@barglabs
```

Dunstan's source lives at [BargLabs/dunstan](https://github.com/BargLabs/dunstan). This repository holds only the plugin packaging.

## Licence

AGPL-3.0-only. See [LICENSE](LICENSE).
