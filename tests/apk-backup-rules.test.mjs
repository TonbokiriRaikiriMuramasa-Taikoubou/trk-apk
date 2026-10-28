// SPDX-License-Identifier: GPL-3.0-or-later
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const parse = text => new JSDOM(text, { contentType:"text/xml" }).window.document;

test("Android backup and D2D rules exclude all documented domains", () => {
  const android = "http://schemas.android.com/apk/res/android";
  const app = parse(read("android/app/src/main/AndroidManifest.xml")).querySelector("application");
  assert.equal(app.getAttributeNS(android, "allowBackup"), "false");
  assert.equal(app.getAttributeNS(android, "dataExtractionRules"), "@xml/data_extraction_rules");
  const xml = parse(read("android/app/src/main/res/xml/data_extraction_rules.xml"));
  assert.equal(xml.documentElement.tagName, "data-extraction-rules");
  const expected = ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"].sort();
  for (const mode of ["cloud-backup", "device-transfer"]) {
    const sections = xml.documentElement.querySelectorAll(mode);
    assert.equal(sections.length, 1, mode);
    const section = sections[0];
    assert.equal(section.querySelectorAll("include").length, 0, mode);
    const exclusions = [...section.querySelectorAll("exclude")];
    assert.deepEqual(exclusions.map(el => el.getAttribute("domain")).sort(), expected, mode);
    assert.ok(exclusions.every(el => el.getAttribute("path") === "."), mode);
  }
});

test("privacy and issue guide describe the Android fork", () => {
  const privacy = read("privacy.html");
  assert.match(privacy, /端末間転送からアプリデータを除外/);
  assert.match(privacy, /device-to-device transfer/);
  const config = read(".github/ISSUE_TEMPLATE/config.yml");
  assert.match(config, /trk-apk\/blob\/main\/docs\/HANDOFF\.md/);
});
