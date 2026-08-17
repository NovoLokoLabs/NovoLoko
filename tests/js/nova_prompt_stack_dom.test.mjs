import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_prompt_stack_aio.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);
source = source.replace(/\bapp\./g, "globalThis.__novoApp.").replace(/\bapi\./g, "globalThis.__novoApi.");

const harness = String.raw`
class MockElement {
    constructor(tagName) {
        this.tagName = String(tagName || "div").toUpperCase();
        this.children = [];
        this.style = { setProperty() {} };
        this.attributes = {};
        this.dataset = {};
        this.scrollTop = 0;
        this._classes = new Set();
        Object.defineProperty(this, "className", {
            get: () => [...this._classes].join(" "),
            set: (value) => { this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean)); },
        });
        this.classList = {
            add: (...names) => names.forEach((name) => this._classes.add(name)),
            toggle: (name, force) => {
                const enabled = force === undefined ? !this._classes.has(name) : Boolean(force);
                if (enabled) this._classes.add(name); else this._classes.delete(name);
                return enabled;
            },
            contains: (name) => this._classes.has(name),
        };
    }
    append(...items) { this.children.push(...items.filter((item) => item !== undefined && item !== null)); }
    replaceChildren(...items) { this.children = [...items]; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    get scrollHeight() {
        if (this.classList.contains("novoloko-slot-head")) return 42;
        if (this.classList.contains("novoloko-slot-body")) {
            return this.classList.contains("collapsed") ? 0 : 258;
        }
        if (this.classList.contains("novoloko-slot-card")) {
            return this.children.reduce((total, child) => total + Number(child?.scrollHeight || 0), 0);
        }
        if (this.classList.contains("novoloko-slot-list")) {
            const content = this.children.reduce((total, child) => total + Number(child?.scrollHeight || 0), 0);
            return content + Math.max(0, this.children.length - 1) * 8;
        }
        if (this.classList.contains("novoloko-slot-empty")) return 70;
        return Math.max(1, this.children.length) * 30;
    }
    get offsetHeight() { return this.scrollHeight; }
    get clientHeight() { return this.classList.contains("novoloko-slot-list") ? 390 : this.scrollHeight; }
    getBoundingClientRect() { return { width: 640, height: this.scrollHeight, top: 0, left: 0, right: 640, bottom: this.scrollHeight }; }
}

const elementsById = new Map();
const document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => elementsById.get(id) || null,
    head: {
        append(item) { if (item?.id) elementsById.set(item.id, item); },
    },
};
globalThis.document = document;
globalThis.window = {};
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };

const response = (data) => ({ ok: true, status: 200, json: async () => data });
let omitSavedValues = false;
const api = {
    fetchApi: async (path) => path.startsWith("/nova_prompt_stack/files")
        ? response({
            ok: true,
            folders: ["All folders", "csv/deep", "csv/deeper/audio"],
            files: omitSavedValues ? ["csv/deep/library.csv"] : ["csv/deep/library.csv", "csv/deeper/audio/sound.csv"],
            file_items: [
                { value: "csv/deep/library.csv", label: "library.csv", relative_path: "csv/deep/library.csv" },
                { value: "csv/deeper/audio/sound.csv", label: "sound.csv", relative_path: "csv/deeper/audio/sound.csv" },
            ],
            default: "csv/deep/library.csv",
        })
        : response({ ok: true, categories: ["All"], styles: omitSavedValues ? ["Entry"] : ["Entry", "Second Entry"], count: 2, filtered_count: 2 }),
};
const app = { graph: { setDirtyCanvas() {} } };
globalThis.__novoApp = app;
globalThis.__novoApi = api;

function backendValues(slotsJson, overrides = {}) {
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
    values.set("control_after_generate", "fixed");
    values.set("delimiter", ", ");
    values.set("manual_prompt", "");
    values.set("extra_positive", "");
    values.set("extra_negative", "");
    values.set("slots_json", slotsJson);
    return [...values].map(([name, value]) => ({ name, value: Object.prototype.hasOwnProperty.call(overrides, name) ? overrides[name] : value, options: {} }));
}

function makeNode(mode, slotsJson, size = [680, 820], overrides = {}) {
    globalThis.LiteGraph = { vueNodesMode: mode };
    const node = {
        widgets: backendValues(slotsJson, overrides),
        size: [...size],
        serialize_widgets: true,
        graph: { change() {} },
        setDirtyCanvas() {},
        setSize(size) { this.size = size; },
        addDOMWidget(type, name, element, options = {}) {
            const item = { type, name, element, options: { ...options } };
            this.widgets.push(item);
            return item;
        },
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
    return node;
}

function findButton(root, label) {
    if (!root) return null;
    if (root.tagName === "BUTTON" && root.textContent === label) return root;
    for (const child of root.children || []) {
        const found = findButton(child, label);
        if (found) return found;
    }
    return null;
}

const initialSlots = JSON.stringify({ version: 1, slots: Array.from({ length: 7 }, (_, index) => ({
    id: "slot-" + (index + 1),
    label: ["Medium", "Subject", "Pose", "Action", "Clothing", "Location", "Character"][index],
    enabled: true,
    file_path: "csv/deep/library.csv",
    folder: "csv/deep",
    folder_search: "",
    category: "All",
    search: "",
    selection: index === 1 ? "Second Entry" : "Entry",
    seed_offset: index + 10,
    collapsed: false,
})) });

for (const mode of [false, true]) {
    const acceptanceSlots = JSON.stringify({ version: 2, ui: { panel_size: "comfortable" }, slots: Array.from({ length: 7 }, (_, index) => ({
        id: "acceptance-" + (index + 1),
        label: ["Medium", "Subject", "Pose", "Action", "Clothing", "Location", "Character"][index],
        legacy_key: ["medium", "subject", "pose", "action", "clothing", "location", "character"][index],
        enabled: index !== 4,
        file_path: "csv/saved/slot-" + index + ".csv",
        folder: "csv/saved/folder-" + index,
        folder_search: "folder-filter-" + index,
        category: "Saved Category " + index,
        search: "saved search " + index,
        selection: "Saved Selection " + index,
        seed_offset: index + 20,
        collapsed: index === 2 || index === 5,
    })) });
    const acceptanceOverrides = {
        random_mode: "Random From Seed",
        seed: 8675309,
        manual_prompt: "manual field stays put",
        extra_positive: "positive stays put",
        extra_negative: "negative stays put",
    };
    const acceptanceNode = makeNode(mode, acceptanceSlots, [680, 820], acceptanceOverrides);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = structuredClone(acceptanceNode.__novoAIOSlots);
    const transportWidget = acceptanceNode.widgets.find((item) => item.name === "slots_json");
    transportWidget.callback = () => {
        acceptanceNode.__novoAIOSlots = normaliseSlots(JSON.parse(acceptanceSlots).slots);
    };
    const changedSlot = acceptanceNode.__novoAIOSlots[1];
    const refs = acceptanceNode.__novoAIORefs.get(changedSlot.id);
    refs.selection.value = "Second Entry";
    refs.selection.onchange();
    assert.equal(acceptanceNode.__novoAIOSlots[1].selection, "Second Entry", "one-slot edit survives the hidden transport callback");
    assert.deepEqual(
        acceptanceNode.__novoAIOSlots.filter((_, index) => index !== 1),
        before.filter((_, index) => index !== 1),
        "editing one slot never resets unrelated slot state",
    );

    omitSavedValues = true;
    await refreshAll(acceptanceNode, true);
    assert.equal(acceptanceNode.__novoAIOSlots[0].file_path, "csv/saved/slot-0.csv", "refresh preserves a saved CSV missing from a transient response");
    assert.equal(acceptanceNode.__novoAIOSlots[0].category, "Saved Category 0", "refresh preserves the saved category");
    assert.equal(acceptanceNode.__novoAIOSlots[0].selection, "Saved Selection 0", "refresh preserves the saved selection");
    omitSavedValues = false;

    installDynamicNode(acceptanceNode, false);
    assert.equal(acceptanceNode.__novoAIOSlots[1].selection, "Second Entry", "lifecycle rebuild does not replace live state with stale transport data");
    const acceptanceSaved = acceptanceNode.serialize();
    const acceptanceBackend = acceptanceNode.__novoAIOBackendWidgets;
    const acceptanceMap = Object.fromEntries(acceptanceBackend.map((item, index) => [item.name, acceptanceSaved.widgets_values[index]]));
    for (const [name, expected] of Object.entries(acceptanceOverrides)) {
        assert.equal(acceptanceMap[name], expected, name + " persists beside the seven-slot transport");
    }
    const acceptanceReloaded = makeNode(mode, acceptanceMap.slots_json, [680, 820], acceptanceMap);
    assert.deepEqual(
        acceptanceReloaded.__novoAIOSlots,
        acceptanceNode.__novoAIOSlots,
        "save/reload preserves seven-slot order, enabled/collapsed state and every visible field",
    );
    clearTimeout(acceptanceNode.__novoAIORefreshTimer);
    clearTimeout(acceptanceReloaded.__novoAIORefreshTimer);

    const node = makeNode(mode, initialSlots);
    assert.equal(node.__novoAIORenderer, "dom", mode ? "Nodes 2.0 uses DOM panel" : "classic uses DOM panel when available");
    assert.equal(node.__novoAIOSlots.length, 7);
    assert.equal(node.__novoAIORoot.style.height, "520px");
    node.size = [680, 1000];
    node.onResize?.(node.size);
    assert.equal(node.__novoAIORoot.style.height, "700px", "slot canvas follows manual node height");
    node.size = [680, 820];
    node.onResize?.(node.size);
    assert.equal(node.__novoAIORoot.style.height, "520px");
    const originalSize = [...node.size];
    assert.equal(node.__novoAIOSlotHeights.length, 7);
    assert.ok(node.__novoAIOSlotHeights.every((height) => height >= 300), "all seven expanded cards keep full natural height");
    assert.ok(node.__novoAIOList.children.every((card) => card.style.flexShrink === "0"), "expanded cards cannot flex-shrink into clipped headers");
    const firstBody = node.__novoAIOList.children[0].children[1];
    assert.deepEqual(
        firstBody.children.filter((item) => item.tagName === "LABEL").map((item) => item.textContent),
        ["Folder filter", "Folder", "CSV file", "Category", "Search", "Selection"],
        "an expanded legacy card exposes every required control in order",
    );

    const initialContentHeight = node.__novoAIOScrollContentHeight;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        findButton(node.__novoAIOList.children[0], "v").onclick();
        assert.equal(node.__novoAIOSlotHeights[0], 42, "collapsed slot is one compact header row");
        assert.ok(node.__novoAIOScrollContentHeight < initialContentHeight, "collapse immediately recomputes total scroll height");
        findButton(node.__novoAIOList.children[0], ">").onclick();
        assert.ok(node.__novoAIOSlotHeights[0] >= 300, "expanded slot immediately restores its full body height");
        assert.equal(node.__novoAIOScrollContentHeight, initialContentHeight);
    }

    const add = findButton(node.__novoAIORoot, "+ Add Slot");
    while (node.__novoAIOSlots.length < 20) add.onclick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(node.__novoAIOSlots.length, 20, "20 dynamic slots remain supported");
    assert.deepEqual(node.size, originalSize, "adding slots does not grow the outer node");
    const twentyExpandedHeight = node.__novoAIOScrollContentHeight;
    assert.ok(twentyExpandedHeight > initialContentHeight, "expanded-all content grows only the internal scroll surface");

    const secondId = node.__novoAIOSlots[1].id;
    findButton(node.__novoAIOList.children[1], "Up").onclick();
    assert.equal(node.__novoAIOSlots[0].id, secondId, "Up changes visible/output order");
    const countBeforeCopy = node.__novoAIOSlots.length;
    findButton(node.__novoAIOList.children[0], "Copy").onclick();
    assert.equal(node.__novoAIOSlots.length, countBeforeCopy + 1);
    findButton(node.__novoAIOList.children[1], "Remove").onclick();
    assert.equal(node.__novoAIOSlots.length, countBeforeCopy);

    findButton(node.__novoAIORoot, "Collapse All").onclick();
    assert.ok(node.__novoAIOSlots.every((slot) => slot.collapsed));
    assert.ok(node.__novoAIOList.children[0].children[1].classList.contains("collapsed"));
    assert.equal(node.__novoAIOList.children[0].children[0].children[3].textContent, "Second Entry");
    const twentyCollapsedHeight = node.__novoAIOScrollContentHeight;
    assert.ok(twentyCollapsedHeight < twentyExpandedHeight);
    assert.ok(node.__novoAIOSlotHeights.every((height) => height === 42));
    assert.deepEqual(node.size, originalSize, "collapse-all preserves the outer fixed height");
    findButton(node.__novoAIORoot, "Expand All").onclick();
    assert.ok(node.__novoAIOSlots.every((slot) => !slot.collapsed));
    assert.ok(node.__novoAIOSlotHeights.every((height) => height >= 300));
    assert.equal(node.__novoAIOScrollContentHeight, twentyExpandedHeight);

    // Keep a mixed collapse state while mutating and reordering the stack.
    findButton(node.__novoAIOList.children[0], "v").onclick();
    findButton(node.__novoAIOList.children[2], "v").onclick();
    const mixedBeforeMutation = node.__novoAIOScrollContentHeight;
    findButton(node.__novoAIOList.children[3], "Copy").onclick();
    assert.equal(node.__novoAIOSlotHeights.length, 21);
    findButton(node.__novoAIOList.children[4], "Remove").onclick();
    assert.equal(node.__novoAIOSlotHeights.length, 20);
    findButton(node.__novoAIOList.children[5], "Up").onclick();
    assert.ok(node.__novoAIOScrollContentHeight > 0 && mixedBeforeMutation > 0, "mixed-state mutations always refresh scroll geometry");
    assert.deepEqual(node.size, originalSize);

    node.__novoAIOPanelSize.value = "roomy";
    node.__novoAIOPanelSize.onchange();
    assert.equal(node.__novoAIORoot.style.height, "600px");
    const saved = node.serialize();
    const backend = node.__novoAIOBackendWidgets;
    assert.equal(saved.widgets_values.length, backend.length);
    const slotsIndex = backend.findIndex((item) => item.name === "slots_json");
    const payload = JSON.parse(saved.widgets_values[slotsIndex]);
    assert.equal(payload.version, 2);
    assert.equal(payload.ui.panel_size, "roomy");
    assert.equal(payload.slots.filter((slot) => slot.collapsed).length, 2);

    const reloaded = makeNode(mode, saved.widgets_values[slotsIndex], node.size);
    assert.equal(reloaded.__novoAIOSlots.length, node.__novoAIOSlots.length);
    assert.deepEqual(
        reloaded.__novoAIOSlots.map((slot) => slot.collapsed),
        node.__novoAIOSlots.map((slot) => slot.collapsed),
        "workflow reload retains sensible per-slot collapse state",
    );
    assert.equal(reloaded.__novoAIORoot.style.height, "600px");
    clearTimeout(node.__novoAIORefreshTimer);
    clearTimeout(reloaded.__novoAIORefreshTimer);
}
`;

await new Function("assert", `${source}\nreturn (async () => {${harness}})();`)(assert);
