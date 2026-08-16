import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function installLegacyGraphNavigation(root, options = {}) {
    if (root.__novaLegacyGraphNavigationInstalled) return;
    root.__novaLegacyGraphNavigationInstalled = true;
    const legacy = () => !globalThis.LiteGraph?.vueNodesMode;
    const consume = (event, handler) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        handler?.call(app.canvas, event);
    };
    root.addEventListener("wheel", (event) => {
        if (!legacy()) return;
        if (options.nativeWheelWhen?.(event)) return;
        consume(event, app.canvas?.processMouseWheel);
    }, { passive: false, capture: true });
    root.addEventListener("pointerdown", (event) => {
        if (!legacy() || event.button !== 1) return;
        consume(event, app.canvas?.processMouseDown);
    }, true);
    root.addEventListener("pointermove", (event) => {
        if (!legacy() || (Number(event.buttons || 0) & 4) === 0) return;
        consume(event, app.canvas?.processMouseMove);
    }, true);
    root.addEventListener("pointerup", (event) => {
        if (!legacy() || event.button !== 1) return;
        consume(event, app.canvas?.processMouseUp);
    }, true);
}
import {
    TEXT_COUNTER_MODES,
    normaliseTextCounterMode,
    restoreTextDisplayText,
    textDisplayCounterSummary,
} from "./nova_text_display_state.js";
import {
    timerChromeCSS,
} from "./nova_timer_layout_state.js";

const EXTENSION_NAME = "NovoLoko.CoreReplacements.v391WorkflowControls";
const TIMER_NODE = "NovaGenerationTimer";
const SEED_NODE = "NovaSeedLab";
const CONTROL_NODE = "NovaControlPanelSwitch";
const CONCAT_NODE = "NovaDynamicTextConcatenate";
const DISPLAY_NODE = "NovaTextDisplay";
const ENHANCER_NODE = "NovaPromptEnhancer";
const MUSIC_WRITER_DEFAULTS = {
    NovaMusicLyricEnhancer: { creativity: 0.85, maxLength: 2048 },
    NovaMusicLyricsGenerator: { creativity: 0.90, maxLength: 4096 },
    NovaMusicCaptionEnhancer: { creativity: 0.70, maxLength: 2048 },
};

const ENHANCER_PRESETS = [
    "Quick Prompt (30–60 words)",
    "Compact Prompt (60–110 words)",
    "Faithful Rich Image",
    "Edit Preserve",
    "Cinematic",
    "Product / Fashion",
    "Character Consistency",
    "Custom",
];
const ENHANCER_LENGTHS = [
    "Very Short",
    "Short",
    "Concise",
    "Rich",
    "Maximum",
];
const ENHANCER_TASK_MODES = [
    "Auto",
    "Krea2 / Image",
    "MiniMax H3 Standard",
    "MiniMax H3 Full Reference",
    "MiniMax H3 Director",
];
const ENHANCER_TASK_MODE_ALIASES = {
    "Auto": "Auto",
    "Image": "Krea2 / Image",
    "Krea2 / Image": "Krea2 / Image",
    "H3 Standard": "MiniMax H3 Standard",
    "MiniMax H3 Standard": "MiniMax H3 Standard",
    "H3 Full Reference": "MiniMax H3 Full Reference",
    "MiniMax H3 Full Reference": "MiniMax H3 Full Reference",
    "H3 Director": "MiniMax H3 Director",
    "MiniMax H3 Director": "MiniMax H3 Director",
};
const ENHANCER_CUSTOM_PRESETS_KEY = "novoloko.promptEnhancer.customPresets.v1";
const ENHANCER_CUSTOM_PRESET_EMPTY = "Current / unsaved";
const ENHANCER_H3_LENGTHS = [
    "Preserve",
    "Compact",
    "Detailed",
];
const ENHANCER_COMBO_OPTIONS = {
    preset: ENHANCER_PRESETS,
    detail_level: ENHANCER_LENGTHS,
    task_mode: ENHANCER_TASK_MODES,
    h3_length_behavior: ENHANCER_H3_LENGTHS,
};
const ENHANCER_PRESET_LENGTH = {
    "Quick Prompt (30–60 words)": "Very Short",
    "Compact Prompt (60–110 words)": "Short",
};

const NOVA_TEXT_PANEL_EXCLUDED_WIDGETS = new Set([
    "filename_prefix",
]);
const LEGACY_CONNECTED_TEXT_WIDGETS = new Map([
    ["NovaVoiceEngineTTS", new Set(["text"])],
    ["NovaPromptEnhancer", new Set(["idea"])],
    ["TextEncodeKrea2", new Set(["prompt"])],
]);

function isNovaNodeName(value) {
    return /^Nova/.test(String(value || ""));
}

function isTextEntryElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    const tag = String(element.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (element.isContentEditable) return true;
    if (tag !== "input") return false;
    return ["text", "search", "url", "email", ""].includes(
        String(element.type || "").toLowerCase(),
    );
}

function dirty(node) {
    try {
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    } catch (_) {}
}

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function normaliseMusicWriterWidgets(node, configured = null) {
    const defaults = MUSIC_WRITER_DEFAULTS[node?.comfyClass || node?.type];
    if (!defaults) return;
    const creativity = widget(node, "creativity");
    const maxLength = widget(node, "max_length");
    if (!creativity || !maxLength) return;

    const values = Array.isArray(configured?.widgets_values)
        ? configured.widgets_values
        : [];
    // The first Music Lab draft omitted placeholders for the two linked text
    // widgets. Its sequence began [enabled, creativity, max_length, ...], which
    // shifted every later value when current ComfyUI restored by widget index.
    const knownShiftedSequence = (
        typeof values[0] === "boolean"
        && Number.isFinite(Number(values[1]))
        && Number(values[1]) >= 0
        && Number(values[1]) <= 1
        && Number.isFinite(Number(values[2]))
        && Number(values[2]) >= 256
    );
    const creativityValue = Number(creativity.value);
    const maxLengthValue = Number(maxLength.value);
    const legacyZeroOnePair = creativityValue === 0 && maxLengthValue === 1;
    const invalidCreativity = !Number.isFinite(creativityValue)
        || creativityValue < 0
        || creativityValue > 1;
    const invalidMaxLength = !Number.isInteger(maxLengthValue)
        || maxLengthValue < 256
        || maxLengthValue > 8192;
    if (!(knownShiftedSequence || legacyZeroOnePair || invalidCreativity || invalidMaxLength)) {
        return;
    }

    creativity.value = defaults.creativity;
    maxLength.value = defaults.maxLength;
    node.properties ||= {};
    node.properties.novaMusicWriterWidgetMigration = "4.3.0";
    dirty(node);
}

function installMusicWriterWidgetMigration(node) {
    if (node.__novaMusicWriterWidgetMigrationInstalled) return;
    node.__novaMusicWriterWidgetMigrationInstalled = true;
    const previousConfigure = node.onConfigure;
    node.onConfigure = function (configured) {
        const result = previousConfigure?.apply(this, arguments);
        normaliseMusicWriterWidgets(this, configured);
        requestAnimationFrame(() => normaliseMusicWriterWidgets(this, configured));
        return result;
    };
    normaliseMusicWriterWidgets(node);
    for (const delay of [0, 60, 250, 1000]) {
        setTimeout(() => normaliseMusicWriterWidgets(node), delay);
    }
}

function installControlPanel(node) {
    if (node.__novaControlPanelInstalled) return;
    node.__novaControlPanelInstalled = true;
    // Leave colour ownership entirely with ComfyUI. Its native node colour
    // serializer also handles subgraph nodes; applying a NovoLoko default here
    // overwrote the user's saved choice whenever the subgraph was rebuilt.
    node.min_size = [235, 92];
    const labels = {
        tts_enabled: "TTS On/Off",
        enhancer_enabled: "Enhancer On/Off",
    };
    for (const item of node.widgets || []) {
        if (!labels[item.name]) continue;
        item.label = labels[item.name];
        item.options ||= {};
        item.options.label = labels[item.name];
    }
    if (Array.isArray(node.size) && (node.size[0] > 500 || node.size[1] > 300)) {
        node.setSize?.([270, 110]);
    }
    dirty(node);
}

