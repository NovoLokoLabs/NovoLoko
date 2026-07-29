const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(
    "C:/Users/IMGR8/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
);

const BASE_URL = "http://127.0.0.1:8288/";
const SETTING_ID = "Comfy.VueNodes.Enabled";
const EDGE_NAMES = ["top", "right", "bottom", "left"];
const CORNER_NAMES = ["nw", "ne", "se", "sw"];
const SCREENSHOT_DIR =
    "C:/Users/IMGR8/.codex/visualizations/2026/07/26/019f9e26-5657-75d1-be61-292b09b781ff";
const WORKFLOW = JSON.parse(fs.readFileSync(
    "M:/ComfyUI-Easy-Install/ComfyUI-Easy-Install/ComfyUI/user/default/workflows/NovoLoko AIO v4.0.0.json",
    "utf8",
));

function closeEnough(actual, expected, tolerance = 1.5) {
    return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function waitForComfy(page) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(async () => {
        try {
            const { app } = await import("/scripts/app.js");
            if (!app?.graph || !app?.canvas || !document.querySelector("canvas")) return false;
            const liteGraph = globalThis.LiteGraph;
            if (!liteGraph?.createNode) return false;
            const probe = liteGraph.createNode("NovaWorkflowBanner");
            const ready = Boolean(probe?.__novaWorkflowBannerInstalled);
            probe?.onRemoved?.();
            return ready;
        } catch {
            return false;
        }
    }, null, { timeout: 60000 });
    await page.waitForTimeout(8000);
    await page.waitForFunction(async () => {
        const { app } = await import("/scripts/app.js");
        return Boolean(app?.graph && app?.canvas);
    }, null, { timeout: 30000 });
}

async function getSetting(page) {
    const response = await page.request.get(
        `${BASE_URL}settings/${encodeURIComponent(SETTING_ID)}`,
    );
    assert(response.ok(), `Could not read ${SETTING_ID}: HTTP ${response.status()}`);
    return Boolean(await response.json());
}

async function setSetting(page, value) {
    const response = await page.request.post(
        `${BASE_URL}settings/${encodeURIComponent(SETTING_ID)}`,
        { data: Boolean(value) },
    );
    assert(response.ok(), `Could not write ${SETTING_ID}: HTTP ${response.status()}`);
}

async function createTestNode(page, type) {
    const configured = await page.evaluate(async ({ type: nodeType, workflow }) => {
        const { app } = await import("/scripts/app.js");
        await app.loadGraphData(workflow);
        await new Promise((resolve) => setTimeout(resolve, 500));
        const node = app.graph._nodes.find((candidate) => candidate.type === nodeType);
        if (!node) throw new Error(`Current workflow does not contain ${nodeType}`);
        node.setPos?.(260, 180);
        if (!node.setPos) node.pos = [260, 180];
        node.setSize?.([860, nodeType === "NovaWorkflowBanner" ? 320 : 600]);
        if (!node.setSize) node.size = [860, nodeType === "NovaWorkflowBanner" ? 320 : 600];
        app.canvas.bringToFront?.(node);
        app.canvas.ds.scale = 0.75;
        app.canvas.ds.offset = [120, 80];
        app.canvas.setDirty?.(true, true);
        app.canvas.draw?.(true, true);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        app.canvas.ds.scale = 0.75;
        app.canvas.ds.offset = [120, 80];
        app.canvas.setDirty?.(true, true);
        app.canvas.draw?.(true, true);
        await new Promise((resolve) => setTimeout(resolve, 250));
        globalThis.__novaSmoke = { node };
        const element = node.widgets?.find((widget) => widget.element)?.element;
        if (element) element.dataset.novaSmokeNode = "true";
        return {
            type: node.type,
            installed: Boolean(node.__novaWorkflowBannerInstalled || node.__novaWorkflowGuideInstalled),
            widgetCount: node.widgets?.length || 0,
            widgetNames: (node.widgets || []).map((widget) => widget.name),
            elementConnected: Boolean(element?.isConnected),
            modern: globalThis.LiteGraph ? Boolean(globalThis.LiteGraph.vueNodesMode) : null,
        };
    }, { type, workflow: WORKFLOW });
    try {
        await page.waitForFunction(() => (
            document.querySelectorAll('[data-nova-smoke-node="true"] [data-nova-frame-drag]').length === 4
            && document.querySelectorAll('[data-nova-smoke-node="true"] [data-nova-frame-resize]').length === 4
        ), null, { timeout: 15000 });
    } catch (error) {
        const dom = await page.evaluate(() => ({
            drag: document.querySelectorAll("[data-nova-frame-drag]").length,
            resize: document.querySelectorAll("[data-nova-frame-resize]").length,
            sections: document.querySelectorAll("section").length,
            canvasCount: document.querySelectorAll("canvas").length,
        }));
        throw new Error(`Presentation DOM did not mount: ${JSON.stringify({ configured, dom })}`, {
            cause: error,
        });
    }
}

