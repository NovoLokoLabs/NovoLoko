import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";


const [baseUrl, workflowPath, evidencePath, playwrightPath] = process.argv.slice(2);
if (!baseUrl || !workflowPath || !evidencePath) {
    throw new Error("Usage: node validate_music3_ui_v464.mjs <base-url> <workflow> <evidence-json> [playwright-module]");
}
const require = createRequire(import.meta.url);
const { chromium } = require(playwrightPath || "playwright");
const workflow = JSON.parse(await fs.readFile(workflowPath, "utf8"));
const browser = await chromium.launch({
    headless: true,
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
});
const results = [];

try {
    for (const mode of [
        { name: "classic", enabled: false },
        { name: "nodes2", enabled: true },
    ]) {
        const context = await browser.newContext({ viewport: { width: 1800, height: 1400 } });
        const page = await context.newPage();
        const errors = [];
        const benignConsole = [];
        page.on("console", (message) => {
            if (message.type() !== "error") return;
            const text = `console: ${message.text()}`;
            if (/404 \(Not Found\)|ComfyApp graph accessed before initialization/.test(text)) benignConsole.push(text);
            else errors.push(text);
        });
        page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
        await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForFunction(() => window.app?.graph && window.LiteGraph, null, { timeout: 60_000 });
        await page.evaluate(async (enabled) => {
            if (window.app?.ui?.settings?.setSettingValue) {
                await window.app.ui.settings.setSettingValue("Comfy.VueNodes.Enabled", enabled);
            }
            window.LiteGraph.vueNodesMode = enabled;
        }, mode.enabled);
        await page.evaluate(async (data) => {
            await window.app.loadGraphData(data, true, true, "v4.6.4-live-acceptance.json");
            const node = window.app.graph._nodes.find((item) => item.type === "NovaMusicControls");
            if (!node) throw new Error("NovaMusicControls missing after workflow load");
            node.pos = [120, 100];
            node.setSize([720, 1040]);
            node.onResize?.(node.size);
            window.app.canvas.ds.scale = 1;
            window.app.canvas.ds.offset = [0, 0];
            window.app.canvas.selectNode(node);
            window.app.canvas.setDirty(true, true);
        }, workflow);
        await page.waitForSelector(".nova-music3-controls-v461", { state: "attached", timeout: 60_000 });
        await page.waitForFunction(() => document.querySelectorAll(".nova-music3-category-row").length === 19, null, { timeout: 60_000 });
        await page.waitForTimeout(700);

        const before = await page.evaluate(() => {
            const node = window.app.graph._nodes.find((item) => item.type === "NovaMusicControls");
            const serialized = window.app.graph.serialize();
            const saved = serialized.nodes.find((item) => item.type === "NovaMusicControls");
            const root = document.querySelector(".nova-music3-controls-v461");
            const list = root.querySelector(".nova-music3-category-list");
            const idea = root.querySelector("textarea");
            const external = [...root.querySelectorAll("span")].find((item) => item.textContent.includes("External seed"));
            const seedInput = external?.parentElement?.querySelector("input");
            const randomLine = root.children[4];
            const afterRun = randomLine?.children?.[2]?.querySelector("select");
            return {
                nodeSize: [...node.size],
                widgetValues: saved.widgets_values,
                links: serialized.links,
                rows: root.querySelectorAll(".nova-music3-category-row").length,
                rootHeight: root.getBoundingClientRect().height,
                listHeight: list.getBoundingClientRect().height,
                listClientHeight: list.clientHeight,
                listScrollHeight: list.scrollHeight,
                listOverflow: getComputedStyle(list).overflowY,
                ideaHeight: idea.getBoundingClientRect().height,
                externalSeedText: external?.textContent ?? null,
                seedInputDisabled: Boolean(seedInput?.disabled),
                afterRunDisabled: Boolean(afterRun?.disabled),
            };
        });

        // Match the real bug sequence: resize, pan until fully outside the
        // viewport, then pan back. Do not touch or reconstruct the node.
        await page.evaluate(() => {
            const node = window.app.graph._nodes.find((item) => item.type === "NovaMusicControls");
            node.setSize([720, 1040]);
            node.onResize?.(node.size);
            window.app.canvas.ds.offset = [-10_000, -10_000];
            window.app.canvas.setDirty(true, true);
        });
        await page.waitForTimeout(800);
        const offscreen = await page.evaluate(() => {
            const root = document.querySelector(".nova-music3-controls-v461");
            return {
                connected: Boolean(root?.isConnected),
                rect: root ? { width: root.getBoundingClientRect().width, height: root.getBoundingClientRect().height } : null,
                measurementDeferred: root?.dataset?.measurementDeferred ?? null,
                lastRenderableHeight: root?.dataset?.lastRenderableHeight ?? null,
            };
        });
        await page.evaluate(() => {
            window.app.canvas.ds.offset = [0, 0];
            window.app.canvas.setDirty(true, true);
        });
        await page.waitForTimeout(1200);

        const after = await page.evaluate(() => {
            const node = window.app.graph._nodes.find((item) => item.type === "NovaMusicControls");
            const serialized = window.app.graph.serialize();
            const saved = serialized.nodes.find((item) => item.type === "NovaMusicControls");
            const root = document.querySelector(".nova-music3-controls-v461");
            const list = root.querySelector(".nova-music3-category-list");
            const idea = root.querySelector("textarea");
            return {
                nodeSize: [...node.size],
                widgetValues: saved.widgets_values,
                links: serialized.links,
                rows: root.querySelectorAll(".nova-music3-category-row").length,
                rootHeight: root.getBoundingClientRect().height,
                listHeight: list.getBoundingClientRect().height,
                listClientHeight: list.clientHeight,
                listScrollHeight: list.scrollHeight,
                listOverflow: getComputedStyle(list).overflowY,
                ideaHeight: idea.getBoundingClientRect().height,
                measurementDeferred: root.dataset.measurementDeferred ?? null,
                allCategoriesVisible: root.dataset.allCategoriesVisible ?? null,
            };
        });
        const acceptance = {
            nodeSizePreserved: JSON.stringify(before.nodeSize) === JSON.stringify(after.nodeSize),
            serialized48Preserved: before.widgetValues.length === 48 && after.widgetValues.length === 48
                && JSON.stringify(before.widgetValues) === JSON.stringify(after.widgetValues),
            graphLinksPreserved: JSON.stringify(before.links) === JSON.stringify(after.links),
            rowsVisible: before.rows === 19 && after.rows === 19,
            dimensionsValid: after.rootHeight > 0 && after.listHeight > 0 && after.ideaHeight > 0,
            viewportRemeasured: after.measurementDeferred === null,
            externalSeedOwned: before.externalSeedText === "External seed — NovoLoko Seed Lab"
                && before.seedInputDisabled && before.afterRunDisabled,
            noPageErrors: errors.length === 0,
        };
        const passed = Object.values(acceptance).every(Boolean);
        results.push({ mode: mode.name, before, offscreen, after, benignConsole, errors, acceptance, passed });
        await context.close();
    }
} finally {
    await browser.close();
}

await fs.mkdir(path.dirname(evidencePath), { recursive: true });
await fs.writeFile(evidencePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify(results.map(({ mode, acceptance, passed, errors }) => ({ mode, acceptance, passed, errors })), null, 2));
if (!results.every((result) => result.passed)) process.exitCode = 1;
