#!/usr/bin/env node
// Checks that each plugin in .claude-plugin/marketplace.json is a faithful
// copy of its public source at the tag its version names.
//
// For each plugin:
//   - the version comes from the copy's .claude-plugin/plugin.json;
//   - the source tree is read at tag v<version> of the repository named in
//     scripts/plugin-sources.json (GitHub's public API; GITHUB_TOKEN is sent
//     when set, for rate limits only). A missing tag fails;
//   - every file under the source path must be in the copy byte for byte,
//     except README.md, which follows the README rule below;
//   - a file the copy has and the source lacks fails, except
//     .claude-plugin/icon.png.
//
// README rule: the title and introduction (everything before the first
// "## " heading) are identical, and every "## " section of the source is in
// the copy, byte-identical and in the same order. The copy may add sections
// headed "## Install" or starting "## Changes". Blank lines at the end of a
// section are the separator between sections and are not compared.
//
// It prints one line per plugin and one line per mismatch, and exits
// non-zero on any mismatch or when it cannot read a source: an unread
// source is not a pass. Node built-ins only.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SOURCES_FILE = "scripts/plugin-sources.json";
const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
const COPY_ONLY_ALLOWED = new Set([".claude-plugin/icon.png"]);
const README = "README.md";

function isAllowedAddedSection(heading) {
  return heading === "## Install" || heading.startsWith("## Changes");
}

function walk(dir, prefix = "") {
  const out = new Map();
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) {
      for (const [k, v] of walk(full, rel)) out.set(k, v);
    } else {
      out.set(rel, readFileSync(full));
    }
  }
  return out;
}

// Splits a README into its introduction (everything before the first "## "
// heading) and its "## " sections. A "## " line inside a fenced code block
// is not a heading.
export function splitReadme(text) {
  const lines = text.split(/(?<=\n)/);
  let intro = "";
  const sections = [];
  let fence = null;
  for (const line of lines) {
    const bare = line.replace(/\r?\n$/, "");
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(bare);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
    }
    if (fence === null && !fenceMatch && bare.startsWith("## ")) {
      sections.push({ heading: bare.trimEnd(), text: line });
    } else if (sections.length === 0) {
      intro += line;
    } else {
      sections[sections.length - 1].text += line;
    }
  }
  const trim = (s) => s.replace(/(\r?\n)+$/, "");
  return { intro: trim(intro), sections: sections.map((s) => ({ heading: s.heading, text: trim(s.text) })) };
}

export function compareReadme(copyText, sourceText, where) {
  const problems = [];
  const copy = splitReadme(copyText);
  const source = splitReadme(sourceText);
  if (copy.intro !== source.intro) {
    problems.push(`${README}: the title and introduction differ from ${where}`);
  }
  let i = 0;
  for (const section of copy.sections) {
    let j = -1;
    for (let k = i; k < source.sections.length; k++) {
      if (source.sections[k].heading === section.heading) {
        j = k;
        break;
      }
    }
    if (j >= 0) {
      for (let k = i; k < j; k++) {
        problems.push(`${README}: section "${source.sections[k].heading}" of ${where} is missing from the copy, or out of order`);
      }
      if (source.sections[j].text !== section.text) {
        problems.push(`${README}: section "${section.heading}" of ${where} differs in the copy`);
      }
      i = j + 1;
    } else if (isAllowedAddedSection(section.heading)) {
      continue;
    } else if (source.sections.some((s) => s.heading === section.heading)) {
      problems.push(`${README}: section "${section.heading}" appears in the copy out of order or twice, against ${where}`);
    } else {
      problems.push(
        `${README}: section "${section.heading}" is not in ${where} and is not an allowed addition ("## Install", "## Changes...")`,
      );
    }
  }
  for (let k = i; k < source.sections.length; k++) {
    problems.push(`${README}: section "${source.sections[k].heading}" of ${where} is missing from the copy, or out of order`);
  }
  return problems;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Checks every plugin. `reader.readTree({ repository, tag, path })` returns
// a Map of path (relative to `path`, "/"-separated) to Buffer, or null when
// the tag does not exist; it throws when it cannot read the source.
export async function checkPlugins({ root, sources, reader }) {
  const lines = [];
  let ok = true;
  const fail = (line) => {
    ok = false;
    lines.push(line);
  };

  let marketplace;
  try {
    marketplace = readJson(join(root, MARKETPLACE_FILE));
  } catch (err) {
    fail(`FAIL: cannot read ${MARKETPLACE_FILE}: ${err.message}`);
    return { ok, lines };
  }
  const plugins = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];
  if (plugins.length === 0) fail(`FAIL: ${MARKETPLACE_FILE} lists no plugins`);
  const names = new Set(plugins.map((p) => p.name));

  for (const plugin of plugins) {
    const name = plugin.name;
    const entry = Object.hasOwn(sources, name) ? sources[name] : undefined;
    if (!entry || typeof entry.repository !== "string" || typeof entry.path !== "string") {
      fail(`FAIL ${name}: no entry in ${SOURCES_FILE} naming its source repository and path`);
      continue;
    }
    if (typeof plugin.source !== "string") {
      fail(`FAIL ${name}: ${MARKETPLACE_FILE} gives no local source path for it`);
      continue;
    }
    const copyDir = resolve(root, plugin.source);
    let version;
    try {
      version = readJson(join(copyDir, ".claude-plugin", "plugin.json")).version;
    } catch (err) {
      fail(`FAIL ${name}: cannot read its .claude-plugin/plugin.json: ${err.message}`);
      continue;
    }
    if (typeof version !== "string" || version === "") {
      fail(`FAIL ${name}: its .claude-plugin/plugin.json names no version`);
      continue;
    }
    const tag = `v${version}`;
    const where = `${entry.repository}@${tag}`;

    let sourceFiles;
    try {
      sourceFiles = await reader.readTree({ repository: entry.repository, tag, path: entry.path });
    } catch (err) {
      fail(`FAIL ${name} ${version}: cannot read ${where}: ${err.message}`);
      continue;
    }
    if (sourceFiles === null) {
      fail(`FAIL ${name} ${version}: tag ${tag} does not exist in ${entry.repository}`);
      continue;
    }
    if (sourceFiles.size === 0) {
      fail(`FAIL ${name} ${version}: ${where} has no files under ${entry.path}`);
      continue;
    }
    if (!existsSync(copyDir)) {
      fail(`FAIL ${name} ${version}: the copy ${plugin.source} does not exist`);
      continue;
    }
    const copyFiles = walk(copyDir);

    const problems = [];
    for (const [rel, bytes] of sourceFiles) {
      const copyBytes = copyFiles.get(rel);
      if (copyBytes === undefined) {
        problems.push(`${rel} is in ${where} but missing from the copy`);
      } else if (rel === README) {
        problems.push(...compareReadme(copyBytes.toString("utf8"), bytes.toString("utf8"), where));
      } else if (!copyBytes.equals(bytes)) {
        problems.push(`${rel} differs from ${where}`);
      }
    }
    for (const rel of copyFiles.keys()) {
      if (!sourceFiles.has(rel) && !COPY_ONLY_ALLOWED.has(rel)) {
        problems.push(`${rel} is in the copy but not in ${where}`);
      }
    }

    if (problems.length === 0) {
      lines.push(`ok ${name} ${version} matches ${where}:${entry.path} (${sourceFiles.size} files compared)`);
    } else {
      fail(`FAIL ${name} ${version}: ${problems.length} mismatch(es) against ${where}:${entry.path}`);
      for (const p of problems) lines.push(`  mismatch: ${p}`);
    }
  }

  for (const name of Object.keys(sources)) {
    if (!names.has(name)) fail(`FAIL ${name}: in ${SOURCES_FILE} but not in ${MARKETPLACE_FILE}`);
  }
  return { ok, lines };
}