function nodeHostElement(node) {
    const value = String(node?.id ?? "");
    if (!value) return null;
    const escaped = globalThis.CSS?.escape
        ? globalThis.CSS.escape(value)
        : value.replace(/(["\\])/g, "\\$1");
    return document.querySelector?.(`[data-node-id="${escaped}"]`) || null;
}

function nodeSelected(node) {
    const selected = app.canvas?.selected_nodes || {};
    const host = nodeHostElement(node);
    return Boolean(
        node?.is_selected
        || node?.selected
        || selected?.[node?.id]
        || selected?.[String(node?.id)]
        || host?.classList?.contains("outline-node-component-outline")
    );
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

let focusedSeedWheelRetry = 0;

function installFocusedSeedWheelSupport() {
    const canvasElement = app.canvas?.canvas;
    if (!globalThis.HTMLElement || !(canvasElement instanceof globalThis.HTMLElement)) {
        clearTimeout(focusedSeedWheelRetry);
        focusedSeedWheelRetry = setTimeout(installFocusedSeedWheelSupport, 250);
        return;
    }
    if (canvasElement.__novaFocusedSeedWheelInstalled) return;
    canvasElement.__novaFocusedSeedWheelInstalled = true;
    canvasElement.addEventListener("wheel", (event) => {
        if (globalThis.LiteGraph?.vueNodesMode) return;
        const point = app.canvas?.graph_mouse;
        if (!Array.isArray(point) && !ArrayBuffer.isView(point)) return;
        const node = app.graph?.getNodeOnPos?.(Number(point[0]), Number(point[1]));
        if (!node || !nodeSelected(node) || !isNovaNodeName(node.comfyClass || node.type)) return;
        const seed = widget(node, "seed");
        if (!seed || seed.type === "hidden" || !Number.isFinite(Number(seed.last_y))) return;
        const localY = Number(point[1]) - Number(node.pos?.[1] || 0);
        const measured = seed.computeSize?.(Number(node.size?.[0]) || 240);
        const height = Math.max(20, Number(measured?.[1]) || 20);
        if (localY < Number(seed.last_y) || localY > Number(seed.last_y) + height) return;

        const baseStep = Math.max(1, Number(seed.options?.step) || 1);
        const multiplier = event.ctrlKey ? 100 : event.shiftKey ? 10 : 1;
        const direction = Number(event.deltaY || 0) < 0 ? 1 : -1;
        const minimum = Number.isFinite(Number(seed.options?.min)) ? Number(seed.options.min) : 0;
        const requestedMax = Number(seed.options?.max);
        const maximum = Number.isFinite(requestedMax)
            ? Math.min(requestedMax, Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER;
        const current = Number.isFinite(Number(seed.value)) ? Number(seed.value) : minimum;
        const next = Math.round(clamp(current + direction * baseStep * multiplier, minimum, maximum));
        if (next === current) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        seed.value = next;
        seed.callback?.call(seed, next, app.canvas, node, event);
        dirty(node);
    }, { capture: true, passive: false });
}

function safeInstall(node, label, installer) {
    try {
        installer(node);
    } catch (error) {
        console.error(`[NovoLoko v3.5.0] ${label} frontend disabled safely:`, error);
        try {
            node.__novaFrontendError = String(error?.message || error || "unknown error");
            dirty(node);
        } catch (_) {}
    }
}

function installNovaTextPanelCSS() {
    if (document.getElementById("nova-all-text-panels-v325")) return;
    const style = document.createElement("style");
    style.id = "nova-all-text-panels-v325";
    style.textContent = `
        .nova-force-text-panel-v325 {
            background: #03060a !important;
            background-color: #03060a !important;
            color: #d7e2ee !important;
            border: 1px solid rgba(104, 178, 228, .82) !important;
            border-radius: 6px !important;
            box-shadow:
                inset 0 0 0 1px rgba(218, 237, 250, .14),
                0 0 0 1px rgba(1, 8, 14, .88) !important;
            outline: none !important;
            visibility: visible !important;
            opacity: var(--nova-panel-opacity-v325, 1) !important;
            box-sizing: border-box !important;
            caret-color: #d7e2ee !important;
        }

        .nova-force-text-panel-v325:focus {
            border-color: rgba(124, 202, 255, .99) !important;
            box-shadow:
                inset 0 0 0 1px rgba(225, 243, 255, .24),
                0 0 0 1px rgba(81, 170, 230, .52) !important;
        }

        .nova-force-text-host-v325 {
            visibility: visible !important;
            opacity: 1 !important;
        }
    `;
    document.head.append(style);
}

function forceNovaTextPanel(element, opacity = 1) {
    if (!isTextEntryElement(element)) return;
    element.classList.add("nova-force-text-panel-v325");
    element.parentElement?.classList?.add("nova-force-text-host-v325");

    const styles = {
        background: "#03060a",
        "background-color": "#03060a",
        color: "#d7e2ee",
        border: "1px solid rgba(104,178,228,.82)",
        "border-radius": "6px",
        "box-shadow": "inset 0 0 0 1px rgba(218,237,250,.14), 0 0 0 1px rgba(1,8,14,.88)",
        visibility: "visible",
        opacity: String(opacity),
        "box-sizing": "border-box",
        "caret-color": "#d7e2ee",
    };
    for (const [name, value] of Object.entries(styles)) {
        element.style.setProperty(name, value, "important");
    }
    element.style.setProperty(
        "--nova-panel-opacity-v325",
        String(opacity),
        "important",
    );
}

function widgetTextElements(item) {
    const elements = new Set();
    for (const candidate of [
        item?.inputEl,
        item?.element,
        item?.el,
        item?.canvas,
    ]) {
        if (candidate instanceof HTMLElement) {
            if (isTextEntryElement(candidate)) elements.add(candidate);
            for (const child of candidate.querySelectorAll?.(
                'textarea,input[type="text"],input[type="search"],[contenteditable="true"]',
            ) || []) {
                elements.add(child);
            }
        }
    }
    return [...elements];
}

function revealLegacyConnectedTextWidgets(node) {
    if (globalThis.LiteGraph?.vueNodesMode) return;
    const nodeName = String(node?.comfyClass || node?.type || "");
    const names = LEGACY_CONNECTED_TEXT_WIDGETS.get(nodeName);
    if (!names) return;

    for (const item of node?.widgets || []) {
        if (!names.has(String(item?.name || ""))) continue;
        // Current ComfyUI marks every widget-backed connected input as
        // computedDisabled. DOM widgets use that flag as a hard visibility
        // gate, so styling the textarea alone cannot bring it back in Legacy.
        // These three large multiline fields are intentionally retained as
        // note/preview panels while their input socket is connected.
        item.computedDisabled = false;
        for (const element of widgetTextElements(item)) {
            element.hidden = false;
            element.removeAttribute?.("hidden");
            element.style.setProperty("display", "block", "important");
            element.style.setProperty("visibility", "visible", "important");
            element.style.setProperty("opacity", "1", "important");
            element.style.setProperty("pointer-events", "auto", "important");
            element.style.setProperty("width", "100%", "important");
            element.style.setProperty("height", "100%", "important");
            element.style.setProperty("box-sizing", "border-box", "important");
        }
    }
}

function installLegacyConnectedTextWidgetRepair(node) {
    const nodeName = String(node?.comfyClass || node?.type || "");
    if (!LEGACY_CONNECTED_TEXT_WIDGETS.has(nodeName)) return;
    if (node.__novaLegacyConnectedTextRepairInstalled) {
        revealLegacyConnectedTextWidgets(node);
        return;
    }
    node.__novaLegacyConnectedTextRepairInstalled = true;

    const previousUpdateComputedDisabled = node.updateComputedDisabled;
    node.updateComputedDisabled = function (...args) {
        const result = previousUpdateComputedDisabled?.apply(this, args);
        if (!globalThis.LiteGraph?.vueNodesMode) {
            const names = LEGACY_CONNECTED_TEXT_WIDGETS.get(
                String(this?.comfyClass || this?.type || ""),
            );
            for (const item of this?.widgets || []) {
                if (names?.has(String(item?.name || ""))) {
                    item.computedDisabled = false;
                }
            }
        }
        return result;
    };

    const apply = () => {
        revealLegacyConnectedTextWidgets(node);
    };
    const schedule = () => {
        if (node.__novaLegacyConnectedTextRepairQueued) return;
        node.__novaLegacyConnectedTextRepairQueued = true;
        requestAnimationFrame(() => {
            node.__novaLegacyConnectedTextRepairQueued = false;
            apply();
        });
    };

    for (const delay of [0, 35, 120, 350, 900, 1800]) {
        setTimeout(apply, delay);
    }

    const previousConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        const result = previousConfigure?.apply(this, args);
        for (const delay of [0, 60, 260, 900]) setTimeout(apply, delay);
        return result;
    };

    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        schedule();
        return result;
    };

    const previousDraw = node.onDrawForeground;
    node.onDrawForeground = function (...args) {
        const result = previousDraw?.apply(this, args);
        schedule();
        return result;
    };
}

function novaNodeTextElements(node) {
    const elements = new Map();
    const preset = String(widget(node, "preset")?.value || "");
    const taskMode = String(widget(node, "task_mode")?.value || "Krea2 / Image");
    for (const item of node?.widgets || []) {
        if (NOVA_TEXT_PANEL_EXCLUDED_WIDGETS.has(String(item?.name || ""))) {
            continue;
        }
        const dimmed = (
            String(item?.name || "") === "custom_instructions"
            && preset !== "Custom"
            && taskMode === "Krea2 / Image"
        );
        for (const element of widgetTextElements(item)) {
            elements.set(element, dimmed ? .48 : 1);
        }
    }

    // NovoLoko Media Studio and similar nodes keep useful text areas on node fields.
    for (const value of Object.values(node || {})) {
        if (isTextEntryElement(value)) {
            elements.set(value, 1);
        }
    }
    return elements;
}

function applyNovaWideTextPanels(node) {
    installNovaTextPanelCSS();
    for (const [element, opacity] of novaNodeTextElements(node)) {
        forceNovaTextPanel(element, opacity);
    }
}

function installNativeTextPanelRepair(node) {
    const nodeName = node?.comfyClass || node?.type;
    if (!isNovaNodeName(nodeName)) return;
    if (node.__novaWideTextPanelsInstalled) {
        applyNovaWideTextPanels(node);
        return;
    }
    node.__novaWideTextPanelsInstalled = true;

    const apply = () => {
        applyNovaWideTextPanels(node);
        dirty(node);
    };

    for (const delay of [0, 35, 120, 350, 900, 1800]) {
        setTimeout(apply, delay);
    }

    const previousConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        const result = previousConfigure?.apply(this, args);
        for (const delay of [0, 60, 260, 900]) {
            setTimeout(apply, delay);
        }
        return result;
    };

    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        requestAnimationFrame(apply);
        return result;
    };

    const previousDraw = node.onDrawForeground;
    node.onDrawForeground = function (...args) {
        const result = previousDraw?.apply(this, args);
        const now = performance.now();
        if (!this.__novaTextPanelLastDrawRepair
            || now - this.__novaTextPanelLastDrawRepair > 350) {
            this.__novaTextPanelLastDrawRepair = now;
            applyNovaWideTextPanels(this);
        }
        return result;
    };
}

function replaceNodeDataCombo(nodeData, inputName, values) {
    const required = nodeData?.input?.required;
    const optional = nodeData?.input?.optional;
    const specification = required?.[inputName] || optional?.[inputName];
    if (!Array.isArray(specification)) return false;
    specification[0] = [...values];
    specification[1] ||= {};
    specification[1].novaValuesVersion = "3.2.5";
    return true;
}

function setComboChoices(item, values) {
    if (!item) return;
    const choices = [...values];
    item.options ||= {};
    item.options.values = choices;
    item.options.novaValuesVersion = "3.2.5";
    item.values = choices;
    item.comboValues = choices;
}

function resolveComboChoice(value, choices, fallback = "") {
    const values = Array.isArray(choices) ? choices : [];
    if (typeof value === "number" && Number.isInteger(value)) {
        return values[value] ?? fallback;
    }
    const text = String(value ?? "");
    return values.includes(text) ? text : fallback;
}

function normaliseEnhancerComboWidget(node, name, fallback) {
    const item = widget(node, name);
    const choices = ENHANCER_COMBO_OPTIONS[name] || [];
    if (!item || !choices.length) return fallback;
    const aliases = name === "task_mode" ? ENHANCER_TASK_MODE_ALIASES : null;
    const aliased = aliases?.[String(item.value)] ?? item.value;
    item.value = resolveComboChoice(aliased, choices, fallback);
    return item.value;
}

function refreshEnhancerChoices(node) {
    const presetWidget = widget(node, "preset");
    const detailWidget = widget(node, "detail_level");
    const taskModeWidget = widget(node, "task_mode");
    const h3LengthWidget = widget(node, "h3_length_behavior");
    setComboChoices(presetWidget, ENHANCER_PRESETS);
    setComboChoices(detailWidget, ENHANCER_LENGTHS);
    setComboChoices(taskModeWidget, ENHANCER_TASK_MODES);
    setComboChoices(h3LengthWidget, ENHANCER_H3_LENGTHS);
}

function installTimerChromeCSS() {
    if (document.getElementById("nova-timer-chrome-v318")) return;
    const style = document.createElement("style");
    style.id = "nova-timer-chrome-v318";
    style.textContent = timerChromeCSS();
    document.head.append(style);
}

function styleTimerAncestors(node) {
    const directHost = nodeHostElement(node);
    if (directHost) {
        node.__novaTimerHost = directHost;
        directHost.classList.add("nova-timer-host-v397");
        applyTimerVisualState(node);
        return;
    }

    const marker = node?.__novaTimerMarker;
    let current = marker?.parentElement || null;
    let lastStyled = null;
    let host = null;

    for (let depth = 0; current && depth < 12; depth += 1) {
        if (current === document.body || current === document.documentElement) break;
        const className = String(current.className || "");
        if (/graph-canvas|graph-container|workspace|canvas-container/i.test(className)) break;

        current.style?.setProperty("background", "transparent", "important");
        current.style?.setProperty("background-color", "transparent", "important");
        current.style?.setProperty("border-color", "transparent", "important");
        current.style?.setProperty("box-shadow", "none", "important");
        current.style?.setProperty("filter", "none", "important");
        current.style?.setProperty(
            "border-radius",
            `${clamp(timerSetting(node, "cornerRadius"), 0, 80)}px`,
            "important",
        );
        lastStyled = current;

        if (
            current.matches?.(".lg-node,.comfy-node,[data-node-id],[node-id]")
            || /(^|\s)(lg-node|comfy-node|node-container)(\s|$)/i.test(className)
        ) {
            host = current;
            break;
        }
        current = current.parentElement;
    }

    node.__novaTimerHost = host || node.__novaTimerHost || lastStyled;
    node.__novaTimerHost?.classList?.add("nova-timer-host-v397");
}

function tagTimerHost(node, attempt = 0) {
    if (!node?.graph) return;
    installTimerChromeCSS();
    styleTimerAncestors(node);
    applyTimerVisualState(node);

    if (!node.__novaTimerHost && attempt < 80) {
        setTimeout(() => tagTimerHost(node, attempt + 1), attempt < 20 ? 50 : 150);
    }
}


// ---------------------------------------------------------------------------
// NovoLoko Dynamic Text Concatenate
// ---------------------------------------------------------------------------
function textInputs(node) {
    return (node.inputs || [])
        .map((input, index) => ({ input, index }))
        .filter(({ input }) => /^text_\d+$/.test(String(input?.name || "")))
        .sort((a, b) => Number(a.input.name.slice(5)) - Number(b.input.name.slice(5)));
}

function inputConnected(node, index) {
    const input = node.inputs?.[index];
    return input?.link != null;
}

function ensureDynamicTextSlots(node) {
    if (node.__novaAdjustingTextSlots) return;
    node.__novaAdjustingTextSlots = true;
    try {
        let entries = textInputs(node);
        while (entries.length < 2) {
            const next = entries.length + 1;
            node.addInput?.(`text_${next}`, "STRING");
            entries = textInputs(node);
        }

        let last = entries[entries.length - 1];
        if (last && inputConnected(node, last.index)) {
            const nextNumber = Number(last.input.name.slice(5)) + 1;
            node.addInput?.(`text_${nextNumber}`, "STRING");
            entries = textInputs(node);
        }

        while (entries.length > 2) {
            const lastEntry = entries[entries.length - 1];
            const previousEntry = entries[entries.length - 2];
            if (inputConnected(node, lastEntry.index) || inputConnected(node, previousEntry.index)) break;
            node.removeInput?.(lastEntry.index);
            entries = textInputs(node);
        }
        dirty(node);
    } finally {
        node.__novaAdjustingTextSlots = false;
    }
}

function installDynamicConcat(node) {
    if (node.__novaDynamicConcatInstalled) return;
    node.__novaDynamicConcatInstalled = true;
    setTimeout(() => ensureDynamicTextSlots(node), 0);

    const originalConnections = node.onConnectionsChange;
    node.onConnectionsChange = function (...args) {
        const result = originalConnections?.apply(this, args);
        setTimeout(() => ensureDynamicTextSlots(this), 0);
        return result;
    };

    const originalConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        const result = originalConfigure?.apply(this, args);
        setTimeout(() => ensureDynamicTextSlots(this), 30);
        return result;
    };
}

// ---------------------------------------------------------------------------
// NovoLoko Seed Lab — compact recent seed history
// ---------------------------------------------------------------------------
function randomSeed(digits = 16) {
    const d = Math.max(3, Math.min(16, Number(digits) || 16));
    const limit = d >= 16 ? Number.MAX_SAFE_INTEGER : Math.pow(10, d);
    return Math.floor(Math.random() * limit);
}

function seedGraphNodes(graph = app.graph, visited = new Set()) {
    if (!graph || visited.has(graph)) return [];
    visited.add(graph);
    const result = [];
    for (const item of graph._nodes || []) {
        result.push(item);
        if (item.subgraph) result.push(...seedGraphNodes(item.subgraph, visited));
    }
    return result;
}

async function runSeedQueueHooks(name) {
    const pending = [];
    for (const item of seedGraphNodes()) {
        for (const target of item.widgets || []) {
            const callback = target?.[name];
            if (typeof callback !== "function") continue;
            const result = callback.call(target, { isPartialExecution: false });
            if (result && typeof result.then === "function") pending.push(result);
        }
    }
    await Promise.all(pending);
}

async function queueSeedWorkflow() {
    if (typeof app.graphToPrompt !== "function" || typeof api.queuePrompt !== "function") {
        throw new Error("This ComfyUI version cannot queue the workflow from Seed Lab.");
    }
    await runSeedQueueHooks("beforeQueued");
    const prompt = await app.graphToPrompt();
    await api.queuePrompt(0, prompt);
    await runSeedQueueHooks("afterQueued");
}

function normaliseSeedHistory(value) {
    const source = Array.isArray(value) ? value : [];
    const output = [];
    for (const item of source) {
        const text = String(item ?? "").trim();
        if (!/^\d+$/.test(text) || output.includes(text)) continue;
        output.push(text);
        if (output.length >= 20) break;
    }
    return output;
}

