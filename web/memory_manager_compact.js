import { app } from "../../scripts/app.js";

function compactMemoryNode(node) {
    if (!node) return;
    const currentMinHeight = Array.isArray(node.min_size) && Number.isFinite(node.min_size[1])
        ? node.min_size[1]
        : 80;
    node.min_size = [180, currentMinHeight];

    const labels = {
        mode: "Mode",
        unload_models: "Unload models",
        clear_vram: "Clear VRAM",
        collect_python: "Collect Python",
        trim_current_process: "Trim process",
    };
    for (const item of node.widgets || []) {
        if (!labels[item.name]) continue;
        item.label = labels[item.name];
        item.options ||= {};
        item.options.label = labels[item.name];
    }

    if (!node.__novaMemoryOriginalComputeSize && typeof node.computeSize === "function") {
        node.__novaMemoryOriginalComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const computed = this.__novaMemoryOriginalComputeSize?.apply(this, args) || [230, currentMinHeight];
            if (Array.isArray(computed)) {
                computed[0] = Math.max(180, Math.min(245, Number(computed[0]) || 230));
            }
            return computed;
        };
    }

    if (Array.isArray(node.size) && node.size[0] > 270) {
        const height = Math.max(currentMinHeight, node.size[1] || currentMinHeight);
        if (typeof node.setSize === "function") node.setSize([235, height]);
        else node.size = [235, height];
    }

    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "NovoLoko.MemoryManagerCompactWidth",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== "NovaMemoryManager") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            compactMemoryNode(this);
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            compactMemoryNode(this);
            return result;
        };
    },
});
