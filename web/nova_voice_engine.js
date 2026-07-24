import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "NovaVoiceEngineTTS";
const PROFILE_VOICE = "Current OmniLoko Profile";

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function setWidgetVisible(item, visible) {
    if (!item) return;
    if (!Object.hasOwn(item, "__novaVoiceEngineOriginalType")) {
        item.__novaVoiceEngineOriginalType = item.type;
        item.__novaVoiceEngineOriginalComputeSize = item.computeSize;
    }
    item.type = visible ? item.__novaVoiceEngineOriginalType : "hidden";
    item.computeSize = visible
        ? item.__novaVoiceEngineOriginalComputeSize
        : () => [0, -4];
    const element = item.element || item.inputEl;
    if (element) {
        element.hidden = !visible;
        element.disabled = !visible;
        if (element.style) {
            element.style.display = visible ? "" : "none";
            element.style.pointerEvents = visible ? "" : "none";
        }
    }
}

function voiceVisibility(engine, advanced) {
    const omni = engine === "OmniLoko";
    const kokoro = engine === "Kokoro";
    return {
        omniloko_voice: omni,
        kokoro_voice: kokoro,
        prefix: advanced && (omni || kokoro),
        max_characters: advanced && (omni || kokoro),
        speed: advanced && kokoro,
        device: advanced && kokoro,
        normalize_loudness: advanced && omni,
        timeout_seconds: advanced && omni,
    };
}

function resizeNode(node) {
    requestAnimationFrame(() => {
        const measured = node.computeSize?.();
        if (!Array.isArray(measured)) return;
        node.setSize?.([
            Math.max(360, Number(node.size?.[0]) || measured[0]),
            Math.max(160, Number(measured[1]) || 160),
        ]);
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    });
}

function refreshVisibility(node) {
    const engine = String(widget(node, "engine")?.value || "Off");
    const advanced = Boolean(widget(node, "advanced")?.value);
    const visibility = voiceVisibility(engine, advanced);
    for (const [name, visible] of Object.entries(visibility)) {
        setWidgetVisible(widget(node, name), visible);
    }
    resizeNode(node);
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

function replaceVoiceOptions(item, incoming, requiredDefault) {
    if (!item) return false;
    const selected = String(item.value || requiredDefault);
    const values = [...new Set((Array.isArray(incoming) ? incoming : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean))];
    if (!values.includes(requiredDefault)) values.unshift(requiredDefault);
    const stale = Boolean(selected && !values.includes(selected));
    if (stale) values.push(selected);
    item.options = item.options || {};
    item.options.values = values;
    item.value = selected || requiredDefault;
    item.callback?.(item.value);
    return stale;
}

function updateRefreshStatus(node, stale, message = "Refresh Voices") {
    const button = node.__novaVoiceRefreshWidget;
    if (!button) return;
    const label = stale ? "Refresh Voices ⚠ stale OmniLoko preset" : message;
    button.name = label;
    button.label = label;
    node.properties = node.properties || {};
    node.properties.novaVoiceStalePreset = Boolean(stale);
    node.setDirtyCanvas?.(true, true);
}

async function refreshVoices(node) {
    const button = node.__novaVoiceRefreshWidget;
    if (button?.__novaRefreshing) return;
    if (button) button.__novaRefreshing = true;
    updateRefreshStatus(node, false, "Refresh Voices…");
    try {
        const response = await api.fetchApi("/nova_voice/voices", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Voice list refresh failed.");
        const stale = replaceVoiceOptions(
            widget(node, "omniloko_voice"),
            data.omniloko,
            PROFILE_VOICE,
        );
        replaceVoiceOptions(
            widget(node, "kokoro_voice"),
            data.kokoro,
            "af_nova | NovoLoko (US Female)",
        );
        updateRefreshStatus(node, stale);
        refreshVisibility(node);
    } catch (error) {
        updateRefreshStatus(node, Boolean(node.properties?.novaVoiceStalePreset), "Refresh Voices • unavailable");
        console.warn("[NovoLoko Voice TTS] Voice refresh unavailable:", error?.message || String(error));
    } finally {
        if (button) button.__novaRefreshing = false;
    }
}

function ensureRefreshButton(node) {
    if (node.__novaVoiceRefreshWidget || typeof node.addWidget !== "function") return;
    const button = node.addWidget("button", "Refresh Voices", null, () => refreshVoices(node));
    button.serialize = false;
    button.options = button.options || {};
    button.options.serialize = false;
    node.__novaVoiceRefreshWidget = button;
}

function configure(node) {
    ensureRefreshButton(node);
    if (!node.__novaVoiceEngineConfigured) {
        node.__novaVoiceEngineConfigured = true;
        wrapRefresh(node, "engine");
        wrapRefresh(node, "advanced");
    }
    refreshVisibility(node);
}

app.registerExtension({
    name: "NovoLoko.CompactVoiceEngineTTS.v350",
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

export { replaceVoiceOptions, setWidgetVisible, voiceVisibility };
