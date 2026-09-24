import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mobileScript = readFileSync(new URL("../apps/mobile/app.js", import.meta.url), "utf8");
const mobileMarkup = readFileSync(new URL("../apps/mobile/index.html", import.meta.url), "utf8");

const mojibakeTokens = [
  "â€”",
  "â€“",
  "â€",
  "â†",
  "âœ",
  "Â·",
  "Ã",
  "�"
];

test("mobile source does not include known mojibake sequences", () => {
  for (const token of mojibakeTokens) {
    assert.equal(mobileScript.includes(token), false, `mobile script should not contain ${token}`);
    assert.equal(mobileMarkup.includes(token), false, `mobile markup should not contain ${token}`);
  }
});

test("mobile source keeps intended unicode UI symbols for dashboard and back controls", () => {
  assert.match(mobileScript, /\\u2014 <span>vs prior period<\/span>/);
  assert.match(mobileScript, /\\u2713<\/span><div><strong>All caught up<\/strong>/);
  assert.match(mobileScript, /\\u2190 Back/);
  assert.match(mobileScript, /\\u2191|\\u2193|\\u2192/);
});
