import { app } from "../../scripts/app.js";

const DEFAULT_MIN_WIDTH = 150;
const DOM_MIN_WIDTH = 210;
const RESET_WIDTH = 240;
const SAVED_SIZE_PROPERTY = "novaSavedManualSize";
const DOM_NODE_TYPES = new Set([
    "NovaAudioHistoryPlayer",
    "NovaImageComparePro",
    "NovaPromptEnhancer",
    "NovaPromptStackAIO",
    "NovaSeedLab",
    "NovaVoiceEngineTTS",
]);
const PERSISTED_SIZE_NODE_TYPES = new Set([
    "NovaSeedLab",
    "NovaVoiceEngineTTS",
]);

function compactMinimum(nodeTypeName) {
    return DOM_NODE_TYPES.has(String(nodeTypeName || ""))
        ? DOM_MIN_WIDTH
        : DEFAULT_MIN_WIDTH;
}

function normaliseSavedSize(value, minWidth, minHeight) {
    if (!Array.isArray(value) || value.length < 2) return null;
    const width = Number(value[0]);
    const height = Number(value[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return [
        Math.max(minWidth, width),
        Math.max(minHeight, height),
    ];
}

function rememberSavedSize(node, minWidth, minHeight) {
    const size = normaliseSavedSize(node?.size, minWidth, minHeight);
    if (!size) return;
    node.properties ||= {};
    node.properties[SAVED_SIZE_PROPERTY] = size;
}

function restoreSavedSize(node, size) {
    if (!node || !Array.isArray(size)) return;
    node.__novaRestoringSavedSize = true;
    try {
        node.setSize?.([...size]);
    } finally {
        queueMicrotask(() => {
            node.__novaRestoringSavedSize = false;
        });
    }
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function scheduleSavedSizeRestore(node, size) {
    if (!node || !Array.isArray(size)) return;
    node.__novaLoadingSavedSize = true;
    queueMicrotask(() => restoreSavedSize(node, size));
    setTimeout(() => {
        restoreSavedSize(node, size);
        requestAnimationFrame(() => {
            restoreSavedSize(node, size);
            node.__novaLoadingSavedSize = false;
        });
    }, 0);
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

    if (!node.__novaResizePersistenceInstalled) {
        const previousResize = node.onResize;
        node.onResize = function (...args) {
            const result = previousResize?.apply(this, args);
            if (
                PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
                && !this.__novaRestoringSavedSize
                && !this.__novaLoadingSavedSize
            ) {
                rememberSavedSize(this, minWidth, minHeight);
            }
            this.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
            if (!this.__novaResizeChangeQueued) {
                this.__novaResizeChangeQueued = true;
                queueMicrotask(() => {
                    this.__novaResizeChangeQueued = false;
                    this.graph?.change?.();
                });
            }
            return result;
        };
        node.__novaResizePersistenceInstalled = true;
    }

    if (
        PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
        && !node.__novaSizeSerializationInstalled
    ) {
        const previousSerialize = node.onSerialize;
        node.onSerialize = function (info) {
            const result = previousSerialize?.apply(this, arguments);
            rememberSavedSize(this, minWidth, minHeight);
            const savedSize = this.properties?.[SAVED_SIZE_PROPERTY];
            if (info && Array.isArray(savedSize)) {
                info.properties ||= {};
                info.properties[SAVED_SIZE_PROPERTY] = [...savedSize];
                info.size = [...savedSize];
            }
            return result;
        };
        node.__novaSizeSerializationInstalled = true;
    }

    for (const item of node.widgets || []) {
        const element = item?.element || item?.inputEl;
        if (!element?.style) continue;
        element.style.minWidth = "0";
        element.style.maxWidth = "100%";
        element.style.boxSizing = "border-box";
    }
}

app.registerExtension({
    name: "NovoLoko.CompactResizableNodes.v393",
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
            const configured = args[0] || {};
            const savedSize = PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
                ? normaliseSavedSize(
                    configured?.properties?.[SAVED_SIZE_PROPERTY]
                        || configured?.size,
                    minWidth,
                    previousMinHeight,
                )
                : null;
            const result = originalConfigure?.apply(this, args);
            if (savedSize) {
                this.properties ||= {};
                this.properties[SAVED_SIZE_PROPERTY] = [...savedSize];
            }
            queueMicrotask(() => {
                installCompactSizing(this, nodeTypeName);
                scheduleSavedSizeRestore(this, savedSize);
            });
            return result;
        };
    },
});