async function state(page) {
    return page.evaluate(() => {
        const node = globalThis.__novaSmoke.node;
        return {
            id: node.id,
            pos: [Number(node.pos[0]), Number(node.pos[1])],
            size: [Number(node.size[0]), Number(node.size[1])],
            min: [Number(node.min_size[0]), Number(node.min_size[1])],
            dragHandles: document.querySelectorAll(
                '[data-nova-smoke-node="true"] [data-nova-frame-drag]',
            ).length,
            resizeHandles: document.querySelectorAll(
                '[data-nova-smoke-node="true"] [data-nova-frame-resize]',
            ).length,
            linkButtons: document.querySelectorAll('[data-nova-smoke-node="true"] nav button').length,
        };
    });
}

async function resetNode(page, before) {
    await page.evaluate(async ({ pos, size }) => {
        const { app } = await import("/scripts/app.js");
        const { node } = globalThis.__novaSmoke;
        node.setPos?.(pos[0], pos[1]);
        if (!node.setPos) node.pos = [...pos];
        node.setSize?.([...size]);
        if (!node.setSize) node.size = [...size];
        app.canvas.setDirty?.(true, true);
    }, before);
    await page.waitForTimeout(80);
}

async function dragHandle(page, selector, dx, dy) {
    const locator = page.locator(`[data-nova-smoke-node="true"] ${selector}`);
    const box = await locator.boundingBox();
    assert(box && box.width > 0 && box.height > 0, `No usable hit area for ${selector}`);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const hit = await page.evaluate(({ x: clientX, y: clientY }) => {
        const element = document.elementFromPoint(clientX, clientY);
        return {
            tag: element?.tagName || null,
            drag: element?.dataset?.novaFrameDrag || null,
            resize: element?.dataset?.novaFrameResize || null,
            smokeRoot: element?.closest?.("[data-nova-smoke-node]")?.dataset?.novaSmokeNode || null,
            pointerEvents: element ? getComputedStyle(element).pointerEvents : null,
        };
    }, { x, y });
    assert(
        hit.drag || hit.resize,
        `Hit test missed ${selector}: ${JSON.stringify({ box, hit })}`,
    );
    await page.mouse.move(x, y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(x + dx, y + dy, { steps: 5 });
    await page.mouse.up({ button: "left" });
    await page.waitForTimeout(80);
}

async function testMovement(page, base) {
    const deltas = {
        top: [28, 18],
        right: [26, -16],
        bottom: [-24, 20],
        left: [-30, -18],
    };
    const results = {};
    for (const edge of EDGE_NAMES) {
        await resetNode(page, base);
        const [dx, dy] = deltas[edge];
        await dragHandle(page, `[data-nova-frame-drag="${edge}"]`, dx, dy);
        const after = await state(page);
        assert(
            Math.abs(after.pos[0] - base.pos[0]) > 5 && Math.abs(after.pos[1] - base.pos[1]) > 5,
            `${edge} edge did not move node: ${JSON.stringify({ before: base.pos, after: after.pos })}`,
        );
        assert(
            closeEnough(after.size[0], base.size[0]) && closeEnough(after.size[1], base.size[1]),
            `${edge} edge changed node size`,
        );
        results[edge] = after.pos;
    }
    return results;
}

async function testResize(page, base) {
    const deltas = {
        nw: [-36, -28],
        ne: [36, -28],
        se: [36, 28],
        sw: [-36, 28],
    };
    const results = {};
    for (const corner of CORNER_NAMES) {
        await resetNode(page, base);
        const [dx, dy] = deltas[corner];
        await dragHandle(page, `[data-nova-frame-resize="${corner}"]`, dx, dy);
        const after = await state(page);
        assert(after.size[0] > base.size[0] + 10, `${corner} did not grow width`);
        assert(after.size[1] > base.size[1] + 10, `${corner} did not grow height`);
        if (corner.includes("w")) {
            assert(after.pos[0] < base.pos[0] - 10, `${corner} did not anchor the opposite X edge`);
        } else {
            assert(closeEnough(after.pos[0], base.pos[0]), `${corner} moved the anchored X edge`);
        }
        if (corner.includes("n")) {
            assert(after.pos[1] < base.pos[1] - 10, `${corner} did not anchor the opposite Y edge`);
        } else {
            assert(closeEnough(after.pos[1], base.pos[1]), `${corner} moved the anchored Y edge`);
        }
        results[corner] = { pos: after.pos, size: after.size };
    }

    await resetNode(page, base);
    await dragHandle(
        page,
        '[data-nova-frame-resize="se"]',
        -(base.size[0] + 600),
        -(base.size[1] + 600),
    );
    const minimum = await state(page);
    assert(closeEnough(minimum.size[0], base.min[0]), "Minimum width clamp failed");
    assert(closeEnough(minimum.size[1], base.min[1]), "Minimum height clamp failed");
    results.minimum = minimum.size;
    return results;
}

async function testSerialization(page, base) {
    await resetNode(page, base);
    await dragHandle(page, '[data-nova-frame-resize="se"]', 44, 32);
    await dragHandle(page, '[data-nova-frame-drag="top"]', 22, 14);
    const expected = await state(page);
    const actual = await page.evaluate(async (expectedId) => {
        const { app } = await import("/scripts/app.js");
        const snapshot = app.graph.serialize();
        app.graph.clear();
        app.graph.configure(snapshot);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const node = app.graph.getNodeById(expectedId);
        if (!node) throw new Error(`Reloaded graph is missing node ${expectedId}`);
        const element = node.widgets?.find((widget) => widget.element)?.element;
        if (element) element.dataset.novaSmokeNode = "true";
        globalThis.__novaSmoke = { node };
        return {
            id: node.id,
            pos: [Number(node.pos[0]), Number(node.pos[1])],
            size: [Number(node.size[0]), Number(node.size[1])],
            installed: Boolean(node.__novaWorkflowBannerInstalled || node.__novaWorkflowGuideInstalled),
        };
    }, expected.id);
    assert(actual.id === expected.id, "Workflow reload changed the node ID");
    assert(actual.installed, "Presentation behavior did not reinstall after workflow reload");
    assert(
        actual.pos.every((value, index) => closeEnough(value, expected.pos[index], 10.01)),
        `Position did not persist: ${JSON.stringify({ expected: expected.pos, actual: actual.pos })}`,
    );
    assert(
        actual.size.every((value, index) => closeEnough(value, expected.size[index], 10.01)),
        `Size did not persist: ${JSON.stringify({ expected: expected.size, actual: actual.size })}`,
    );
    return { expected, actual };
}

async function testGraphNavigation(page, base, modern, type) {
    await resetNode(page, base);
    const root = page.locator('[data-nova-smoke-node="true"]');
    const box = await root.boundingBox();
    assert(box, "Presentation surface has no visible box");
    const before = await page.evaluate(async () => {
        const { app } = await import("/scripts/app.js");
        const scroller = [...document.querySelectorAll('[data-nova-smoke-node="true"] *')]
            .find((element) => getComputedStyle(element).overflowY === "auto");
        if (scroller) scroller.scrollTop = 0;
        return {
            scale: app.canvas.ds.scale,
            offset: [...app.canvas.ds.offset],
            hasScroller: Boolean(scroller),
        };
    });
    if (type === "NovaWorkflowGuide") {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(80);
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, type === "NovaWorkflowGuide" ? 120 : -120);
    await page.waitForTimeout(100);
    const afterWheel = await page.evaluate(async () => {
        const { app } = await import("/scripts/app.js");
        const scroller = [...document.querySelectorAll('[data-nova-smoke-node="true"] *')]
            .find((element) => getComputedStyle(element).overflowY === "auto");
        return {
            scale: app.canvas.ds.scale,
            offset: [...app.canvas.ds.offset],
            scrollTop: Number(scroller?.scrollTop || 0),
        };
    });
    if (type === "NovaWorkflowGuide") {
        assert(before.hasScroller, "Cheat Sheet scroll surface is missing");
        if (!(afterWheel.scrollTop > 0)) {
            const diagnostics = await page.evaluate(async ({ x, y }) => {
                const { app } = await import("/scripts/app.js");
                const node = globalThis.__novaSmoke.node;
                const host = document.querySelector(`[data-node-id="${CSS.escape(String(node.id))}"]`);
                const hit = document.elementFromPoint(x, y);
                const selected = app.canvas?.selected_nodes || {};
                const scroller = [...document.querySelectorAll('[data-nova-smoke-node="true"] *')]
                    .find((element) => getComputedStyle(element).overflowY === "auto");
                return {
                    nodeId: node.id,
                    nodeSelected: node.selected,
                    nodeIsSelected: node.is_selected,
                    appSelectedKeys: Object.keys(selected),
                    hostClass: host?.className || null,
                    scrollTop: scroller?.scrollTop,
                    scrollHeight: scroller?.scrollHeight,
                    clientHeight: scroller?.clientHeight,
                    hitTag: hit?.tagName || null,
                    hitClass: hit?.className || null,
                    hitInSmokeRoot: Boolean(hit?.closest?.('[data-nova-smoke-node="true"]')),
                };
            }, {
                x: box.x + box.width / 2,
                y: box.y + box.height / 2,
            });
            throw new Error(
                `Wheel over selected Cheat Sheet did not scroll its content: ${JSON.stringify(diagnostics)}`,
            );
        }
    } else {
        assert(
            Math.abs(afterWheel.scale - before.scale) > 0.001,
            "Wheel over presentation did not zoom graph",
        );
    }

    if (!modern) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down({ button: "middle" });
        await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 35, { steps: 5 });
        await page.mouse.up({ button: "middle" });
        await page.waitForTimeout(100);
        const afterPan = await page.evaluate(async () => {
            const { app } = await import("/scripts/app.js");
            return [...app.canvas.ds.offset];
        });
        assert(
            Math.abs(afterPan[0] - afterWheel.offset[0]) > 1
                || Math.abs(afterPan[1] - afterWheel.offset[1]) > 1,
            "Middle mouse over presentation did not pan Legacy graph",
        );
        return {
            wheel: type === "NovaWorkflowGuide" ? "content scroll" : "graph zoom",
            middlePan: true,
        };
    }
    return {
        wheel: type === "NovaWorkflowGuide" ? "content scroll" : "graph zoom",
        middlePan: "native Nodes 2.0 canvas",
    };
}