function installSeedLab(node) {
    if (node.__novaSeedLabInstalled) return;
    node.__novaSeedLabInstalled = true;
    node.properties ||= {};
    node.properties.novaLastSeed ??= "";
    node.properties.novaSeedHistory = normaliseSeedHistory(
        node.properties.novaSeedHistory,
    );
    node.properties.novaSelectedSeed ??=
        node.properties.novaSeedHistory[0] || "";
    node.min_size = [235, 145];

    const root = document.createElement("div");
    root.style.cssText = [
        "display:grid",
        "grid-template-columns:minmax(0,1fr) auto auto",
        "gap:4px",
        "align-items:center",
        "box-sizing:border-box",
        "width:100%",
        "height:100%",
        "min-height:46px",
        "padding:4px",
        "background:rgba(5,10,17,.72)",
        "border:1px solid rgba(91,189,92,.32)",
        "border-radius:7px",
        "overflow:hidden",
    ].join(";");

    const last = document.createElement("div");
    last.textContent = "Last used seed";
    last.title = node.properties.novaLastSeed
        ? `Last used seed: ${node.properties.novaLastSeed}`
        : "No seed has been used yet";
    last.style.cssText = [
        "grid-column:1/-1",
        "min-width:0",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
        "font:800 11px/1.1 system-ui",
        "color:#dfffe4",
        "padding:1px 3px",
    ].join(";");

    // Do not use a native <select>. Chromium/Windows renders its opened list
    // as a large white system popup that ignores the node theme.
    const recent = document.createElement("button");
    recent.type = "button";
    recent.title = "Recent seeds — up to the last 20 runs";
    recent.style.cssText = [
        "position:relative",
        "min-width:0",
        "width:100%",
        "height:25px",
        "padding:2px 20px 2px 7px",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
        "text-align:left",
        "font:700 10px/1 system-ui",
        "background:#101925",
        "color:#eaffed",
        "border:1px solid rgba(255,255,255,.18)",
        "border-radius:5px",
        "cursor:pointer",
    ].join(";");

    const arrow = document.createElement("span");
    arrow.textContent = "▾";
    arrow.style.cssText = [
        "position:absolute",
        "right:6px",
        "top:50%",
        "transform:translateY(-52%)",
        "pointer-events:none",
        "opacity:.82",
    ].join(";");
    recent.append(arrow);

    let recentMenu = null;
    let recentValues = [];
    let recentValue = "";

    function closeRecentMenu() {
        recentMenu?.remove?.();
        recentMenu = null;
        recent.setAttribute("aria-expanded", "false");
    }

    function renderRecentButton() {
        const label = recentValue || "No recent seeds";
        const textNode = recent.firstChild;
        if (textNode?.nodeType === Node.TEXT_NODE) {
            textNode.textContent = `${label} `;
        } else {
            recent.insertBefore(
                document.createTextNode(`${label} `),
                recent.firstChild,
            );
        }
        recent.disabled = recentValues.length === 0;
        recent.style.opacity = recent.disabled ? ".55" : "1";
        recent.style.cursor = recent.disabled ? "default" : "pointer";
        recent.title = recentValue
            ? `Selected recent seed: ${recentValue}`
            : "No recent seeds";
    }

    function chooseRecent(value) {
        const clean = String(value || "").trim();
        if (!recentValues.includes(clean)) return;
        recentValue = clean;
        node.properties.novaSelectedSeed = clean;
        renderRecentButton();
        closeRecentMenu();
        dirty(node);
    }

    function openRecentMenu(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!recentValues.length) return;

        if (recentMenu) {
            closeRecentMenu();
            return;
        }

        const rect = recent.getBoundingClientRect();
        const menu = document.createElement("div");
        menu.dataset.novaSeedHistoryMenu = "true";
        menu.style.cssText = [
            "position:fixed",
            `left:${Math.max(6, Math.min(rect.left, window.innerWidth - 260))}px`,
            `top:${Math.min(window.innerHeight - 8, rect.bottom + 3)}px`,
            `width:${Math.max(170, Math.min(250, rect.width + 60))}px`,
            "max-height:min(55vh,360px)",
            "overflow:auto",
            "padding:5px",
            "box-sizing:border-box",
            "z-index:2147483200",
            "background:#0b141e",
            "color:#eaffed",
            "border:1px solid rgba(102,210,118,.62)",
            "border-radius:8px",
            "box-shadow:0 14px 42px rgba(0,0,0,.72)",
            "font:700 11px/1.2 ui-monospace,Consolas,monospace",
        ].join(";");

        for (const value of recentValues) {
            const option = document.createElement("button");
            option.type = "button";
            option.textContent = value === recentValue ? `✓ ${value}` : value;
            option.title = `Use recent seed ${value}`;
            option.style.cssText = [
                "display:block",
                "width:100%",
                "min-height:27px",
                "padding:5px 7px",
                "border:0",
                "border-radius:5px",
                "background:transparent",
                "color:inherit",
                "text-align:left",
                "cursor:pointer",
                "font:inherit",
                "white-space:nowrap",
                "overflow:hidden",
                "text-overflow:ellipsis",
            ].join(";");
            option.addEventListener("mouseenter", () => {
                option.style.background = "rgba(74,184,91,.25)";
            });
            option.addEventListener("mouseleave", () => {
                option.style.background = "transparent";
            });
            option.addEventListener("click", (choiceEvent) => {
                choiceEvent.preventDefault();
                choiceEvent.stopPropagation();
                chooseRecent(value);
            });
            menu.append(option);
        }

        document.body.append(menu);
        recentMenu = menu;
        recent.setAttribute("aria-expanded", "true");

        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.bottom > window.innerHeight - 6) {
                menu.style.top = `${Math.max(
                    6,
                    rect.top - menuRect.height - 3,
                )}px`;
            }
        });
    }

    recent.addEventListener("click", openRecentMenu);
    recent.addEventListener("keydown", (event) => {
        if (
            event.key === "Enter"
            || event.key === " "
            || event.key === "ArrowDown"
        ) {
            openRecentMenu(event);
        } else if (event.key === "Escape") {
            closeRecentMenu();
        }
    });

    const closeOnOutside = (event) => {
        if (!recentMenu) return;
        if (recentMenu.contains(event.target) || recent.contains(event.target)) {
            return;
        }
        closeRecentMenu();
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("blur", closeRecentMenu);
    window.addEventListener("resize", closeRecentMenu);

    const makeButton = (label, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.style.cssText = [
            "height:25px",
            "padding:2px 6px",
            "border:1px solid rgba(255,255,255,.16)",
            "border-radius:5px",
            "background:#183123",
            "color:#eaffed",
            "cursor:pointer",
            "font:700 10px system-ui",
        ].join(";");
        return button;
    };

    const reuse = makeButton(
        "Reuse",
        "Set the selected recent seed and switch mode to Fixed",
    );
    const copy = makeButton("Copy", "Copy the selected recent seed");
    const fresh = makeButton(
        "🎲 Manual Random Seed",
        "Create a new seed, switch to Fixed, and run the workflow immediately",
    );
    fresh.style.gridColumn = "1/-1";
    fresh.style.width = "100%";
    const fixedRun = makeButton(
        "Fixed Seed Run",
        "Switch to Fixed and run the workflow with the seed shown above",
    );
    fixedRun.style.gridColumn = "1/-1";
    fixedRun.style.width = "100%";

    root.append(last, recent, reuse, copy, fresh, fixedRun);
    installLegacyGraphNavigation(root);

    const dom = node.addDOMWidget?.(
        "nova_seed_history",
        "NOVA_SEED_HISTORY",
        root,
        {
            serialize: false,
            hideOnZoom: false,
        },
    );
    if (dom) {
        dom.computeSize = (width) => [
            Math.max(235, Math.min(360, width || 280)),
            113,
        ];
    }

    if (
        !node.__novaSeedOriginalComputeSize
        && typeof node.computeSize === "function"
    ) {
        node.__novaSeedOriginalComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const size = this.__novaSeedOriginalComputeSize?.apply(
                this,
                args,
            ) || [170, 150];
            return [
                Math.max(235, Math.min(380, Number(size[0]) || 280)),
                Number(size[1]) || 150,
            ];
        };
    }
    node.getMinSize = () => [235, 145];

    function selectedSeed() {
        return String(
            recentValue
            || node.properties.novaSelectedSeed
            || node.properties.novaLastSeed
            || "",
        ).trim();
    }

    function syncAfterGenerate() {
        const modeWidget = widget(node, "mode");
        const controlWidget = widget(node, "control_after_generate");
        if (!controlWidget) return;
        const wanted = String(modeWidget?.value || "") === "Random Every Queue"
            ? "randomize"
            : "fixed";
        controlWidget.value = wanted;
        controlWidget.label = "After run";
        controlWidget.options ||= {};
        controlWidget.options.label = "After run";
    }

    const modeWidget = widget(node, "mode");
    if (modeWidget && !modeWidget.__novaSeedModeWrapped) {
        const previousModeCallback = modeWidget.callback;
        modeWidget.callback = function (...args) {
            const result = previousModeCallback?.apply(this, args);
            syncAfterGenerate();
            dirty(node);
            return result;
        };
        modeWidget.__novaSeedModeWrapped = true;
    }

    for (const item of node.widgets || []) {
        const labels = {
            mode: "Mode",
            seed: "Seed",
            control_after_generate: "After run",
            digits: "Digits",
        };
        if (labels[item.name]) {
            item.label = labels[item.name];
            item.options ||= {};
            item.options.label = labels[item.name];
        }
    }
    syncAfterGenerate();

    function refreshRecent(selected = "") {
        closeRecentMenu();
        const history = normaliseSeedHistory(
            node.properties.novaSeedHistory,
        );
        node.properties.novaSeedHistory = history;
        recentValues = history;

        if (!history.length) {
            recentValue = "";
            node.properties.novaSelectedSeed = "";
            renderRecentButton();
            return;
        }

        const desired = history.includes(String(selected))
            ? String(selected)
            : (
                history.includes(String(node.properties.novaSelectedSeed))
                    ? String(node.properties.novaSelectedSeed)
                    : history[0]
            );

        recentValue = desired;
        node.properties.novaSelectedSeed = desired;
        renderRecentButton();
    }

    function useSeed(value) {
        const seed = Number(String(value || "").trim());
        if (!Number.isFinite(seed)) return;
        const seedWidget = widget(node, "seed");
        const modeWidget = widget(node, "mode");
        if (seedWidget) {
            seedWidget.value = Math.max(0, Math.floor(seed));
            seedWidget.callback?.(seedWidget.value);
        }
        if (modeWidget) {
            modeWidget.value = "Fixed";
            modeWidget.callback?.("Fixed");
        }
        syncAfterGenerate();
        node.properties.novaSelectedSeed = String(Math.floor(seed));
        recentValue = node.properties.novaSelectedSeed;
        renderRecentButton();
        dirty(node);
    }

    reuse.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        useSeed(selectedSeed());
    });

    copy.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const value = selectedSeed();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
        } catch (_) {}
    });

    let queueBusy = false;
    async function runSeed(value, sourceButton) {
        if (queueBusy) return;
        useSeed(value);
        const clean = String(Math.max(0, Math.floor(Number(value) || 0)));
        queueBusy = true;
        fresh.disabled = true;
        fixedRun.disabled = true;
        const originalLabel = sourceButton.textContent;
        sourceButton.textContent = "Queueing…";
        last.textContent = `Queueing seed ${clean}`;
        try {
            await queueSeedWorkflow();
            last.textContent = `Queued seed ${clean}`;
            last.title = `Queued fixed seed: ${clean}`;
        } catch (error) {
            const message = String(error?.message || error || "Workflow queue failed");
            last.textContent = "Seed run could not be queued";
            last.title = message;
            console.warn("[NovoLoko Seed Lab] queue failed:", error);
        } finally {
            sourceButton.textContent = originalLabel;
            fresh.disabled = false;
            fixedRun.disabled = false;
            queueBusy = false;
        }
    }

    fresh.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const value = randomSeed(widget(node, "digits")?.value);
        node.properties.novaLastSeed = String(value);
        node.properties.novaSeedHistory = normaliseSeedHistory([
            String(value),
            ...node.properties.novaSeedHistory,
        ]);
        last.textContent = "Last used seed";
        last.title = `Last used seed: ${value}`;
        refreshRecent(String(value));
        await runSeed(value, fresh);
    });

    fixedRun.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await runSeed(widget(node, "seed")?.value, fixedRun);
    });

    refreshRecent();

    const originalExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        originalExecuted?.apply(this, arguments);
        const payload = message?.nova_seed_lab?.[0];
        if (!payload) return;
        const seed = String(payload.seed ?? "").trim();
        if (!seed) return;
        this.properties ||= {};
        this.properties.novaLastSeed = seed;
        this.properties.novaSelectedSeed = seed;
        this.properties.novaSeedHistory = normaliseSeedHistory([
            seed,
            ...(this.properties.novaSeedHistory || []),
        ]);
        last.textContent = "Last used seed";
        last.title = `Last used seed: ${seed}`;
        syncAfterGenerate();
        refreshRecent(seed);
        dirty(this);
    };

    const originalRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        closeRecentMenu();
        document.removeEventListener("pointerdown", closeOnOutside, true);
        window.removeEventListener("blur", closeRecentMenu);
        window.removeEventListener("resize", closeRecentMenu);
        return originalRemoved?.apply(this, args);
    };

}

// ---------------------------------------------------------------------------
// NovoLoko borderless generation timer
// ---------------------------------------------------------------------------
const timerNodes = new Set();
let timerRunning = false;
let timerStartedAt = 0;
let timerInterval = 0;
let timerLastMs = 0;
let timerOutcome = "IDLE";
let timerAudioContext = null;
let timerCompletionHandled = true;

const TIMER_DEFAULTS = {
    idleColor: "#f3f7ff",
    runningColor: "#6ee7ff",
    doneColor: "#9cffbd",
    errorColor: "#ff7474",
    statusColor: "#c8d5e5",
    backgroundColor: "#08101a",
    borderColor: "#2b5577",
    cornerRadius: 5,
    showBackground: true,
    showBorder: true,
    showStatus: true,
    showAverage: true,
    showLast: true,
    showBest: true,
    displayPreset: "Full Stats",
    historyLimit: 20,
    sound: "Custom: 05 SFX/01 Pack 100/008 - Cash.mp3",
    volume: 35,
    glow: false,
};

function timerSetting(node, key) {
    const value = node?.properties?.[`novaTimer_${key}`];
    return value == null ? TIMER_DEFAULTS[key] : value;
}

const TIMER_DISPLAY_PRESETS = {
    "Minimal": {
        showStatus: false,
        showAverage: false,
        showLast: false,
        showBest: false,
    },
    "Time + Status": {
        showStatus: true,
        showAverage: false,
        showLast: false,
        showBest: false,
    },
    "Full Stats": {
        showStatus: true,
        showAverage: true,
        showLast: true,
        showBest: true,
    },
};

const BUILTIN_TIMER_SOUNDS = [
    "Off",
    "Soft Chime",
    "Double Beep",
    "Bell",
    "Success",
    "Triple Rise",
    "Gentle Ping",
    "Digital Pop",
    "Low Gong",
    "Victory Fanfare",
    "Alert Pulse",
];

function inferTimerDisplayPreset(node) {
    const saved = String(timerSetting(node, "displayPreset") || "");
    if (saved === "Custom" || TIMER_DISPLAY_PRESETS[saved]) return saved;

    for (const [name, values] of Object.entries(TIMER_DISPLAY_PRESETS)) {
        if (
            Boolean(timerSetting(node, "showStatus")) === values.showStatus
            && Boolean(timerSetting(node, "showAverage")) === values.showAverage
            && Boolean(timerSetting(node, "showLast")) === values.showLast
            && Boolean(timerSetting(node, "showBest")) === values.showBest
        ) {
            return name;
        }
    }
    return "Custom";
}

function customTimerSoundFilename(value) {
    const prefix = "Custom: ";
    const sound = String(value || "");
    return sound.startsWith(prefix) ? sound.slice(prefix.length).trim() : "";
}

async function fetchTimerCustomSounds() {
    try {
        const url = typeof api.apiURL === "function"
            ? api.apiURL("/nova_timer/sounds")
            : "/nova_timer/sounds";
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return [];
        const payload = await response.json();
        return Array.isArray(payload?.items) ? payload.items : [];
    } catch (_) {
        return [];
    }
}

async function uploadTimerCustomSound(file) {
    const body = new FormData();
    body.append("sound", file, file.name);
    const url = typeof api.apiURL === "function"
        ? api.apiURL("/nova_timer/sounds/upload")
        : "/nova_timer/sounds/upload";
    const response = await fetch(url, { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Custom sound upload failed.");
    }
    return payload;
}

async function openTimerSoundFolder() {
    const url = typeof api.apiURL === "function"
        ? api.apiURL("/nova_timer/sounds/open_folder")
        : "/nova_timer/sounds/open_folder";
    const response = await fetch(url, { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Sound folder could not be opened.");
    }
    return payload;
}

function formatTimer(ms) {
    const value = Math.max(0, Number(ms) || 0);
    const hours = Math.floor(value / 3600000);
    const minutes = Math.floor((value % 3600000) / 60000);
    const seconds = Math.floor((value % 60000) / 1000);
    const tenths = Math.floor((value % 1000) / 100);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
    return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

function timerElapsed() {
    return timerRunning ? Math.max(0, Date.now() - timerStartedAt) : timerLastMs;
}

function timerHistory(node) {
    const source = Array.isArray(node?.properties?.novaTimerHistory)
        ? node.properties.novaTimerHistory
        : [];
    return source.map(Number).filter((value) => Number.isFinite(value) && value >= 0);
}

function timerAverage(node) {
    const history = timerHistory(node);
    if (!history.length) return 0;
    return history.reduce((sum, value) => sum + value, 0) / history.length;
}

function timerBest(node) {
    const history = timerHistory(node).filter((value) => value > 0);
    return history.length ? Math.min(...history) : 0;
}

function applyTimerVisualState(node) {
    if (!node) return;
    const showBackground = Boolean(timerSetting(node, "showBackground"));
    const background = String(timerSetting(node, "backgroundColor") || "#08101a");
    const transparent = "rgba(0,0,0,0)";

    node.color = transparent;
    node.boxcolor = transparent;
    node.bgcolor = transparent;
    node.flags ||= {};
    node.flags.no_title = true;

    const LG = globalThis.LiteGraph || {};
    node.shape = LG.ROUND_SHAPE ?? node.shape;

    const radius = clamp(timerSetting(node, "cornerRadius"), 0, 80);
    const host = node.__novaTimerHost;
    if (host?.style) {
        host.style.setProperty("background", "transparent", "important");
        host.style.setProperty("background-color", "transparent", "important");
        host.style.setProperty("border-radius", `${radius}px`, "important");
        host.style.setProperty("overflow", "hidden", "important");
    }
}

function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(Number(radius) || 0, width / 2, height / 2));
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, r);
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

async function playTimerSound(node, outcome = "DONE", soundOverride = null, volumeOverride = null) {
    if (outcome !== "DONE") return false;
    const sound = String(soundOverride ?? timerSetting(node, "sound") ?? "Off");
    if (sound === "Off") return false;
    const volume = clamp(volumeOverride ?? timerSetting(node, "volume"), 0, 100) / 100;

    const customFilename = customTimerSoundFilename(sound);
    if (customFilename) {
        try {
            const params = new URLSearchParams({
                filename: customFilename,
                t: String(Date.now()),
            });
            const url = typeof api.apiURL === "function"
                ? api.apiURL(`/nova_timer/sound?${params.toString()}`)
                : `/nova_timer/sound?${params.toString()}`;
            const audio = new Audio(url);
            audio.volume = volume;
            await audio.play();
            return true;
        } catch (error) {
            console.warn("[NovoLoko Timer] Custom sound could not play:", error);
            return false;
        }
    }

    const definitions = {
        "Soft Chime": {
            type: "triangle",
            notes: [[660, 0, .12], [880, .12, .18]],
        },
        "Double Beep": {
            type: "square",
            notes: [[740, 0, .08], [740, .14, .08]],
        },
        "Bell": {
            type: "sine",
            notes: [[523, 0, .35], [784, .03, .42]],
        },
        "Success": {
            type: "triangle",
            notes: [[523, 0, .10], [659, .11, .10], [784, .22, .20]],
        },
        "Triple Rise": {
            type: "triangle",
            notes: [[440, 0, .09], [554, .10, .09], [659, .20, .18]],
        },
        "Gentle Ping": {
            type: "sine",
            notes: [[988, 0, .24], [1319, .02, .32]],
        },
        "Digital Pop": {
            type: "square",
            notes: [[1047, 0, .045], [784, .055, .045], [1175, .11, .09]],
        },
        "Low Gong": {
            type: "sine",
            notes: [[147, 0, .65], [220, .02, .48], [294, .04, .30]],
        },
        "Victory Fanfare": {
            type: "sawtooth",
            notes: [[523, 0, .10], [659, .11, .10], [784, .22, .10], [1047, .34, .28]],
        },
        "Alert Pulse": {
            type: "square",
            notes: [[880, 0, .07], [660, .10, .07], [880, .20, .07], [660, .30, .12]],
        },
    };

    const definition = definitions[sound] || definitions["Soft Chime"];
    try {
        timerAudioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        const context = timerAudioContext;
        await context.resume?.();
        const now = context.currentTime + 0.02;

        for (const [frequency, delay, duration] of definition.notes) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = definition.type;
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(
                Math.max(.0002, volume * .20),
                now + delay + .01,
            );
            gain.gain.exponentialRampToValueAtTime(
                .0001,
                now + delay + duration,
            );
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(now + delay);
            oscillator.stop(now + delay + duration + .04);
        }
        return true;
    } catch (error) {
        console.warn("[NovoLoko Timer] Built-in sound could not play:", error);
        return false;
    }
}

