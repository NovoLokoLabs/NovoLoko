import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_NAME = "NovaPromptStackAIO";
const SEARCH_HELP_TEXT = 'Search: word or "exact phrase" | Exclude: -word or -"exact phrase"';
const DEFAULT_MEDIUM = "csv/wildcards/novoloko_uploaded_styles_master_397_FINAL.csv";
const ALL_FOLDERS = "All folders";
const DEFAULT_PANEL_SIZE = "comfortable";
const PANEL_HEIGHTS = Object.freeze({
    compact: 450,
    comfortable: 520,
    roomy: 600,
});
const PANEL_MIN_HEIGHT = 320;
const PANEL_NODE_CHROME_HEIGHT = 300;
const PANEL_WIDGET_GAP = 10;
const LEGACY_SLOTS = [
    { key: "medium", label: "Medium", seedOffset: 0, selection: "random" },
    { key: "subject", label: "Subject", seedOffset: 6, selection: "none" },
    { key: "pose", label: "Pose", seedOffset: 1, selection: "random" },
    { key: "action", label: "Action", seedOffset: 2, selection: "random" },
    { key: "clothing", label: "Clothing", seedOffset: 3, selection: "random" },
    { key: "location", label: "Location", seedOffset: 4, selection: "random" },
    { key: "character", label: "Character", seedOffset: 5, selection: "random" },
];
const LEGACY_WIDGET_NAMES = LEGACY_SLOTS.flatMap(({ key }) => [
    `${key}_file_path`,
    `${key}_category`,
    `${key}_search`,
    `${key}_selection`,
]);

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function markDirty(node) {
    node.graph?.change?.();
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function cloneValue(value) {
    if (!value || typeof value !== "object") return value ?? null;
    return JSON.parse(JSON.stringify(value));
}

function unique(values) {
    const seen = new Set();
    return (values || []).filter((value) => {
        const text = String(value ?? "").trim();
        if (!text || seen.has(text)) return false;
        seen.add(text);
        return true;
    });
}

function makeId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `slot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function installCss() {
    if (document.getElementById("novoloko-dynamic-slots-css")) return;
    const style = document.createElement("style");
    style.id = "novoloko-dynamic-slots-css";
    style.textContent = `
        .novoloko-slot-panel{container-type:inline-size;height:520px;min-height:320px;overflow:hidden;display:flex;flex-direction:column;gap:7px;padding:8px;box-sizing:border-box;color:#edf5ff;background:#111923;border:1px solid #31506e;border-radius:9px;font:12px system-ui,sans-serif}
        .novoloko-slot-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .novoloko-slot-toolbar button,.novoloko-slot-toolbar select,.novoloko-slot-card button{border:1px solid #476780;border-radius:6px;background:#203246;color:#edf5ff;padding:5px 8px;cursor:pointer;font:600 11px system-ui}
        .novoloko-slot-toolbar button:hover,.novoloko-slot-card button:hover{background:#2b4864}
        .novoloko-slot-toolbar .novoloko-add-slot{background:#117f66;border-color:#21c89c;font-size:12px;padding:7px 13px}
        .novoloko-slot-toolbar .novoloko-add-slot:hover{background:#159a7b}
        .novoloko-slot-size{max-width:132px}
        .novoloko-slot-status{margin-left:auto;color:#9db1c5;font-size:11px;white-space:nowrap}
        .novoloko-slot-list{height:100%;min-height:0;flex:1 1 auto;overflow-x:hidden;overflow-y:scroll;scrollbar-gutter:stable;overscroll-behavior:contain;overflow-anchor:none;padding:0 3px 0 0;display:flex;flex-direction:column;align-items:stretch;gap:8px}
        .novoloko-slot-empty{padding:28px;text-align:center;border:1px dashed #496279;border-radius:8px;color:#a8bbcd}
        .novoloko-slot-card{flex:0 0 auto;min-height:max-content;width:100%;box-sizing:border-box;border:1px solid #3a536a;border-radius:8px;background:#172433;overflow:hidden}
        .novoloko-slot-card.disabled{opacity:.68}
        .novoloko-slot-head{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:7px;background:#203245}
        .novoloko-slot-toggle{flex:0 0 auto}
        .novoloko-slot-head input[type=text]{flex:1 1 120px;width:auto;min-width:90px;box-sizing:border-box;border:1px solid #506c85;border-radius:5px;background:#101b27;color:#f4f8fc;padding:5px 7px;font-weight:700}
        .novoloko-slot-summary{flex:2 1 130px;min-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d7e5f2;padding:0 4px}
        .novoloko-slot-summary.empty{color:#8196a9;font-style:italic}
        .novoloko-slot-actions{display:flex;flex:0 1 auto;flex-wrap:wrap;gap:4px;margin-left:auto}
        .novoloko-slot-head button{padding:4px 7px;min-width:28px}
        .novoloko-slot-body{display:grid;grid-template-columns:104px minmax(0,1fr);grid-auto-rows:minmax(30px,auto);gap:7px 9px;align-items:center;padding:9px;box-sizing:border-box;overflow:visible}
        .novoloko-slot-body.collapsed{display:none}
        .novoloko-slot-body label{color:#b9cad8;font-weight:700}
        .novoloko-slot-body select,.novoloko-slot-body input{width:100%;min-width:0;min-height:30px;box-sizing:border-box;border:1px solid #49657d;border-radius:5px;background:#0f1924;color:#f0f5fa;padding:6px}
        .novoloko-slot-count{grid-column:2;color:#8fa7ba;font-size:10px;min-height:13px}
        .novoloko-slot-help{color:#93a8ba;font-size:10px;line-height:1.35}
        @container (max-width:560px){
            .novoloko-slot-status{margin-left:0}
            .novoloko-slot-actions{flex-basis:100%;margin-left:28px}
            .novoloko-slot-body{grid-template-columns:82px minmax(0,1fr)}
        }
    `;
    document.head.append(style);
}

function hideWidget(node, name) {
    const item = widget(node, name);
    if (!item) return;
    item.hidden = true;
    item.options ||= {};
    item.options.hidden = true;
    // Classic LiteGraph does not consistently honour `hidden` for native
    // widgets. Its renderer does reliably ignore the built-in hidden type.
    // Keep the widget/value in place for the backend serialization contract,
    // but give it no paint or layout surface so it cannot leave thin bars.
    item.__novoAIOOriginalType ??= item.type;
    item.type = "hidden";
    item.draw = () => {};
    item.computeSize = () => [0, -4];
    const element = item.element || item.inputEl;
    if (element?.style) element.style.setProperty("display", "none", "important");
}

function preserveBackendWidgetOrder(node) {
    if (!node.__novoAIOBackendWidgets) {
        node.__novoAIOBackendWidgets = [...(node.widgets || [])];
    }
    if (node.__novoAIOSerializeWrapped || typeof node.serialize !== "function") return;
    const original = node.serialize;
    node.serialize = function (...args) {
        const visual = [...(this.widgets || [])];
        const backend = (this.__novoAIOBackendWidgets || []).filter((item) => visual.includes(item));
        const serializableLater = visual.filter(
            (item) => !backend.includes(item) && item.serialize !== false,
        );
        this.widgets.splice(0, this.widgets.length, ...backend, ...serializableLater);
        let info;
        try {
            info = original.apply(this, args);
        } finally {
            this.widgets.splice(0, this.widgets.length, ...visual);
        }
        if (info && this.serialize_widgets) {
            info.widgets_values = [];
            backend.forEach((item, index) => {
                if (item.serialize === false) return;
                info.widgets_values[index] = cloneValue(item.value);
            });
        }
        return info;
    };
    node.__novoAIOSerializeWrapped = true;
}

function migrateLegacyMasterOrder(node) {
    const master = widget(node, "all_slots_enabled");
    const characterSelection = widget(node, "character_selection");
    if (!master || typeof master.value === "boolean") return;
    if (!characterSelection || typeof characterSelection.value !== "boolean") return;

    const releasedOrder = LEGACY_SLOTS
        .filter(({ key }) => key !== "subject")
        .flatMap(({ key }) => [
            `${key}_file_path`, `${key}_category`, `${key}_search`, `${key}_selection`,
        ]);
    const shifted = [master.value, ...releasedOrder.slice(0, -1).map((name) => widget(node, name)?.value)];
    master.value = Boolean(characterSelection.value);
    releasedOrder.forEach((name, index) => {
        const item = widget(node, name);
        if (item) item.value = shifted[index];
    });
}

function legacyState(node) {
    return LEGACY_SLOTS.map((definition) => ({
        id: `legacy-${definition.key}`,
        label: definition.label,
        legacy_key: definition.key,
        enabled: true,
        file_path: String(widget(node, `${definition.key}_file_path`)?.value || DEFAULT_MEDIUM),
        folder: ALL_FOLDERS,
        folder_search: "",
        category: String(widget(node, `${definition.key}_category`)?.value || "All"),
        search: String(widget(node, `${definition.key}_search`)?.value || ""),
        selection: String(widget(node, `${definition.key}_selection`)?.value || definition.selection),
        seed_offset: definition.seedOffset,
        collapsed: false,
    }));
}

function normalisePanelSize(value) {
    const key = String(value || "").toLowerCase();
    return Object.prototype.hasOwnProperty.call(PANEL_HEIGHTS, key) ? key : DEFAULT_PANEL_SIZE;
}

function normaliseSlots(raw) {
    if (!Array.isArray(raw)) return null;
    const ids = new Set();
    return raw.filter((item) => item && typeof item === "object").map((item, index) => {
        let id = String(item.id || makeId());
        if (ids.has(id)) id = makeId();
        ids.add(id);
        const legacy = String(item.legacy_key || "").toLowerCase();
        const fallback = LEGACY_SLOTS.find(({ key }) => key === legacy);
        const parsedOffset = Number.parseInt(item.seed_offset, 10);
        return {
            id,
            label: String(item.label || `Slot ${index + 1}`),
            legacy_key: fallback?.key || "",
            enabled: item.enabled !== false,
            file_path: String(item.file_path || DEFAULT_MEDIUM),
            folder: String(item.folder || ALL_FOLDERS),
            folder_search: String(item.folder_search || ""),
            category: String(item.category || "All"),
            search: String(item.search || ""),
            selection: String(item.selection || "none"),
            seed_offset: Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : index,
            collapsed: Object.prototype.hasOwnProperty.call(item, "collapsed")
                ? Boolean(item.collapsed)
                : false,
        };
    });
}

function readTransport(node) {
    const item = widget(node, "slots_json");
    const text = String(item?.value || "").trim();
    if (!text) return null;
    try {
        const payload = JSON.parse(text);
        const slots = normaliseSlots(Array.isArray(payload) ? payload : payload?.slots);
        if (slots === null) return null;
        return {
            slots,
            ui: {
                panel_size: normalisePanelSize(Array.isArray(payload) ? "" : payload?.ui?.panel_size),
            },
        };
    } catch (error) {
        console.warn("[NovoLoko Prompt Stack] Invalid slots_json; migrating legacy slots.", error);
        return null;
    }
}

function syncLegacyWidgets(node, slots) {
    for (const definition of LEGACY_SLOTS) {
        const slot = slots.find((item) => item.legacy_key === definition.key);
        if (!slot) continue;
        for (const field of ["file_path", "category", "search", "selection"]) {
            const item = widget(node, `${definition.key}_${field}`);
            if (item) item.value = slot[field];
        }
    }
}

function storeSlots(node) {
    const item = widget(node, "slots_json");
    if (!item) return;
    syncLegacyWidgets(node, node.__novoAIOSlots || []);
    item.value = JSON.stringify({
        version: 2,
        ui: { panel_size: normalisePanelSize(node.__novoAIOUi?.panel_size) },
        slots: node.__novoAIOSlots || [],
    });
    item.callback?.(item.value);
    markDirty(node);
}

async function fetchJson(path) {
    const response = await api.fetchApi(path);
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`NovoLoko slot endpoint returned ${response.status}`);
    }
    if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
    }
    return data;
}

function slotKind(slot) {
    return LEGACY_SLOTS.some(({ key }) => key === slot.legacy_key)
        ? slot.legacy_key
        : "medium";
}

function setOptions(select, values, current, fallback) {
    const options = unique([...(values || []), current]);
    select.replaceChildren();
    for (const value of options.length ? options : [fallback]) {
        const option = document.createElement("option");
        option.value = String(value);
        option.textContent = String(value);
        select.append(option);
    }
    select.value = options.includes(String(current)) ? String(current) : String(fallback || options[0] || "");
}

function fileItem(value) {
    const path = String(value || "");
    return {
        value: path,
        label: path.split("/").pop() || path,
        relative_path: path,
    };
}

function setFileOptions(select, items, current) {
    const byValue = new Map();
    for (const raw of items || []) {
        const item = typeof raw === "string" ? fileItem(raw) : raw;
        const value = String(item?.value || "").trim();
        if (value && !byValue.has(value)) byValue.set(value, { ...fileItem(value), ...item, value });
    }
    const selected = String(current || "");
    if (selected && !byValue.has(selected)) byValue.set(selected, fileItem(selected));
    select.replaceChildren();
    for (const item of byValue.values()) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = String(item.label || item.value);
        option.title = String(item.relative_path || item.value);
        select.append(option);
    }
    select.value = byValue.has(selected) ? selected : String(byValue.keys().next().value || "");
    select.title = selected;
}

function setNativeOptions(item, values, current, fallback) {
    if (!item) return;
    const options = unique([...(values || []), current]);
    item.options ||= {};
    item.options.values = options.length ? options : [fallback];
    item.value = options.includes(String(current)) ? String(current) : String(fallback || options[0] || "");
}

function updateSlotControls(node, slot) {
    const cache = node.__novoAIOCache?.get(slot.id) || {};
    const refs = node.__novoAIORefs?.get(slot.id);
    if (refs) {
        setOptions(refs.folder, cache.folders || [ALL_FOLDERS], slot.folder, ALL_FOLDERS);
        setFileOptions(refs.file, cache.fileItems || cache.files || [slot.file_path], slot.file_path);
        setOptions(refs.category, cache.categories || ["All"], slot.category, "All");
        setOptions(
            refs.selection,
            ["none", "random", ...(cache.entries || [])],
            slot.selection,
            "random",
        );
        refs.folderSearch.value = slot.folder_search || "";
        refs.search.value = slot.search || "";
        refs.count.textContent = cache.error
            ? `Refresh failed: ${cache.error}`
            : (cache.countText || "Ready to refresh");
        refs.file.title = slot.file_path;
        if (refs.summary) {
            refs.summary.textContent = selectionSummary(slot);
            refs.summary.title = refs.summary.textContent;
            refs.summary.classList.toggle("empty", ["No selection", "Random"].includes(refs.summary.textContent));
        }
    }

    const native = node.__novoAIONativeRefs?.get(slot.id);
    if (native) {
        setNativeOptions(native.folder, cache.folders || [ALL_FOLDERS], slot.folder, ALL_FOLDERS);
        setNativeOptions(native.file, cache.files || [slot.file_path], slot.file_path, slot.file_path);
        setNativeOptions(native.category, cache.categories || ["All"], slot.category, "All");
        setNativeOptions(
            native.selection,
            ["none", "random", ...(cache.entries || [])],
            slot.selection,
            "random",
        );
        native.folderSearch.value = slot.folder_search || "";
        native.search.value = slot.search || "";
        native.selection.label = cache.error
            ? `${native.prefix} Selection (refresh failed)`
            : `${native.prefix} Selection${cache.countText ? ` (${cache.countText})` : ""}`;
    }
    markDirty(node);
}

async function refreshSlot(node, slot, refreshFiles = true, preserveSelection = true, forceRescan = false) {
    node.__novoAIOCache ||= new Map();
    const cache = node.__novoAIOCache.get(slot.id) || {};
    node.__novoAIOCache.set(slot.id, cache);
    const requestId = Number(cache.requestId || 0) + 1;
    cache.requestId = requestId;
    const savedState = JSON.stringify({
        file_path: slot.file_path,
        folder: slot.folder,
        category: slot.category,
        search: slot.search,
        selection: slot.selection,
    });
    try {
        if (refreshFiles) {
            const oldFile = slot.file_path;
            const fileParams = new URLSearchParams({
                slot: slotKind(slot),
                folder: slot.folder || ALL_FOLDERS,
                folder_search: slot.folder_search || "",
                refresh: forceRescan ? "1" : "0",
            });
            const files = await fetchJson(`/nova_prompt_stack/files?${fileParams}`);
            if (cache.requestId !== requestId) return;
            cache.folders = unique([...(files.folders || [ALL_FOLDERS]), slot.folder || ALL_FOLDERS]);
            cache.fileItems = files.file_items || (files.files || []).map(fileItem);
            cache.files = unique(files.files || cache.fileItems.map((item) => item.value));
            if (!cache.files.includes(slot.file_path)) {
                slot.file_path = files.default || cache.files[0] || oldFile || DEFAULT_MEDIUM;
            }
            if (slot.file_path !== oldFile) {
                slot.category = "All";
                slot.search = "";
                slot.selection = "random";
            }
        }
        const entryParams = () => new URLSearchParams({
            file: slot.file_path,
            slot: slotKind(slot),
            category: slot.category || "All",
            search: slot.search || "",
        });
        let entries = await fetchJson(`/nova_prompt_stack/list?${entryParams()}`);
        if (cache.requestId !== requestId) return;
        if (!(entries.categories || ["All"]).includes(slot.category || "All")) {
            slot.category = "All";
            entries = await fetchJson(`/nova_prompt_stack/list?${entryParams()}`);
            if (cache.requestId !== requestId) return;
        }
        cache.categories = entries.categories || ["All"];
        cache.entries = entries.styles || [];
        cache.countText = `${entries.filtered_count}/${entries.count} entries`;
        cache.error = "";
        if (!preserveSelection || !["none", "random", ...cache.entries].includes(slot.selection)) {
            slot.selection = "random";
        }
        const refreshedState = JSON.stringify({
            file_path: slot.file_path,
            folder: slot.folder,
            category: slot.category,
            search: slot.search,
            selection: slot.selection,
        });
        if (refreshedState !== savedState) storeSlots(node);
    } catch (error) {
        cache.error = String(error?.message || error);
        console.warn(`[NovoLoko Prompt Stack] Failed to refresh ${slot.label}:`, error);
    }
    updateSlotControls(node, slot);
}

async function refreshAll(node, refreshFiles = true, forceRescan = false) {
    const slots = node.__novoAIOSlots || [];
    const status = node.__novoAIOStatus;
    if (status) status.textContent = `Refreshing ${slots.length} slot${slots.length === 1 ? "" : "s"}...`;
    let remaining = slots;
    if (refreshFiles && forceRescan && slots.length) {
        await refreshSlot(node, slots[0], true, true, true);
        remaining = slots.slice(1);
    }
    await Promise.all(remaining.map((slot) => refreshSlot(node, slot, refreshFiles, true)));
    if (status) status.textContent = `${slots.length} slot${slots.length === 1 ? "" : "s"}`;
}

function nextSeedOffset(slots) {
    return Math.max(-1, ...(slots || []).map((slot) => Number(slot.seed_offset) || 0)) + 1;
}

function selectionSummary(slot) {
    const value = String(slot?.selection || "").trim();
    if (!value || value.toLowerCase() === "none") return "No selection";
    if (value.toLowerCase() === "random") return "Random";
    return value;
}

function panelHeight(node) {
    return Math.max(
        PANEL_MIN_HEIGHT,
        Math.floor(Number(node.size?.[1] || 820) - PANEL_NODE_CHROME_HEIGHT),
    );
}

function applyPanelSize(node, resizeNode = false) {
    const size = normalisePanelSize(node.__novoAIOUi?.panel_size);
    const preferredHeight = PANEL_HEIGHTS[size];
    node.__novoAIOUi ||= {};
    node.__novoAIOUi.panel_size = size;
    if (resizeNode && Array.isArray(node.size)) {
        node.setSize?.([
            Math.max(420, Number(node.size[0]) || 680),
            preferredHeight + PANEL_NODE_CHROME_HEIGHT,
        ]);
    }
    const height = resizeNode ? preferredHeight : panelHeight(node);
    if (node.__novoAIORoot?.style) {
        node.__novoAIORoot.style.height = `${height}px`;
        node.__novoAIORoot.style.minHeight = `${PANEL_MIN_HEIGHT}px`;
        node.__novoAIORoot.style.maxHeight = `${height}px`;
    }
    if (node.__novoAIODom) {
        node.__novoAIODom.computeSize = (width) => [
            Math.max(420, Number(width) || 680),
            height + PANEL_WIDGET_GAP,
        ];
        node.__novoAIODom.options ||= {};
        node.__novoAIODom.options.getMinHeight = () => PANEL_MIN_HEIGHT + PANEL_WIDGET_GAP;
        node.__novoAIODom.options.getHeight = () => panelHeight(node) + PANEL_WIDGET_GAP;
    }
    recomputeDOMGeometry(node);
    markDirty(node);
}

function installPanelResizeTracking(node) {
    if (node.__novoAIOResponsiveResizeInstalled) return;
    node.__novoAIOResponsiveResizeInstalled = true;
    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        requestAnimationFrame(() => applyPanelSize(this, false));
        return result;
    };
}

function measureElementHeight(element) {
    if (!element) return 0;
    const rectHeight = Number(element.getBoundingClientRect?.().height || 0);
    return Math.ceil(rectHeight || Number(element.offsetHeight || 0) || Number(element.scrollHeight || 0));
}

function recomputeDOMGeometry(node, preferredScrollTop = null) {
    const list = node.__novoAIOList;
    if (!list) return;
    const apply = () => {
        const cards = Array.from(list.children || []).filter((item) => item?.classList?.contains("novoloko-slot-card"));
        for (const card of cards) {
            // Inline flex protection is intentional. Some classic ComfyUI
            // themes inject broad flex rules after extension styles load.
            card.style.flex = "0 0 auto";
            card.style.flexShrink = "0";
        }
        node.__novoAIOSlotHeights = cards.map(measureElementHeight);
        node.__novoAIOScrollContentHeight = Math.ceil(Number(list.scrollHeight || 0));
        if (preferredScrollTop !== null && preferredScrollTop !== undefined) {
            list.scrollTop = Math.max(0, Number(preferredScrollTop) || 0);
        }
        markDirty(node);
    };

    // Read once now so classic LiteGraph sees fresh geometry in the same
    // interaction, then remeasure after the browser has completed DOM layout.
    apply();
    if (typeof globalThis.requestAnimationFrame === "function") {
        if (node.__novoAIOGeometryFrame) globalThis.cancelAnimationFrame?.(node.__novoAIOGeometryFrame);
        node.__novoAIOGeometryFrame = globalThis.requestAnimationFrame(() => {
            node.__novoAIOGeometryFrame = 0;
            apply();
        });
    }
}

function textButton(label, title, callback, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.className = className;
    button.onclick = callback;
    return button;
}

function renderDOMSlots(node) {
    const list = node.__novoAIOList;
    if (!list) return;
    const previousScrollTop = Number(list.scrollTop || 0);
    list.replaceChildren();
    node.__novoAIORefs = new Map();
    const slots = node.__novoAIOSlots || [];
    if (!slots.length) {
        const empty = document.createElement("div");
        empty.className = "novoloko-slot-empty";
        empty.textContent = "No slots yet. Click + Add Slot to create one.";
        list.append(empty);
    }

    slots.forEach((slot, index) => {
        const card = document.createElement("section");
        card.className = `novoloko-slot-card${slot.enabled ? "" : " disabled"}${slot.collapsed ? " collapsed" : ""}`;
        card.dataset.slotId = slot.id;
        const head = document.createElement("div");
        head.className = "novoloko-slot-head";
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.className = "novoloko-slot-toggle";
        enabled.checked = slot.enabled;
        enabled.title = "Include this slot in prompt generation";
        enabled.onchange = () => {
            slot.enabled = enabled.checked;
            card.classList.toggle("disabled", !slot.enabled);
            storeSlots(node);
        };
        const label = document.createElement("input");
        label.type = "text";
        label.value = slot.label;
        label.placeholder = `Slot ${index + 1}`;
        label.title = "Editable slot label (never included in all_names)";
        label.oninput = () => {
            slot.label = label.value || `Slot ${index + 1}`;
            storeSlots(node);
        };
        const collapse = textButton(slot.collapsed ? ">" : "v", slot.collapsed ? "Expand slot" : "Collapse slot", () => {
            slot.collapsed = !slot.collapsed;
            storeSlots(node);
            renderSlots(node);
        });
        collapse.classList.add("novoloko-slot-toggle");
        const summary = document.createElement("span");
        summary.className = "novoloko-slot-summary";
        summary.textContent = selectionSummary(slot);
        summary.title = summary.textContent;
        const up = textButton("Up", "Move slot up", () => {
            if (index <= 0) return;
            [slots[index - 1], slots[index]] = [slots[index], slots[index - 1]];
            storeSlots(node);
            renderSlots(node);
        });
        const down = textButton("Down", "Move slot down", () => {
            if (index >= slots.length - 1) return;
            [slots[index], slots[index + 1]] = [slots[index + 1], slots[index]];
            storeSlots(node);
            renderSlots(node);
        });
        const duplicate = textButton("Copy", "Duplicate slot", () => {
            const copy = {
                ...JSON.parse(JSON.stringify(slot)),
                id: makeId(),
                label: `${slot.label} Copy`,
                legacy_key: "",
                seed_offset: nextSeedOffset(slots),
            };
            slots.splice(index + 1, 0, copy);
            storeSlots(node);
            renderSlots(node);
            refreshSlot(node, copy, true, true);
        });
        const remove = textButton("Remove", "Remove slot", () => {
            slots.splice(index, 1);
            node.__novoAIOCache?.delete(slot.id);
            storeSlots(node);
            renderSlots(node);
        });
        up.disabled = index === 0;
        down.disabled = index === slots.length - 1;
        const actions = document.createElement("div");
        actions.className = "novoloko-slot-actions";
        actions.append(up, down, duplicate, remove);
        head.append(enabled, collapse, label, summary, actions);

        const body = document.createElement("div");
        body.className = `novoloko-slot-body${slot.collapsed ? " collapsed" : ""}`;
        const addField = (caption, control) => {
            const fieldLabel = document.createElement("label");
            fieldLabel.textContent = caption;
            body.append(fieldLabel, control);
        };
        const file = document.createElement("select");
        const folder = document.createElement("select");
        const folderSearch = document.createElement("input");
        folderSearch.type = "search";
        folderSearch.value = slot.folder_search || "";
        folderSearch.placeholder = "Filter folders...";
        folderSearch.title = "Filter the folder dropdown by words from its relative path";
        const category = document.createElement("select");
        const search = document.createElement("input");
        search.type = "search";
        search.value = slot.search;
        search.placeholder = "Search entries...";
        search.title = SEARCH_HELP_TEXT;
        const selection = document.createElement("select");
        const count = document.createElement("div");
        count.className = "novoloko-slot-count";
        addField("Folder filter", folderSearch);
        addField("Folder", folder);
        addField("CSV file", file);
        addField("Category", category);
        addField("Search", search);
        addField("Selection", selection);
        body.append(document.createElement("span"), count);

        folderSearch.oninput = () => {
            slot.folder_search = folderSearch.value;
            storeSlots(node);
            node.__novoAIOFolderSearchTimers ||= new Map();
            clearTimeout(node.__novoAIOFolderSearchTimers.get(slot.id));
            node.__novoAIOFolderSearchTimers.set(
                slot.id,
                setTimeout(() => refreshSlot(node, slot, true, true), 280),
            );
        };
        folder.onchange = () => {
            slot.folder = folder.value || ALL_FOLDERS;
            storeSlots(node);
            refreshSlot(node, slot, true, true);
        };
        file.onchange = () => {
            slot.file_path = file.value;
            slot.category = "All";
            slot.search = "";
            slot.selection = "random";
            search.value = "";
            storeSlots(node);
            refreshSlot(node, slot, false, false);
        };
        category.onchange = () => {
            slot.category = category.value;
            slot.selection = "random";
            storeSlots(node);
            refreshSlot(node, slot, false, false);
        };
        search.oninput = () => {
            slot.search = search.value;
            slot.selection = "random";
            storeSlots(node);
            node.__novoAIOSearchTimers ||= new Map();
            clearTimeout(node.__novoAIOSearchTimers.get(slot.id));
            node.__novoAIOSearchTimers.set(
                slot.id,
                setTimeout(() => refreshSlot(node, slot, false, false), 280),
            );
        };
        selection.onchange = () => {
            slot.selection = selection.value;
            storeSlots(node);
            updateSlotControls(node, slot);
        };
        card.append(head, body);
        list.append(card);
        node.__novoAIORefs.set(slot.id, {
            folderSearch, folder, file, category, search, selection, count, summary,
        });
        updateSlotControls(node, slot);
    });
    if (node.__novoAIOStatus) {
        node.__novoAIOStatus.textContent = `${slots.length} slot${slots.length === 1 ? "" : "s"}`;
    }
    recomputeDOMGeometry(node, previousScrollTop);
}

function removeNativeWidgets(node) {
    const owned = new Set(node.__novoAIONativeWidgets || []);
    if (!owned.size) return;
    for (const item of owned) item.onRemove?.();
    const kept = (node.widgets || []).filter((item) => !owned.has(item));
    node.widgets.splice(0, node.widgets.length, ...kept);
    node.__novoAIONativeWidgets = [];
}

function addNativeControl(node, type, name, value, callback, options = {}) {
    const item = node.addWidget(type, name, value, callback, { ...options, serialize: false });
    item.serialize = false;
    item.options ||= {};
    item.options.serialize = false;
    node.__novoAIONativeWidgets ||= [];
    node.__novoAIONativeWidgets.push(item);
    return item;
}

function arrangeNativeWidgets(node) {
    const controls = node.__novoAIONativeWidgets || [];
    const front = [
        widget(node, "all_slots_enabled"),
        ...controls,
        widget(node, "random_mode"),
        widget(node, "seed"),
        widget(node, "control_after_generate"),
        widget(node, "delimiter"),
        widget(node, "manual_prompt"),
        widget(node, "extra_positive"),
        widget(node, "extra_negative"),
    ].filter(Boolean);
    const frontSet = new Set(front);
    const remaining = (node.widgets || []).filter((item) => !frontSet.has(item));
    node.widgets.splice(0, node.widgets.length, ...front, ...remaining);
}

function renderNativeSlots(node) {
    removeNativeWidgets(node);
    node.__novoAIONativeRefs = new Map();
    const slots = node.__novoAIOSlots || [];
    const addSlot = () => {
        const slot = {
            id: makeId(),
            label: `Slot ${slots.length + 1}`,
            legacy_key: "",
            enabled: true,
            file_path: DEFAULT_MEDIUM,
            folder: ALL_FOLDERS,
            folder_search: "",
            category: "All",
            search: "",
            selection: "random",
            seed_offset: nextSeedOffset(slots),
            collapsed: false,
        };
        slots.push(slot);
        storeSlots(node);
        renderNativeSlots(node);
        refreshSlot(node, slot, true, true);
    };
    addNativeControl(node, "button", "+ Add Slot", null, addSlot);
    addNativeControl(node, "button", "Collapse All", null, () => {
        for (const slot of slots) slot.collapsed = true;
        storeSlots(node);
        renderNativeSlots(node);
    });
    addNativeControl(node, "button", "Expand All", null, () => {
        for (const slot of slots) slot.collapsed = false;
        storeSlots(node);
        renderNativeSlots(node);
    });
    addNativeControl(
        node,
        "button",
        "Refresh Folders + Files + Categories + Entries",
        null,
        () => refreshAll(node, true, true),
    );
    addNativeControl(node, "button", "Clear Searches", null, async () => {
        for (const slot of slots) {
            slot.folder_search = "";
            slot.category = "All";
            slot.search = "";
            slot.selection = "random";
        }
        storeSlots(node);
        renderNativeSlots(node);
        await refreshAll(node, false);
    });
    addNativeControl(node, "button", "Browse Medium Styles", null, () => browseMedium(node));

    slots.forEach((slot, index) => {
        const prefix = `${index + 1}. ${slot.label}`;
        addNativeControl(node, "toggle", `${index + 1}. Enabled`, slot.enabled, (value) => {
            slot.enabled = value !== false;
            storeSlots(node);
        });
        addNativeControl(node, "text", `${index + 1}. Label`, slot.label, (value) => {
            slot.label = String(value || `Slot ${index + 1}`);
            storeSlots(node);
        });
        const actions = ["Actions...", "Collapse/Expand", "Up", "Down", "Copy", "Remove", "Refresh slot"];
        const action = addNativeControl(node, "combo", `${index + 1}. Slot actions`, actions[0], (value) => {
            action.value = actions[0];
            let copied = null;
            if (value === "Collapse/Expand") slot.collapsed = !slot.collapsed;
            if (value === "Up" && index > 0) [slots[index - 1], slots[index]] = [slots[index], slots[index - 1]];
            if (value === "Down" && index < slots.length - 1) [slots[index], slots[index + 1]] = [slots[index + 1], slots[index]];
            if (value === "Copy") {
                copied = {
                    ...JSON.parse(JSON.stringify(slot)),
                    id: makeId(),
                    label: `${slot.label} Copy`,
                    legacy_key: "",
                    seed_offset: nextSeedOffset(slots),
                };
                slots.splice(index + 1, 0, copied);
            }
            if (value === "Remove") {
                slots.splice(index, 1);
                node.__novoAIOCache?.delete(slot.id);
            }
            storeSlots(node);
            if (value === "Refresh slot") refreshSlot(node, slot, true, true, true);
            else if (value !== actions[0]) {
                renderNativeSlots(node);
                if (copied) refreshSlot(node, copied, true, true);
            }
        }, { values: actions });

        if (slot.collapsed) return;
        const folderSearch = addNativeControl(node, "text", `${index + 1}. Folder search`, slot.folder_search || "", (value) => {
            slot.folder_search = String(value || "");
            storeSlots(node);
            node.__novoAIOFolderSearchTimers ||= new Map();
            clearTimeout(node.__novoAIOFolderSearchTimers.get(slot.id));
            node.__novoAIOFolderSearchTimers.set(
                slot.id,
                setTimeout(() => refreshSlot(node, slot, true, true), 280),
            );
        });
        const folder = addNativeControl(node, "combo", `${index + 1}. Folder`, slot.folder || ALL_FOLDERS, (value) => {
            slot.folder = String(value || ALL_FOLDERS);
            storeSlots(node);
            refreshSlot(node, slot, true, true);
        }, { values: [slot.folder || ALL_FOLDERS] });
        const file = addNativeControl(node, "combo", `${index + 1}. File path`, slot.file_path, (value) => {
            slot.file_path = String(value || slot.file_path);
            slot.category = "All";
            slot.search = "";
            slot.selection = "random";
            storeSlots(node);
            refreshSlot(node, slot, false, false);
        }, { values: [slot.file_path] });
        const category = addNativeControl(node, "combo", `${index + 1}. Category`, slot.category, (value) => {
            slot.category = String(value || "All");
            slot.selection = "random";
            storeSlots(node);
            refreshSlot(node, slot, false, false);
        }, { values: [slot.category || "All"] });
        const search = addNativeControl(node, "text", `${index + 1}. Entry search`, slot.search || "", (value) => {
            slot.search = String(value || "");
            slot.selection = "random";
            storeSlots(node);
            node.__novoAIOSearchTimers ||= new Map();
            clearTimeout(node.__novoAIOSearchTimers.get(slot.id));
            node.__novoAIOSearchTimers.set(
                slot.id,
                setTimeout(() => refreshSlot(node, slot, false, false), 280),
            );
        });
        const selection = addNativeControl(node, "combo", `${index + 1}. Selection`, slot.selection, (value) => {
            slot.selection = String(value || "random");
            storeSlots(node);
        }, { values: ["none", "random", slot.selection] });
        node.__novoAIONativeRefs.set(slot.id, {
            prefix, folderSearch, folder, file, category, search, selection,
        });
        updateSlotControls(node, slot);
    });
    arrangeNativeWidgets(node);
    markDirty(node);
}

function renderSlots(node) {
    if (node.__novoAIORenderer === "native") renderNativeSlots(node);
    else renderDOMSlots(node);
}

function browseMedium(node) {
    const browser = window.NovoLokoStyleBrowser;
    if (!browser?.open) {
        console.warn("[NovoLoko Prompt Stack] Visual browser is still loading. Try again in a moment.");
        return;
    }
    const slots = node.__novoAIOSlots || [];
    const slot = slots.find((item) => item.legacy_key === "medium") || slots[0];
    if (!slot) return;
    browser.open({
        node,
        csv: slot.file_path || DEFAULT_MEDIUM,
        kind: "styles",
        search: slot.search || "",
        category: slot.category || "All",
        title: `NovoLoko Prompt Stack - ${slot.label}`,
        onSelect(item) {
            slot.selection = String(item?.name || "none");
            const cache = node.__novoAIOCache?.get(slot.id) || {};
            cache.entries = unique([...(cache.entries || []), slot.selection]);
            node.__novoAIOCache?.set(slot.id, cache);
            storeSlots(node);
            updateSlotControls(node, slot);
        },
    });
}

function buildPanel(node) {
    installCss();
    const root = document.createElement("div");
    root.className = "novoloko-slot-panel";
    node.__novoAIORoot = root;
    const toolbar = document.createElement("div");
    toolbar.className = "novoloko-slot-toolbar";
    const status = document.createElement("span");
    status.className = "novoloko-slot-status";
    node.__novoAIOStatus = status;
    const add = textButton("+ Add Slot", "Create another prompt slot", () => {
        const slots = node.__novoAIOSlots || [];
        const slot = {
            id: makeId(),
            label: `Slot ${slots.length + 1}`,
            legacy_key: "",
            enabled: true,
            file_path: DEFAULT_MEDIUM,
            folder: ALL_FOLDERS,
            folder_search: "",
            category: "All",
            search: "",
            selection: "random",
            seed_offset: nextSeedOffset(slots),
            collapsed: false,
        };
        slots.push(slot);
        storeSlots(node);
        renderSlots(node);
        if (node.__novoAIOList) node.__novoAIOList.scrollTop = node.__novoAIOList.scrollHeight;
        refreshSlot(node, slot, true, true);
    }, "novoloko-add-slot");
    const collapseAll = textButton("Collapse All", "Collapse every slot to a compact summary row", () => {
        for (const slot of node.__novoAIOSlots || []) slot.collapsed = true;
        storeSlots(node);
        renderSlots(node);
        if (node.__novoAIOList) node.__novoAIOList.scrollTop = 0;
    });
    const expandAll = textButton("Expand All", "Expand every slot inside the scroll panel", () => {
        for (const slot of node.__novoAIOSlots || []) slot.collapsed = false;
        storeSlots(node);
        renderSlots(node);
        if (node.__novoAIOList) node.__novoAIOList.scrollTop = 0;
    });
    const refresh = textButton("Refresh Folders + Files + Categories + Entries", "Refresh every slot", () => refreshAll(node, true, true));
    const clear = textButton("Clear Searches", "Clear folder/category/entry searches and return slots to random", async () => {
        for (const slot of node.__novoAIOSlots || []) {
            slot.folder_search = "";
            slot.category = "All";
            slot.search = "";
            slot.selection = "random";
        }
        storeSlots(node);
        renderSlots(node);
        await refreshAll(node, false);
    });
    const browse = textButton("Browse Medium Styles", "Open the visual style browser", () => browseMedium(node));
    const panelSize = document.createElement("select");
    panelSize.className = "novoloko-slot-size";
    panelSize.title = "Set a convenient panel height; manual node resizing continues from there";
    for (const [value, height] of Object.entries(PANEL_HEIGHTS)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${value[0].toUpperCase()}${value.slice(1)} ${height}px`;
        panelSize.append(option);
    }
    panelSize.value = normalisePanelSize(node.__novoAIOUi?.panel_size);
    panelSize.onchange = () => {
        node.__novoAIOUi ||= {};
        node.__novoAIOUi.panel_size = normalisePanelSize(panelSize.value);
        applyPanelSize(node, true);
        storeSlots(node);
    };
    node.__novoAIOPanelSize = panelSize;
    toolbar.append(add, collapseAll, expandAll, refresh, clear, browse, panelSize, status);
    const help = document.createElement("div");
    help.className = "novoloko-slot-help";
    help.textContent = "The slot canvas follows the node height. Filter or choose folders, then choose CSV, category, search, and selection. Visible order controls combined_prompt and all_names; all_names contains names only.";
    const list = document.createElement("div");
    list.className = "novoloko-slot-list";
    node.__novoAIOList = list;
    root.append(toolbar, help, list);
    return root;
}

function arrangeVisualWidgets(node, dom) {
    const front = [
        widget(node, "all_slots_enabled"),
        dom,
        widget(node, "random_mode"),
        widget(node, "seed"),
        widget(node, "control_after_generate"),
        widget(node, "delimiter"),
        widget(node, "manual_prompt"),
        widget(node, "extra_positive"),
        widget(node, "extra_negative"),
    ].filter(Boolean);
    const frontSet = new Set(front);
    const remaining = (node.widgets || []).filter((item) => !frontSet.has(item));
    node.widgets.splice(0, node.widgets.length, ...front, ...remaining);
}

function installDynamicNode(node, newNode = false) {
    migrateLegacyMasterOrder(node);
    const subjectFile = widget(node, "subject_file_path");
    if (subjectFile && !String(subjectFile.value || "").trim()) {
        subjectFile.value = "csv/subjects/novoloko_subjects_master_3600.csv";
    }
    preserveBackendWidgetOrder(node);

    const transported = readTransport(node);
    node.__novoAIOSlots = transported === null ? legacyState(node) : transported.slots;
    node.__novoAIOUi = transported === null
        ? { panel_size: DEFAULT_PANEL_SIZE }
        : transported.ui;
    if (transported === null) storeSlots(node);

    node.__novoAIORenderer ||= typeof node.addDOMWidget === "function" ? "dom" : "native";
    for (const name of [...LEGACY_WIDGET_NAMES, "slots_json"]) hideWidget(node, name);

    if (node.__novoAIORenderer === "native") {
        if (typeof node.addWidget !== "function") {
            console.warn("[NovoLoko Prompt Stack] Classic controls could not be created: addWidget is unavailable.");
            return;
        }
        node.min_size = [420, 620];
        node.getMinSize = () => [420, 620];
        renderNativeSlots(node);
        if (newNode && (!Array.isArray(node.size) || node.size[0] < 500)) {
            node.setSize?.([680, 820]);
        }
    } else if (!node.__novoAIODom) {
        for (const name of [...LEGACY_WIDGET_NAMES, "slots_json"]) hideWidget(node, name);
        const root = buildPanel(node);
        const dom = node.addDOMWidget("novoloko_dynamic_slots", "NOVOLOKO_DYNAMIC_SLOTS", root, {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => PANEL_MIN_HEIGHT + PANEL_WIDGET_GAP,
            getHeight: () => panelHeight(node) + PANEL_WIDGET_GAP,
            selectOn: ["click", "focus"],
        });
        dom.serialize = false;
        dom.options ||= {};
        dom.options.serialize = false;
        node.__novoAIODom = dom;
        installPanelResizeTracking(node);
        applyPanelSize(node, false);
        node.min_size = [420, 700];
        node.getMinSize = () => [420, 700];
        arrangeVisualWidgets(node, dom);
        if (newNode && (!Array.isArray(node.size) || node.size[0] < 420)) {
            node.setSize?.([680, 820]);
        }
    }
    if (node.__novoAIORenderer === "dom") {
        applyPanelSize(node, false);
        renderDOMSlots(node);
    }
    clearTimeout(node.__novoAIORefreshTimer);
    node.__novoAIORefreshTimer = setTimeout(() => refreshAll(node, true), 180);
}

app.registerExtension({
    name: "NovoLoko.PromptStackDynamicSlots.v2",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== NODE_NAME) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            clearTimeout(this.__novoAIOCreatedTimer);
            const delay = globalThis.LiteGraph?.vueNodesMode ? 900 : 0;
            this.__novoAIOCreatedTimer = setTimeout(() => installDynamicNode(this, true), delay);
            return result;
        };
        const configured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = configured?.apply(this, arguments);
            clearTimeout(this.__novoAIOCreatedTimer);
            setTimeout(() => installDynamicNode(this, false), 0);
            return result;
        };
        const graphConfigured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function () {
            const result = graphConfigured?.apply(this, arguments);
            clearTimeout(this.__novoAIOCreatedTimer);
            setTimeout(() => installDynamicNode(this, false), 0);
            return result;
        };
        const removed = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            clearTimeout(this.__novoAIOCreatedTimer);
            clearTimeout(this.__novoAIORefreshTimer);
            if (this.__novoAIOGeometryFrame) globalThis.cancelAnimationFrame?.(this.__novoAIOGeometryFrame);
            for (const timer of this.__novoAIOSearchTimers?.values?.() || []) clearTimeout(timer);
            for (const timer of this.__novoAIOFolderSearchTimers?.values?.() || []) clearTimeout(timer);
            return removed?.apply(this, arguments);
        };
    },
});
