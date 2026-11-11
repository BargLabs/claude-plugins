#!/usr/bin/env bash
# The pre-dispatch gate the goal runner (BargLabs/alfred scripts/run-goal-stream.sh) runs on this
# repository's origin/main before it starts an agent, and refuses to dispatch without.
#
# WHAT THIS CHECKS, exactly: every JSON file the marketplace serves parses, and the marketplace and
# its plugins agree. Each plugin entry in .claude-plugin/marketplace.json has a source directory
# holding .claude-plugin/plugin.json and .mcp.json; each plugin.json names the entry's plugin and a
# version; each .mcp.json runs that plugin's package at exactly that version.
#
# WHAT IT DOES NOT CHECK: that a plugin's files match its public source repository at that version.
# That is the plugin-sources check, when this repository has one. A pass here is not that.
#
# Exit codes: 0 passed; 1 failed; 99 could not enter the repository root.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 99

node --input-type=module -e '
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const fail = [];
const read = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch (e) { fail.push(`${p}: ${e.message}`); return undefined; } };
const market = read(".claude-plugin/marketplace.json");
for (const entry of market?.plugins ?? []) {
  const dir = entry.source;
  const plugin = read(join(dir, ".claude-plugin/plugin.json"));
  const mcp = existsSync(join(dir, ".mcp.json")) ? read(join(dir, ".mcp.json")) : (fail.push(`${dir}/.mcp.json: missing`), undefined);
  if (!plugin || !mcp) continue;
  if (plugin.name !== entry.name) fail.push(`${dir}: plugin.json name ${plugin.name} is not the marketplace entry ${entry.name}`);
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? "")) fail.push(`${dir}: plugin.json has no x.y.z version`);
  const args = Object.values(mcp.mcpServers ?? {}).flatMap((s) => s.args ?? []);
  if (!args.some((a) => typeof a === "string" && a.endsWith(`@${plugin.version}`))) fail.push(`${dir}: .mcp.json does not run version ${plugin.version}`);
  console.log(`${entry.name} ${plugin.version}: ${dir}`);
}
if (!market?.plugins?.length) fail.push(".claude-plugin/marketplace.json: no plugins");
for (const f of fail) console.error(`preflight: ${f}`);
process.exit(fail.length ? 1 : 0);
'