function repaintTimers() {
    for (const node of [...timerNodes]) {
        if (!node?.graph) {
            timerNodes.delete(node);
            continue;
        }
        node.__novaTimerRefresh?.();
        dirty(node);
    }
    uninstallTimerEventsIfUnused();
}

function beginTimer() {
    timerRunning = true;
    timerStartedAt = Date.now();
    timerLastMs = 0;
    timerOutcome = "RUNNING";
    timerCompletionHandled = false;
    clearInterval(timerInterval);
    timerInterval = setInterval(repaintTimers, 100);
    repaintTimers();
}

function finishTimer(outcome = "DONE") {
    if (timerCompletionHandled) return;
    timerCompletionHandled = true;
    if (timerRunning) timerLastMs = Math.max(0, Date.now() - timerStartedAt);
    timerRunning = false;
    timerOutcome = outcome;
    clearInterval(timerInterval);
    timerInterval = 0;

    let soundPlayed = false;
    for (const node of timerNodes) {
        node.properties ||= {};
        node.properties.novaTimerLastMs = timerLastMs;
        node.properties.novaTimerOutcome = timerOutcome;
        if (outcome === "DONE") {
            const limit = Math.max(1, Math.min(100, Number(timerSetting(node, "historyLimit")) || 20));
            node.properties.novaTimerHistory = [timerLastMs, ...timerHistory(node)].slice(0, limit);
            if (!soundPlayed && String(timerSetting(node, "sound")) !== "Off") {
                playTimerSound(node, outcome);
                soundPlayed = true;
            }
        }
    }
    repaintTimers();
}

let timerEventsInstalled = false;
const timerEventHandlers = {
    start: () => beginTimer(),
    success: () => finishTimer("DONE"),
    error: () => finishTimer("ERROR"),
    interrupted: () => finishTimer("STOPPED"),
    executing: (event) => {
        if (event?.detail == null && timerRunning) finishTimer("DONE");
    },
};
function installTimerEvents() {
    if (timerEventsInstalled) return;
    timerEventsInstalled = true;
    api.addEventListener("execution_start", timerEventHandlers.start);
    api.addEventListener("execution_success", timerEventHandlers.success);
    api.addEventListener("execution_error", timerEventHandlers.error);
    api.addEventListener("execution_interrupted", timerEventHandlers.interrupted);
    api.addEventListener("executing", timerEventHandlers.executing);
}

function uninstallTimerEventsIfUnused() {
    if (!timerEventsInstalled || timerNodes.size) return;
    timerEventsInstalled = false;
    api.removeEventListener("execution_start", timerEventHandlers.start);
    api.removeEventListener("execution_success", timerEventHandlers.success);
    api.removeEventListener("execution_error", timerEventHandlers.error);
    api.removeEventListener("execution_interrupted", timerEventHandlers.interrupted);
    api.removeEventListener("executing", timerEventHandlers.executing);
    clearInterval(timerInterval);
    timerInterval = 0;
    timerRunning = false;
    timerCompletionHandled = true;
}

function colourInput(label, value) {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px";
    const text = document.createElement("span");
    text.textContent = label;
    const input = document.createElement("input");
    input.type = "color";
    input.value = value;
    wrapper.append(text, input);
    return { wrapper, input };
}

function showTimerSettings(node) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);font:13px system-ui;color:#eaf4ff";
    const panel = document.createElement("div");
    panel.style.cssText = "width:min(760px,94vw);max-height:90vh;overflow:auto;padding:16px;border-radius:14px;background:#101925;border:1px solid #345774;box-shadow:0 20px 70px rgba(0,0,0,.6)";
    const heading = document.createElement("h3");
    heading.textContent = "NovoLoko Generation Timer — settings";
    heading.style.margin = "0 0 12px";

    const field = (label, input) => {
        const wrapper = document.createElement("label");
        wrapper.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:28px";
        const span = document.createElement("span");
        span.textContent = label;
        wrapper.append(span, input);
        return wrapper;
    };

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 14px";

    const colours = {
        idleColor: colourInput("Idle font", timerSetting(node, "idleColor")),
        runningColor: colourInput("Running font", timerSetting(node, "runningColor")),
        doneColor: colourInput("Done font", timerSetting(node, "doneColor")),
        errorColor: colourInput("Error font", timerSetting(node, "errorColor")),
        statusColor: colourInput("Status / statistics", timerSetting(node, "statusColor")),
        backgroundColor: colourInput("Background", timerSetting(node, "backgroundColor")),
        borderColor: colourInput("Border", timerSetting(node, "borderColor")),
    };
    for (const item of Object.values(colours)) grid.append(item.wrapper);

    const displayPreset = document.createElement("select");
    for (const value of ["Minimal", "Time + Status", "Full Stats", "Custom"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        displayPreset.append(option);
    }
    displayPreset.value = inferTimerDisplayPreset(node);

    const radius = document.createElement("input");
    radius.type = "number";
    radius.min = "0";
    radius.max = "80";
    radius.value = String(timerSetting(node, "cornerRadius"));
    radius.style.width = "90px";

    const historyLimit = document.createElement("input");
    historyLimit.type = "number";
    historyLimit.min = "1";
    historyLimit.max = "100";
    historyLimit.value = String(timerSetting(node, "historyLimit"));
    historyLimit.style.width = "90px";

    const sound = document.createElement("select");
    sound.style.maxWidth = "250px";
    const soundStatus = document.createElement("div");
    soundStatus.style.cssText = "grid-column:1/-1;padding:7px 9px;border-radius:7px;background:#08101a;color:#aebfd0;min-height:18px";

    async function populateSounds(preferred = null) {
        const selected = String(preferred ?? sound.value ?? timerSetting(node, "sound") ?? "Off");
        sound.replaceChildren();

        for (const value of BUILTIN_TIMER_SOUNDS) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            sound.append(option);
        }

        const custom = await fetchTimerCustomSounds();
        if (custom.length) {
            const separator = document.createElement("option");
            separator.disabled = true;
            separator.textContent = "──── Custom sounds ────";
            sound.append(separator);
            for (const item of custom) {
                const option = document.createElement("option");
                option.value = `Custom: ${item.filename}`;
                option.textContent = `Custom • ${item.display || item.label || item.filename}`;
                option.title = item.filename;
                sound.append(option);
            }
        }

        const available = [...sound.options].some((option) => option.value === selected);
        sound.value = available ? selected : "Off";
        soundStatus.textContent = custom.length
            ? `${custom.length} sound${custom.length === 1 ? "" : "s"} found recursively in ComfyUI-NovoLoko/data/NovoLokoTimerSounds.`
            : "Add WAV, MP3, OGG, M4A, AAC, FLAC or OPUS sounds under ComfyUI-NovoLoko/data/NovoLokoTimerSounds. Subfolders are scanned automatically.";
    }

    const volume = document.createElement("input");
    volume.type = "range";
    volume.min = "0";
    volume.max = "100";
    volume.value = String(timerSetting(node, "volume"));

    const showBackground = document.createElement("input");
    showBackground.type = "checkbox";
    showBackground.checked = Boolean(timerSetting(node, "showBackground"));
    const showBorder = document.createElement("input");
    showBorder.type = "checkbox";
    showBorder.checked = Boolean(timerSetting(node, "showBorder"));
    const showStatus = document.createElement("input");
    showStatus.type = "checkbox";
    showStatus.checked = Boolean(timerSetting(node, "showStatus"));
    const showAverage = document.createElement("input");
    showAverage.type = "checkbox";
    showAverage.checked = Boolean(timerSetting(node, "showAverage"));
    const showLast = document.createElement("input");
    showLast.type = "checkbox";
    showLast.checked = Boolean(timerSetting(node, "showLast"));
    const showBest = document.createElement("input");
    showBest.type = "checkbox";
    showBest.checked = Boolean(timerSetting(node, "showBest"));
    const glow = document.createElement("input");
    glow.type = "checkbox";
    glow.checked = Boolean(timerSetting(node, "glow"));

    const presetChecks = { showStatus, showAverage, showLast, showBest };

    function applyPresetToControls(name) {
        const values = TIMER_DISPLAY_PRESETS[name];
        if (!values) return;
        for (const [key, value] of Object.entries(values)) {
            presetChecks[key].checked = value;
        }
    }

    displayPreset.addEventListener("change", () => {
        applyPresetToControls(displayPreset.value);
    });

    for (const checkbox of Object.values(presetChecks)) {
        checkbox.addEventListener("change", () => {
            displayPreset.value = "Custom";
        });
    }

    const soundActions = document.createElement("div");
    soundActions.style.cssText = "display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end";
    const makeSmall = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = "padding:5px 9px;border-radius:6px;border:1px solid #456985;background:#18314a;color:#fff;cursor:pointer";
        return button;
    };
    const addSound = makeSmall("Add sound…");
    const refreshSounds = makeSmall("Refresh");
    const openFolder = makeSmall("Open folder");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".wav,.mp3,.ogg,.m4a,.aac,.flac,.opus,audio/*";
    fileInput.style.display = "none";
    soundActions.append(addSound, refreshSounds, openFolder, fileInput);

    addSound.onclick = () => fileInput.click();
    refreshSounds.onclick = () => populateSounds(sound.value);
    openFolder.onclick = async () => {
        try {
            const payload = await openTimerSoundFolder();
            soundStatus.textContent = `Opened ${payload.folder}`;
        } catch (error) {
            soundStatus.textContent = String(error?.message || error);
        }
    };
    fileInput.onchange = async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        soundStatus.textContent = `Adding ${file.name}…`;
        try {
            const payload = await uploadTimerCustomSound(file);
            await populateSounds(`Custom: ${payload.filename}`);
            soundStatus.textContent = `Added ${payload.filename}`;
        } catch (error) {
            soundStatus.textContent = String(error?.message || error);
        } finally {
            fileInput.value = "";
        }
    };

    grid.append(
        field("Display preset", displayPreset),
        field("Corner radius", radius),
        field("Average history runs", historyLimit),
        field("Finish sound", sound),
        field("Sound volume", volume),
        soundActions,
        field("Show background", showBackground),
        field("Show border", showBorder),
        field("Show status", showStatus),
        field("Show average", showAverage),
        field("Show last time", showLast),
        field("Show best time", showBest),
        field("Glow while running", glow),
        soundStatus,
    );

    const stats = document.createElement("div");
    const history = timerHistory(node);
    stats.textContent = history.length
        ? `Stored runs: ${history.length} • Average: ${formatTimer(timerAverage(node))} • Last: ${formatTimer(Number(node.properties?.novaTimerLastMs || 0))} • Best: ${formatTimer(timerBest(node))}`
        : "No completed runs stored yet.";
    stats.style.cssText = "margin-top:12px;padding:9px;border-radius:8px;background:#08101a;color:#bed0e4";

    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px";
    const make = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = "padding:7px 12px;border-radius:7px;border:1px solid #456985;background:#18314a;color:#fff;cursor:pointer";
        return button;
    };

    const clearHistory = make("Clear history");
    const reset = make("Reset defaults");
    const test = make("Test sound");
    const cancel = make("Cancel");
    const save = make("Save");

    const close = () => overlay.remove();
    cancel.onclick = close;
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) close();
    });

    clearHistory.onclick = () => {
        node.properties.novaTimerHistory = [];
        node.properties.novaTimerLastMs = 0;
        stats.textContent = "No completed runs stored yet.";
        dirty(node);
    };

    test.onclick = async () => {
        soundStatus.textContent = `Testing ${sound.options[sound.selectedIndex]?.textContent || sound.value}…`;
        const played = await playTimerSound(
            node,
            "DONE",
            sound.value,
            Number(volume.value),
        );
        soundStatus.textContent = played
            ? `Played ${sound.options[sound.selectedIndex]?.textContent || sound.value}.`
            : "That sound could not be decoded. NovoLoko tried PCM16 conversion and browser fallback.";
    };

    reset.onclick = () => {
        for (const [key, value] of Object.entries(TIMER_DEFAULTS)) {
            node.properties[`novaTimer_${key}`] = value;
        }
        applyTimerVisualState(node);
        if (globalThis.LiteGraph?.vueNodesMode) tagTimerHost(node);
        close();
        dirty(node);
    };

    save.onclick = () => {
        for (const [key, item] of Object.entries(colours)) {
            node.properties[`novaTimer_${key}`] = item.input.value;
        }
        node.properties.novaTimer_displayPreset = displayPreset.value;
        node.properties.novaTimer_cornerRadius = clamp(radius.value, 0, 80);
        node.properties.novaTimer_historyLimit = clamp(historyLimit.value, 1, 100);
        node.properties.novaTimer_sound = sound.value;
        node.properties.novaTimer_volume = clamp(volume.value, 0, 100);
        node.properties.novaTimer_showBackground = showBackground.checked;
        node.properties.novaTimer_showBorder = showBorder.checked;
        node.properties.novaTimer_showStatus = showStatus.checked;
        node.properties.novaTimer_showAverage = showAverage.checked;
        node.properties.novaTimer_showLast = showLast.checked;
        node.properties.novaTimer_showBest = showBest.checked;
        node.properties.novaTimer_glow = glow.checked;
        applyTimerVisualState(node);
        if (globalThis.LiteGraph?.vueNodesMode) tagTimerHost(node);
        close();
        dirty(node);
    };

    buttons.append(clearHistory, reset, test, cancel, save);
    panel.append(heading, grid, stats, buttons);
    overlay.append(panel);
    document.body.append(overlay);
    populateSounds(String(timerSetting(node, "sound") || "Off"));
}

function isTimerNode(node) {
    return Boolean(
        node
        && (node.type === TIMER_NODE || node.comfyClass === TIMER_NODE)
    );
}

function restoreTimerNodeState(node) {
    if (!node) return;
    node.properties ||= {};
    node.flags ||= {};
    node.flags.no_title = true;

    const last = Number(node.properties.novaTimerLastMs || 0);
    const outcome = String(node.properties.novaTimerOutcome || "IDLE");
    if (!timerRunning && Number.isFinite(last) && last >= 0) {
        timerLastMs = last;
        timerOutcome = outcome;
    }
}

function countdownFields(node) {
    return {
        hours: clamp(node.properties?.novaTimerCountdownHours ?? 0, 0, 999),
        minutes: clamp(node.properties?.novaTimerCountdownMinutes ?? 0, 0, 59),
        seconds: clamp(node.properties?.novaTimerCountdownSeconds ?? 10, 0, 59),
    };
}

function countdownDurationMs(node) {
    const values = countdownFields(node);
    return Math.round(
        (values.hours * 3600 + values.minutes * 60 + values.seconds) * 1000,
    );
}

function countdownRemainingMs(node) {
    if (node.__novaCountdownState === "RUNNING") {
        return Math.max(0, Number(node.__novaCountdownEndsAt || 0) - Date.now());
    }
    return Math.max(0, Number(node.__novaCountdownRemainingMs || 0));
}

function stopCountdownInterval(node) {
    clearInterval(node.__novaCountdownInterval || 0);
    node.__novaCountdownInterval = 0;
}

function finishCountdown(node) {
    if (node.__novaCountdownState === "DONE") return;
    stopCountdownInterval(node);
    node.__novaCountdownState = "DONE";
    node.__novaCountdownRemainingMs = 0;
    node.properties.novaTimerCountdownState = "DONE";
    node.properties.novaTimerCountdownRemainingMs = 0;
    if (!node.__novaCountdownCompletionPlayed) {
        node.__novaCountdownCompletionPlayed = true;
        playTimerSound(node, "DONE");
    }
    node.__novaTimerRefresh?.();
    dirty(node);
}

