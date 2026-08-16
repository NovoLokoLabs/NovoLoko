import assert from "node:assert/strict";
import fs from "node:fs";

const frontendPath = process.argv[2];
if (!frontendPath) throw new Error("Pass nova_prompt_stack_height_hotfix.js as the first argument");

let source = fs.readFileSync(frontendPath, "utf8").replace(/^import .*;\r?\n/gm, "");
const registration = source.indexOf("app.registerExtension({");
assert.ok(registration > 0, "frontend registration marker is present");
source = source.slice(0, registration);

const harness = String.raw`
function makeRoot(height = 520) {
    return {
        style: {},
        parentElement: { style: {} },
        getBoundingClientRect() { return { width: 640, height }; },
    };
}

function makeNode(size, panelSize = "comfortable") {
    const slotsJson = {
        name: "slots_json",
        value: JSON.stringify({ version: 2, ui: { panel_size: panelSize }, slots: [] }),
    };
    return {
        size: [...size],
        min_size: [420, 700],
        max_size: [8192, 8192],
        widgets: [slotsJson],
        properties: {},
        __novoAIORoot: makeRoot(),
        __novoAIODom: { options: {} },
        __novoAIOUi: { panel_size: panelSize },
        graph: { change() {} },
        setDirtyCanvas() {},
        setSize(next) { this.size = [...next]; },
    };
}

globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
const app = {
    canvas: { resizing_node: null },
    graph: { setDirtyCanvas() {} },
};

const corrupt = makeNode([680, 5200]);
assert.equal(initialStablePanelHeight(corrupt), 520, "corrupt saved height falls back to the stored panel preset");
assert.equal(repairNodeHeight(corrupt), true);
assert.deepEqual(corrupt.size, [680, 820], "corrupt skyscraper height is repaired to the comfortable node height");
assert.equal(corrupt.__novoAIORoot.style.height, "520px");
assert.equal(corrupt.__novoAIODom.options.getHeight(), 530);
assert.equal(corrupt.__novoAIORoot.parentElement.style.contain, "size layout");

const drift = makeNode([680, 820]);
repairNodeHeight(drift);
drift.size = [680, 1000];
repairNodeHeight(drift, { allowManualResize: true });
assert.deepEqual(drift.size, [680, 820], "layout-driven growth is rejected instead of feeding back into the DOM height");
assert.equal(drift.__novoAIORoot.style.height, "520px");

const manual = makeNode([680, 820]);
repairNodeHeight(manual);
app.canvas.resizing_node = manual;
manual.size = [680, 1000];
repairNodeHeight(manual, { allowManualResize: true });
assert.deepEqual(manual.size, [680, 1000], "real user resizing remains allowed");
assert.equal(manual.__novoAIORoot.style.height, "700px", "manual node resize changes only the stable allocated panel height");
app.canvas.resizing_node = null;
repairNodeHeight(manual, { allowManualResize: true });
assert.deepEqual(manual.size, [680, 1000], "manual size remains stable after resize ends");

manual.widgets[0].value = JSON.stringify({ version: 2, ui: { panel_size: "roomy" }, slots: [] });
manual.__novoAIOUi.panel_size = "roomy";
manual.size = [680, 900];
repairNodeHeight(manual, { allowManualResize: true });
assert.equal(manual.__novoAIORoot.style.height, "600px", "panel-size dropdown changes are still accepted");
assert.deepEqual(manual.size, [680, 900]);
`;

await new Function("assert", `${source}\n${harness}`)(assert);
