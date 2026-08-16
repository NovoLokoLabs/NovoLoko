import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_core_nodes.js as the first argument");

const source = fs.readFileSync(frontendPath, "utf8");
const start = source.indexOf("function resolveComboChoice(");
const end = source.indexOf("function normaliseEnhancerComboWidget(");
assert.ok(start >= 0 && end > start, "enhancer combo resolver is present");
const resolveComboChoice = new Function(
    `${source.slice(start, end)}\nreturn resolveComboChoice;`,
)();

const choices = ["Auto", "Krea2 / Image", "MiniMax H3 Standard"];
assert.equal(resolveComboChoice(1, choices, "Auto"), "Krea2 / Image");
assert.equal(resolveComboChoice(2, choices, "Auto"), "MiniMax H3 Standard");
assert.equal(resolveComboChoice("Krea2 / Image", choices, "Auto"), "Krea2 / Image");
assert.equal(resolveComboChoice(99, choices, "Auto"), "Auto");
