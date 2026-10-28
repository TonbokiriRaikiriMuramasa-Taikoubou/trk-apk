// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
test("mobile staging ships only the Lat guide, even if local model files exist", () => {
  const input = path.join(root, "assets/mmd/lat-miku");
  const sentinel = path.join(input, `test-${randomUUID()}.pmd`);
  try {
    fs.writeFileSync(sentinel, "not a real model", {flag:"wx"});
    execFileSync(process.execPath, ["tools/prepare-mobile-web.mjs"], {cwd:root});
    const staged = path.join(root, "mobile-web/assets/mmd/lat-miku");
    assert.deepEqual(fs.readdirSync(staged).sort(), ["README.md", "preset.json"]);
    const guide = JSON.parse(fs.readFileSync(path.join(staged, "preset.json"), "utf8"));
    assert.deepEqual(guide.files, []);
    assert.equal(guide.guide[0].url, "https://bowlroll.net/file/30199");
  } finally {
    fs.rmSync(sentinel, {force:true});
  }
});
