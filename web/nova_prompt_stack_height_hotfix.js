import { app } from "../../scripts/app.js";

const NODE_NAME = "NovaPromptStackAIO";
const DEFAULT_NODE_WIDTH = 680;
const DEFAULT_NODE_HEIGHT = 820;
const MIN_NODE_WIDTH = 420;
const MIN_NODE_HEIGHT = 700;
const MAX_NODE_HEIGHT = 2400;
const PANEL_MIN_HEIGHT = 320;
const PANEL_WIDGET_GAP = 10;
const CLASSIC_NODE_CHROME_HEIGHT = 300;
const NODES2_NODE_CHROME_HEIGHT = 380;
const PANEL_HEIGHTS = Object.freeze({ compact: 450, comfortable: 520, roomy: 600 });
const STABLE_PANEL_PROPERTY = "novaPromptStackStablePanelHeight";

function clamp(value, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return minimum;
    return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function nodes2Mode() {
    return Boolean(globalThis.LiteGraph?.vueNodesMode);
}

function nodeChromeHeight() {
    return nodes2Mode() ? NODES2_NODE_CHROME_HEIGHT : CLASSIC_NODE_CHROME_HEIGHT;
}

function preferredPanelHeight(node) {
    const slotsJson = node?.widgets?.find?.((item) => item?.name === "slots_json");
    try {
        const payload = JSON.parse(String(slotsJson?.value || "{}"));
        const preset = String(payload?.ui?.panel_size || node?.__novoAIOUi?.panel_size || "comfortable").toLowerCase();
        return PANEL_HEIGHTS[preset] || PANEL_HEIGHTS.comfortable;
    } catch (_error) {
        const preset = String(node?.__novoAIOUi?.panel_size || "comfortable").toLowerCase();
        return PANEL_HEIGHTS[preset] || PANEL_HEIGHTS.comfortable;
    }
}

function saneWidth(node) {
    const width = Number(node?.size?.[0]);
    return Number.isFinite(width) && width >= MIN_NODE_WIDTH && width <= 8192
        ? Math.round(width)
        : DEFAULT_NODE_WIDTH;
}

function initialStablePanelHeight(node) {
    const preferred = preferredPanelHeight(node);
    const chrome = nodeChromeHeight();
    const saved = Number(node?.properties?.[STABLE_PANEL_PROPERTY]);
    if (Number.isFinite(saved) && saved >= PANEL_MIN_HEIGHT && saved <= MAX_NODE_HEIGHT - chrome) {
        return Math.round(saved);
    }

    const nodeHeight = Number(node?.size?.[1]);
    if (Number.isFinite(nodeHeight) && nodeHeight >= MIN_NODE_HEIGHT && nodeHeight <= MAX_NODE_HEIGHT) {
        // Fresh/default nodes can arrive in Nodes 2.0 with the classic 820px
        // outer height before the DOM wrapper has been laid out. Treat heights
        // close to either renderer's preset geometry as the stored panel preset
        // instead of misreading the renderer difference as a manual resize.
        const classicPresetHeight = preferred + CLASSIC_NODE_CHROME_HEIGHT;
        const nodes2PresetHeight = preferred + NODES2_NODE_CHROME_HEIGHT;
        if (Math.abs(nodeHeight - classicPresetHeight) <= 96 || Math.abs(nodeHeight - nodes2PresetHeight) <= 96) {
            return preferred;
        }
        return clamp(nodeHeight - chrome, PANEL_MIN_HEIGHT, MAX_NODE_HEIGHT - chrome);
    }
    return preferred;
}

function ensureContainment(node) {
    const root = node?.__novoAIORoot;
    const wrapper = root?.parentElement;
    if (wrapper?.style) {
        wrapper.style.minWidth = "0";
        wrapper.style.minHeight = "0";
        wrapper.style.overflow = "hidden";
        wrapper.style.contain = "size layout";
    }
}

function applyStablePanelContract(node, stablePanelHeight) {
    const root = node?.__novoAIORoot;
    const dom = node?.__novoAIODom;
    if (!root || !dom) return false;

    const chrome = nodeChromeHeight();
    const stable = clamp(
        stablePanelHeight,
        PANEL_MIN_HEIGHT,
        MAX_NODE_HEIGHT - chrome,
    );
    node.properties ||= {};
    node.properties[STABLE_PANEL_PROPERTY] = stable;
    node.__novoPromptStackStablePanelHeight = stable;

    ensureContainment(node);
    root.style.height = `${stable}px`;
    root.style.minHeight = `${PANEL_MIN_HEIGHT}px`;
    root.style.maxHeight = `${stable}px`;

    dom.computeSize = (width) => [
        Math.max(MIN_NODE_WIDTH, Number(width) || saneWidth(node)),
        stable + PANEL_WIDGET_GAP,
    ];
    dom.options ||= {};
    dom.options.getMinHeight = () => PANEL_MIN_HEIGHT + PANEL_WIDGET_GAP;
    dom.options.getHeight = () => stable + PANEL_WIDGET_GAP;
    return true;
}

function repairNodeHeight(node, { allowManualResize = false } = {}) {
    if (!node || node.__novoPromptStackHeightRepairing) return false;
    const root = node.__novoAIORoot;
    const dom = node.__novoAIODom;
    if (!root || !dom) return false;

    const chrome = nodeChromeHeight();
    let stable = Number(node.__novoPromptStackStablePanelHeight);
    if (!(Number.isFinite(stable) && stable >= PANEL_MIN_HEIGHT)) {
        stable = initialStablePanelHeight(node);
    }

    const nodeHeight = Number(node.size?.[1]);
    const preferred = preferredPanelHeight(node);
    const preferredNodeHeight = preferred + chrome;
    const userResizing = allowManualResize && app.canvas?.resizing_node === node;
    const programmaticPresetResize = Number.isFinite(nodeHeight)
        && Math.abs(nodeHeight - preferredNodeHeight) <= 2
        && Math.abs(preferred - stable) > 2;

    if (userResizing && Number.isFinite(nodeHeight)) {
        stable = clamp(
            nodeHeight - chrome,
            PANEL_MIN_HEIGHT,
            MAX_NODE_HEIGHT - chrome,
        );
    } else if (programmaticPresetResize) {
        stable = preferred;
    }

    const expectedNodeHeight = stable + chrome;
    const corruptNodeHeight = !Number.isFinite(nodeHeight)
        || nodeHeight < MIN_NODE_HEIGHT
        || nodeHeight > MAX_NODE_HEIGHT;
    const layoutDrift = !userResizing
        && Number.isFinite(nodeHeight)
        && Math.abs(nodeHeight - expectedNodeHeight) >= 48;

    if (corruptNodeHeight || layoutDrift) {
        node.__novoPromptStackHeightRepairing = true;
        try {
            node.setSize?.([saneWidth(node), expectedNodeHeight || DEFAULT_NODE_HEIGHT]);
        } finally {
            node.__novoPromptStackHeightRepairing = false;
        }
    }

    applyStablePanelContract(node, stable);
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
    return true;
}

function reapplyInstalledRepair(node) {
    if (!node?.__novoAIODom || !node?.__novoAIORoot) return false;
    repairNodeHeight(node);
    requestAnimationFrame(() => repairNodeHeight(node));
    setTimeout(() => repairNodeHeight(node), 80);
    return true;
}

function installHeightRepair(node) {
    if (!node) return false;
    if (node.__novoPromptStackHeightHotfixInstalled) {
        // The dynamic Prompt Stack rebuilds its DOM sizing contract on tab
        // remount/onConfigure. The original hotfix returned early here, so the
        // bad node-size -> DOM-height contract won again after switching tabs.
        // Reassert the stable contract every time the node is configured.
        return reapplyInstalledRepair(node);
    }
    if (!node.__novoAIODom || !node.__novoAIORoot) return false;

    node.__novoPromptStackHeightHotfixInstalled = true;
    node.__novoPromptStackStablePanelHeight = initialStablePanelHeight(node);
    const oldMin = Array.isArray(node.min_size) ? node.min_size : [0, 0];
    node.min_size = [
        Math.max(MIN_NODE_WIDTH, Number(oldMin[0]) || 0),
        Math.max(MIN_NODE_HEIGHT, Number(oldMin[1]) || 0),
    ];
    const oldMax = Array.isArray(node.max_size) ? node.max_size : [8192, 8192];
    node.max_size = [
        Math.max(MIN_NODE_WIDTH, Number(oldMax[0]) || 8192),
        Math.min(MAX_NODE_HEIGHT, Number(oldMax[1]) || MAX_NODE_HEIGHT),
    ];

    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        requestAnimationFrame(() => repairNodeHeight(this, { allowManualResize: true }));
        return result;
    };

    repairNodeHeight(node);
    requestAnimationFrame(() => repairNodeHeight(node));
    setTimeout(() => repairNodeHeight(node), 120);
    return true;
}

function scheduleInstall(node) {
    const attempts = [0, 40, 160, 420, 1100, 1350];
    for (const delay of attempts) {
        setTimeout(() => installHeightRepair(node), delay);
    }
}

app.registerExtension({
    name: "NovoLoko.PromptStackHeightHotfix.v467",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== NODE_NAME) return;

        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            scheduleInstall(this);
            return result;
        };

        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = configured?.apply(this, args);
            scheduleInstall(this);
            return result;
        };

        const graphConfigured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function (...args) {
            const result = graphConfigured?.apply(this, args);
            scheduleInstall(this);
            return result;
        };
    },
});