async function runMode(page, modern) {
    console.log(`Testing ${modern ? "Nodes 2.0" : "Legacy"}`);
    await setSetting(page, modern);
    await waitForComfy(page);
    const actualMode = await getSetting(page);
    assert(actualMode === modern, `Mode switch failed: expected ${modern}, got ${actualMode}`);
    const runtimeMode = await page.evaluate(
        (fallback) => globalThis.LiteGraph
            ? Boolean(globalThis.LiteGraph.vueNodesMode)
            : fallback,
        actualMode,
    );
    assert(runtimeMode === modern, `LiteGraph mode mismatch: expected ${modern}, got ${runtimeMode}`);
    await page.evaluate(() => { globalThis.__novaSmoke = { node: null }; });

    const nodes = {};
    for (const type of ["NovaWorkflowBanner", "NovaWorkflowGuide"]) {
        console.log(`  ${type}: mount`);
        await waitForComfy(page);
        await page.evaluate(() => { globalThis.__novaSmoke = { node: null }; });
        await createTestNode(page, type);
        const base = await state(page);
        assert(base.dragHandles === 4, `${type} does not have four movement rails`);
        assert(base.resizeHandles === 4, `${type} does not have four resize corners`);
        const movement = await testMovement(page, base);
        const resize = await testResize(page, base);
        console.log(`  ${type}: drag and resize passed`);
        const navigation = await testGraphNavigation(page, base, modern, type);
        const serialization = await testSerialization(page, base);
        nodes[type] = { base, movement, resize, navigation, serialization };
        console.log(`  ${type}: navigation and reload passed`);
    }

    await waitForComfy(page);
    await page.evaluate(() => { globalThis.__novaSmoke = { node: null }; });
    await createTestNode(page, "NovaWorkflowBanner");
    const banner = await state(page);
    assert(banner.linkButtons >= 2, "Banner links disappeared during interaction tests");
    const screenshot = path.join(
        SCREENSHOT_DIR,
        `novoloko-presentation-${modern ? "nodes2" : "legacy"}-smoke.png`,
    );
    await page.locator('[data-nova-smoke-node="true"]').screenshot({ path: screenshot });
    return {
        mode: modern ? "Nodes 2.0" : "Legacy",
        runtimeMode,
        nodes,
        bannerLinks: banner.linkButtons,
        screenshot,
    };
}