// Reads a source tree at a tag from GitHub's REST API.
export function githubReader({ token = process.env.GITHUB_TOKEN, apiBase = "https://api.github.com" } = {}) {
  async function get(url) {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "barglabs-claude-plugins-source-check",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${apiBase}${url}`, { headers, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
      throw new Error(`GET ${url} answered ${res.status}: ${body}`);
    }
    return res.json();
  }
  async function must(url) {
    const data = await get(url);
    if (data === null) throw new Error(`GET ${url} answered 404`);
    return data;
  }

  return {
    async readTree({ repository, tag, path }) {
      const repo = await get(`/repos/${repository}`);
      if (repo === null) throw new Error(`repository ${repository} not found`);
      const ref = await get(`/repos/${repository}/git/ref/tags/${encodeURIComponent(tag)}`);
      if (ref === null || Array.isArray(ref)) return null;
      let object = ref.object;
      for (let depth = 0; object.type === "tag"; depth++) {
        if (depth > 5) throw new Error(`tag ${tag} nests too deeply`);
        object = (await must(`/repos/${repository}/git/tags/${object.sha}`)).object;
      }
      if (object.type !== "commit") throw new Error(`tag ${tag} points at a ${object.type}, not a commit`);
      const commit = await must(`/repos/${repository}/git/commits/${object.sha}`);
      const tree = await must(`/repos/${repository}/git/trees/${commit.tree.sha}?recursive=1`);
      if (tree.truncated) throw new Error(`the tree at ${tag} is too large to read in one call`);
      const prefix = `${path.replace(/\/+$/, "")}/`;
      const files = new Map();
      for (const item of tree.tree) {
        if (!item.path.startsWith(prefix)) continue;
        if (item.type === "tree") continue;
        if (item.type !== "blob") throw new Error(`${item.path} at ${tag} is a ${item.type}, which the check cannot compare`);
        const blob = await must(`/repos/${repository}/git/blobs/${item.sha}`);
        if (blob.encoding !== "base64") throw new Error(`${item.path} at ${tag} came back as ${blob.encoding}`);
        const bytes = Buffer.from(blob.content, "base64");
        if (bytes.length !== blob.size) throw new Error(`${item.path} at ${tag} came back short`);
        files.set(item.path.slice(prefix.length), bytes);
      }
      return files;
    },
  };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sources = readJson(join(root, SOURCES_FILE));
  const { ok, lines } = await checkPlugins({ root, sources, reader: githubReader() });
  for (const line of lines) console.log(line);
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.log(`FAIL: ${err.message}`);
    process.exitCode = 1;
  });
}
