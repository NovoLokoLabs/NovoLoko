import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_music3_data_v2.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);
source = source.replace(/\bapp\./g, "globalThis.__novoApp.").replace(/\bapi\./g, "globalThis.__novoApi.");

const harness = String.raw`
class MockElement {
    constructor() {
        this.dataset = {};
        this.style = { overflowY: "visible", overflowX: "visible" };
        this.parentElement = null;
        this.children = [];
        this.listeners = new Map();
        this.scrollTop = 0;
        this.scrollLeft = 0;
        this.scrollHeight = 100;
        this.clientHeight = 100;
        this.scrollWidth = 100;
        this.clientWidth = 100;
    }
    append(child) { child.parentElement = this; this.children.push(child); }
    contains(candidate) {
        if (candidate === this) return true;
        return this.children.some((child) => child.contains(candidate));
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
}
globalThis.Element = MockElement;
globalThis.window = {};
globalThis.getComputedStyle = (element) => element.style;
globalThis.WheelEvent = class {
    constructor(type, values) { this.type = type; Object.assign(this, values); }
};

let forwarded = 0;
const canvas = { dispatchEvent(event) { forwarded += 1; this.lastEvent = event; return true; } };
const root = new MockElement();
const inner = new MockElement();
inner.style.overflowY = "auto";
inner.scrollHeight = 500;
inner.clientHeight = 100;
root.append(inner);
const leaf = new MockElement();
inner.append(leaf);
const node = { id: 4, type: "NovaMusicAudioLibrary", widgets: [{ element: root }] };
globalThis.__novoApp = { graph: { _nodes: [node] }, canvas: { canvas, selected_nodes: {} } };
globalThis.__novoApi = {};

installWheelHandoff(root, "NovaMusicAudioLibrary");
const wheel = root.listeners.get("wheel");
assert.equal(typeof wheel, "function");

function fire(target, deltaY, deltaX = 0) {
    const event = {
        target, deltaY, deltaX, deltaZ: 0, deltaMode: 0,
        clientX: 10, clientY: 20, screenX: 10, screenY: 20,
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.immediate = true; },
    };
    wheel(event);
    return event;
}

inner.scrollTop = 50;
let event = fire(leaf, 20);
assert.equal(forwarded, 0, "a list that can scroll down keeps the wheel");
assert.equal(event.stopped, true);
assert.equal(event.prevented, undefined, "native inner scrolling is not prevented");

inner.scrollTop = 400;
event = fire(leaf, 20);
assert.equal(forwarded, 1, "the bottom boundary hands the wheel to canvas zoom");
assert.equal(event.prevented, true);
assert.equal(event.immediate, true);

inner.scrollTop = 0;
event = fire(leaf, -20);
assert.equal(forwarded, 2, "the top boundary hands the wheel to canvas zoom");

event = fire(root, 20);
assert.equal(forwarded, 3, "non-scrollable panel chrome always hands the wheel to canvas zoom");

globalThis.__novoApp.canvas.selected_nodes = { 4: node };
event = fire(root, 20);
assert.equal(forwarded, 4, "selection does not trap wheel input");

inner.scrollTop = 50;
event = fire(leaf, -20);
assert.equal(forwarded, 4, "the same selected node still scrolls a movable inner list");
assert.equal(event.stopped, true);

assert.match(PROMPT_STACK_NODE, /NovaPromptStackAIO/);
`;

await new Function("assert", `${source}\n${harness}`)(assert);

