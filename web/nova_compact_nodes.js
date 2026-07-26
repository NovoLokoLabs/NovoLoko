import { app } from "../../scripts/app.js";

const DEFAULT_MIN_WIDTH = 150;
const DOM_MIN_WIDTH = 210;
const RESET_WIDTH = 240;
const DOM_NODE_TYPES = new Set([
    "NovaAudioHistoryPlayer",
    "NovaImageComparePro",
    "NovaPromptEnhancer",
    "NovaPromptStackAIO",
    "NovaSeedLab",
    "NovaVoiceEngineTTS",
]);

function compactMinimum(nodeTypeName) {
    return DOM_NODE_TYPES.has(String(nodeTypeName || ""))
        ? DOM_MIN_WIDTH
        : DEFAULT_MIN_WIDTH;
}

function installCompactSizing(node, nodeTypeName) {
    if (!node) return;
    const minWidth = compactMinimum(nodeTypeName);
    const minHeight = Array.isArray(node.min_size) && Number.isFinite(Number(node.min_size[1]))
        ? Number(node.min_size[1])
        : 40;
    node.min_size = [minWidth, minHeight];

    if (!node.__novaCompactSizingInstalled && typeof node.computeSize === "function") {
        const originalComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const measured = originalComputeSize.apply(this, args);
            if (!Array.isArray(measured)) return measured;
            return [
                Math.max(minWidth, Math.min(RESET_WIDTH, Number(measured[0]) || RESET_WIDTH)),
                Number(measured[1]) || minHeight,
            ];
        };
    }
    node.__novaCompactSizingInstalled = true;

    for (const item of node.widgets || []) {
        const element = item?.element || item?.inputEl;
        if (!element?.style) continue;
        element.style.minWidth = "0";
        element.style.maxWidth = "100%";
        element.style.boxSizing = "border-box";
    }
}

app.registerExtension({
    name: "NovoLoko.CompactResizableNodes.v380",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const nodeTypeName = String(nodeData?.name || "");
        if (!nodeTypeName.startsWith("Nova")) return;

        const minWidth = compactMinimum(nodeTypeName);
        const previousMinHeight = Array.isArray(nodeType.min_size)
            ? Number(nodeType.min_size[1]) || 40
            : 40;
        nodeType.min_size = [minWidth, previousMinHeight];

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            queueMicrotask(() => installCompactSizing(this, nodeTypeName));
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = originalConfigure?.apply(this, args);
            queueMicrotask(() => installCompactSizing(this, nodeTypeName));
            return result;
        };
    },
});
