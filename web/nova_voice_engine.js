import { app } from "../../scripts/app.js";

const NODE_NAME = "NovaVoiceEngineTTS";

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function setWidgetVisible(item, visible) {
    if (!item) return;
    if (!item.__novaVoiceEngineOriginalComputeSize) {
        item.__novaVoiceEngineOriginalComputeSize = item.computeSize;
    }
    item.hidden = !visible;
    item.computeSize = visible
        ? item.__novaVoiceEngineOriginalComputeSize
        : () => [0, -4];
    const element = item.element || item.inputEl;
    if (element?.style) element.style.display = visible ? "" : "none";
}

function refreshVisibility(node) {
    const engine = String(widget(node, "engine")?.value || "Off");
    const advanced = Boolean(widget(node, "advanced")?.value);
    const omni = engine === "OmniLoko";
    const kokoro = engine === "Kokoro";

    setWidgetVisible(widget(node, "omniloko_voice"), omni);
    setWidgetVisible(widget(node, "kokoro_voice"), kokoro);
    setWidgetVisible(widget(node, "prefix"), advanced && engine !== "Off");
    setWidgetVisible(widget(node, "max_characters"), advanced && engine !== "Off");
    setWidgetVisible(widget(node, "speed"), advanced && kokoro);
    setWidgetVisible(widget(node, "device"), advanced && kokoro);
    setWidgetVisible(widget(node, "normalize_loudness"), advanced && omni);
    setWidgetVisible(widget(node, "timeout_seconds"), advanced && omni);

    const measured = node.computeSize?.();
    if (Array.isArray(measured)) {
        node.setSize?.([
            Math.max(360, Number(node.size?.[0]) || measured[0]),
            Math.max(220, Number(measured[1]) || 220),
        ]);
    }
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function wrapRefresh(node, name) {
    const item = widget(node, name);
    if (!item || item.__novaVoiceEngineWrapped) return;
    const previous = item.callback;
    item.callback = function (...args) {
        const result = previous?.apply(this, args);
        refreshVisibility(node);
        return result;
    };
    item.__novaVoiceEngineWrapped = true;
}

function configure(node) {
    if (!node.__novaVoiceEngineConfigured) {
        node.__novaVoiceEngineConfigured = true;
        wrapRefresh(node, "engine");
        wrapRefresh(node, "advanced");
    }
    refreshVisibility(node);
}

app.registerExtension({
    name: "NovoLoko.CompactVoiceEngineTTS.v340",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== NODE_NAME) return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            setTimeout(() => configure(this), 0);
            return result;
        };

        const originalConfigured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function () {
            const result = originalConfigured?.apply(this, arguments);
            setTimeout(() => configure(this), 0);
            return result;
        };
    },
});
