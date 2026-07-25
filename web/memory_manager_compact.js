import { app } from "../../scripts/app.js";

function compactMemoryNode(node) {
    if (!node) return;
    const currentMinHeight = Array.isArray(node.min_size) && Number.isFinite(node.min_size[1])
        ? node.min_size[1]
        : 80;
    node.min_size = [220, currentMinHeight];

    if (Array.isArray(node.size) && node.size[0] > 320) {
        const height = Math.max(currentMinHeight, node.size[1] || currentMinHeight);
        if (typeof node.setSize === "function") node.setSize([280, height]);
        else node.size = [280, height];
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