function tickCountdown(node) {
    if (node.__novaCountdownState !== "RUNNING") return;
    node.__novaCountdownRemainingMs = countdownRemainingMs(node);
    if (node.__novaCountdownRemainingMs <= 0) finishCountdown(node);
    else node.__novaTimerRefresh?.();
}

function installTimerDOM(node) {
    if (
        node.__novaTimerDOMInstalled
    ) return;

    node.__novaTimerDOMInstalled = true;
    const controller = new AbortController();
    node.__novaTimerDOMController = controller;

    const root = document.createElement("div");
    root.className = "nova-timer-nodes2-legacy-v398";
    root.style.cssText = [
        "position:absolute",
        "inset:0",
        "min-width:0",
        "min-height:0",
        "overflow:hidden",
        "box-sizing:border-box",
        "pointer-events:auto",
    ].join(";");
    root.style.setProperty("display", "block", "important");
    root.style.setProperty("visibility", "visible", "important");
    root.style.setProperty("opacity", "1", "important");
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%;min-width:0;min-height:0";
    root.append(canvas);

    const refresh = () => {
        const width = Math.max(1, root.clientWidth || Number(node.size?.[0] || 190));
        const height = Math.max(1, root.clientHeight || Number(node.size?.[1] || 70));
        const sourceWidth = Math.max(1, Number(node.size?.[0] || 190));
        const sourceHeight = Math.max(1, Number(node.size?.[1] || 70));
        const pixelRatio = clamp(globalThis.devicePixelRatio || 1, 1, 2);
        canvas.width = Math.max(1, Math.round(width * pixelRatio));
        canvas.height = Math.max(1, Math.round(height * pixelRatio));
        const context = canvas.getContext("2d");
        if (!context) return;
        context.setTransform(
            pixelRatio * width / sourceWidth,
            0,
            0,
            pixelRatio * height / sourceHeight,
            0,
            0,
        );
        context.clearRect(0, 0, sourceWidth, sourceHeight);
        node.onDrawForeground?.call(node, context);
    };
    node.__novaTimerRefresh = refresh;

    root.addEventListener("pointerenter", () => {
        node.__novaTimerHover = true;
        refresh();
    }, { signal: controller.signal });
    root.addEventListener("pointerleave", () => {
        node.__novaTimerHover = false;
        refresh();
    }, { signal: controller.signal });
    root.addEventListener("pointerdown", (event) => {
        const hit = node.__novaTimerCogHit;
        if (!hit) return;
        const bounds = root.getBoundingClientRect();
        const x = (event.clientX - bounds.left)
            * Math.max(1, Number(node.size?.[0] || 190))
            / Math.max(1, bounds.width);
        const y = (event.clientY - bounds.top)
            * Math.max(1, Number(node.size?.[1] || 70))
            / Math.max(1, bounds.height);
        if (
            x < hit.x || x > hit.x + hit.width
            || y < hit.y || y > hit.y + hit.height
        ) return;
        event.preventDefault();
        event.stopPropagation();
        showTimerSettings(node);
    }, { signal: controller.signal });

    const mount = () => {
        if (!globalThis.LiteGraph?.vueNodesMode) {
            root.remove();
            return;
        }
        const host = nodeHostElement(node);
        if (!host) return;
        host.classList.add("nova-timer-host-v397");
        node.__novaTimerHost = host;

        const body = host.querySelector?.(`[data-testid="node-body-${node.id}"]`);
        if (body?.style) {
            body.style.setProperty("padding", "0", "important");
            body.style.setProperty("gap", "0", "important");
            body.style.setProperty("background", "transparent", "important");
            for (const child of body.children || []) {
                if (child.classList?.contains("mt-auto")) {
                    child.style.setProperty("display", "none", "important");
                }
            }
        }

        if (root.parentElement !== host) {
            const firstResizeHandle = [...host.children].find(
                (child) => child.getAttribute?.("role") === "button",
            );
            host.insertBefore(root, firstResizeHandle || null);
        }
        refresh();
    };
    node.__novaTimerMount = mount;

    const observer = new ResizeObserver(refresh);
    observer.observe(root);
    node.__novaTimerDOMObserver = observer;
    const mountInterval = setInterval(mount, 250);
    node.__novaTimerMountInterval = mountInterval;

    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        controller.abort();
        observer.disconnect();
        clearInterval(mountInterval);
        root.remove();
        previousRemoved?.apply(this, arguments);
    };
    requestAnimationFrame(() => {
        mount();
    });
}

