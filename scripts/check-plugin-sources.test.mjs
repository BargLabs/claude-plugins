// Tests for check-plugin-sources.mjs. They run the check against local
// fixture directories through a local source reader, so they make no
// network call. Run with: node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { checkPlugins } from "./check-plugin-sources.mjs";

const SOURCE_README = `# Demo

The demo plugin, as the source ships it.

## Tools

Two tools.

## Settings

\`\`\`
## not a heading: inside a code block
\`\`\`

One setting.
`;

const PLUGIN_JSON = JSON.stringify({ name: "demo", version: "1.2.3" }, null, 2) + "\n";
const MCP_JSON = JSON.stringify({ mcpServers: { demo: { command: "npx", args: ["demo@1.2.3"] } } }, null, 2) + "\n";
const SKILL = "---\nname: demo\n---\n\nUse the demo.\n";

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

// Builds a repository root holding an identical copy of plugin "demo", and a
// source directory laid out as <sourceRoot>/<owner>/<repo>/<tag>/<path>.
function fixture() {
  const base = mkdtempSync(join(tmpdir(), "plugin-sources-"));
  const root = join(base, "repo");
  const sourceRoot = join(base, "sources");
  write(
    join(root, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "fixture", plugins: [{ name: "demo", source: "./plugins/demo" }] }, null, 2),
  );
  const copy = join(root, "plugins", "demo");
  const src = join(sourceRoot, "Example", "demo", "v1.2.3", "plugins", "demo");
  for (const dir of [copy, src]) {
    write(join(dir, ".claude-plugin", "plugin.json"), PLUGIN_JSON);
    write(join(dir, ".mcp.json"), MCP_JSON);
    write(join(dir, "skills", "demo", "SKILL.md"), SKILL);
    write(join(dir, "README.md"), SOURCE_README);
  }
  write(join(copy, ".claude-plugin", "icon.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const sources = { demo: { repository: "Example/demo", path: "plugins/demo" } };
  return { base, root, copy, sourceRoot, sources, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function walk(dir, prefix = "") {
  const out = new Map();
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) for (const [k, v] of walk(full, rel)) out.set(k, v);
    else out.set(rel, readFileSync(full));
  }
  return out;
}

// A source reader over the fixture directory: null for a tag that does not
// exist, a map of path -> bytes otherwise.
function localReader(sourceRoot) {
  return {
    async readTree({ repository, tag, path }) {
      const tagDir = join(sourceRoot, repository, tag);
      if (!existsSync(tagDir)) return null;
      return walk(join(tagDir, path));
    },
  };
}

async function run(f, reader = localReader(f.sourceRoot)) {
  return checkPlugins({ root: f.root, sources: f.sources, reader });
}

function withInstall(readme) {
  return readme.replace("## Tools", "## Install\n\n```\n/plugin install demo@fixture\n```\n\n## Tools");
}

test("an identical copy passes", async () => {
  const f = fixture();
  try {
    const r = await run(f);
    assert.equal(r.ok, true, r.lines.join("\n"));
    assert.match(r.lines[0], /^ok demo 1\.2\.3 matches Example\/demo@v1\.2\.3:plugins\/demo/);
    assert.equal(r.lines.length, 1);
  } finally {
    f.cleanup();
  }
});

test("a changed .mcp.json fails, naming the file and the tag", async () => {
  const f = fixture();
  try {
    write(join(f.copy, ".mcp.json"), MCP_JSON.replace("demo@1.2.3", "demo@1.2.2"));
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => /^ {2}mismatch: \.mcp\.json differs from Example\/demo@v1\.2\.3$/.test(l)), r.lines.join("\n"));
    assert.match(r.lines[0], /^FAIL demo 1\.2\.3/);
  } finally {
    f.cleanup();
  }
});

test("a missing skill file fails", async () => {
  const f = fixture();
  try {
    rmSync(join(f.copy, "skills"), { recursive: true });
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(
      r.lines.some((l) => l.includes("skills/demo/SKILL.md is in Example/demo@v1.2.3 but missing from the copy")),
      r.lines.join("\n"),
    );
  } finally {
    f.cleanup();
  }
});

test("an extra non-icon file fails", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "notes.txt"), "local notes\n");
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(
      r.lines.some((l) => l.includes("notes.txt is in the copy but not in Example/demo@v1.2.3")),
      r.lines.join("\n"),
    );
    assert.ok(!r.lines.some((l) => l.includes("icon.png")), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a README with an added ## Install section passes", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "README.md"), withInstall(SOURCE_README));
    const r = await run(f);
    assert.equal(r.ok, true, r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a README with an added ## Changes since section passes", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "README.md"), withInstall(SOURCE_README) + "\n## Changes since 1.2.0\n\n- A change.\n");
    const r = await run(f);
    assert.equal(r.ok, true, r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a README with an added section of another name fails", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "README.md"), SOURCE_README + "\n## Extras\n\nNot in the source.\n");
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.includes('README.md: section "## Extras"')), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a README with a source section edited fails", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "README.md"), withInstall(SOURCE_README).replace("Two tools.", "Three tools."));
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(
      r.lines.some((l) => l.includes('README.md: section "## Tools" of Example/demo@v1.2.3')),
      r.lines.join("\n"),
    );
  } finally {
    f.cleanup();
  }
});

test("a README with a source section dropped fails", async () => {
  const f = fixture();
  try {
    const dropped = SOURCE_README.slice(0, SOURCE_README.indexOf("## Settings"));
    write(join(f.copy, "README.md"), dropped);
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(
      r.lines.some((l) => l.includes('README.md: section "## Settings" of Example/demo@v1.2.3')),
      r.lines.join("\n"),
    );
  } finally {
    f.cleanup();
  }
});

test("a README with a changed introduction fails", async () => {
  const f = fixture();
  try {
    write(join(f.copy, "README.md"), SOURCE_README.replace("as the source ships it", "as we ship it"));
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.includes("README.md: the title and introduction differ")), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a missing tag fails", async () => {
  const f = fixture();
  try {
    write(join(f.copy, ".claude-plugin", "plugin.json"), PLUGIN_JSON.replace("1.2.3", "1.2.4"));
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.includes("tag v1.2.4 does not exist in Example/demo")), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a plugin with no source entry fails", async () => {
  const f = fixture();
  try {
    f.sources = {};
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.startsWith("FAIL demo: no entry in scripts/plugin-sources.json")), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a source entry with no plugin fails", async () => {
  const f = fixture();
  try {
    f.sources.ghost = { repository: "Example/ghost", path: "plugins/ghost" };
    const r = await run(f);
    assert.equal(r.ok, false);
    assert.ok(r.lines.some((l) => l.startsWith("FAIL ghost: in scripts/plugin-sources.json but not in")), r.lines.join("\n"));
  } finally {
    f.cleanup();
  }
});

test("a source read error fails, not passes", async () => {
  const f = fixture();
  try {
    const reader = {
      async readTree() {
        throw new Error("network unreachable");
      },
    };
    const r = await run(f, reader);
    assert.equal(r.ok, false);
    assert.ok(
      r.lines.some((l) => l.startsWith("FAIL demo 1.2.3: cannot read Example/demo@v1.2.3: network unreachable")),
      r.lines.join("\n"),
    );
  } finally {
    f.cleanup();
  }
});
