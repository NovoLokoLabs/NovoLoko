import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_music3.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);
source = source.replace(/\bapp\./g, "globalThis.__novoApp.").replace(/\bapi\./g, "globalThis.__novoApi.");

const harness = String.raw`
class MockStyle {
    constructor() { this.values = {}; }
    set cssText(value) {
        this._cssText = String(value || "");
        for (const part of this._cssText.split(";")) {
            const index = part.indexOf(":");
            if (index < 0) continue;
            const key = part.slice(0, index).trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            this[key] = part.slice(index + 1).trim();
        }
    }
    get cssText() { return this._cssText || ""; }
    setProperty(name, value) { this[name] = value; }
}

class MockElement {
    constructor(tagName) {
        this.tagName = String(tagName || "div").toUpperCase();
        this.children = [];
        this.style = new MockStyle();
        this.dataset = {};
        this.value = "";
        this.checked = false;
        this.disabled = false;
        this.hidden = false;
        this.isConnected = true;
        this.parentElement = null;
        this._height = 360;
        this.scrollHeight = 360;
        this._classes = new Set();
        Object.defineProperty(this, "className", {
            get: () => [...this._classes].join(" "),
            set: (value) => { this._classes = new Set(String(value || "").split(/\s+/).filter(Boolean)); },
        });
        this.classList = { contains: (name) => this._classes.has(name) };
    }
    append(...items) {
        for (const item of items.filter((entry) => entry !== undefined && entry !== null)) {
            this.children.push(item);
            if (item && typeof item === "object") item.parentElement = this;
        }
    }
    replaceChildren(...items) { this.children = []; this.append(...items); }
    focus() {}
    get options() { return this.tagName === "SELECT" ? this.children : undefined; }
    get selectedOptions() { return this.tagName === "SELECT" ? this.children.filter((item) => item.value === this.value) : undefined; }
    getBoundingClientRect() {
        const styled = String(this.style.height || "").endsWith("px") ? Number.parseFloat(this.style.height) : NaN;
        const height = Number.isFinite(styled) ? styled : this._height;
        return { width: 620, height, top: 0, left: 0, right: 620, bottom: height };
    }
}

const elementsById = new Map();
globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    createTextNode: (text) => ({ textContent: String(text), parentElement: null }),
    getElementById: (id) => elementsById.get(id) || null,
    head: { append(item) { if (item?.id) elementsById.set(item.id, item); } },
};
globalThis.window = {};
globalThis.confirm = () => false;
globalThis.prompt = () => null;
globalThis.cancelAnimationFrame = () => {};
globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
};
const intersectionObservers = [];
globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.targets = []; this.disconnected = false; intersectionObservers.push(this); }
    observe(target) { this.targets.push(target); }
    disconnect() { this.disconnected = true; }
};

const categories = Array.from({ length: 19 }, (_, index) => ({
    key: "category_" + index,
    label: "Category " + index,
    default: "Choice A",
    options: ["Choice A", "Choice B"],
}));
const controlsPayload = {
    categories,
    special_choices: ["None / no preference", "Custom", "Random"],
    special_presets: ["Custom / CSV selections", "None / no preferences", "Randomize all categories"],
    presets: [{
        name: "Balanced test",
        source: "built-in",
        folder: "Tests",
        selections: Object.fromEntries(categories.map((item) => [item.key, "Choice A"])),
        custom_values: {},
        policy: {},
    }, {
        name: "Pearl Jam — Clone", reference: "Pearl Jam", reference_mode: "Clone",
        source: "built-in", folder: "Artist References / Rock & Alternative",
        selections: Object.fromEntries(categories.map((item) => [item.key, "Choice A"]),),
        custom_values: {}, policy: {},
    }, {
        name: "Måneskin — Like", reference: "Måneskin", reference_mode: "Like",
        source: "built-in", folder: "Artist References / Rock & Alternative",
        selections: Object.fromEntries(categories.map((item) => [item.key, "Choice A"]),),
        custom_values: {}, policy: {},
    }],
};
const response = (data) => ({ ok: true, status: 200, json: async () => data });
const apiListeners = new Map();
globalThis.__novoApi = {
    addEventListener(name, callback) { apiListeners.set(name, callback); },
    fetchApi: async (path) => path === "/nova_music3/controls" ? response(controlsPayload) : response({}),
};
globalThis.__novoApp = {
    graph: { setDirtyCanvas() {} },
    canvas: { resizing_node: null },
};

function backendWidgets() {
    const widgets = [
        { name: "preset", value: "Balanced test", type: "combo", options: { values: ["Balanced test"] } },
        { name: "randomize_all", value: false, type: "toggle", options: {} },
        { name: "seed", value: 42, type: "number", options: {} },
        { name: "control_after_generate", value: "fixed", type: "combo", options: { values: ["fixed", "randomize"] } },
    ];
    for (const category of categories) widgets.push({ name: category.key, value: "Choice A", type: "combo", options: { values: ["Choice A", "Choice B"] } });
    for (const category of categories) widgets.push({ name: "custom_" + category.key, value: "", type: "text", options: {} });
    widgets.push(
        { name: "allow_random_none", value: false, type: "toggle", options: {} },
        { name: "random_preset_scope", value: "Off", type: "combo", options: { values: ["Off"] } },
        { name: "random_preset_filter", value: "", type: "combo", options: { values: [""] } },
        { name: "idea", value: "same benchmark idea", type: "text", options: {} },
        { name: "control_overrides_json", value: "[]", type: "text", options: {} },
        { name: "seed_after_run", value: "Fixed", type: "combo", options: { values: ["Fixed", "Randomize Seed"] } },
    );
    return widgets;
}

function makeNode(nodes2, size = [620, 760]) {
    globalThis.LiteGraph = { vueNodesMode: nodes2 };
    const node = {
        widgets: backendWidgets(),
        size: [...size],
        inputs: [{ name: "seed", link: null }],
        graph: { links: {}, _nodes_by_id: {} },
        properties: { novaMusicControlsPanelHeight: 99999999 },
        setSize(next) { this.size = [...next]; },
        setDirtyCanvas() {},
        addDOMWidget(name, type, element, options = {}) {
            const wrapper = new MockElement("div");
            wrapper._height = 360;
            wrapper.append(element);
            const item = { name, type, element, wrapper, computedHeight: Math.max(260, this.size[1] - 40), options: { ...options } };
            this.widgets.push(item);
            return item;
        },
    };
    installMusicControls(node);
    return node;
}

for (const nodes2 of [false, true]) {
    const node = makeNode(nodes2);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const backend = node.widgets.filter((item) => item.name !== "nova_music3_controls_v461");
    const dom = node.widgets.find((item) => item.name === "nova_music3_controls_v461");
    assert.equal(backend.length, 48, "all serialized backend widgets plus seed policy remain in deterministic order");
    assert.ok(backend.every((item) => item.hidden && item.options.hidden), "classic and Nodes 2.0 hidden states are both set");
    assert.ok(backend.every((item) => item.computeSize()[1] === -4), "hidden rows consume no stock-widget height");
    assert.equal(dom.computeSize, undefined, "custom panel is growable, never a fixed canvas-height widget");
    assert.equal(dom.options.getHeight, undefined, "the browser allocation comes from computedHeight, not a 100% intrinsic request");
    assert.equal(dom.element.style.height, "720px");
    assert.equal(dom.element.style.minHeight, "0");
    assert.deepEqual(node.size, [620, 760], "the compact default is preserved");
    assert.deepEqual(node.min_size, [420, 480], "manual resize has sensible, compact minimums");

    const preservedSize = [...node.size];
    const preservedBasis = dom.element.children.at(-1).style.flexBasis;
    dom.element.style.height = "0px";
    dom.element._height = 0;
    node.__novaMusic3AllocateControlsBody();
    assert.equal(dom.element.dataset.measurementDeferred, "offscreen-zero-size", "offscreen zero-size layout is deferred");
    assert.equal(dom.element.children.at(-1).style.flexBasis, preservedBasis, "offscreen measurement preserves the last category allocation");
    assert.deepEqual(node.size, preservedSize, "offscreen measurement never mutates the serialized node size");
    dom.element.style.height = "720px";
    dom.element._height = 720;
    intersectionObservers.at(-1).callback([{ target: dom.element, isIntersecting: true }]);
    assert.equal(dom.element.dataset.measurementDeferred, undefined, "viewport re-entry forces a valid remeasurement");
    assert.deepEqual(node.size, preservedSize, "viewport re-entry preserves the user's node size");

    const list = dom.element.children.at(-1);
    assert.equal(list.style.minHeight, "0");
    const ideaPanel = dom.element.children[0];
    const ideaInput = ideaPanel.children[1];
    dom.element._height = 720;
    ideaPanel._height = 104;
    const fixedHeights = [58, 40, 34, 34, 25, 42];
    dom.element.children.slice(1, 7).forEach((item, index) => { item._height = fixedHeights[index]; });
    list._height = 383;
    list.scrollHeight = 900;
    node.__novaMusic3AllocateControlsBody();
    assert.equal(list.style.overflowY, "auto", "default/compact allocation scrolls only inside categories");
    assert.equal(list.style.scrollbarGutter, "stable");

    const compactSizes = [[420, 480], [620, 760], [720, 1040]];
    let previousListAllocation = 0;
    for (const [width, height] of compactSizes) {
        node.size = [width, height];
        dom.computedHeight = height - 40;
        dom.wrapper._height = height - 40;
        dom.options.afterResize();
        node.__novaMusic3AllocateControlsBody();
        assert.deepEqual(node.size, [width, height], width + "x" + height + " manual size is preserved");
        assert.equal(list.style.overflowY, "auto", width + "x" + height + " keeps categories internally scrollable while needed");
        const allocation = Number.parseInt(list.style.flexBasis, 10);
        assert.ok(allocation >= previousListAllocation, "a taller node exposes at least as much of the category list");
        previousListAllocation = allocation;
    }

    node.size = [470, 520];
    dom.computedHeight = 480;
    dom.wrapper._height = 480;
    globalThis.__novoApp.canvas.resizing_node = node;
    node.onResize?.(node.size);
    globalThis.__novoApp.canvas.resizing_node = null;
    assert.deepEqual(node.size, [470, 520], "smaller manual size is not snapped back");
    node.size = [720, 1450];
    dom.computedHeight = 1410;
    dom.wrapper._height = 1410;
    node.onResize?.(node.size);
    assert.deepEqual(node.size, [720, 1450], "a useful tall manual size is preserved");
    node.__novaMusic3AllocateControlsBody();
    assert.equal(list.style.overflowY, "hidden", "tall allocation removes the internal category scrollbar when all rows fit");
    assert.equal(list.style.scrollbarGutter, "auto", "no empty scrollbar gutter remains when all categories fit");
    assert.ok(Number.parseInt(ideaInput.style.height, 10) > 76, "tall allocation expands SONG IDEA before leaving spare space");
    node.size = [720, 1900];
    dom.computedHeight = 1860;
    dom.wrapper._height = 1860;
    dom.options.afterResize();
    assert.equal(ideaInput.style.height, "280px", "very tall allocation caps SONG IDEA at a useful height");
    assert.ok(node.size[1] < 1900, "very tall resize stops at the content ceiling instead of leaving a giant blank region");
    assert.ok(node.size[1] >= 1400, "content ceiling still leaves every category and the capped idea visible");

    dom.computedHeight = 444;
    dom.wrapper._height = 444;
    dom.options.afterResize();
    assert.equal(node.properties.novaMusicControlsPanelHeight, 444, "tab/remount allocation is measured from the real DOM box");
    const expandedSize = [...node.size];
    node.flags = { collapsed: true };
    node.onResize?.(node.size);
    node.flags.collapsed = false;
    node.onResize?.(node.size);
    assert.deepEqual(node.size, expandedSize, "collapse and expand do not replace the user's size");

    const presetSelect = dom.element.children[1].children[2];
    const visiblePresetLabels = [...presetSelect.options].map((item) => item.textContent);
    assert.ok(visiblePresetLabels.includes("Pearl Jam — Clone"), "artist preset keeps the exact user-visible name");
    assert.ok(visiblePresetLabels.includes("Måneskin — Like"), "requested expanded artist is visible and searchable");
    assert.ok(!visiblePresetLabels.some((value) => /Pearl Jam.*Pearl Jam/.test(value)), "artist name is never duplicated in selector text");

    const oldValues = backend.map((item) => item.value);
    oldValues.splice(3, 1);
    oldValues.pop();
    const legacyInfo = { widgets_values: oldValues };
    node.onConfigure?.(legacyInfo);
    assert.equal(legacyInfo.widgets_values[3], "fixed", "legacy workflow migration inserts the missing after-generate slot");
    assert.equal(legacyInfo.widgets_values.at(-1), "Fixed", "legacy workflow migration appends seed-only policy deterministically");
    await node.__novaMusic3ApplyRecipe({ seed: 99, seed_after_run: "Randomize Seed", selections: {}, custom_values: {} });
    assert.equal(backend.find((item) => item.name === "control_after_generate").value, "randomize");
    assert.equal(backend.find((item) => item.name === "seed_after_run").value, "Randomize Seed");

    const seedLinkId = 900 + Number(nodes2);
    const seedSourceId = 950 + Number(nodes2);
    node.inputs[0].link = seedLinkId;
    node.graph.links[seedLinkId] = { origin_id: seedSourceId };
    node.graph._nodes_by_id[seedSourceId] = { id: seedSourceId, type: "NovaSeedLab", title: "NovoLoko Seed Lab" };
    node.onConnectionsChange?.();
    const randomLine = dom.element.children[4];
    const seedInput = randomLine.children[1].children[1];
    const afterRunSelect = randomLine.children[2].children[1];
    assert.match(randomLine.children[1].children[0].textContent, /External seed — NovoLoko Seed Lab/);
    assert.equal(seedInput.disabled, true, "linked Seed Lab disables stale internal seed editing");
    assert.equal(afterRunSelect.disabled, true, "linked Seed Lab suppresses the internal after-run policy");
    assert.equal(backend.find((item) => item.name === "control_after_generate").value, "fixed");
    apiListeners.get("execution_success")();
    assert.match(dom.element.children[5].textContent, /External seed source.*owns the next seed/);
    node.inputs[0].link = null;
    node.onConnectionsChange?.();
    assert.equal(seedInput.disabled, false, "disconnect restores internal seed editing");
    assert.equal(afterRunSelect.disabled, false, "disconnect restores internal after-run behavior");
    assert.equal(backend.find((item) => item.name === "control_after_generate").value, "randomize");
    const categorySnapshot = backend.filter((item) => item.name.startsWith("category_")).map((item) => item.value);
    backend.find((item) => item.name === "seed").value = 123456;
    apiListeners.get("execution_success")();
    const policyStatus = dom.element.children[5];
    assert.match(policyStatus.textContent, /Next run seed set to 123456/);
    assert.match(policyStatus.textContent, /No extra setup run is needed/);
    assert.deepEqual(
        backend.filter((item) => item.name.startsWith("category_")).map((item) => item.value),
        categorySnapshot,
        "post-run seed update changes none of the 19 controls",
    );

    const repaired = makeNode(nodes2, [620, 99_999_999]);
    assert.deepEqual(repaired.size, [620, 760], "corrupt saved height is clamped on reload");
    node.onRemoved?.();
    assert.equal(node.__novaMusic3ControlsResizeObserver, undefined, "resize observer is cleaned up with the node");
    assert.equal(node.__novaMusic3ControlsIntersectionObserver, undefined, "intersection observer is cleaned up with the node");
    assert.equal(node.__novaMusic3AllocateControlsBody, undefined, "adaptive body allocator is cleaned up with the node");
}
`;

await new Function("assert", `${source}\nreturn (async () => {${harness}})();`)(assert);