function installTimerNode(node) {
    if (node.__novaTimerInstalled) return;
    node.__novaTimerInstalled = true;
    node.properties ||= {};
    node.flags ||= {};

    // Safe Pixaroma-style instance changes:
    // - title mode is set on the node TYPE during registration;
    // - no package metadata is deleted;
    // - the visual badge list is cleared only after this node exists.
    node.flags.no_title = true;
    node.badges = [];
    node.title = "";
    node.color = "rgba(0,0,0,0)";
    node.bgcolor = "rgba(0,0,0,0)";
    node.boxcolor = "rgba(0,0,0,0)";
    node.min_size = [32, 24];
    node.getMinSize = () => [32, 24];
    if (
        !globalThis.LiteGraph?.vueNodesMode
        && !node.__novaTimerOriginalComputeSize
    ) {
        node.__novaTimerOriginalComputeSize = node.computeSize;
        node.computeSize = () => [32, 24];
    }

    const LG = globalThis.LiteGraph || {};
    node.shape = LG.ROUND_SHAPE ?? node.shape;

    if (!Array.isArray(node.size) || node.size[0] < 20 || node.size[1] < 20) {
        node.size = [190, 70];
    }

    installTimerChromeCSS();
    applyTimerVisualState(node);

    // Legacy draws directly on the graph canvas and must not own a hidden DOM
    // widget below the visible timer. Nodes 2.0 still uses its real node host.
    if (globalThis.LiteGraph?.vueNodesMode) tagTimerHost(node);

    restoreTimerNodeState(node);
    timerNodes.add(node);
    installTimerEvents();
    const previousForeground = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        const result = previousForeground?.apply(this, arguments);
        if (!ctx) return result;

        const width = Math.max(1, this.size?.[0] || 190);
        const height = Math.max(1, this.size?.[1] || 70);
        const inset = clamp(Math.min(width, height) * .012, 1, 4);
        const radius = clamp(
            timerSetting(this, "cornerRadius"),
            0,
            Math.min(width, height) / 2,
        );
        applyTimerVisualState(this);
        const showStatus = Boolean(timerSetting(this, "showStatus")) && height >= 42;
        const showAverage = Boolean(timerSetting(this, "showAverage")) && height >= 54;
        const showLast = Boolean(timerSetting(this, "showLast")) && height >= 54;
        const showBest = Boolean(timerSetting(this, "showBest")) && height >= 54;
        const timeText = formatTimer(timerElapsed());
        const average = timerAverage(this);
        const last = Number(this.properties?.novaTimerLastMs || timerLastMs || 0);
        const best = timerBest(this);

        let mainColor = timerSetting(this, "idleColor");
        if (timerRunning) mainColor = timerSetting(this, "runningColor");
        else if (timerOutcome === "DONE") mainColor = timerSetting(this, "doneColor");
        else if (timerOutcome === "ERROR") mainColor = timerSetting(this, "errorColor");

        ctx.save();
        const showBackground = Boolean(timerSetting(this, "showBackground"));
        const showBorder = Boolean(timerSetting(this, "showBorder"));
        if (showBackground || showBorder) {
            roundedRect(ctx, inset, inset, width - inset * 2, height - inset * 2, radius);
            if (showBackground) {
                ctx.fillStyle = String(timerSetting(this, "backgroundColor"));
                ctx.fill();
            }
            if (showBorder) {
                ctx.lineWidth = Math.max(1, Math.min(4, Math.min(width, height) * .025));
                ctx.strokeStyle = String(timerSetting(this, "borderColor"));
                ctx.stroke();
            }
        }

        // Compact status dot. It scales with the node but never dominates it.
        const dotRadius = clamp(Math.min(width, height) * .045, 2, 8);
        ctx.beginPath();
        ctx.arc(inset + dotRadius * 1.9, inset + dotRadius * 1.9, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = timerRunning
            ? String(timerSetting(this, "runningColor"))
            : timerOutcome === "DONE"
                ? String(timerSetting(this, "doneColor"))
                : timerOutcome === "ERROR"
                    ? String(timerSetting(this, "errorColor"))
                    : String(timerSetting(this, "statusColor"));
        ctx.fill();

        const hasMeta = showStatus || showAverage || showLast || showBest;
        const reservedMeta = hasMeta
            ? clamp(height * .17, 18, 52)
            : 0;
        const fontByHeight = Math.max(8, (height - reservedMeta - inset * 2) * .62);
        const fontByWidth = width / Math.max(4.5, timeText.length * .62);
        const mainFont = Math.max(8, Math.min(220, fontByHeight, fontByWidth));
        const timeY = hasMeta
            ? clamp(height * .43, inset + mainFont * .52, height - inset - mainFont)
            : height / 2;

        ctx.font = `800 ${mainFont}px ui-monospace,SFMono-Regular,Consolas,monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = String(mainColor);
        if (timerRunning && Boolean(timerSetting(this, "glow"))) {
            ctx.shadowColor = String(mainColor);
            ctx.shadowBlur = Math.min(28, mainFont * .45);
        }
        ctx.fillText(timeText, width / 2, timeY);
        ctx.shadowBlur = 0;

        const cogSize = Math.max(12, Math.min(24, Math.min(width, height) * .18));
        const cogX = width - inset - cogSize * .65;
        const cogY = inset + cogSize * .55;
        this.__novaTimerCogHit = {
            x: width - inset - cogSize * 1.35,
            y: inset,
            width: cogSize * 1.35,
            height: cogSize * 1.35,
        };
        ctx.save();
        ctx.globalAlpha = this.__novaTimerHover ? .98 : .48;
        ctx.font = `700 ${cogSize}px "Segoe UI Symbol","Segoe UI",sans-serif`;
        ctx.fillStyle = String(timerSetting(this, "statusColor"));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("⚙", cogX, cogY);
        ctx.restore();

        if (showStatus || showAverage || showLast || showBest) {
            const parts = [];
            if (showStatus) parts.push(timerOutcome);
            if (showLast && last > 0) parts.push(`LAST ${formatTimer(last)}`);
            if (showBest && best > 0) parts.push(`BEST ${formatTimer(best)}`);
            if (showAverage && average > 0) {
                parts.push(`AVG ${formatTimer(average)} • ${timerHistory(this).length}`);
            }
            const meta = parts.join("  ");
            const metaFont = Math.max(
                7,
                Math.min(28, height * .12, width / Math.max(6, meta.length * .58)),
            );
            const naturalMetaY = timeY + mainFont * .58 + metaFont * .72;
            const metaY = Math.min(
                height - inset - metaFont * .58,
                naturalMetaY,
            );
            ctx.font = `700 ${metaFont}px ui-sans-serif,system-ui`;
            ctx.fillStyle = String(timerSetting(this, "statusColor"));
            ctx.fillText(meta, width / 2, metaY);
        }

        ctx.restore();
        return result;
    };

    const previousEnter = node.onMouseEnter;
    node.onMouseEnter = function (...args) {
        this.__novaTimerHover = true;
        dirty(this);
        return previousEnter?.apply(this, args);
    };

    const previousLeave = node.onMouseLeave;
    node.onMouseLeave = function (...args) {
        this.__novaTimerHover = false;
        dirty(this);
        return previousLeave?.apply(this, args);
    };

    const previousMouseDown = node.onMouseDown;
    node.onMouseDown = function (event, pos, graphCanvas) {
        const hit = this.__novaTimerCogHit;
        const x = Number(pos?.[0] ?? -1);
        const y = Number(pos?.[1] ?? -1);
        if (
            hit
            && x >= hit.x && x <= hit.x + hit.width
            && y >= hit.y && y <= hit.y + hit.height
        ) {
            showTimerSettings(this);
            event?.preventDefault?.();
            event?.stopPropagation?.();
            return true;
        }
        return previousMouseDown?.apply(this, arguments);
    };

    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        applyTimerVisualState(this);
        if (globalThis.LiteGraph?.vueNodesMode) tagTimerHost(this);
        this.__novaTimerRefresh?.();
        if (this.__novaTimerHost) {
            this.__novaTimerHost.style.setProperty(
                "--nova-timer-radius",
                `${clamp(timerSetting(this, "cornerRadius"), 0, 80)}px`,
            );
        }
        return result;
    };

    installTimerDOM(node);

    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        timerNodes.delete(this);
        uninstallTimerEventsIfUnused();
        stopCountdownInterval(this);
        this.__novaTimerDOMController?.abort?.();
        clearInterval(this.__novaTimerMountInterval || 0);
        this.__novaTimerMarker = null;
        this.__novaTimerHost?.classList?.remove(
            "nova-timer-surface-v318",
            "nova-timer-host-v397",
        );
        previousRemoved?.apply(this, arguments);
    };

    dirty(node);
}

// ---------------------------------------------------------------------------
// NovoLoko Text Display Pro — selectable when selected, drag-scroll when not
// ---------------------------------------------------------------------------
const TEXT_DISPLAY_DEFAULTS = Object.freeze({
    backgroundColor: "#03060a",
    textColor: "#d7e2ee",
    fontFamily: "Monospace",
    fontSize: 0,
    fontWeight: "Normal",
    lineSpacing: 1.38,
    textAlign: "Left",
    wrapText: true,
});

const TEXT_DISPLAY_FONTS = Object.freeze({
    Monospace: "ui-monospace,SFMono-Regular,Consolas,monospace",
    System: "Inter,Segoe UI,Arial,sans-serif",
    Serif: "Georgia,Times New Roman,serif",
});

const TEXT_DISPLAY_WEIGHTS = Object.freeze({
    Normal: "400",
    Medium: "600",
    Bold: "700",
});

function textDisplaySetting(node, key) {
    const value = node?.properties?.[`novaText_${key}`];
    return value ?? TEXT_DISPLAY_DEFAULTS[key];
}

function textDisplayFont(node) {
    const name = String(textDisplaySetting(node, "fontFamily") || "Monospace");
    return TEXT_DISPLAY_FONTS[name] || TEXT_DISPLAY_FONTS.Monospace;
}

function textDisplayWeight(node) {
    const name = String(textDisplaySetting(node, "fontWeight") || "Normal");
    return TEXT_DISPLAY_WEIGHTS[name] || TEXT_DISPLAY_WEIGHTS.Normal;
}

function textDisplayFontSize(node, width) {
    const saved = Number(textDisplaySetting(node, "fontSize"));
    return saved > 0
        ? clamp(saved, 8, 36)
        : Math.max(8, Math.min(18, Number(width || 320) / 42));
}

function textDisplayLineSpacing(node) {
    return clamp(textDisplaySetting(node, "lineSpacing"), 1, 2.2);
}

function normaliseTextDisplayProperties(node) {
    node.properties ||= {};
    for (const [key, value] of Object.entries(TEXT_DISPLAY_DEFAULTS)) {
        node.properties[`novaText_${key}`] ??= value;
    }
}

function showTextDisplaySettings(node) {
    normaliseTextDisplayProperties(node);

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);font:13px system-ui;color:#eaf4ff";
    const panel = document.createElement("div");
    panel.style.cssText = "width:min(620px,94vw);max-height:90vh;overflow:auto;padding:16px;border-radius:14px;background:#101925;border:1px solid #345774;box-shadow:0 20px 70px rgba(0,0,0,.6)";
    const heading = document.createElement("h3");
    heading.textContent = "NovoLoko Text Display — settings";
    heading.style.margin = "0 0 12px";

    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px";
    const field = (label, input) => {
        const wrapper = document.createElement("label");
        wrapper.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px";
        const span = document.createElement("span");
        span.textContent = label;
        wrapper.append(span, input);
        return wrapper;
    };
    const select = (values, selected) => {
        const input = document.createElement("select");
        input.style.cssText = "min-width:150px;padding:5px;background:#08101a;color:#eaf4ff;border:1px solid #456985;border-radius:6px";
        for (const value of values) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            input.append(option);
        }
        input.value = selected;
        return input;
    };

    const background = colourInput("Background", String(textDisplaySetting(node, "backgroundColor")));
    const textColor = colourInput("Text colour", String(textDisplaySetting(node, "textColor")));
    const font = select(Object.keys(TEXT_DISPLAY_FONTS), String(textDisplaySetting(node, "fontFamily")));
    const weight = select(Object.keys(TEXT_DISPLAY_WEIGHTS), String(textDisplaySetting(node, "fontWeight")));
    const alignment = select(["Left", "Center", "Right"], String(textDisplaySetting(node, "textAlign")));
    const counterMode = select(TEXT_COUNTER_MODES, normaliseTextCounterMode(node.properties.novaTextCounterMode));

    const fontSize = document.createElement("input");
    fontSize.type = "number";
    fontSize.min = "0";
    fontSize.max = "36";
    fontSize.step = "1";
    fontSize.value = String(textDisplaySetting(node, "fontSize"));
    fontSize.title = "Use 0 for automatic sizing";
    fontSize.style.width = "90px";

    const lineSpacing = document.createElement("input");
    lineSpacing.type = "number";
    lineSpacing.min = "1";
    lineSpacing.max = "2.2";
    lineSpacing.step = "0.05";
    lineSpacing.value = String(textDisplaySetting(node, "lineSpacing"));
    lineSpacing.style.width = "90px";

    const wrapText = document.createElement("input");
    wrapText.type = "checkbox";
    wrapText.checked = Boolean(textDisplaySetting(node, "wrapText"));

    grid.append(
        background.wrapper,
        textColor.wrapper,
        field("Font", font),
        field("Font weight", weight),
        field("Font size (0 = Auto)", fontSize),
        field("Line spacing", lineSpacing),
        field("Text alignment", alignment),
        field("Word wrap", wrapText),
        field("Text counter", counterMode),
    );

    const note = document.createElement("div");
    note.textContent = "Settings are saved with this node in the workflow and apply in both Legacy and Nodes 2.0.";
    note.style.cssText = "margin-top:12px;padding:8px 10px;border-radius:7px;background:#08101a;color:#b9cee1";

    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:14px";
    const makeButton = (label) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.style.cssText = "padding:7px 12px;border-radius:7px;border:1px solid #456985;background:#18314a;color:#fff;cursor:pointer";
        return button;
    };
    const reset = makeButton("Reset defaults");
    const cancel = makeButton("Cancel");
    const save = makeButton("Save");
    const close = () => overlay.remove();

    cancel.onclick = close;
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) close();
    });
    reset.onclick = () => {
        for (const [key, value] of Object.entries(TEXT_DISPLAY_DEFAULTS)) {
            node.properties[`novaText_${key}`] = value;
        }
        node.properties.novaTextCounterMode = "Words + Characters";
        node.__novaTextDisplayRefresh?.();
        dirty(node);
        close();
    };
    save.onclick = () => {
        node.properties.novaText_backgroundColor = background.input.value;
        node.properties.novaText_textColor = textColor.input.value;
        node.properties.novaText_fontFamily = font.value;
        node.properties.novaText_fontWeight = weight.value;
        node.properties.novaText_fontSize = Number(fontSize.value) > 0
            ? clamp(fontSize.value, 8, 36)
            : 0;
        node.properties.novaText_lineSpacing = clamp(lineSpacing.value, 1, 2.2);
        node.properties.novaText_textAlign = alignment.value;
        node.properties.novaText_wrapText = wrapText.checked;
        node.properties.novaTextCounterMode = normaliseTextCounterMode(counterMode.value);
        node.__novaTextDisplayRefresh?.();
        dirty(node);
        close();
    };

    buttons.append(reset, cancel, save);
    panel.append(heading, grid, note, buttons);
    overlay.append(panel);
    document.body.append(overlay);
}

function wrapCanvasText(ctx, text, maxWidth) {
    const output = [];
    const paragraphs = String(text || "").replace(/\r\n?/g, "\n").split("\n");

    for (const paragraph of paragraphs) {
        if (!paragraph) {
            output.push("");
            continue;
        }

        const words = paragraph.split(/\s+/);
        let line = "";
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(candidate).width > maxWidth) {
                output.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        output.push(line);
    }
    return output;
}

function textDisplayCounterLabel(node, boxWidth) {
    return textDisplayCounterSummary(
        node?.__novaDisplayText || "",
        node?.properties?.novaTextCounterMode,
        boxWidth,
    );
}

function textDisplayScale() {
    return Math.max(.05, Number(app.canvas?.ds?.scale || 1));
}

function installTextDisplayDOM(node) {
    if (
        typeof node?.addDOMWidget !== "function"
        || node.__novaTextDisplayDOMInstalled
    ) return;

    node.__novaTextDisplayDOMInstalled = true;
    const controller = new AbortController();
    node.__novaTextDisplayDOMController = controller;

    const root = document.createElement("section");
    root.className = "nova-text-display-nodes2-v396";
    root.style.cssText = [
        "position:relative",
        "width:100%",
        "height:100%",
        "min-width:0",
        "min-height:0",
        "flex:1 1 0",
        "overflow:hidden",
        "box-sizing:border-box",
        "border:1px solid rgba(92,159,208,.72)",
        "border-radius:7px",
        "box-shadow:inset 0 0 0 2px rgba(210,232,250,.20)",
        "background:#03060a",
        "color:#d7e2ee",
        "font:12px/1.38 ui-monospace,SFMono-Regular,Consolas,monospace",
        "pointer-events:auto",
    ].join(";");
    root.style.setProperty("display", "block", "important");
    root.style.setProperty("visibility", "visible", "important");
    root.style.setProperty("opacity", "1", "important");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "COPY";
    copy.style.cssText = [
        "position:absolute",
        "z-index:2",
        "top:6px",
        "right:7px",
        "min-width:45px",
        "height:20px",
        "padding:2px 7px",
        "border:1px solid rgba(180,215,240,.38)",
        "border-radius:5px",
        "background:rgba(42,72,98,.92)",
        "color:#f3f8ff",
        "font:700 10px/1 system-ui",
        "cursor:pointer",
    ].join(";");

    const content = document.createElement("pre");
    node.__novaTextDisplayContent = content;
    content.tabIndex = 0;
    content.style.cssText = [
        "position:absolute",
        "inset:2px",
        "min-height:0",
        "margin:0",
        "padding:7px 8px 8px",
        "overflow-x:auto",
        "overflow-y:scroll",
        "scrollbar-gutter:stable",
        "scrollbar-color:rgba(190,220,245,.72) rgba(255,255,255,.12)",
        "box-sizing:border-box",
        "white-space:pre-wrap",
        "overflow-wrap:anywhere",
        "user-select:text",
        "cursor:text",
        "color:#d7e2ee",
        "background:#03060a",
        "font:inherit",
    ].join(";");

    // The selected/focused display owns wheel input only over its text. An
    // unselected display deliberately lets the event reach normal canvas
    // navigation. Middle mouse is never captured here.
    const textOwnsWheel = () => (
        nodeSelected(node)
        || document.activeElement === content
        || content.contains(document.activeElement)
    );
    installLegacyGraphNavigation(root, { nativeWheelWhen: textOwnsWheel });
    content.addEventListener("wheel", (event) => {
        if (!textOwnsWheel()) return;
        // Explicit scrolling avoids renderer/browser differences where a DOM
        // widget consumes the event before <pre> performs its native scroll.
        // The unselected path returns untouched so ComfyUI keeps normal canvas
        // zoom/navigation, and middle-button pointer events remain separate.
        const delta = event.deltaMode === 1
            ? event.deltaY * 18
            : event.deltaMode === 2
                ? event.deltaY * Math.max(1, content.clientHeight)
                : event.deltaY;
        content.scrollTop += delta;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
    }, { passive: false, signal: controller.signal });
    content.addEventListener("pointerdown", (event) => {
        if (event.button === 0) content.focus({ preventScroll: true });
    }, { signal: controller.signal });

    const counter = document.createElement("footer");
    counter.style.cssText = [
        "position:absolute",
        "z-index:2",
        "right:7px",
        "bottom:6px",
        "min-height:20px",
        "max-width:calc(100% - 18px)",
        "padding:3px 8px",
        "box-sizing:border-box",
        "overflow:hidden",
        "border:1px solid rgba(122,184,226,.46)",
        "border-radius:6px",
        "background:rgba(15,31,45,.94)",
        "color:#bcd7ea",
        "white-space:nowrap",
        "text-overflow:ellipsis",
        "text-align:right",
        "font:700 10px/1.3 system-ui",
        "pointer-events:none",
    ].join(";");
    root.append(content, copy, counter);

    const refresh = () => {
        const value = String(node.__novaDisplayText || "");
        const width = Math.max(1, root.clientWidth || node.size?.[0] || 320);
        const height = Math.max(1, root.clientHeight || node.size?.[1] || 180);
        const fontSize = textDisplayFontSize(node, width);
        const fontFamily = textDisplayFont(node);
        const fontWeight = textDisplayWeight(node);
        const lineSpacing = textDisplayLineSpacing(node);
        const textAlign = String(textDisplaySetting(node, "textAlign") || "Left").toLowerCase();
        const wrapText = Boolean(textDisplaySetting(node, "wrapText"));
        const backgroundColor = String(textDisplaySetting(node, "backgroundColor"));
        const textColor = String(textDisplaySetting(node, "textColor"));
        const copyVisible = width >= 120 && height >= 34;
        const counterLabel = textDisplayCounterSummary(
            value,
            node.properties?.novaTextCounterMode,
            width,
        );
        const counterVisible = Boolean(counterLabel) && width >= 100 && height >= 48;

        const priorScroll = content.scrollTop;
        if (content.textContent !== value) content.textContent = value;
        root.style.background = backgroundColor;
        root.style.color = textColor;
        root.style.fontFamily = fontFamily;
        root.style.fontWeight = fontWeight;
        root.style.lineHeight = String(lineSpacing);
        content.style.background = backgroundColor;
        content.style.color = textColor;
        content.style.fontFamily = fontFamily;
        content.style.fontWeight = fontWeight;
        content.style.fontSize = `${fontSize}px`;
        content.style.lineHeight = String(lineSpacing);
        content.style.textAlign = ["left", "center", "right"].includes(textAlign)
            ? textAlign
            : "left";
        content.style.whiteSpace = wrapText ? "pre-wrap" : "pre";
        content.style.overflowWrap = wrapText ? "anywhere" : "normal";
        content.style.paddingTop = copyVisible ? "39px" : "7px";
        content.style.paddingBottom = counterVisible ? "38px" : "8px";
        copy.style.display = copyVisible ? "block" : "none";
        counter.textContent = counterLabel;
        counter.style.display = counterVisible ? "block" : "none";
        if (content.scrollTop !== priorScroll) content.scrollTop = priorScroll;
        root.style.borderColor = nodeSelected(node)
            ? "rgba(124,202,255,.96)"
            : "rgba(92,159,208,.72)";
    };
    node.__novaTextDisplayRefresh = refresh;

    copy.addEventListener("click", async () => {
        await node.__novaTextDisplayCopyText?.();
        copy.textContent = "COPIED";
        copy.style.background = "rgba(84,190,132,.88)";
        setTimeout(() => {
            copy.textContent = "COPY";
            copy.style.background = "rgba(42,72,98,.92)";
        }, 1200);
    }, { signal: controller.signal });

    root.addEventListener("pointerdown", (event) => {
        if (event.button === 1) {
            if (!globalThis.LiteGraph?.vueNodesMode) {
                event.preventDefault();
                event.stopPropagation();
                app.canvas?.processMouseDown?.(event);
            }
            return;
        }
        app.canvas?.selectNode?.(node);
        app.canvas?.bringToFront?.(node);
        event.stopPropagation();
    }, { signal: controller.signal });

    root.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        node.__novaTextDisplaySelectedText = String(
            globalThis.getSelection?.()?.toString?.() || "",
        );
        app.canvas?.selectNode?.(node);
        app.canvas?.bringToFront?.(node);
        app.canvas?.processContextMenu?.(node, event);
    }, { signal: controller.signal });

    for (const eventName of ["pointermove", "pointerup"]) {
        root.addEventListener(eventName, (event) => {
            if (event.button === 1 || (Number(event.buttons || 0) & 4) !== 0) {
                if (!globalThis.LiteGraph?.vueNodesMode) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (eventName === "pointermove") {
                        app.canvas?.processMouseMove?.(event);
                    } else {
                        app.canvas?.processMouseUp?.(event);
                    }
                }
                return;
            }
            event.stopPropagation();
        }, {
            signal: controller.signal,
        });
    }
    for (const eventName of ["keydown", "keyup"]) {
        root.addEventListener(eventName, (event) => event.stopPropagation(), {
            signal: controller.signal,
        });
    }
    const dom = node.addDOMWidget(
        "nova_text_display_nodes2_v396",
        "NOVA_TEXT_DISPLAY_NODES2",
        root,
        {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => 1,
            getHeight: () => Math.max(1, Number(node.size?.[1] || 180) - 52),
            selectOn: ["focus", "click"],
            afterResize: () => requestAnimationFrame(refresh),
        },
    );
    dom.serialize = false;
    dom.options.serialize = false;
    node.__novaTextDisplayUsesDOM = true;

    let lastNodes2Mode = null;
    const syncRendererMode = () => {
        const nodes2 = Boolean(globalThis.LiteGraph?.vueNodesMode);
        if (lastNodes2Mode === nodes2) return;
        lastNodes2Mode = nodes2;
        // The DOM panel is now the single implementation for both renderers,
        // keeping Legacy behaviour identical to Nodes 2.0.
        dom.hidden = false;
        root.style.pointerEvents = "auto";
        refresh();
        dirty(node);
    };
    node.__novaTextDisplayModeInterval = setInterval(syncRendererMode, 250);

    const observer = new ResizeObserver(refresh);
    observer.observe(root);
    node.__novaTextDisplayDOMObserver = observer;

    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        controller.abort();
        observer.disconnect();
        clearInterval(node.__novaTextDisplayModeInterval || 0);
        previousRemoved?.apply(this, arguments);
    };

    requestAnimationFrame(syncRendererMode);
}

function installTextDisplay(node) {
    if (node.__novaTextDisplayInstalled) return;
    node.__novaTextDisplayInstalled = true;
    node.properties ||= {};
    normaliseTextDisplayProperties(node);
    node.properties.novaTextCounterMode = normaliseTextCounterMode(
        node.properties.novaTextCounterMode,
    );
    node.min_size = [110, 80];
    node.getMinSize = () => [110, 80];
    node.__novaDisplayText = restoreTextDisplayText(node.properties);
    node.__novaDisplayScroll = 0;
    node.__novaDisplayLines = [];
    node.__novaCopyFeedbackUntil = 0;
    node.__novaCopyHit = null;
    node.__novaDisplayMaxScroll = 0;
    node.__novaTextDisplayCopyText = async () => {
        const value = String(node.__novaDisplayText || "");
        try {
            await navigator.clipboard.writeText(value);
        } catch (_) {
            const area = document.createElement("textarea");
            area.value = value;
            area.style.cssText = "position:fixed;left:-9999px;top:-9999px";
            document.body.append(area);
            area.select();
            document.execCommand("copy");
            area.remove();
        }
        node.__novaCopyFeedbackUntil = Date.now() + 1200;
        node.__novaTextDisplayRefresh?.();
        dirty(node);
        setTimeout(() => {
            node.__novaTextDisplayRefresh?.();
            dirty(node);
        }, 1250);
    };
    node.__novaTextDisplayCopySelectedText = async () => {
        const value = String(node.__novaTextDisplaySelectedText || "");
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
        } catch (_) {
            const area = document.createElement("textarea");
            area.value = value;
            area.style.cssText = "position:fixed;left:-9999px;top:-9999px";
            document.body.append(area);
            area.select();
            document.execCommand("copy");
            area.remove();
        }
    };
    const previousExtraMenuOptions = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_canvas, options) {
        const result = previousExtraMenuOptions?.apply(this, arguments);
        const menu = Array.isArray(options) ? options : [];
        menu.unshift(
            {
                content: "Text Display settings…",
                callback: () => showTextDisplaySettings(this),
            },
            {
                content: "Copy text",
                callback: () => Promise.resolve(this.__novaTextDisplayCopyText?.())
                    .catch((error) => console.warn("[NovoLoko] Copy text failed:", error)),
            },
            {
                content: "Copy selected text",
                disabled: !String(this.__novaTextDisplaySelectedText || ""),
                callback: () => Promise.resolve(this.__novaTextDisplayCopySelectedText?.())
                    .catch((error) => console.warn("[NovoLoko] Copy selected text failed:", error)),
            },
            null,
        );
        return result;
    };
    installTextDisplayDOM(node);

    const draw = node.onDrawForeground;
    node.onDrawForeground = function (ctx) {
        draw?.apply(this, arguments);
        if (this.__novaTextDisplayUsesDOM) return;
        if (!ctx) return;

        const width = Math.max(1, Number(this.size?.[0] || 320));
        const height = Math.max(1, Number(this.size?.[1] || 180));
        const top = 48;
        const margin = 7;
        const boxX = margin;
        const boxY = top;
        const boxW = Math.max(10, width - margin * 2);
        const boxH = Math.max(10, height - top - margin);
        const fontSize = textDisplayFontSize(this, boxW);
        const fontFamily = textDisplayFont(this);
        const fontWeight = textDisplayWeight(this);
        const lineHeight = fontSize * textDisplayLineSpacing(this);
        const textAlign = String(textDisplaySetting(this, "textAlign") || "Left").toLowerCase();
        const wrapText = Boolean(textDisplaySetting(this, "wrapText"));

        ctx.save();

        // Reset shared-canvas state before drawing the output panel.
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.setLineDash?.([]);

        const graphScale = textDisplayScale();
        const outerLine = clamp(1.35 / graphScale, .35, 4.6);
        const selected = nodeSelected(this);
        const radius = clamp(Math.min(boxW, boxH) * .025, 4, 10);

        // Solid black background with a border that remains visible at any zoom.
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, radius);
        else ctx.rect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = String(textDisplaySetting(this, "backgroundColor"));
        ctx.fill();
        ctx.strokeStyle = selected
            ? "rgba(124,202,255,.96)"
            : "rgba(92,159,208,.72)";
        ctx.lineWidth = outerLine;
        ctx.stroke();

        const innerInset = Math.max(1.2, outerLine * .78);
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(
                boxX + innerInset,
                boxY + innerInset,
                Math.max(1, boxW - innerInset * 2),
                Math.max(1, boxH - innerInset * 2),
                Math.max(2, radius - innerInset),
            );
        } else {
            ctx.rect(
                boxX + innerInset,
                boxY + innerInset,
                Math.max(1, boxW - innerInset * 2),
                Math.max(1, boxH - innerInset * 2),
            );
        }
        ctx.strokeStyle = "rgba(210,232,250,.20)";
        ctx.lineWidth = Math.max(.28, outerLine * .42);
        ctx.stroke();

        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(
                boxX + innerInset,
                boxY + innerInset,
                Math.max(1, boxW - innerInset * 2),
                Math.max(1, boxH - innerInset * 2),
                Math.max(2, radius - innerInset),
            );
        } else {
            ctx.rect(
                boxX + innerInset,
                boxY + innerInset,
                Math.max(1, boxW - innerInset * 2),
                Math.max(1, boxH - innerInset * 2),
            );
        }
        ctx.clip();

        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = String(textDisplaySetting(this, "textColor"));
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        const copyVisible = boxW >= 120 && boxH >= 34;
        const copyLabel = Date.now() < Number(this.__novaCopyFeedbackUntil || 0)
            ? "COPIED"
            : "COPY";
        const copyFont = Math.max(8, Math.min(12, fontSize * .82));
        ctx.font = `700 ${copyFont}px ui-sans-serif,system-ui`;
        const copyW = copyVisible
            ? Math.max(42, ctx.measureText(copyLabel).width + 16)
            : 0;
        const copyH = copyVisible ? Math.max(20, copyFont + 9) : 0;
        const copyX = boxX + boxW - copyW - 7;
        const copyY = boxY + 6;

        if (copyVisible) {
            this.__novaCopyHit = { x: copyX, y: copyY, width: copyW, height: copyH };
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(copyX, copyY, copyW, copyH, 5);
            else ctx.rect(copyX, copyY, copyW, copyH);
            ctx.fillStyle = Date.now() < Number(this.__novaCopyFeedbackUntil || 0)
                ? "rgba(84,190,132,.88)"
                : "rgba(42,72,98,.92)";
            ctx.fill();
            ctx.strokeStyle = "rgba(180,215,240,.38)";
            ctx.stroke();
            ctx.fillStyle = "#f3f8ff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(copyLabel, copyX + copyW / 2, copyY + copyH / 2 + .5);
        } else {
            this.__novaCopyHit = null;
        }

        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = ["left", "center", "right"].includes(textAlign)
            ? textAlign
            : "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = String(textDisplaySetting(this, "textColor"));
        const firstLineReserve = copyVisible ? copyW + 12 : 0;
        const lines = wrapText
            ? wrapCanvasText(
                ctx,
                this.__novaDisplayText,
                Math.max(10, boxW - 16 - firstLineReserve),
            )
            : String(this.__novaDisplayText || "").replace(/\r\n?/g, "\n").split("\n");
        this.__novaDisplayLines = lines;

        const counterLabel = textDisplayCounterLabel(this, boxW);
        const counterVisible = Boolean(counterLabel) && boxW >= 100 && boxH >= 48;
        const counterFont = Math.max(7, Math.min(12, fontSize * .78));
        const counterH = counterVisible ? Math.max(18, counterFont + 8) : 0;
        const topReserve = copyVisible ? copyH + 18 : 12;
        const bottomReserve = counterVisible ? counterH + 10 : 8;
        const visible = Math.max(
            1,
            Math.floor((boxH - topReserve - bottomReserve) / lineHeight),
        );
        const maxScroll = Math.max(0, lines.length - visible);
        this.__novaDisplayMaxScroll = maxScroll;
        this.__novaDisplayScroll = Math.max(0, Math.min(maxScroll, Number(this.__novaDisplayScroll || 0)));

        let y = boxY + (copyVisible ? copyH + 13 : 7);
        const textX = ctx.textAlign === "center"
            ? boxX + boxW / 2
            : ctx.textAlign === "right"
                ? boxX + boxW - 8
                : boxX + 8;
        for (let index = this.__novaDisplayScroll; index < lines.length && index < this.__novaDisplayScroll + visible; index += 1) {
            ctx.fillText(lines[index], textX, y);
            y += lineHeight;
        }

        if (counterVisible) {
            ctx.font = `700 ${counterFont}px ui-sans-serif,system-ui`;
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";
            const pillW = Math.min(
                boxW - 18,
                Math.max(58, ctx.measureText(counterLabel).width + 16),
            );
            const pillX = boxX + boxW - pillW - 7;
            const pillY = boxY + boxH - counterH - 6;

            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, counterH, 6);
            else ctx.rect(pillX, pillY, pillW, counterH);
            ctx.fillStyle = "rgba(15,31,45,.94)";
            ctx.fill();
            ctx.strokeStyle = "rgba(122,184,226,.46)";
            ctx.lineWidth = Math.max(.3, outerLine * .38);
            ctx.stroke();

            ctx.fillStyle = "#bcd7ea";
            ctx.fillText(
                counterLabel,
                pillX + pillW - 8,
                pillY + counterH / 2 + .25,
            );
        }

        if (maxScroll > 0) {
            const trackX = boxX + boxW - 5;
            const trackY = boxY + 5;
            const trackH = Math.max(
                12,
                boxH - 10 - (counterVisible ? counterH + 7 : 0),
            );
            const thumbH = Math.max(16, trackH * visible / Math.max(visible, lines.length));
            const thumbY = trackY + (trackH - thumbH) * this.__novaDisplayScroll / maxScroll;
            ctx.fillStyle = "rgba(255,255,255,.16)";
            ctx.fillRect(trackX, trackY, 2, trackH);
            ctx.fillStyle = "rgba(190,220,245,.72)";
            ctx.fillRect(trackX - 1, thumbY, 4, thumbH);
        }

        ctx.restore();
    };

    async function copyDisplayText(targetNode) {
        await targetNode.__novaTextDisplayCopyText?.();
    }

    const previousMouseDown = node.onMouseDown;
    node.onMouseDown = function (event, pos, graphCanvas) {
        if (event?.button === 1) return false;
        const hit = this.__novaCopyHit;
        const x = Number(pos?.[0] ?? -1);
        const y = Number(pos?.[1] ?? -1);
        if (
            hit
            && x >= hit.x && x <= hit.x + hit.width
            && y >= hit.y && y <= hit.y + hit.height
        ) {
            copyDisplayText(this);
            event?.preventDefault?.();
            event?.stopPropagation?.();
            return true;
        }
        return previousMouseDown?.apply(this, arguments);
    };

    const originalExecuted = node.onExecuted;
    node.onExecuted = function (message) {
        originalExecuted?.apply(this, arguments);
        const payload = message?.nova_text_display?.[0];
        if (!payload) return;
        this.__novaDisplayText = String(payload.text || "");
        this.properties ||= {};
        this.properties.novaDisplayLastText = this.__novaDisplayText;
        this.__novaDisplayScroll = 0;
        if (this.__novaTextDisplayContent) this.__novaTextDisplayContent.scrollTop = 0;
        this.__novaTextDisplayRefresh?.();
        dirty(this);
    };

    const originalConfigure = node.onConfigure;
    node.onConfigure = function () {
        const result = originalConfigure?.apply(this, arguments);
        this.__novaDisplayText = restoreTextDisplayText(
            this.properties,
            this.__novaDisplayText,
        );
        this.__novaDisplayScroll = 0;
        this.__novaTextDisplayRefresh?.();
        dirty(this);
        return result;
    };
}

// ---------------------------------------------------------------------------
// Prompt Enhancer option guide and first-load widget migration
// ---------------------------------------------------------------------------
const ENHANCER_GUIDE = `
Enabled
Off returns the raw idea unchanged.

Task Mode
This selects the model and prompt format being enhanced.
Auto detects MiniMax H3 Standard fields, Full Reference fields, or Director scene markers.
Krea2 / Image keeps the original NovoLoko image-enhancement behaviour and is the safe default for older AIO workflows.
Every H3 mode uses a dedicated MiniMax H3 video core and never includes the image core.

H3 Length Behavior
Preserve keeps the source prompt's length and detail and is recommended for H3.
Compact removes repetition without removing fields, references, timing, continuity, or audio.
Detailed adds useful production detail inside the existing H3 structure.

Preset
Faithful Rich Image preserves the concept while adding useful visual detail.
Edit Preserve changes only the requested details and protects the rest.
Cinematic strengthens shot size, lens character, blocking, lighting and atmosphere.
Product / Fashion prioritises materials, construction, logos and commercial finish.
Character Consistency protects face, hair, age, outfit, proportions and silhouette.
Custom follows the Custom Instructions field.

Length Preset
Very Short targets roughly 30–60 words.
Short targets roughly 60–110 words.
Concise targets roughly 80–160 words.
Rich targets roughly 150–320 words.
Maximum targets roughly 300–550 words.

Creativity
This is the sampling temperature. 0.45–0.75 is usually faithful. 0.8–1.1 is more inventive.
Very high values can wander, repeat or ignore details.

Max Length
This is the maximum token budget, not a word count. Around 700–1400 is plenty for most image prompts.

Seed
Controls the enhancer's text sampling. Reuse a seed for a similar rewrite.

Thinking
Allows supported models to reason internally before returning the final prompt.

Use Default Template
Uses the connected model's built-in chat formatting. Leave this on for Qwen/Krea2 unless the model says otherwise.

Image
Optional grounding reference. Visible details are preserved unless the raw idea asks to change them.

Custom Instructions
In Image mode, used only when Preset is Custom. In H3 mode, including H3 detected by Auto,
custom instructions are appended after the H3 preservation core so they supplement it.
Use Saved Custom Preset to apply a named instruction set. Save Current Custom stores the current text in this browser.
`.trim();

function showEnhancerGuide() {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62)";
    const panel = document.createElement("div");
    panel.style.cssText = "width:min(720px,92vw);max-height:86vh;overflow:auto;padding:16px;border-radius:14px;background:#101925;border:1px solid #345774;color:#eaf4ff;box-shadow:0 20px 70px rgba(0,0,0,.6)";
    const title = document.createElement("h3");
    title.textContent = "NovoLoko Prompt Enhancer Pro — option guide";
    title.style.margin = "0 0 10px";
    const pre = document.createElement("pre");
    pre.textContent = ENHANCER_GUIDE;
    pre.style.cssText = "white-space:pre-wrap;margin:0;font:12px/1.5 ui-monospace,Consolas,monospace;color:#d9e7f6";
    const close = document.createElement("button");
    close.textContent = "Close";
    close.style.cssText = "display:block;margin:14px 0 0 auto;padding:7px 13px;border-radius:7px;border:1px solid #456985;background:#18314a;color:#fff;cursor:pointer";
    close.onclick = () => overlay.remove();
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) overlay.remove();
    });
    panel.append(title, pre, close);
    overlay.append(panel);
    document.body.append(overlay);
}

const ENHANCER_SETTING_NAMES = [
    "enabled",
    "preset",
    "detail_level",
    "creativity",
    "max_length",
    "thinking",
    "use_default_template",
    "custom_instructions",
    "task_mode",
    "h3_length_behavior",
];

function sanitiseEnhancerWidgets(node) {
    const set = (name, fallback, validator) => {
        const item = widget(node, name);
        if (!item) return;
        if (!validator(item.value)) item.value = fallback;
    };
    refreshEnhancerChoices(node);
    normaliseEnhancerComboWidget(node, "preset", "Faithful Rich Image");
    normaliseEnhancerComboWidget(node, "detail_level", "Rich");
    normaliseEnhancerComboWidget(node, "task_mode", "Krea2 / Image");
    normaliseEnhancerComboWidget(node, "h3_length_behavior", "Preserve");
    set("enabled", true, (value) => typeof value === "boolean");
    set("preset", "Faithful Rich Image", (value) => ENHANCER_PRESETS.includes(String(value)));
    set("detail_level", "Rich", (value) => ENHANCER_LENGTHS.includes(String(value)));
    set("creativity", 0.65, (value) => Number.isFinite(Number(value)) && Number(value) >= .01 && Number(value) <= 2);
    set("max_length", 1200, (value) => Number.isFinite(Number(value)) && Number(value) >= 32 && Number(value) <= 32768);
    set("seed", 0, (value) => Number.isFinite(Number(value)) && Number(value) >= 0);
    set("thinking", true, (value) => typeof value === "boolean");
    set("use_default_template", true, (value) => typeof value === "boolean");
    set("task_mode", "Krea2 / Image", (value) => ENHANCER_TASK_MODES.includes(String(value)));
    set("h3_length_behavior", "Preserve", (value) => ENHANCER_H3_LENGTHS.includes(String(value)));
}

function snapshotEnhancerSettings(node) {
    node.properties ||= {};
    for (const [name, choices] of Object.entries(ENHANCER_COMBO_OPTIONS)) {
        const fallback = choices[0] || "";
        normaliseEnhancerComboWidget(node, name, fallback);
    }
    const settings = {};
    for (const name of ENHANCER_SETTING_NAMES) {
        const item = widget(node, name);
        if (!item) continue;
        settings[name] = item.value;
    }
    node.properties.novaEnhancerSettings = settings;
    if (ENHANCER_TASK_MODES.includes(String(settings.task_mode || ""))) {
        node.properties.novaEnhancerLastTaskMode = settings.task_mode;
    }
    dirty(node);
}

function restoreEnhancerSettings(node) {
    const settings = node.properties?.novaEnhancerSettings;
    const rememberedMode = String(node.properties?.novaEnhancerLastTaskMode || "");
    if ((!settings || typeof settings !== "object") && !ENHANCER_TASK_MODES.includes(rememberedMode)) {
        return false;
    }

    for (const name of ENHANCER_SETTING_NAMES) {
        if (!settings || !(name in settings)) continue;
        const item = widget(node, name);
        if (item) item.value = settings[name];
    }
    if (ENHANCER_TASK_MODES.includes(rememberedMode)) {
        const taskMode = widget(node, "task_mode");
        if (taskMode) taskMode.value = rememberedMode;
    }
    sanitiseEnhancerWidgets(node);
    dirty(node);
    return true;
}

function updateEnhancerCustomState(node) {
    const presetWidget = widget(node, "preset");
    const customWidget = widget(node, "custom_instructions");
    const detailWidget = widget(node, "detail_level");
    const taskModeWidget = widget(node, "task_mode");
    const h3LengthWidget = widget(node, "h3_length_behavior");
    if (!presetWidget || !customWidget) return;

    refreshEnhancerChoices(node);
    const presetValue = String(presetWidget.value || "");
    const taskMode = String(taskModeWidget?.value || "Krea2 / Image");
    const explicitH3 = taskMode.startsWith("MiniMax H3 ");
    const autoMode = taskMode === "Auto";
    const active = presetValue === "Custom" || explicitH3 || autoMode;
    const forcedLength = ENHANCER_PRESET_LENGTH[presetValue];
    if (explicitH3 && detailWidget) {
        detailWidget.disabled = true;
        detailWidget.label = "image length preset - not used in H3 mode";
    } else if (forcedLength && detailWidget) {
        detailWidget.value = forcedLength;
        detailWidget.disabled = true;
        detailWidget.label = `length preset - ${forcedLength} (preset controlled)`;
    } else if (detailWidget) {
        detailWidget.disabled = false;
        detailWidget.label = "length preset";
    }
    if (h3LengthWidget) {
        h3LengthWidget.disabled = taskMode === "Krea2 / Image";
        h3LengthWidget.label = taskMode === "Krea2 / Image"
            ? "H3 length behavior - not used in Image mode"
            : "H3 length behavior";
    }
    if (taskModeWidget) taskModeWidget.label = "target model / prompt format";
    const creativityWidget = widget(node, "creativity");
    if (creativityWidget) {
        creativityWidget.label = explicitH3 || autoMode
            ? "creativity (H3 recommended around 0.30)"
            : "creativity (Krea2 / Image)";
    }
    customWidget.disabled = !active;
    customWidget.label = autoMode && presetValue !== "Custom"
        ? "custom instructions - active only if Auto detects H3"
        : (active
            ? "custom instructions - ACTIVE"
            : "custom instructions - saved, Custom preset or H3 mode");

    if (customWidget.inputEl) {
        customWidget.inputEl.disabled = !active;
        customWidget.inputEl.style.setProperty(
            "--nova-panel-opacity-v325",
            active ? "1" : ".48",
        );
        customWidget.inputEl.style.filter = active ? "" : "grayscale(.35)";
        customWidget.inputEl.title = autoMode && presetValue !== "Custom"
            ? "Sent only when Auto detects an H3 prompt. Ignored when Auto resolves to Image."
            : (active
                ? "These instructions are being sent to the model."
                : "Saved but ignored unless Preset is Custom or an H3 mode is selected.");
    }

    dirty(node);
}

function loadEnhancerCustomPresets() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ENHANCER_CUSTOM_PRESETS_KEY) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([name, text]) => String(name).trim() && String(text).trim())
                .map(([name, text]) => [String(name).trim(), String(text)]),
        );
    } catch (error) {
        console.warn("[NovoLoko] Could not read Prompt Enhancer custom presets", error);
        return {};
    }
}

function saveEnhancerCustomPresets(presets) {
    try {
        localStorage.setItem(ENHANCER_CUSTOM_PRESETS_KEY, JSON.stringify(presets));
        return true;
    } catch (error) {
        console.error("[NovoLoko] Could not save Prompt Enhancer custom presets", error);
        window.alert("NovoLoko could not save this preset in browser storage.");
        return false;
    }
}

function refreshEnhancerSavedPresetWidget(node, selected = null) {
    const item = node.__novaEnhancerSavedPresetWidget;
    if (!item) return;
    const names = Object.keys(loadEnhancerCustomPresets()).sort((a, b) => a.localeCompare(b));
    setComboChoices(item, [ENHANCER_CUSTOM_PRESET_EMPTY, ...names]);
    const requested = selected ?? node.properties?.novaEnhancerSavedPresetName;
    item.value = names.includes(requested) ? requested : ENHANCER_CUSTOM_PRESET_EMPTY;
}

function applyEnhancerSavedPreset(node, name) {
    if (!name || name === ENHANCER_CUSTOM_PRESET_EMPTY) return;
    const text = loadEnhancerCustomPresets()[name];
    if (!text) {
        refreshEnhancerSavedPresetWidget(node);
        return;
    }
    const customWidget = widget(node, "custom_instructions");
    const presetWidget = widget(node, "preset");
    if (!customWidget || !presetWidget) return;
    customWidget.value = text;
    if (customWidget.inputEl) customWidget.inputEl.value = text;
    presetWidget.value = "Custom";
    node.properties.novaEnhancerSavedPresetName = name;
    snapshotEnhancerSettings(node);
    updateEnhancerCustomState(node);
}

function saveCurrentEnhancerCustomPreset(node) {
    const text = String(widget(node, "custom_instructions")?.value || "").trim();
    if (!text) {
        window.alert("Enter Custom Instructions before saving a preset.");
        return;
    }
    const current = String(node.__novaEnhancerSavedPresetWidget?.value || "");
    const suggested = current === ENHANCER_CUSTOM_PRESET_EMPTY ? "" : current;
    const entered = window.prompt("Name this NovoLoko Prompt Enhancer preset", suggested);
    const name = String(entered || "").trim();
    if (!name) return;
    const presets = loadEnhancerCustomPresets();
    if (presets[name] && !window.confirm(`Replace the saved preset "${name}"?`)) return;
    presets[name] = text;
    if (!saveEnhancerCustomPresets(presets)) return;
    node.properties.novaEnhancerSavedPresetName = name;
    refreshEnhancerSavedPresetWidget(node, name);
    applyEnhancerSavedPreset(node, name);
}

function deleteEnhancerCustomPreset(node) {
    const name = String(node.__novaEnhancerSavedPresetWidget?.value || "");
    if (!name || name === ENHANCER_CUSTOM_PRESET_EMPTY) return;
    if (!window.confirm(`Delete the saved Prompt Enhancer preset "${name}"?`)) return;
    const presets = loadEnhancerCustomPresets();
    delete presets[name];
    if (!saveEnhancerCustomPresets(presets)) return;
    node.properties.novaEnhancerSavedPresetName = "";
    refreshEnhancerSavedPresetWidget(node, ENHANCER_CUSTOM_PRESET_EMPTY);
    dirty(node);
}

function installEnhancerGuide(node) {
    if (node.__novaEnhancerGuideInstalled) return;
    node.__novaEnhancerGuideInstalled = true;
    node.properties ||= {};

    let savedPreset = null;
    savedPreset = node.addWidget?.(
        "combo",
        "saved custom preset",
        ENHANCER_CUSTOM_PRESET_EMPTY,
        (value) => {
            const choices = savedPreset?.options?.values || [ENHANCER_CUSTOM_PRESET_EMPTY];
            const resolved = resolveComboChoice(value, choices, ENHANCER_CUSTOM_PRESET_EMPTY);
            if (savedPreset) savedPreset.value = resolved;
            applyEnhancerSavedPreset(node, resolved);
        },
        { values: [ENHANCER_CUSTOM_PRESET_EMPTY] },
    );
    if (savedPreset) {
        savedPreset.serialize = false;
        node.__novaEnhancerSavedPresetWidget = savedPreset;
        refreshEnhancerSavedPresetWidget(node);
    }
    const savePreset = node.addWidget?.(
        "button",
        "Save Current Custom",
        null,
        () => saveCurrentEnhancerCustomPreset(node),
    );
    if (savePreset) savePreset.serialize = false;
    const deletePreset = node.addWidget?.(
        "button",
        "Delete Saved Custom",
        null,
        () => deleteEnhancerCustomPreset(node),
    );
    if (deletePreset) deletePreset.serialize = false;

    const guide = node.addWidget?.("button", "ⓘ Option guide", null, () => showEnhancerGuide());
    if (guide) guide.serialize = false;

    for (const name of ENHANCER_SETTING_NAMES) {
        const item = widget(node, name);
        if (!item || item.__novaPersistenceWrapped) continue;

        const previousCallback = item.callback;
        item.callback = function (...args) {
            const result = previousCallback?.apply(this, args);
            queueMicrotask(() => {
                if (ENHANCER_COMBO_OPTIONS[name]) {
                    normaliseEnhancerComboWidget(
                        node,
                        name,
                        ENHANCER_COMBO_OPTIONS[name][0] || "",
                    );
                }
                snapshotEnhancerSettings(node);
                if (name === "task_mode") {
                    const mode = String(widget(node, "task_mode")?.value || "");
                    const creativity = widget(node, "creativity");
                    const maxLength = widget(node, "max_length");
                    if (mode.startsWith("MiniMax H3 ")) {
                        if (Number(creativity?.value) === 0.65) creativity.value = 0.3;
                        if (Number(maxLength?.value) === 1200) maxLength.value = 4000;
                    } else if (mode === "Krea2 / Image") {
                        if (Number(creativity?.value) === 0.3) creativity.value = 0.65;
                        if (Number(maxLength?.value) === 4000) maxLength.value = 1200;
                    }
                    snapshotEnhancerSettings(node);
                }
                if (name === "preset" || name === "task_mode") updateEnhancerCustomState(node);
            });
            return result;
        };
        item.__novaPersistenceWrapped = true;

        if (item.inputEl && !item.inputEl.__novaEnhancerPersistenceBound) {
            const save = () => {
                item.value = item.inputEl.value;
                snapshotEnhancerSettings(node);
            };
            item.inputEl.addEventListener("input", save);
            item.inputEl.addEventListener("change", save);
            item.inputEl.__novaEnhancerPersistenceBound = true;
        }
    }

    const originalConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        const result = originalConfigure?.apply(this, args);
        setTimeout(() => {
            sanitiseEnhancerWidgets(this);
            if (!restoreEnhancerSettings(this)) {
                snapshotEnhancerSettings(this);
            }
            updateEnhancerCustomState(this);
            refreshEnhancerSavedPresetWidget(this);
        }, 80);
        return result;
    };

    setTimeout(() => {
        sanitiseEnhancerWidgets(node);
        if (!restoreEnhancerSettings(node)) {
            snapshotEnhancerSettings(node);
        }
        updateEnhancerCustomState(node);
        refreshEnhancerSavedPresetWidget(node);
    }, 250);
}


app.registerExtension({
    name: EXTENSION_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const name = nodeData?.name;

        if (LEGACY_CONNECTED_TEXT_WIDGETS.has(name)) {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(
                    this,
                    `${name} Legacy connected text panel`,
                    installLegacyConnectedTextWidgetRepair,
                );
            };
        }

        if (name === ENHANCER_NODE) {
            replaceNodeDataCombo(nodeData, "preset", ENHANCER_PRESETS);
            replaceNodeDataCombo(nodeData, "detail_level", ENHANCER_LENGTHS);
            replaceNodeDataCombo(nodeData, "task_mode", ENHANCER_TASK_MODES);
            replaceNodeDataCombo(nodeData, "h3_length_behavior", ENHANCER_H3_LENGTHS);
        }

        if (name === CONCAT_NODE) {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, "Text Concatenate", installDynamicConcat);
            };
        }

        if (name === SEED_NODE) {
            nodeType.min_size = [235, 145];
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, "Seed Lab", installSeedLab);
            };
        }

        if (name === CONTROL_NODE) {
            nodeType.min_size = [235, 92];
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, "Control Panel", installControlPanel);
            };
        }

        if (name === TIMER_NODE) {
            // Set title-less mode once on the registered TYPE. Do not delete or
            // mutate nodeData package metadata: ComfyUI Desktop still consumes it.
            const LG = globalThis.LiteGraph || {};
            nodeType.title_mode = LG.NO_TITLE ?? 1;
            nodeType.min_size = [260, 150];

            if (!nodeType.prototype.__novaTimerTypePatched) {
                nodeType.prototype.__novaTimerTypePatched = true;

                const originalConfigure = nodeType.prototype.onConfigure;
                nodeType.prototype.onConfigure = function (...args) {
                    const result = originalConfigure?.apply(this, args);
                    this.flags ||= {};
                    this.flags.no_title = true;
                    restoreTimerNodeState(this);
                    if (globalThis.LiteGraph?.vueNodesMode) {
                        setTimeout(() => tagTimerHost(this), 0);
                    }
                    dirty(this);
                    return result;
                };
            }
        }

        if (name === DISPLAY_NODE) {
            nodeType.min_size = [125, 80];
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, "Text Display", installTextDisplay);
            };
        }

        if (MUSIC_WRITER_DEFAULTS[name]) {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, `${name} widget migration`, installMusicWriterWidgetMigration);
            };
        }

        if (name === ENHANCER_NODE) {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, "Prompt Enhancer", installEnhancerGuide);
                safeInstall(this, "Prompt Enhancer text panels", installNativeTextPanelRepair);
            };
        } else if (isNovaNodeName(name)) {
            const created = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                created?.apply(this, arguments);
                safeInstall(this, `${name} text panels`, installNativeTextPanelRepair);
            };
        }
    },

    nodeCreated(node) {
        const nodeName = node?.comfyClass || node?.type;
        if (LEGACY_CONNECTED_TEXT_WIDGETS.has(nodeName)) {
            safeInstall(
                node,
                `${nodeName} Legacy connected text panel`,
                installLegacyConnectedTextWidgetRepair,
            );
        }
        if (isTimerNode(node)) {
            safeInstall(node, "Generation Timer", installTimerNode);
        }
        if (nodeName === DISPLAY_NODE) {
            safeInstall(node, "Text Display", installTextDisplay);
        }
        if (isNovaNodeName(nodeName)) {
            safeInstall(node, `${nodeName} text panels`, installNativeTextPanelRepair);
            if (widget(node, "seed")) installFocusedSeedWheelSupport();
        }
    },

    loadedGraphNode(node) {
        const nodeName = node?.comfyClass || node?.type;
        if (MUSIC_WRITER_DEFAULTS[nodeName]) {
            safeInstall(node, `${nodeName} loaded widget migration`, installMusicWriterWidgetMigration);
            for (const delay of [0, 100, 500]) {
                setTimeout(() => normaliseMusicWriterWidgets(node), delay);
            }
        }
        if (nodeName === DISPLAY_NODE) {
            safeInstall(node, "Loaded Text Display", installTextDisplay);
        }
        if (isNovaNodeName(nodeName) && widget(node, "seed")) {
            installFocusedSeedWheelSupport();
        }
    },

    getNodeMenuItems(node) {
        const nodeName = node?.comfyClass || node?.type;

        if (nodeName === DISPLAY_NODE) {
            node.properties ||= {};
            const mode = normaliseTextCounterMode(
                node.properties.novaTextCounterMode,
            );
            const option = (value) => ({
                content: `${mode === value ? "✓ " : ""}Text counter: ${value}`,
                callback: () => {
                    node.properties.novaTextCounterMode = value;
                    node.__novaTextDisplayRefresh?.();
                    dirty(node);
                },
            });
            return [
                null,
                {
                    content: "Text Display settings…",
                    callback: () => showTextDisplaySettings(node),
                },
                {
                    content: "Copy text",
                    callback: () => Promise.resolve(node.__novaTextDisplayCopyText?.())
                        .catch((error) => console.warn("[NovoLoko] Copy text failed:", error)),
                },
                {
                    content: "Copy selected text",
                    disabled: !String(node.__novaTextDisplaySelectedText || ""),
                    callback: () => Promise.resolve(node.__novaTextDisplayCopySelectedText?.())
                        .catch((error) => console.warn("[NovoLoko] Copy selected text failed:", error)),
                },
                option("Off"),
                option("Words"),
                option("Words + Characters"),
            ];
        }

        if (!isTimerNode(node)) return [];
        return [
            null,
            {
                content: "⏱ Timer settings…",
                callback: () => showTimerSettings(node),
            },
            {
                content: "▶ Test finish sound",
                callback: () => playTimerSound(node, "DONE"),
            },
            {
                content: "↺ Clear timer history",
                callback: () => {
                    node.properties ||= {};
                    node.properties.novaTimerHistory = [];
                    dirty(node);
                },
            },
        ];
    },
});
