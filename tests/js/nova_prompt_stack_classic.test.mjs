import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_prompt_stack_aio.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8")
    .replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);

const harness = String.raw`
globalThis.LiteGraph = { vueNodesMode: false };
const response = (data) => ({ ok: true, status: 200, json: async () => data });
const api = {
    fetchApi: async (path) => path.startsWith("/nova_prompt_stack/files")
        ? response({
            ok: true,
            folders: ["All folders", "csv/deep"],
            files: ["csv/deep/library.csv"],
            file_items: [{ value: "csv/deep/library.csv", label: "library.csv", relative_path: "csv/deep/library.csv" }],
            default: "csv/deep/library.csv",
        })
        : response({ ok: true, categories: ["All"], styles: ["Entry"], count: 1, filtered_count: 1 }),
};
const app = { graph: { setDirtyCanvas() {} } };

const values = new Map();
values.set("all_slots_enabled", true);
for (const definition of LEGACY_SLOTS) {
    values.set(definition.key + "_file_path", DEFAULT_MEDIUM);
    values.set(definition.key + "_category", "All");
    values.set(definition.key + "_search", "");
    values.set(definition.key + "_selection", definition.selection);
}
values.set("random_mode", "Random From Seed");
values.set("seed", 42);
values.set("delimiter", ", ");
values.set("manual_prompt", "");
values.set("extra_positive", "");
values.set("extra_negative", "");
values.set("slots_json", JSON.stringify({ version: 1, slots: [
    { id: "one", label: "One", enabled: true, file_path: "csv/deep/library.csv", folder: "csv/deep", category: "All", search: "", selection: "Entry", seed_offset: 10 },
    { id: "two", label: "Two", enabled: true, file_path: "csv/deep/library.csv", folder: "csv/deep", category: "All", search: "", selection: "Entry", seed_offset: 20 },
] }));

const backendWidgets = [...values].map(([name, value]) => ({ name, value, options: {} }));
const node = {
    widgets: backendWidgets,
    size: [720, 980],
    serialize_widgets: true,
    graph: { change() {} },
    setDirtyCanvas() {},
    setSize(size) { this.size = size; },
    addWidget(type, name, value, callback, options = {}) {
        const item = { type, name, value, callback, options: { ...options } };
        this.widgets.push(item);
        return item;
    },
    serialize() {
        return { widgets_values: this.widgets.filter((item) => item.serialize !== false).map((item) => item.value) };
    },
};

installDynamicNode(node, false);
assert.equal(node.__novoAIORenderer, "native");
assert.equal(node.__novoAIOSlots.length, 2);
assert.ok(node.widgets.some((item) => item.name === "+ Add Slot"));
assert.ok(node.widgets.some((item) => item.name === "Collapse All"));
assert.ok(node.widgets.some((item) => item.name === "Expand All"));
assert.ok(node.widgets.some((item) => item.name === "Browse Medium Styles"));
assert.ok(node.widgets.some((item) => item.name === "1. Folder" && item.type === "combo"));
assert.ok(node.widgets.some((item) => item.name === "1. File path" && item.type === "combo"));
assert.ok(node.widgets.some((item) => item.name === "1. Category" && item.type === "combo"));
assert.ok(node.widgets.some((item) => item.name === "1. Entry search" && item.type === "text"));
assert.ok(node.widgets.some((item) => item.name === "1. Selection" && item.type === "combo"));
assert.ok(node.__novoAIONativeWidgets.every((item) => item.serialize === false && item.options.serialize === false));
for (const name of [...LEGACY_WIDGET_NAMES, "slots_json"]) {
    const hidden = node.widgets.find((item) => item.name === name);
    assert.equal(hidden.type, "hidden", name + " cannot draw a stray classic widget bar");
    assert.equal(hidden.hidden, true);
    assert.equal(hidden.options.hidden, true);
    assert.deepEqual(hidden.computeSize(), [0, -4]);
    assert.doesNotThrow(() => hidden.draw());
}

node.widgets.find((item) => item.name === "2. Slot actions").callback("Up");
assert.deepEqual(node.__novoAIOSlots.map((item) => item.id), ["two", "one"]);
node.widgets.find((item) => item.name === "1. Slot actions").callback("Copy");
assert.equal(node.__novoAIOSlots.length, 3);
node.widgets.find((item) => item.name === "+ Add Slot").callback();
assert.equal(node.__novoAIOSlots.length, 4);
node.widgets.find((item) => item.name === "Collapse All").callback();
assert.ok(node.__novoAIOSlots.every((item) => item.collapsed));
node.widgets.find((item) => item.name === "Expand All").callback();
assert.ok(node.__novoAIOSlots.every((item) => !item.collapsed));

const serialized = node.serialize();
const expectedBackend = node.__novoAIOBackendWidgets.map((item) => item.value);
assert.deepEqual(serialized.widgets_values, expectedBackend);
assert.equal(serialized.widgets_values.length, expectedBackend.length);
clearTimeout(node.__novoAIORefreshTimer);
`;

// Run the unmodified frontend helpers and the mock classic-node exercise in
// the same function scope so internal functions remain private in production.
new Function("assert", `${source}\n${harness}`)(assert);
