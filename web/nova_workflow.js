import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function markDirty(node) {
    try {
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (_) {}
}

function comboValues(widget, values) {
    const list = Array.isArray(values) && values.length ? values : ["none", "random"];
    widget.options = widget.options || {};
    widget.options.values = list;
    if (!list.includes(widget.value)) widget.value = list[0];
}

async function refreshStyler(node) {
    const fileWidget = node.widgets?.find((widget) => widget.name === "style_file");
    const templateWidget = node.widgets?.find((widget) => widget.name === "template_name");
    if (!fileWidget || !templateWidget) return;

    try {
        const query = new URLSearchParams({ file: String(fileWidget.value || "styles/camera.yaml") });
        const response = await api.fetchApi(`/nova_prompt_styler/list?${query.toString()}`);
        const data = await response.json();
        if (response.ok && data?.ok) {
            comboValues(templateWidget, data.templates);
            markDirty(node);
        }
    } catch (_) {}
}

function installStyler(node) {
    const fileWidget = node.widgets?.find((widget) => widget.name === "style_file");
    if (!fileWidget || fileWidget.__novaStylerWrapped) return;
    const previous = fileWidget.callback;
    fileWidget.callback = function (...args) {
        const result = previous?.apply(this, args);
        setTimeout(() => refreshStyler(node), 0);
        return result;
    };
    fileWidget.__novaStylerWrapped = true;
    setTimeout(() => refreshStyler(node), 0);
}

function installCompactSaveNode(node) {
    if (node.__novaCompactSaveInstalled) return;
    node.__novaCompactSaveInstalled = true;
    node.min_size = [170, 250];

    const shortLabels = {
        filename_prefix: "Path",
        file_format: "Format",
        lossless_webp: "Lossless",
        quality: "Quality",
        embed_workflow: "Workflow",
        save_with_metadata: "Metadata",
        add_counter_to_filename: "Counter",
        save_as_recipe: "Recipe",
    };

    for (const item of node.inputs || []) {
        if (item.name === "images") item.label = "Image";
    }

    for (const item of node.widgets || []) {
        const label = shortLabels[item.name];
        if (!label) continue;
        item.label = label;
        item.options ||= {};
        item.options.label = label;
    }

    /*
     * Some ComfyUI frontends use computeSize as the reset/minimum width.
     * Cap only that calculated width; manual resizing can still go wider.
     */
    if (!node.__novaOriginalComputeSize && typeof node.computeSize === "function") {
        node.__novaOriginalComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const size = this.__novaOriginalComputeSize?.apply(this, args) || [220, 300];
            if (Array.isArray(size)) {
                size[0] = Math.max(170, Math.min(250, Number(size[0]) || 220));
            }
            return size;
        };
    }

    if (Array.isArray(node.size) && node.size[0] > 420) {
        node.setSize?.([250, node.size[1]]);
    }
    markDirty(node);
}

app.registerExtension({
    name: "NovoLoko.WorkflowReplacements.v314",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name === "NovaSaveImageMetadata") {
            nodeType.min_size = [170, 250];
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                installCompactSaveNode(this);
            };
            const configured = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                configured?.apply(this, arguments);
                setTimeout(() => installCompactSaveNode(this), 0);
            };
        }

        if (nodeData?.name === "NovaPromptStyler") {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                installStyler(this);
            };
            const configured = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                configured?.apply(this, arguments);
                setTimeout(() => installStyler(this), 0);
            };
        }

    },
});