(async () => {
    const browser = await chromium.launch({
        executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", (error) => {
        if (/nova_workflow_presentation/i.test(error.stack || "")) {
            console.error("PRESENTATION PAGE ERROR:", error.stack || error.message);
        }
    });
    page.on("console", (message) => {
        const text = message.text();
        if (/workflowpresentation|nova_workflow_presentation|title_mode/i.test(text)) {
            console.error("PRESENTATION CONSOLE ERROR:", text);
        }
    });

    await waitForComfy(page);
    const original = await getSetting(page);
    const results = [];
    try {
        if (process.env.NOVA_SMOKE_ONLY !== "nodes2") {
            results.push(await runMode(page, false));
        }
        if (process.env.NOVA_SMOKE_ONLY !== "legacy") {
            results.push(await runMode(page, true));
        }
    } finally {
        if (await getSetting(page) !== original) {
            await setSetting(page, original);
        }
        await browser.close();
    }
    console.log(JSON.stringify({
        originalSettingRestoredTo: original,
        results: results.map((result) => ({
            mode: result.mode,
            runtimeMode: result.runtimeMode,
            banner: {
                movementEdges: Object.keys(result.nodes.NovaWorkflowBanner.movement),
                resizeCorners: Object.keys(result.nodes.NovaWorkflowBanner.resize),
                navigation: result.nodes.NovaWorkflowBanner.navigation,
                workflowReload: result.nodes.NovaWorkflowBanner.serialization.actual,
            },
            guide: {
                movementEdges: Object.keys(result.nodes.NovaWorkflowGuide.movement),
                resizeCorners: Object.keys(result.nodes.NovaWorkflowGuide.resize),
                navigation: result.nodes.NovaWorkflowGuide.navigation,
                workflowReload: result.nodes.NovaWorkflowGuide.serialization.actual,
            },
            bannerLinks: result.bannerLinks,
            screenshot: result.screenshot,
        })),
    }, null, 2));
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
