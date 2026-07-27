import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const DEFAULT_STANDALONE_LIBRARY = "styles/novoloko_all_yaml_styles.yaml";
const MAX_GENERATED_PREVIEW_BYTES = 32 * 1024 * 1024;
const GENERATED_PREVIEW_TIMEOUT_MS = 30 * 60 * 1000;
const LAUNCHER_POSITION_KEY = "novoloko.styleBrowserLauncher.v1";
const BROWSER_SETTINGS_KEY = "novoloko.styleBrowserSettings.v1";
const STANDALONE_LIBRARY_KEY = "novoloko.styleBrowserLibrary.v1";
let standaloneBrowser = null;
const previewBatchSession = {
    running: false,
    cancelRequested: false,
    mode: "",
    currentPromptId: "",
    completed: 0,
    total: 0,
    library: "",
    message: "",
    listeners: new Set(),
};

function readBrowserSettings() {
    const defaults = {
        autoOpenGenerated: true,
        wrapViewerNavigation: true,
        itemsPerPage: 24,
        previewSize: 512,
    };
    try {
        return { ...defaults, ...JSON.parse(localStorage.getItem(BROWSER_SETTINGS_KEY) || "{}") };
    } catch {
        return defaults;
    }
}

function saveBrowserSettings(settings) {
    try {
        localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Settings remain active for this page when storage is unavailable.
    }
}

function publishBatchStatus(message = previewBatchSession.message) {
    previewBatchSession.message = message;
    for (const listener of [...previewBatchSession.listeners]) listener(previewBatchSession);
}

let previewBatchEventsBound = false;
function bindPreviewBatchExecutionEvents() {
    if (previewBatchEventsBound) return;
    previewBatchEventsBound = true;
    const stopFromComfyUI = (event) => {
        if (!previewBatchSession.running) return;
        const eventPromptId = event?.detail?.prompt_id == null
            ? ""
            : String(event.detail.prompt_id);
        if (
            eventPromptId
            && previewBatchSession.currentPromptId
            && eventPromptId !== previewBatchSession.currentPromptId
        ) {
            return;
        }
        previewBatchSession.cancelRequested = true;
        publishBatchStatus("Stopped from ComfyUI. Finishing preview cleanup…");
    };
    api.addEventListener("execution_interrupted", stopFromComfyUI);
    api.addEventListener("execution_error", stopFromComfyUI);
}

function widget(node, name) {
    return node?.widgets?.find((item) => item.name === name);
}

function isNovaStyleLoader(nodeData) {
    const name = nodeData?.name || "";
    return name === "LoadStylesCSVPro" ||
        name.startsWith("NovaLoadStylesCSVPro") ||
        name.startsWith("NovaLoadCharactersCSVPro");
}

function isCharacterLoader(nodeData) {
    return String(nodeData?.name || "").startsWith("NovaLoadCharactersCSVPro");
}

function isPromptStyler(nodeData) {
    return String(nodeData?.name || "") === "NovaPromptStyler";
}

function setComboValues(target, values, fallback) {
    if (!target || !Array.isArray(values) || values.length === 0) return;
    target.type = "combo";
    target.options ||= {};
    target.options.values = values;
    if (!values.includes(target.value)) {
        target.value = values.includes(fallback) ? fallback : values[0];
    }
}

function markDirty(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function browserParams(node, nodeData, overrides = {}) {
    const kind = String(overrides.kind || (isCharacterLoader(nodeData) ? "characters" : "styles"));
    return new URLSearchParams({
        csv: String(
            overrides.csv
            ?? widget(node, "csv_file_path")?.value
            ?? widget(node, "style_file")?.value
            ?? DEFAULT_STANDALONE_LIBRARY
        ),
        kind,
        search: String(overrides.search ?? widget(node, "search")?.value ?? ""),
        category: String(overrides.category ?? widget(node, "category")?.value ?? "All"),
        favorites_only: String(Boolean(overrides.favoritesOnly)),
        history_only: String(Boolean(overrides.historyOnly)),
        page: String(overrides.page || 1),
        page_size: String(overrides.pageSize ?? 24),
        compact: String(Boolean(overrides.browserOnly)),
    });
}

async function fetchStyles(node, nodeData, overrides = {}) {
    const response = await api.fetchApi(`/nova_styles_csv_pro/list?${browserParams(node, nodeData, overrides)}`, {
        cache: "no-store",
    });
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Style library returned HTTP ${response.status}`);
    }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Style library returned HTTP ${response.status}`);
    return data;
}

function storedStandaloneLibrary() {
    try {
        return String(localStorage.getItem(STANDALONE_LIBRARY_KEY) || DEFAULT_STANDALONE_LIBRARY);
    } catch {
        return DEFAULT_STANDALONE_LIBRARY;
    }
}

function saveStandaloneLibrary(value) {
    try {
        localStorage.setItem(STANDALONE_LIBRARY_KEY, String(value || DEFAULT_STANDALONE_LIBRARY));
    } catch {
        // The selected library remains active for this page.
    }
}

async function fetchStyleLibraries() {
    const response = await api.fetchApi("/nova_styles_csv_pro/libraries", {
        cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Library list returned HTTP ${response.status}`);
    }
    return data;
}

async function previewFolderRequest(path = undefined) {
    const options = path === undefined
        ? { cache: "no-store" }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
        };
    const response = await api.fetchApi("/nova_style_previews/location", options);
    const data = await response.json();
    if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Preview-folder request returned HTTP ${response.status}`);
    }
    return data;
}

