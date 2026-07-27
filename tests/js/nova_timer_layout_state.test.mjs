import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperSource = await readFile(process.argv[2], "utf8");
const {
    timerChromeCSS,
    timerControlsLayoutSize,
} = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);

assert.deepEqual(timerControlsLayoutSize(), {
    minHeight: 118,
    minWidth: 1,
});

const css = timerChromeCSS();
const hostBlock = css.match(/\.nova-timer-host-v397\s*\{([^}]+)\}/s)?.[1] || "";

assert.doesNotMatch(css, /\[class\*=["']header/);
assert.doesNotMatch(css, /\[class\*=["']node-title/);
assert.doesNotMatch(hostBlock, /min-(?:width|height)\s*:\s*0/);
assert.doesNotMatch(hostBlock, /display\s*:\s*none/);
assert.match(css, /\.nova-timer-marker-wrapper-v318/);

console.log("NovoLoko Timer executable Nodes 2.0 layout tests passed.");
