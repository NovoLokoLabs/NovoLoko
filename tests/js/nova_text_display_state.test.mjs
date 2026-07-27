import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperSource = await readFile(process.argv[2], "utf8");
const helper = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);

const {
    restoreTextDisplayText,
    shouldInstallTextDisplayDOM,
    textDisplayCounterSummary,
    textDisplayCounts,
} = helper;

assert.equal(shouldInstallTextDisplayDOM({
    nodes2: true,
    canAddDOMWidget: true,
}), true);
assert.equal(shouldInstallTextDisplayDOM({
    nodes2: false,
    canAddDOMWidget: true,
}), false);
assert.equal(shouldInstallTextDisplayDOM({
    nodes2: true,
    canAddDOMWidget: true,
    installed: true,
}), false);
assert.equal(
    restoreTextDisplayText({ novaDisplayLastText: "saved output" }, "stale"),
    "saved output",
);
assert.equal(restoreTextDisplayText({}, "live output"), "live output");
assert.deepEqual(textDisplayCounts("one two\nthree"), {
    words: 3,
    characters: 13,
});
assert.equal(
    textDisplayCounterSummary("one two", "Words + Characters", 320),
    "2 words • 7 characters",
);

console.log("NovoLoko Text Display executable Nodes 2.0 state tests passed.");