async function openPreviewFolder() {
    const response = await api.fetchApi("/nova_style_previews/open_folder", {
        method: "POST",
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Opening the preview folder returned HTTP ${response.status}`);
    }
    return data;
}

async function refreshNovaCSVDropdown(node, nodeData, quiet = false) {
    const style = widget(node, "style");
    const category = widget(node, "category");
    if (!widget(node, "csv_file_path") || !style) return;

    const character = isCharacterLoader(nodeData);
    try {
        const data = await fetchStyles(node, nodeData);
        setComboValues(style, data.styles || [], character ? "No Character/None" : "No Style");
        setComboValues(category, data.categories || [], "All");
        markDirty(node);
        if (!quiet) {
            console.log(`[NovoLoko Style Library] Dropdown refreshed: ${data.filtered_count}/${data.count} from ${data.file_name}`);
        }
    } catch (error) {
        console.warn("[NovoLoko Style Library] Dropdown refresh failed:", error);
    }
}

function debounceRefresh(node, nodeData) {
    clearTimeout(node.__novaCSVRefreshTimer);
    node.__novaCSVRefreshTimer = setTimeout(
        () => refreshNovaCSVDropdown(node, nodeData, true),
        250,
    );
}

function wrapWidgetCallback(node, nodeData, name) {
    const target = widget(node, name);
    if (!target || target.__novaWrapped) return;
    const previous = target.callback;
    target.callback = function (...args) {
        const result = previous?.apply(this, args);
        debounceRefresh(node, nodeData);
        return result;
    };
    target.__novaWrapped = true;
}

function hashHue(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % 360;
}

function swatchBackground(item) {
    const hue = hashHue(`${item.category}/${item.name}`);
    const second = (hue + 42 + (hashHue(item.prompt) % 90)) % 360;
    return [
        `radial-gradient(circle at 24% 22%, hsla(${second},90%,72%,.82), transparent 24%)`,
        `radial-gradient(circle at 76% 70%, hsla(${hue},90%,58%,.76), transparent 31%)`,
        `linear-gradient(135deg, hsl(${hue},45%,16%), hsl(${second},55%,34%))`,
    ].join(",");
}

function previewElement(item) {
    const swatch = document.createElement("div");
    swatch.className = "nova-style-swatch";
    swatch.style.background = swatchBackground(item);
    if (item.preview_url) {
        const image = document.createElement("img");
        const size = document.createElement("span");
        image.className = "nova-style-preview-image";
        size.className = "nova-style-preview-size";
        size.hidden = true;
        image.src = item.preview_url;
        image.alt = `${item.clean_name || item.name} preview`;
        image.loading = "lazy";
        image.decoding = "async";
        image.draggable = false;
        image.onload = () => {
            const width = Math.max(0, Number(image.naturalWidth) || 0);
            const height = Math.max(0, Number(image.naturalHeight) || 0);
            if (!width || !height) return;
            size.textContent = width === height ? String(width) : `${width}×${height}`;
            size.title = `Saved preview: ${width}×${height}`;
            size.hidden = false;
        };
        image.onerror = () => {
            image.remove();
            size.remove();
        };
        swatch.append(image, size);
    }
    return swatch;
}

function ensureBrowserStyles() {
    if (document.getElementById("nova-style-browser-css")) return;
    const style = document.createElement("style");
    style.id = "nova-style-browser-css";
    style.textContent = `
        .nova-style-browser{position:fixed;inset:0;z-index:100000;background:rgba(3,5,9,.84);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:24px;color:#eef3ff;font:13px/1.35 Inter,Segoe UI,sans-serif}
        .nova-style-dialog{position:relative;width:min(1420px,96vw);height:min(920px,94vh);display:flex;flex-direction:column;background:#171a21;border:1px solid #3a4050;border-radius:18px;box-shadow:0 28px 90px #000b;overflow:hidden}
        .nova-style-head{display:flex;gap:12px;align-items:center;padding:17px 20px;border-bottom:1px solid #303541;background:linear-gradient(100deg,#242936,#161920)}
        .nova-style-title{font-size:20px;font-weight:800;letter-spacing:.2px;flex:1}.nova-style-count{color:#aeb9d0}
        .nova-style-controls{display:flex;flex-wrap:wrap;gap:9px;padding:13px 20px;border-bottom:1px solid #2c313c;background:#1d2129}.nova-style-controls input{flex:1 1 230px}.nova-style-controls select{flex:0 1 240px}
        .nova-style-controls input,.nova-style-controls select,.nova-style-browser button{border:1px solid #3b4251;border-radius:9px;background:#252a34;color:#f5f7ff;padding:9px 11px;font:inherit}
        .nova-style-browser button{cursor:pointer;font-weight:700}.nova-style-browser button:hover{border-color:#7b9cff;background:#30394b}.nova-style-browser button.active{background:#315fcf;border-color:#73a0ff}
        .nova-style-content{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0;min-height:0;flex:1;overflow:hidden}
        .nova-style-grid{padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));grid-auto-rows:max-content;gap:12px;overflow-x:hidden;overflow-y:auto;align-content:start;background:#11141a;scrollbar-gutter:stable}
        .nova-style-grid.list{grid-template-columns:1fr;grid-auto-rows:92px}
        .nova-style-card{position:relative;display:flex;flex-direction:column;min-height:252px;padding:0;overflow:hidden;text-align:left;border:1px solid #3b4251;border-radius:12px;background:#242934;color:#f5f7ff;cursor:pointer}
        .nova-style-card:hover,.nova-style-card:focus{outline:none;border-color:#7b9cff;background:#30394b}
        .nova-style-card.selected{border:2px solid #6ca1ff!important;box-shadow:0 0 0 3px #2865d755}
        .nova-style-swatch{width:100%;height:auto;aspect-ratio:1/1;position:relative;flex:none}.nova-style-grid.list .nova-style-card{display:grid;grid-template-columns:144px 1fr;min-height:92px}.nova-style-grid.list .nova-style-swatch{width:auto;height:100%;aspect-ratio:auto}
        .nova-style-swatch:after{content:"";position:absolute;inset:12%;border:1px solid #ffffff38;border-radius:50% 22% 50% 28%;transform:rotate(-14deg);box-shadow:inset 0 0 24px #fff2}
        .nova-style-preview-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#0b0d12;z-index:1}
        .nova-style-preview-size{position:absolute;right:7px;bottom:7px;z-index:4;min-width:34px;padding:3px 6px;border:1px solid #ffffff55;border-radius:6px;background:#080b10d9;color:#fff;font:800 10px/1 Inter,Segoe UI,sans-serif;text-align:center;box-shadow:0 2px 8px #000a;pointer-events:none}
        .nova-style-preview-number{position:absolute;left:7px;top:7px;z-index:4;min-width:25px;padding:4px 7px;border:1px solid #ffffff80;border-radius:999px;background:#05070ae6;color:#fff;font:900 11px/1 Inter,Segoe UI,sans-serif;text-align:center;text-shadow:0 1px 2px #000;box-shadow:0 2px 9px #000c;pointer-events:none}
        .nova-style-card-copy{padding:9px 10px;min-width:0}.nova-style-card-name{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nova-style-card-category{color:#9fabbd;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .nova-style-star{position:absolute;right:7px;top:7px;z-index:5;width:32px;height:32px;padding:0!important;border-radius:50%!important;background:#111e!important;font-size:17px!important;box-shadow:0 2px 10px #000b}.nova-style-star.on{color:#ffd45a}
        .nova-style-detail{border-left:1px solid #303541;background:#1b1f27;padding:18px;overflow:auto}.nova-style-detail h3{font-size:18px;margin:0 0 5px}.nova-style-detail .category{color:#8baeff;margin-bottom:16px}.nova-style-detail .label{color:#8f9bb0;text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.8px;margin-top:15px}.nova-style-detail .text{white-space:pre-wrap;color:#d5dbea;margin-top:5px}
        .nova-style-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.nova-style-detail-actions button{flex:1 1 auto}
        .nova-style-preview-viewer{position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(0,0,0,.92)}
        .nova-style-preview-viewer-panel{position:relative;width:min(1180px,96vw);height:min(940px,94vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid #3b4251;border-radius:15px;background:#11141a;box-shadow:0 28px 90px #000}
        .nova-style-preview-viewer-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #303541}.nova-style-preview-viewer-title{flex:1;min-width:240px;font-size:15px;font-weight:800}.nova-style-preview-zoom{min-width:52px;text-align:center;color:#b9c5da;font-weight:700}
        .nova-style-preview-viewer-stage{position:relative;min-height:0;flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;background:#080a0e}.nova-style-preview-viewer-stage.overflow-x{justify-content:flex-start}.nova-style-preview-viewer-stage.overflow-y{align-items:flex-start}
        .nova-style-preview-viewer-stage.zoomed{cursor:grab}.nova-style-preview-viewer-stage.panning{cursor:grabbing;user-select:none}
        .nova-style-preview-viewer-image{display:block;flex:0 0 auto;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.nova-style-preview-viewer-image.actual{max-width:none;max-height:none}
        .nova-style-preview-viewer-counter{position:absolute;left:50%;bottom:12px;z-index:8;transform:translateX(-50%);min-width:78px;padding:6px 10px;border:1px solid #ffffff66;border-radius:999px;background:#05070aeb;color:#fff;font:900 12px/1 Inter,Segoe UI,sans-serif;text-align:center;text-shadow:0 1px 2px #000;box-shadow:0 3px 14px #000d;pointer-events:none}
        .nova-style-empty{grid-column:1/-1;align-self:center;justify-self:center;color:#98a3b7;font-size:16px;text-align:center}
        .nova-style-foot{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid #303541;background:#1d2129}.nova-style-pages{display:flex;gap:6px;flex:1;justify-content:center}.nova-style-page{min-width:38px}
        .nova-style-settings{position:absolute;right:18px;top:116px;z-index:8;min-width:290px;padding:12px;border:1px solid #424b5d;border-radius:12px;background:#20252f;box-shadow:0 18px 45px #000b}.nova-style-settings.hidden{display:none}.nova-style-setting{display:flex;align-items:center;gap:9px;padding:7px 4px}.nova-style-setting input{width:17px;height:17px}
        .nova-style-standalone-launcher{position:fixed;right:22px;bottom:88px;z-index:99999;border:1px solid #668cff;border-radius:12px;background:#243f87;color:white;padding:10px 14px;font:700 13px Inter,Segoe UI,sans-serif;box-shadow:0 8px 24px #0008;cursor:grab;touch-action:none;user-select:none;pointer-events:auto}
        .nova-style-standalone-launcher.dragging{cursor:grabbing}
        .nova-style-standalone-launcher:hover{background:#315fcf}
        @media(max-width:850px){.nova-style-content{grid-template-columns:1fr}.nova-style-detail{display:none}}
    `;
    document.head.append(style);
}

function setSelectedStyle(node, item, csv = "") {
    const styleFile = widget(node, "style_file");
    const template = widget(node, "template_name");
    if (styleFile && template) {
        const fileValue = String(csv || styleFile.value || DEFAULT_STANDALONE_LIBRARY);
        const files = [...new Set([...(styleFile.options?.values || []), fileValue])];
        setComboValues(styleFile, files, fileValue);
        styleFile.value = fileValue;
        styleFile.callback?.(fileValue);

        const templates = [...new Set([...(template.options?.values || []), item.name])];
        setComboValues(template, templates, item.name);
        template.value = item.name;
        template.callback?.(item.name);
        markDirty(node);
        return;
    }

    const style = widget(node, "style");
    const mode = widget(node, "mode");
    const manual = widget(node, "manual_style_name");
    if (style) {
        const values = Array.isArray(style.options?.values) ? [...style.options.values] : [];
        if (!values.includes(item.name)) values.push(item.name);
        setComboValues(style, values, item.name);
        style.value = item.name;
        style.callback?.(item.name);
    }
    if (manual) manual.value = "";
    if (mode) {
        mode.value = "Manual";
        mode.callback?.("Manual");
    }
    markDirty(node);
}

async function copyText(value) {
    const text = String(value || "");
    if (!text) return false;
    await navigator.clipboard.writeText(text);
    return true;
}

async function uploadPreview(item, csv, size, file) {
    const body = new FormData();
    body.append("csv", String(csv || DEFAULT_STANDALONE_LIBRARY));
    body.append("style", item.name);
    body.append("size", String(size));
    body.append("image", file, file.name);
    const response = await api.fetchApi("/nova_style_previews/upload", {
        method: "POST",
        body,
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Preview upload failed");
    return data;
}

async function deletePreview(item, csv) {
    const response = await api.fetchApi("/nova_style_previews/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            csv: String(csv || DEFAULT_STANDALONE_LIBRARY),
            style: item.name,
        }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Preview removal failed");
    return data;
}

function graphNodes(graph = app.graph, visited = new Set()) {
    if (!graph || visited.has(graph)) return [];
    visited.add(graph);
    const result = [];
    for (const node of graph._nodes || []) {
        result.push(node);
        if (node.subgraph) result.push(...graphNodes(node.subgraph, visited));
    }
    return result;
}

async function runWidgetQueueHooks(name) {
    const pending = [];
    for (const node of graphNodes()) {
        for (const target of node.widgets || []) {
            const callback = target?.[name];
            if (typeof callback !== "function") continue;
            const result = callback.call(target, { isPartialExecution: false });
            if (result && typeof result.then === "function") pending.push(result);
        }
    }
    await Promise.all(pending);
}

async function queueCurrentWorkflow() {
    if (typeof app.graphToPrompt !== "function" || typeof api.queuePrompt !== "function") {
        throw new Error("This ComfyUI version cannot queue the current workflow from the style browser.");
    }
    await runWidgetQueueHooks("beforeQueued");
    const prompt = await app.graphToPrompt();
    const queued = await api.queuePrompt(0, prompt);
    await runWidgetQueueHooks("afterQueued");
    const promptId = String(queued?.prompt_id || "");
    if (!promptId) throw new Error("ComfyUI did not return a prompt ID for the preview run.");
    return promptId;
}

function finalGeneratedImage(historyEntry) {
    const candidates = [];
    for (const output of Object.values(historyEntry?.outputs || {})) {
        for (const item of output?.images || []) {
            if (item?.filename) candidates.push(item);
        }
    }
    return candidates.at(-1) || null;
}

function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForGeneratedImage(promptId, onProgress, isCancelled = () => false) {
    const deadline = Date.now() + GENERATED_PREVIEW_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (isCancelled()) throw new Error("Preview generation stopped.");
        const response = await api.fetchApi(`/history/${encodeURIComponent(promptId)}`, {
            cache: "no-store",
        });
        if (!response.ok) throw new Error(`ComfyUI history returned HTTP ${response.status}.`);
        const history = await response.json();
        const entry = history?.[promptId];
        if (entry) {
            const status = String(entry.status?.status_str || "").toLowerCase();
            if (status === "error") throw new Error("The preview workflow failed. Check ComfyUI's execution error.");
            const image = finalGeneratedImage(entry);
            if (image) return image;
            if (entry.status?.completed) {
                throw new Error("The workflow completed without an image output to use as the preview.");
            }
        }
        onProgress?.();
        await delay(750);
    }
    throw new Error("The preview workflow did not finish within 30 minutes.");
}

async function downloadGeneratedImage(image) {
    const params = new URLSearchParams({
        filename: String(image.filename || ""),
        subfolder: String(image.subfolder || ""),
        type: String(image.type || "output"),
    });
    const response = await api.fetchApi(`/view?${params}`);
    if (!response.ok) throw new Error(`Generated image download returned HTTP ${response.status}.`);
    const declaredLength = Number(response.headers.get("Content-Length") || 0);
    if (declaredLength > MAX_GENERATED_PREVIEW_BYTES) {
        throw new Error("The generated image is too large to use as a style preview.");
    }
    const contentType = String(response.headers.get("Content-Type") || "").split(";", 1)[0].trim();
    if (!contentType.startsWith("image/")) {
        throw new Error("ComfyUI returned a non-image output for the generated preview.");
    }
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_GENERATED_PREVIEW_BYTES) {
        throw new Error("The generated image is empty or too large to use as a style preview.");
    }
    return new File([blob], String(image.filename || "novoloko-preview.png"), {
        type: contentType,
    });
}

function compatibleStyleTargets() {
    return graphNodes().filter((candidate) =>
        widget(candidate, "medium_selection")
        || widget(candidate, "style")
        || (widget(candidate, "style_file") && widget(candidate, "template_name"))
    );
}

function styleTargetLabel(target) {
    const title = String(target?.title || target?.type || "NovoLoko style node").trim();
    return `${title} · node ${target?.id ?? "?"}`;
}

function applyStandaloneStyle(item, csv, requestedTargetId = null) {
    const compatible = compatibleStyleTargets();
    const selected = app.canvas?.current_node;
    const requested = compatible.find((candidate) => String(candidate.id) === String(requestedTargetId));
    const target = requested
        || (compatible.includes(selected)
        ? selected
        : (compatible.length === 1 ? compatible[0] : null));
    if (!target) {
        throw new Error(
            "Open this browser from Prompt Stack, Manual Prompt or a Style Loader, or select the one target node before generating."
        );
    }

    if (widget(target, "style_file") && widget(target, "template_name")) {
        setSelectedStyle(target, item, csv);
        return;
    }

    const medium = widget(target, "medium_selection");
    if (medium) {
        const file = widget(target, "medium_file_path");
        if (file) {
            file.value = csv;
            file.callback?.(csv);
        }
        const value = String(item.name || "").replace(/[\\/]+/g, " › ").trim();
        const values = [...new Set([...(medium.options?.values || []), value])];
        medium.options ||= {};
        medium.options.values = values;
        medium.value = value;
        medium.callback?.(value);
        markDirty(target);
        return;
    }

    const file = widget(target, "csv_file_path");
    if (file) {
        file.value = csv;
        file.callback?.(csv);
    }
    setSelectedStyle(target, item, csv);
}

async function setFavourite(item, enabled, kind) {
    const response = await api.fetchApi("/nova_favorites/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            kind,
            action: enabled ? "add" : "remove",
            names: [item.name],
        }),
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || "Favourite update failed");
}

function openStyleBrowser(node, nodeData = {}, options = {}) {
    ensureBrowserStyles();
    if (node) {
        if (typeof node.__novaStyleBrowser?.__novaClose === "function") node.__novaStyleBrowser.__novaClose();
        else node.__novaStyleBrowser?.remove();
    } else if (typeof standaloneBrowser?.__novaClose === "function") {
        standaloneBrowser.__novaClose();
    } else {
        standaloneBrowser?.remove();
    }

    const browserSettings = readBrowserSettings();
    const state = {
        page: 1,
        pageSize: [24, 50, 100, "all"].includes(browserSettings?.itemsPerPage)
            ? browserSettings.itemsPerPage
            : 24,
        search: String(options.search ?? widget(node, "search")?.value ?? ""),
        category: String(options.category ?? widget(node, "category")?.value ?? "All"),
        favoritesOnly: false,
        historyOnly: false,
        list: false,
        selected: null,
        data: null,
        browserOnly: true,
        csv: String(
            options.csv
            ?? widget(node, "csv_file_path")?.value
            ?? widget(node, "style_file")?.value
            ?? (options.standalone ? storedStandaloneLibrary() : DEFAULT_STANDALONE_LIBRARY)
        ),
        kind: String(options.kind || (isCharacterLoader(nodeData) ? "characters" : "styles")),
        previewSize: Number(options.previewSize ?? browserSettings.previewSize ?? 512) === 1024 ? 1024 : 512,
        generating: false,
    };
    const favoriteKind = state.kind;

    const overlay = document.createElement("div");
    overlay.className = "nova-style-browser";
    overlay.tabIndex = -1;
    if (node) node.__novaStyleBrowser = overlay;
    else standaloneBrowser = overlay;
    const dialog = document.createElement("section");
    dialog.className = "nova-style-dialog";
    const head = document.createElement("header");
    head.className = "nova-style-head";
    const title = document.createElement("div");
    title.className = "nova-style-title";
    title.textContent = options.title || "NovoLoko Visual Style Library";
    const count = document.createElement("div");
    count.className = "nova-style-count";
    const close = document.createElement("button");
    close.textContent = "Close ×";
    head.append(title, count, close);

    const controls = document.createElement("div");
    controls.className = "nova-style-controls";
    const search = document.createElement("input");
    search.placeholder = "Search style names and prompt text…";
    search.value = state.search;
    const category = document.createElement("select");
    const library = document.createElement("select");
    library.title = "Choose an installed NovoLoko CSV/YAML library";
    library.hidden = !options.standalone;
    const loadingLibrary = document.createElement("option");
    loadingLibrary.value = state.csv;
    loadingLibrary.textContent = "Library file: loading…";
    library.append(loadingLibrary);
    const targetNode = document.createElement("select");
    targetNode.title = "Choose which Prompt Stack or Style Loader receives standalone selections";
    targetNode.hidden = !options.standalone;
    const refresh = document.createElement("button");
    refresh.textContent = "↻ Refresh";
    refresh.title = "Reload this CSV/YAML and its saved preview images";
    const favorites = document.createElement("button");
    favorites.textContent = "★ Favourites";
    const history = document.createElement("button");
    history.textContent = "↶ Recent";
    const random = document.createElement("button");
    random.textContent = "⤨ Random";
    const view = document.createElement("button");
    view.textContent = "☷ List";
    const previewSize = document.createElement("select");
    previewSize.title = "Imported preview-image size";
    for (const size of [512, 1024]) {
        const option = document.createElement("option");
        option.value = String(size);
        option.textContent = `${size} previews`;
        previewSize.append(option);
    }
    previewSize.value = String(state.previewSize);
    const pageSize = document.createElement("select");
    pageSize.title = "Styles shown per page";
    for (const amount of [24, 50, 100, "all"]) {
        const option = document.createElement("option");
        option.value = String(amount);
        option.textContent = amount === "all" ? "All styles" : `${amount} per page`;
        pageSize.append(option);
    }
    pageSize.value = String(state.pageSize);
    const generateAll = document.createElement("button");
    generateAll.textContent = "Generate all missing";
    generateAll.title = "Run the current workflow once for every style in this CSV/YAML that does not yet have a preview";
    const openFolder = document.createElement("button");
    openFolder.textContent = "Open previews folder";
    openFolder.title = "Open the folder where generated and imported style previews are saved";
    const changeFolder = document.createElement("button");
    changeFolder.textContent = "Change preview folder…";
    changeFolder.title = "Choose a different absolute folder for generated and imported style previews";
    const settingsButton = document.createElement("button");
    settingsButton.textContent = "⚙ Options";
    controls.append(
        library,
        targetNode,
        search,
        category,
        refresh,
        favorites,
        history,
        random,
        view,
        pageSize,
        previewSize,
        generateAll,
        openFolder,
        changeFolder,
        settingsButton,
    );

    const content = document.createElement("div");
    content.className = "nova-style-content";
    const grid = document.createElement("div");
    grid.className = "nova-style-grid";
    const detail = document.createElement("aside");
    detail.className = "nova-style-detail";
    detail.innerHTML = "<h3>Select a style</h3><div class='text'>Click a card to select it. Double-click a saved image to open the large viewer. Use Generate + save preview when an image is missing.</div>";
    content.append(grid, detail);

    const foot = document.createElement("footer");
    foot.className = "nova-style-foot";
    const status = document.createElement("span");
    status.textContent = "Loading…";
    const pages = document.createElement("div");
    pages.className = "nova-style-pages";
    foot.append(status, pages);
    dialog.append(head, controls, content, foot);
    const settingsPanel = document.createElement("div");
    settingsPanel.className = "nova-style-settings hidden";
    function addSetting(label, key) {
        const row = document.createElement("label");
        row.className = "nova-style-setting";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(browserSettings[key]);
        input.onchange = () => {
            browserSettings[key] = input.checked;
            saveBrowserSettings(browserSettings);
        };
        const text = document.createElement("span");
        text.textContent = label;
        row.append(input, text);
        settingsPanel.append(row);
    }
    addSetting("Open preview after a single generated style", "autoOpenGenerated");
    addSetting("Wrap Previous/Next at the ends", "wrapViewerNavigation");
    dialog.append(settingsPanel);
    overlay.append(dialog);
    document.body.append(overlay);

    const syncBatchControls = (session) => {
        if (session.running) {
            generateAll.textContent = session.cancelRequested ? "Stopping…" : "■ Stop generating";
            generateAll.classList.add("active");
            if (session.message) status.textContent = session.message;
        } else {
            generateAll.textContent = "Generate all missing";
            generateAll.classList.remove("active");
        }
    };
    previewBatchSession.listeners.add(syncBatchControls);
    syncBatchControls(previewBatchSession);

    const closeBrowser = () => {
        previewBatchSession.listeners.delete(syncBatchControls);
        if (node?.__novaStyleBrowser === overlay) node.__novaStyleBrowser = null;
        if (standaloneBrowser === overlay) standaloneBrowser = null;
        overlay.remove();
    };
    overlay.__novaClose = closeBrowser;
    close.onclick = closeBrowser;
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) closeBrowser();
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeBrowser();
    });
    dialog.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeBrowser();
    });
    dialog.addEventListener("pointerdown", (event) => {
        if (event.button === 3 || event.button === 4) event.preventDefault();
    });
    dialog.addEventListener("pointerup", (event) => {
        if (event.button !== 3 && event.button !== 4) return;
        event.preventDefault();
        void navigateStyle(event.button === 3 ? -1 : 1);
    });
    for (const eventName of ["wheel", "pointerdown", "pointermove", "pointerup"]) {
        dialog.addEventListener(eventName, (event) => event.stopPropagation());
    }
    settingsButton.onclick = (event) => {
        event.stopPropagation();
        settingsPanel.classList.toggle("hidden");
        settingsButton.classList.toggle("active", !settingsPanel.classList.contains("hidden"));
    };

    function applySelection(item) {
        state.selected = item;
        if (typeof options.onSelect === "function") {
            options.onSelect(item);
        } else if (node) {
            setSelectedStyle(node, item, state.csv);
        }
    }

    function updateVisiblePreview(item) {
        const visible = (state.data?.items || []).find((candidate) => candidate.name === item.name);
        if (visible) visible.preview_url = item.preview_url;
    }

    async function requestPreviewStop() {
        if (!previewBatchSession.running || previewBatchSession.cancelRequested) return;
        previewBatchSession.cancelRequested = true;
        publishBatchStatus("Stopping the active preview generation…");
        if (!previewBatchSession.currentPromptId || typeof api.interrupt !== "function") return;
        try {
            await api.interrupt();
        } catch {
            publishBatchStatus("Stop requested. Waiting for ComfyUI to release the active preview…");
        }
    }

    async function applyAndGenerate(item, batchPosition = "", isBatch = false, suppressAutoOpen = false) {
        const ownsSession = !isBatch;
        if (state.generating || (ownsSession && previewBatchSession.running)) {
            const message = "A style preview is already generating. Stop it or wait for it to finish.";
            status.textContent = message;
            return { ok: false, message };
        }
        if (ownsSession) {
            previewBatchSession.running = true;
            previewBatchSession.cancelRequested = false;
            previewBatchSession.mode = "single";
            previewBatchSession.currentPromptId = "";
            previewBatchSession.completed = 0;
            previewBatchSession.total = 1;
            previewBatchSession.library = state.csv;
            publishBatchStatus(`Preparing ${item.clean_name || item.name}…`);
        }
        state.generating = true;
        showDetail(item);
        const setGenerationStatus = (message) => {
            status.textContent = message;
            if (previewBatchSession.running) publishBatchStatus(message);
        };
        try {
            if (options.standalone) applyStandaloneStyle(item, state.csv, targetNode.value);
            else applySelection(item);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            setGenerationStatus(`${batchPosition}Queueing ${item.clean_name || item.name} with the current workflow…`);
            const promptId = await queueCurrentWorkflow();
            previewBatchSession.currentPromptId = promptId;
            if (previewBatchSession.cancelRequested && typeof api.interrupt === "function") {
                await api.interrupt();
            }
            setGenerationStatus(`${batchPosition}Workflow queued. Waiting for its final image…`);
            const generated = await waitForGeneratedImage(promptId, () => {
                setGenerationStatus(`${batchPosition}Generating preview…`);
            }, () => previewBatchSession.cancelRequested);
            if (previewBatchSession.cancelRequested) throw new Error("Preview generation stopped.");
            setGenerationStatus(`${batchPosition}Saving ${state.previewSize}×${state.previewSize} preview…`);
            const file = await downloadGeneratedImage(generated);
            const result = await uploadPreview(item, state.csv, state.previewSize, file);
            item.preview_url = result.preview_url;
            updateVisiblePreview(item);
            renderCards();
            setGenerationStatus(`${batchPosition}Generated and saved ${result.size}×${result.size} preview`);
            if (!isBatch && !suppressAutoOpen && browserSettings.autoOpenGenerated) {
                openLargePreview(item);
            }
            return { ok: true };
        } catch (error) {
            const message = String(error?.message || "Preview generation failed");
            setGenerationStatus(message);
            return { ok: false, message };
        } finally {
            if (isBatch) previewBatchSession.currentPromptId = "";
            if (ownsSession) {
                previewBatchSession.running = false;
                previewBatchSession.cancelRequested = false;
                previewBatchSession.mode = "";
                previewBatchSession.currentPromptId = "";
                publishBatchStatus();
            }
            state.generating = false;
            if (overlay.isConnected) showDetail(item);
        }
    }

    function canGeneratePreview(item) {
        const clean = String(item?.clean_name || item?.name || "").trim().toLowerCase();
        return clean && !["none", "no style", "random"].includes(clean);
    }

    async function fetchWholeLibrary() {
        const overrides = {
            ...state,
            search: "",
            category: "All",
            favoritesOnly: false,
            historyOnly: false,
            page: 1,
            pageSize: 100,
        };
        const first = await fetchStyles(node, nodeData, overrides);
        const items = [...(first.items || [])];
        for (let page = 2; page <= Number(first.page_count || 1); page += 1) {
            const next = await fetchStyles(node, nodeData, { ...overrides, page });
            items.push(...(next.items || []));
        }
        return items;
    }

    async function generateWholeLibrary() {
        if (previewBatchSession.running) {
            await requestPreviewStop();
            return;
        }
        previewBatchSession.running = true;
        previewBatchSession.cancelRequested = false;
        previewBatchSession.mode = "batch";
        previewBatchSession.currentPromptId = "";
        previewBatchSession.completed = 0;
        previewBatchSession.total = 0;
        previewBatchSession.library = state.csv;
        publishBatchStatus("Checking the complete CSV/YAML for missing previews…");
        let finalMessage = "";
        let missing = [];
        let completed = 0;
        try {
            generateAll.disabled = true;
            status.textContent = "Checking the complete CSV/YAML for missing previews…";
            const allItems = await fetchWholeLibrary();
            missing = allItems.filter((item) => canGeneratePreview(item) && !item.preview_url);
            previewBatchSession.total = missing.length;
            if (previewBatchSession.cancelRequested) {
                finalMessage = "Preview generation stopped before any styles were queued.";
                return;
            }
            if (!missing.length) {
                finalMessage = "Every style in this CSV/YAML already has a preview.";
                return;
            }
            const warning = [
                `Generate ${missing.length.toLocaleString()} missing style previews?`,
                "",
                "This runs the current ComfyUI workflow once per style, one at a time.",
                "A large CSV/YAML may take many hours. Existing previews will not be replaced.",
                "You can stop after the current preview from this button.",
            ].join("\n");
            if (!window.confirm(warning)) {
                finalMessage = "Whole-library preview generation was cancelled.";
                return;
            }
            publishBatchStatus(`Starting 1 of ${missing.length.toLocaleString()} missing previews…`);
            generateAll.disabled = false;
            for (const item of missing) {
                if (previewBatchSession.cancelRequested) break;
                const position = `[${completed + 1}/${missing.length}] `;
                const result = await applyAndGenerate(item, position, true);
                if (!result?.ok) {
                    if (!previewBatchSession.cancelRequested) {
                        finalMessage = `${position}Stopped: ${result?.message || "preview generation failed"}`;
                    }
                    break;
                }
                completed += 1;
                previewBatchSession.completed = completed;
            }
            if (previewBatchSession.cancelRequested) {
                finalMessage = `Stopped after ${completed.toLocaleString()} of ${missing.length.toLocaleString()} missing previews. Run again to resume the remaining styles.`;
            } else if (completed === missing.length) {
                finalMessage = `Completed all ${completed.toLocaleString()} missing previews.`;
            }
        } catch (error) {
            finalMessage = String(error?.message || "Whole-library preview generation failed");
        } finally {
            previewBatchSession.running = false;
            previewBatchSession.cancelRequested = false;
            previewBatchSession.mode = "";
            previewBatchSession.currentPromptId = "";
            previewBatchSession.completed = completed;
            previewBatchSession.total = missing.length;
            publishBatchStatus(finalMessage);
            generateAll.disabled = false;
            if (finalMessage && overlay.isConnected) status.textContent = finalMessage;
            if (state.selected && overlay.isConnected) showDetail(state.selected);
        }
    }

    function openLargePreview(item) {
        if (!item.preview_url) return;
        let currentItem = item;
        let fitMode = true;
        let zoom = 1;
        let navigating = false;
        let pan = null;
        const viewer = document.createElement("div");
        viewer.className = "nova-style-preview-viewer";
        viewer.tabIndex = -1;
        const panel = document.createElement("section");
        panel.className = "nova-style-preview-viewer-panel";
        const viewerHead = document.createElement("header");
        viewerHead.className = "nova-style-preview-viewer-head";
        const viewerTitle = document.createElement("div");
        viewerTitle.className = "nova-style-preview-viewer-title";
        viewerTitle.textContent = currentItem.clean_name || currentItem.name;
        const previous = document.createElement("button");
        previous.textContent = "← Previous";
        const next = document.createElement("button");
        next.textContent = "Next →";
        const generateNew = document.createElement("button");
        generateNew.textContent = "Generate new";
        generateNew.title = "Run the current workflow and replace this saved style preview";
        const zoomOut = document.createElement("button");
        zoomOut.textContent = "Zoom −";
        const zoomLabel = document.createElement("span");
        zoomLabel.className = "nova-style-preview-zoom";
        zoomLabel.textContent = "Fit";
        const zoomIn = document.createElement("button");
        zoomIn.textContent = "Zoom +";
        const sizeToggle = document.createElement("button");
        sizeToggle.textContent = "Actual size";
        const closeViewer = document.createElement("button");
        closeViewer.textContent = "Close ×";
        const stage = document.createElement("div");
        stage.className = "nova-style-preview-viewer-stage";
        const image = document.createElement("img");
        image.className = "nova-style-preview-viewer-image";
        image.draggable = false;
        const viewerCounter = document.createElement("div");
        viewerCounter.className = "nova-style-preview-viewer-counter";
        function activeViewerPosition(target = currentItem) {
            const data = state.data || {};
            const items = data.items || [];
            const localIndex = items.findIndex((candidate) => candidate.name === target?.name);
            const page = Math.max(1, Number(data.page || state.page || 1));
            const pageSize = Math.max(1, Number(data.page_size || state.pageSize || items.length || 1));
            const total = Math.max(0, Number(data.filtered_count || items.length));
            const index = localIndex >= 0
                ? (page - 1) * pageSize + localIndex + 1
                : 0;
            return { index: Math.min(total, index), total };
        }
        function updateViewerCounter() {
            const position = activeViewerPosition();
            viewerCounter.textContent = `${position.index.toLocaleString()} / ${position.total.toLocaleString()}`;
        }
        function updateTitle() {
            const dimensions = image.naturalWidth && image.naturalHeight
                ? ` · ${image.naturalWidth}×${image.naturalHeight}`
                : "";
            viewerTitle.textContent = `${currentItem.clean_name || currentItem.name}${dimensions}`;
            updateViewerCounter();
        }
        function applyView() {
            image.classList.toggle("actual", !fitMode);
            stage.classList.toggle("zoomed", !fitMode);
            if (fitMode) {
                image.style.width = "";
                image.style.height = "";
                stage.classList.remove("overflow-x", "overflow-y");
                zoomLabel.textContent = "Fit";
                sizeToggle.textContent = "Actual size";
            } else {
                const renderedWidth = Math.max(1, image.naturalWidth * zoom);
                const renderedHeight = Math.max(1, image.naturalHeight * zoom);
                image.style.width = `${renderedWidth}px`;
                image.style.height = "auto";
                stage.classList.toggle("overflow-x", renderedWidth > Math.max(1, stage.clientWidth - 32));
                stage.classList.toggle("overflow-y", renderedHeight > Math.max(1, stage.clientHeight - 32));
                zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                sizeToggle.textContent = "Fit to window";
            }
        }
        function setZoom(multiplier, clientX = null, clientY = null) {
            if (!image.naturalWidth) return;
            const stageRect = stage.getBoundingClientRect();
            const before = image.getBoundingClientRect();
            const anchorX = Number.isFinite(clientX)
                ? Math.max(stageRect.left, Math.min(stageRect.right, clientX))
                : stageRect.left + stageRect.width / 2;
            const anchorY = Number.isFinite(clientY)
                ? Math.max(stageRect.top, Math.min(stageRect.bottom, clientY))
                : stageRect.top + stageRect.height / 2;
            const sourceX = before.width > 0
                ? Math.max(0, Math.min(1, (anchorX - before.left) / before.width))
                : 0.5;
            const sourceY = before.height > 0
                ? Math.max(0, Math.min(1, (anchorY - before.top) / before.height))
                : 0.5;
            if (fitMode) {
                const fittedWidth = Math.max(1, before.width);
                zoom = fittedWidth / image.naturalWidth;
            }
            fitMode = false;
            zoom = Math.min(32, Math.max(0.05, zoom * multiplier));
            applyView();
            const after = image.getBoundingClientRect();
            stage.scrollLeft += after.left + sourceX * after.width - anchorX;
            stage.scrollTop += after.top + sourceY * after.height - anchorY;
        }
        function loadViewerItem(nextItem) {
            currentItem = nextItem;
            fitMode = true;
            zoom = 1;
            stage.scrollTo({ left: 0, top: 0 });
            image.alt = `${currentItem.clean_name || currentItem.name} large preview`;
            image.src = currentItem.preview_url;
            viewerTitle.textContent = currentItem.clean_name || currentItem.name;
            updateViewerCounter();
            applyView();
        }
        image.onload = () => {
            updateTitle();
            applyView();
        };
        image.onerror = () => {
            viewerTitle.textContent = "Preview image could not be loaded";
            sizeToggle.disabled = true;
            zoomOut.disabled = true;
            zoomIn.disabled = true;
        };
        sizeToggle.onclick = () => {
            if (fitMode) {
                fitMode = false;
                zoom = 1;
            } else {
                fitMode = true;
            }
            applyView();
        };
        zoomOut.onclick = () => setZoom(1 / 1.15);
        zoomIn.onclick = () => setZoom(1.15);
        generateNew.onclick = async () => {
            if (state.generating) return;
            const original = generateNew.textContent;
            generateNew.disabled = true;
            generateNew.textContent = "Generating…";
            try {
                const result = await applyAndGenerate(currentItem, "", false, true);
                if (result?.ok && viewer.isConnected) loadViewerItem(currentItem);
            } finally {
                generateNew.textContent = original;
                generateNew.disabled = false;
            }
        };
        stage.addEventListener("wheel", (event) => {
            event.preventDefault();
            event.stopPropagation();
            setZoom(
                event.deltaY < 0 ? 1.15 : 1 / 1.15,
                event.clientX,
                event.clientY,
            );
        }, { passive: false });
        stage.addEventListener("pointerdown", (event) => {
            if (fitMode || (event.button !== 0 && event.button !== 1)) return;
            event.preventDefault();
            pan = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: stage.scrollLeft,
                top: stage.scrollTop,
            };
            stage.setPointerCapture?.(event.pointerId);
            stage.classList.add("panning");
        });
        stage.addEventListener("pointermove", (event) => {
            if (!pan || event.pointerId !== pan.pointerId) return;
            event.preventDefault();
            stage.scrollLeft = pan.left - (event.clientX - pan.x);
            stage.scrollTop = pan.top - (event.clientY - pan.y);
        });
        const endPan = (event) => {
            if (!pan || event.pointerId !== pan.pointerId) return;
            stage.releasePointerCapture?.(event.pointerId);
            pan = null;
            stage.classList.remove("panning");
        };
        stage.addEventListener("pointerup", endPan);
        stage.addEventListener("pointercancel", endPan);
        image.ondblclick = (event) => {
            event.preventDefault();
            sizeToggle.click();
        };

        async function navigatePreview(direction) {
            if (navigating) return;
            navigating = true;
            previous.disabled = true;
            next.disabled = true;
            try {
                const firstData = state.data || await fetchStyles(node, nodeData, state);
                const pageCount = Math.max(1, Number(firstData.page_count || 1));
                let page = Number(state.page || firstData.page || 1);
                let pageData = firstData;
                for (let checkedPages = 0; checkedPages < pageCount; checkedPages += 1) {
                    const items = pageData.items || [];
                    const currentIndex = items.findIndex((candidate) => candidate.name === currentItem.name);
                    let index = currentIndex >= 0
                        ? currentIndex + direction
                        : (direction > 0 ? 0 : items.length - 1);
                    while (index >= 0 && index < items.length) {
                        const candidate = items[index];
                        if (candidate.preview_url && candidate.name !== currentItem.name) {
                            state.page = page;
                            state.data = pageData;
                            state.selected = candidate;
                            renderCards();
                            renderPages();
                            showDetail(candidate);
                            loadViewerItem(candidate);
                            return;
                        }
                        index += direction;
                    }
                    let nextPage = page + direction;
                    if (nextPage < 1 || nextPage > pageCount) {
                        if (!browserSettings.wrapViewerNavigation) break;
                        nextPage = direction > 0 ? 1 : pageCount;
                    }
                    page = nextPage;
                    pageData = await fetchStyles(node, nodeData, { ...state, page });
                }
                viewerTitle.textContent = "No other saved preview in this filter";
                setTimeout(() => {
                    if (viewer.isConnected) updateTitle();
                }, 1200);
            } catch {
                viewerTitle.textContent = "Could not load the next saved preview";
            } finally {
                navigating = false;
                previous.disabled = false;
                next.disabled = false;
            }
        }
        previous.onclick = () => void navigatePreview(-1);
        next.onclick = () => void navigatePreview(1);
        const closeLargePreview = () => viewer.remove();
        closeViewer.onclick = closeLargePreview;
        viewer.addEventListener("pointerdown", (event) => {
            if (event.target === viewer) closeLargePreview();
        });
        viewer.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                closeLargePreview();
            } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                void navigatePreview(-1);
            } else if (event.key === "ArrowRight") {
                event.preventDefault();
                void navigatePreview(1);
            }
        });
        viewer.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            closeLargePreview();
        });
        panel.addEventListener("pointerdown", (event) => {
            if (event.button === 3 || event.button === 4) event.preventDefault();
        });
        panel.addEventListener("pointerup", (event) => {
            if (event.button !== 3 && event.button !== 4) return;
            event.preventDefault();
            void navigatePreview(event.button === 3 ? -1 : 1);
        });
        for (const eventName of ["pointerdown", "pointermove", "pointerup"]) {
            panel.addEventListener(eventName, (event) => event.stopPropagation());
        }
        viewerHead.append(
            viewerTitle,
            previous,
            next,
            generateNew,
            zoomOut,
            zoomLabel,
            zoomIn,
            sizeToggle,
            closeViewer,
        );
        stage.append(image);
        panel.append(viewerHead, stage, viewerCounter);
        viewer.append(panel);
        document.body.append(viewer);
        loadViewerItem(currentItem);
        viewer.focus();
    }

    function showDetail(item) {
        detail.replaceChildren();
        const heading = document.createElement("h3");
        heading.textContent = item.clean_name || item.name;
        const categoryText = document.createElement("div");
        categoryText.className = "category";
        categoryText.textContent = item.category;
        detail.append(heading, categoryText);
        for (const [label, value] of [["Positive prompt", item.prompt], ["Negative prompt", item.negative]]) {
            const labelElement = document.createElement("div");
            labelElement.className = "label";
            labelElement.textContent = label;
            const textElement = document.createElement("div");
            textElement.className = "text";
            textElement.textContent = value || "None";
            detail.append(labelElement, textElement);
        }
        const actions = document.createElement("div");
        actions.className = "nova-style-detail-actions";
        const copyPositive = document.createElement("button");
        copyPositive.textContent = options.standalone ? "Copy positive prompt" : "Apply style";
        copyPositive.onclick = async () => {
            try {
                if (options.standalone) {
                    const copied = await copyText(item.prompt);
                    status.textContent = copied ? "Positive prompt copied" : "This style has no positive prompt";
                } else {
                    applySelection(item);
                    status.textContent = `Selected ${item.clean_name || item.name}`;
                }
            } catch {
                status.textContent = "Clipboard access was unavailable";
            }
        };
        const copyNegative = document.createElement("button");
        copyNegative.textContent = "Copy negative";
        copyNegative.onclick = async () => {
            try {
                const copied = await copyText(item.negative);
                status.textContent = copied ? "Negative prompt copied" : "This style has no negative prompt";
            } catch {
                status.textContent = "Clipboard access was unavailable";
            }
        };
        const generateImage = document.createElement("button");
        generateImage.textContent = state.generating ? "Generating preview…" : "Generate + save preview";
        generateImage.title = "Apply this style, run the current ComfyUI workflow, and save its final image on this card";
        generateImage.disabled = state.generating || previewBatchSession.running;
        generateImage.onclick = () => void applyAndGenerate(item);
        const viewLarge = document.createElement("button");
        viewLarge.textContent = "View larger";
        viewLarge.title = "Open this stored preview in a large uncropped viewer";
        viewLarge.disabled = !item.preview_url;
        viewLarge.onclick = () => openLargePreview(item);
        const addImage = document.createElement("button");
        addImage.textContent = item.preview_url ? "Replace image…" : "Add image…";
        const imageInput = document.createElement("input");
        imageInput.type = "file";
        imageInput.accept = "image/png,image/jpeg,image/webp";
        imageInput.hidden = true;
        addImage.onclick = () => imageInput.click();
        imageInput.onchange = async () => {
            const file = imageInput.files?.[0];
            if (!file) return;
            status.textContent = `Importing ${state.previewSize}×${state.previewSize} preview…`;
            try {
                const result = await uploadPreview(item, state.csv, state.previewSize, file);
                item.preview_url = result.preview_url;
                renderCards();
                showDetail(item);
                status.textContent = `Preview saved at ${result.size}×${result.size}`;
            } catch (error) {
                status.textContent = String(error?.message || "Preview import failed");
            }
        };
        const removeImage = document.createElement("button");
        removeImage.textContent = "Remove image";
        removeImage.disabled = !item.preview_url;
        removeImage.onclick = async () => {
            try {
                await deletePreview(item, state.csv);
                item.preview_url = "";
                renderCards();
                showDetail(item);
                status.textContent = "Preview removed";
            } catch (error) {
                status.textContent = String(error?.message || "Preview removal failed");
            }
        };
        actions.append(copyPositive, copyNegative, generateImage, viewLarge, addImage, removeImage, imageInput);
        detail.append(actions);
    }

    function renderPages() {
        pages.replaceChildren();
        const pageCount = Number(state.data?.page_count || 1);
        const candidates = [...new Set([1, state.page - 1, state.page, state.page + 1, pageCount])]
            .filter((value) => value >= 1 && value <= pageCount)
            .sort((a, b) => a - b);
        for (const pageNumber of candidates) {
            const button = document.createElement("button");
            button.className = `nova-style-page${pageNumber === state.page ? " active" : ""}`;
            button.textContent = String(pageNumber);
            button.onclick = () => {
                state.page = pageNumber;
                void load();
            };
            pages.append(button);
        }
    }

    function renderCards() {
        grid.replaceChildren();
        const items = state.data?.items || [];
        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "nova-style-empty";
            empty.textContent = state.historyOnly
                ? "No recent styles match this library and filter."
                : "No styles match. Clear the search or choose another category.";
            grid.append(empty);
            return;
        }
        const page = Math.max(1, Number(state.data?.page || state.page || 1));
        const pageSize = Math.max(1, Number(state.data?.page_size || state.pageSize || items.length || 1));
        for (const [localIndex, item] of items.entries()) {
            const card = document.createElement("div");
            card.className = `nova-style-card${state.selected?.name === item.name ? " selected" : ""}`;
            card.dataset.styleName = item.name;
            card.title = item.prompt || item.name;
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            const swatch = previewElement(item);
            const number = document.createElement("span");
            number.className = "nova-style-preview-number";
            number.textContent = String((page - 1) * pageSize + localIndex + 1);
            number.title = `Style ${(page - 1) * pageSize + localIndex + 1}`;
            swatch.append(number);
            const copy = document.createElement("div");
            copy.className = "nova-style-card-copy";
            const name = document.createElement("div");
            name.className = "nova-style-card-name";
            name.textContent = item.clean_name || item.name;
            const group = document.createElement("div");
            group.className = "nova-style-card-category";
            group.textContent = item.category;
            copy.append(name, group);
            const star = document.createElement("button");
            star.className = `nova-style-star${item.favorite ? " on" : ""}`;
            star.textContent = item.favorite ? "★" : "☆";
            star.title = item.favorite ? "Remove from favourites" : "Add to favourites";
            star.onclick = async (event) => {
                event.preventDefault();
                event.stopPropagation();
                try {
                    await setFavourite(item, !item.favorite, favoriteKind);
                    item.favorite = !item.favorite;
                    renderCards();
                } catch (error) {
                    status.textContent = error.message;
                }
            };
            star.ondblclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
            };
            card.onclick = () => {
                state.selected = item;
                if (!options.standalone) applySelection(item);
                showDetail(item);
                renderCards();
                status.textContent = `Selected ${item.clean_name || item.name}`;
            };
            card.ondblclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (item.preview_url) {
                    openLargePreview(item);
                } else {
                    status.textContent = "No saved preview yet. Use Generate + save preview or Add image.";
                }
            };
            card.onkeydown = (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    card.click();
                }
            };
            card.append(swatch, copy, star);
            grid.append(card);
        }
    }

    async function navigateStyle(direction) {
        const currentData = state.data;
        const pageCount = Math.max(1, Number(currentData?.page_count || 1));
        let page = Number(state.page || 1);
        let data = currentData;
        let index = (data?.items || []).findIndex((candidate) => candidate.name === state.selected?.name);
        for (let checkedPages = 0; checkedPages < pageCount; checkedPages += 1) {
            const items = data?.items || [];
            index = index >= 0 ? index + direction : (direction > 0 ? 0 : items.length - 1);
            if (index >= 0 && index < items.length) {
                const selected = items[index];
                state.selected = selected;
                if (!options.standalone) applySelection(selected);
                showDetail(selected);
                renderCards();
                const selectedCard = [...grid.querySelectorAll(".nova-style-card")]
                    .find((card) => card.dataset.styleName === selected.name);
                selectedCard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                status.textContent = `Selected ${selected.clean_name || selected.name}`;
                return;
            }
            let nextPage = page + direction;
            if (nextPage < 1 || nextPage > pageCount) {
                if (!browserSettings.wrapViewerNavigation) return;
                nextPage = direction > 0 ? 1 : pageCount;
            }
            page = nextPage;
            data = await fetchStyles(node, nodeData, { ...state, page });
            state.page = page;
            state.data = data;
            index = direction > 0 ? -1 : (data.items || []).length;
            renderPages();
        }
    }

    async function load() {
        status.textContent = "Loading styles…";
        grid.setAttribute("aria-busy", "true");
        try {
            const data = await fetchStyles(node, nodeData, state);
            state.data = data;
            state.page = Number(data.page || 1);
            count.textContent = `${Number(data.filtered_count || 0).toLocaleString()} of ${Number(data.count || 0).toLocaleString()} styles`;
            status.textContent = `${data.file_name} • page ${data.page} of ${data.page_count}`;
            const currentCategory = state.category;
            category.replaceChildren();
            for (const name of data.categories || ["All"]) {
                const option = document.createElement("option");
                option.value = name;
                option.textContent = name;
                category.append(option);
            }
            category.value = [...category.options].some((option) => option.value === currentCategory)
                ? currentCategory
                : "All";
            renderCards();
            renderPages();
            if (previewBatchSession.running) syncBatchControls(previewBatchSession);
        } catch (error) {
            grid.replaceChildren();
            const empty = document.createElement("div");
            empty.className = "nova-style-empty";
            empty.textContent = "The style library could not be loaded. Check the CSV/YAML path and try Reload.";
            grid.append(empty);
            status.textContent = String(error?.message || "Style library unavailable");
        } finally {
            grid.removeAttribute("aria-busy");
        }
    }

    let searchTimer;
    search.oninput = () => {
        state.search = search.value;
        state.page = 1;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => void load(), 180);
    };
    category.onchange = () => {
        state.category = category.value;
        state.page = 1;
        void load();
    };
    refresh.onclick = async () => {
        refresh.disabled = true;
        status.textContent = "Refreshing styles and saved previews…";
        try {
            await load();
            if (!previewBatchSession.running) {
                status.textContent = `${state.data?.file_name || "Style library"} refreshed`;
            }
        } finally {
            refresh.disabled = false;
        }
    };
    favorites.onclick = () => {
        state.favoritesOnly = !state.favoritesOnly;
        state.historyOnly = false;
        state.page = 1;
        favorites.classList.toggle("active", state.favoritesOnly);
        history.classList.remove("active");
        void load();
    };
    history.onclick = () => {
        state.historyOnly = !state.historyOnly;
        state.favoritesOnly = false;
        state.page = 1;
        history.classList.toggle("active", state.historyOnly);
        favorites.classList.remove("active");
        void load();
    };
    random.onclick = () => {
        const items = state.data?.items || [];
        if (!items.length) return;
        const item = items[Math.floor(Math.random() * items.length)];
        state.selected = item;
        if (!options.standalone) applySelection(item);
        showDetail(item);
        renderCards();
        status.textContent = `Random selection: ${item.clean_name || item.name}`;
    };
    view.onclick = () => {
        state.list = !state.list;
        grid.classList.toggle("list", state.list);
        view.textContent = state.list ? "▦ Grid" : "☷ List";
        view.classList.toggle("active", state.list);
    };
    previewSize.onchange = () => {
        state.previewSize = Number(previewSize.value) === 1024 ? 1024 : 512;
        browserSettings.previewSize = state.previewSize;
        saveBrowserSettings(browserSettings);
    };
    pageSize.onchange = () => {
        state.pageSize = pageSize.value === "all"
            ? "all"
            : ([24, 50, 100].includes(Number(pageSize.value)) ? Number(pageSize.value) : 24);
        state.page = 1;
        browserSettings.itemsPerPage = state.pageSize;
        saveBrowserSettings(browserSettings);
        void load();
    };
    library.onchange = () => {
        state.csv = library.value || DEFAULT_STANDALONE_LIBRARY;
        state.page = 1;
        state.search = "";
        state.category = "All";
        state.favoritesOnly = false;
        state.historyOnly = false;
        state.selected = null;
        search.value = "";
        favorites.classList.remove("active");
        history.classList.remove("active");
        saveStandaloneLibrary(state.csv);
        void load();
    };
    targetNode.onchange = () => {
        const target = compatibleStyleTargets().find(
            (candidate) => String(candidate.id) === String(targetNode.value)
        );
        if (!target) {
            status.textContent = "Select a Prompt Stack or Style Loader before generating.";
            return;
        }
        const file = widget(target, widget(target, "medium_selection") ? "medium_file_path" : "csv_file_path");
        if (file) {
            file.value = state.csv;
            file.callback?.(state.csv);
            markDirty(target);
        }
        status.textContent = `${state.data?.file_name || "Library"} assigned to ${styleTargetLabel(target)}`;
    };
    generateAll.onclick = () => {
        if (previewBatchSession.running) void requestPreviewStop();
        else void generateWholeLibrary();
    };
    openFolder.onclick = async () => {
        try {
            const data = await openPreviewFolder();
            status.textContent = `Opened preview folder: ${data.path}`;
        } catch (error) {
            status.textContent = String(error?.message || "Could not open the preview folder");
        }
    };
    changeFolder.onclick = async () => {
        try {
            const current = await previewFolderRequest();
            const requested = window.prompt(
                [
                    "Enter an absolute folder for NovoLoko style previews.",
                    "Leave it empty to restore the package data/style_previews folder.",
                    "Existing previews are not moved automatically.",
                ].join("\n"),
                current.path || "",
            );
            if (requested === null) return;
            const changed = await previewFolderRequest(requested.trim());
            status.textContent = changed.configured
                ? `Preview folder changed to ${changed.path}`
                : `Preview folder restored to ${changed.path}`;
            await load();
        } catch (error) {
            status.textContent = String(error?.message || "Could not change the preview folder");
        }
    };

    async function populateLibraryChoices() {
        if (!options.standalone) return;
        try {
            const data = await fetchStyleLibraries();
            const choices = Array.isArray(data.libraries) ? data.libraries : [];
            library.replaceChildren();
            for (const item of choices) {
                const option = document.createElement("option");
                option.value = String(item.path || "");
                option.textContent = `${item.group || "library"} · ${item.name || item.path}`;
                library.append(option);
            }
            const paths = choices.map((item) => String(item.path || ""));
            if (!paths.includes(state.csv)) {
                state.csv = paths.includes(String(data.default || ""))
                    ? String(data.default)
                    : (paths[0] || DEFAULT_STANDALONE_LIBRARY);
            }
            library.value = state.csv;
            saveStandaloneLibrary(state.csv);
            state.page = 1;
            await load();
        } catch (error) {
            library.replaceChildren(loadingLibrary);
            loadingLibrary.textContent = "Library file list unavailable";
            status.textContent = String(error?.message || "Library file list unavailable");
        }
    }

    function populateTargetChoices() {
        if (!options.standalone) return;
        const choices = compatibleStyleTargets();
        const current = app.canvas?.current_node;
        targetNode.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = choices.length
            ? "Choose workflow target…"
            : "No Prompt Stack or Style Loader found";
        targetNode.append(placeholder);
        for (const target of choices) {
            const option = document.createElement("option");
            option.value = String(target.id);
            option.textContent = styleTargetLabel(target);
            targetNode.append(option);
        }
        if (choices.includes(current)) targetNode.value = String(current.id);
        else if (choices.length === 1) targetNode.value = String(choices[0].id);
    }

    overlay.focus();
    if (options.standalone) {
        populateTargetChoices();
        void populateLibraryChoices();
    }
    void load();
}

window.NovoLokoStyleBrowser = {
    open(options = {}) {
        openStyleBrowser(options.node || null, options.nodeData || {}, options);
    },
};

function clampLauncherPosition(launcher, left, top) {
    const margin = 8;
    const width = launcher.offsetWidth || 104;
    const height = launcher.offsetHeight || 42;
    return {
        left: Math.max(margin, Math.min(Number(left) || margin, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(Number(top) || margin, window.innerHeight - height - margin)),
    };
}

function placeLauncher(launcher, left, top, persist = false) {
    const position = clampLauncherPosition(launcher, left, top);
    launcher.style.left = `${position.left}px`;
    launcher.style.top = `${position.top}px`;
    launcher.style.right = "auto";
    launcher.style.bottom = "auto";
    if (persist) {
        try {
            localStorage.setItem(LAUNCHER_POSITION_KEY, JSON.stringify(position));
        } catch {
            // The launcher still works when browser storage is unavailable.
        }
    }
}

function installStandaloneLauncher() {
    const existing = document.getElementById("nova-style-standalone-launcher");
    if (existing) return existing;
    ensureBrowserStyles();
    const launcher = document.createElement("button");
    launcher.id = "nova-style-standalone-launcher";
    launcher.className = "nova-style-standalone-launcher";
    launcher.textContent = "🎨 Styles";
    launcher.title = "Click to open. Drag to move.";
    let saved = null;
    try {
        saved = JSON.parse(localStorage.getItem(LAUNCHER_POSITION_KEY) || "null");
    } catch {
        saved = null;
    }
    (document.body || document.documentElement).append(launcher);
    requestAnimationFrame(() => {
        if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) {
            placeLauncher(launcher, saved.left, saved.top);
        }
    });

    let drag = null;
    let suppressClick = false;
    launcher.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const box = launcher.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            left: box.left,
            top: box.top,
            moved: false,
        };
        launcher.classList.add("dragging");
        launcher.setPointerCapture?.(event.pointerId);
    });
    launcher.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const dx = event.clientX - drag.originX;
        const dy = event.clientY - drag.originY;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        placeLauncher(launcher, drag.left + dx, drag.top + dy);
    });
    launcher.addEventListener("pointerup", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.stopPropagation();
        suppressClick = drag.moved;
        const box = launcher.getBoundingClientRect();
        placeLauncher(launcher, box.left, box.top, true);
        launcher.classList.remove("dragging");
        launcher.releasePointerCapture?.(event.pointerId);
        drag = null;
    });
    launcher.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (suppressClick) {
            suppressClick = false;
            return;
        }
        openStyleBrowser(null, {}, {
            standalone: true,
            csv: storedStandaloneLibrary(),
            kind: "styles",
            title: "NovoLoko Standalone Style Browser",
        });
    });
    window.addEventListener("resize", () => {
        if (!launcher.isConnected || !launcher.style.left) return;
        const box = launcher.getBoundingClientRect();
        placeLauncher(launcher, box.left, box.top, true);
    });
    return launcher;
}

app.registerExtension({
    name: "NovoLoko.CSVStyleVisualLibrary.v391",
    setup() {
        bindPreviewBatchExecutionEvents();
        installStandaloneLauncher();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const styleLoader = isNovaStyleLoader(nodeData);
        const promptStyler = isPromptStyler(nodeData);
        if (!styleLoader && !promptStyler) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            const node = this;

            if (!node.__novaCSVVisualBrowserAdded) {
                const browse = node.addWidget(
                    "button",
                    isCharacterLoader(nodeData)
                        ? "Browse characters visually…"
                        : (promptStyler ? "Browse CSV / YAML styles visually…" : "Browse styles visually…"),
                    null,
                    () => openStyleBrowser(node, nodeData, {
                        csv: String(
                            widget(node, promptStyler ? "style_file" : "csv_file_path")?.value
                            || DEFAULT_STANDALONE_LIBRARY
                        ),
                        title: promptStyler
                            ? "NovoLoko Manual Prompt — CSV / YAML styles"
                            : undefined,
                    }),
                );
                browse.serialize = false;
                if (styleLoader) {
                    const reload = node.addWidget(
                        "button",
                        "↻ Reload CSV / YAML",
                        null,
                        () => refreshNovaCSVDropdown(node, nodeData, false),
                    );
                    reload.serialize = false;
                }
                node.__novaCSVVisualBrowserAdded = true;
            }

            if (styleLoader) {
                for (const name of ["csv_file_path", "category", "search", "favorites_list", "use_saved_favorites"]) {
                    wrapWidgetCallback(node, nodeData, name);
                }
                setTimeout(() => refreshNovaCSVDropdown(node, nodeData, true), 100);
            }
            return result;
        };

        const originalOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            this.__novaStyleBrowser?.remove();
            this.__novaStyleBrowser = null;
            return originalOnRemoved?.apply(this, arguments);
        };
    },
});
