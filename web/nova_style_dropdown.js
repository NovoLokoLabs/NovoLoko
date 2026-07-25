import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const DEFAULT_STANDALONE_LIBRARY = "styles/novoloko_all_yaml_styles.yaml";
const MAX_GENERATED_PREVIEW_BYTES = 32 * 1024 * 1024;
const GENERATED_PREVIEW_TIMEOUT_MS = 30 * 60 * 1000;
const LAUNCHER_POSITION_KEY = "novoloko.styleBrowserLauncher.v1";
let standaloneBrowser = null;

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
        csv: String(overrides.csv ?? widget(node, "csv_file_path")?.value ?? DEFAULT_STANDALONE_LIBRARY),
        kind,
        search: String(overrides.search ?? widget(node, "search")?.value ?? ""),
        category: String(overrides.category ?? widget(node, "category")?.value ?? "All"),
        favorites_only: String(Boolean(overrides.favoritesOnly)),
        history_only: String(Boolean(overrides.historyOnly)),
        page: String(overrides.page || 1),
        page_size: String(overrides.pageSize || 24),
        compact: String(Boolean(overrides.browserOnly)),
    });
}

async function fetchStyles(node, nodeData, overrides = {}) {
    const response = await api.fetchApi(`/nova_styles_csv_pro/list?${browserParams(node, nodeData, overrides)}`);
    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error(`Style library returned HTTP ${response.status}`);
    }
    if (!response.ok || !data?.ok) throw new Error(data?.error || `Style library returned HTTP ${response.status}`);
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
        image.className = "nova-style-preview-image";
        image.src = item.preview_url;
        image.alt = `${item.clean_name || item.name} preview`;
        image.loading = "lazy";
        image.decoding = "async";
        image.draggable = false;
        image.onerror = () => image.remove();
        swatch.append(image);
    }
    return swatch;
}

function ensureBrowserStyles() {
    if (document.getElementById("nova-style-browser-css")) return;
    const style = document.createElement("style");
    style.id = "nova-style-browser-css";
    style.textContent = `
        .nova-style-browser{position:fixed;inset:0;z-index:100000;background:rgba(3,5,9,.84);backdrop-filter:blur(7px);display:flex;align-items:center;justify-content:center;padding:24px;color:#eef3ff;font:13px/1.35 Inter,Segoe UI,sans-serif}
        .nova-style-dialog{width:min(1240px,96vw);height:min(880px,94vh);display:flex;flex-direction:column;background:#171a21;border:1px solid #3a4050;border-radius:18px;box-shadow:0 28px 90px #000b;overflow:hidden}
        .nova-style-head{display:flex;gap:12px;align-items:center;padding:17px 20px;border-bottom:1px solid #303541;background:linear-gradient(100deg,#242936,#161920)}
        .nova-style-title{font-size:20px;font-weight:800;letter-spacing:.2px;flex:1}.nova-style-count{color:#aeb9d0}
        .nova-style-controls{display:grid;grid-template-columns:minmax(210px,1fr) minmax(180px,260px) auto auto auto auto auto auto;gap:9px;padding:13px 20px;border-bottom:1px solid #2c313c;background:#1d2129}
        .nova-style-controls input,.nova-style-controls select,.nova-style-browser button{border:1px solid #3b4251;border-radius:9px;background:#252a34;color:#f5f7ff;padding:9px 11px;font:inherit}
        .nova-style-browser button{cursor:pointer;font-weight:700}.nova-style-browser button:hover{border-color:#7b9cff;background:#30394b}.nova-style-browser button.active{background:#315fcf;border-color:#73a0ff}
        .nova-style-content{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:0;min-height:0;flex:1}
        .nova-style-grid{padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));grid-auto-rows:190px;gap:12px;overflow:auto;align-content:start;background:#11141a}
        .nova-style-grid.list{grid-template-columns:1fr;grid-auto-rows:92px}
        .nova-style-card{position:relative;display:flex;flex-direction:column;padding:0;overflow:hidden;text-align:left;border:1px solid #3b4251;border-radius:12px;background:#242934;color:#f5f7ff;cursor:pointer}
        .nova-style-card:hover,.nova-style-card:focus{outline:none;border-color:#7b9cff;background:#30394b}
        .nova-style-card.selected{border:2px solid #6ca1ff!important;box-shadow:0 0 0 3px #2865d755}
        .nova-style-swatch{height:112px;position:relative;flex:none}.nova-style-grid.list .nova-style-card{display:grid;grid-template-columns:144px 1fr}.nova-style-grid.list .nova-style-swatch{height:100%}
        .nova-style-swatch:after{content:"";position:absolute;inset:12%;border:1px solid #ffffff38;border-radius:50% 22% 50% 28%;transform:rotate(-14deg);box-shadow:inset 0 0 24px #fff2}
        .nova-style-preview-image{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#0b0d12;z-index:1}
        .nova-style-card-copy{padding:9px 10px;min-width:0}.nova-style-card-name{font-size:13px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nova-style-card-category{color:#9fabbd;font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .nova-style-star{position:absolute;right:7px;top:7px;width:32px;height:32px;padding:0!important;border-radius:50%!important;background:#111b!important;font-size:17px!important}.nova-style-star.on{color:#ffd45a}
        .nova-style-detail{border-left:1px solid #303541;background:#1b1f27;padding:18px;overflow:auto}.nova-style-detail h3{font-size:18px;margin:0 0 5px}.nova-style-detail .category{color:#8baeff;margin-bottom:16px}.nova-style-detail .label{color:#8f9bb0;text-transform:uppercase;font-size:10px;font-weight:800;letter-spacing:.8px;margin-top:15px}.nova-style-detail .text{white-space:pre-wrap;color:#d5dbea;margin-top:5px}
        .nova-style-detail-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}.nova-style-detail-actions button{flex:1 1 auto}
        .nova-style-preview-viewer{position:fixed;inset:0;z-index:100010;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(0,0,0,.92)}
        .nova-style-preview-viewer-panel{width:min(1180px,96vw);height:min(940px,94vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid #3b4251;border-radius:15px;background:#11141a;box-shadow:0 28px 90px #000}
        .nova-style-preview-viewer-head{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid #303541}.nova-style-preview-viewer-title{flex:1;font-size:15px;font-weight:800}
        .nova-style-preview-viewer-stage{min-height:0;flex:1;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;background:#080a0e}.nova-style-preview-viewer-stage.actual{align-items:flex-start;justify-content:flex-start}
        .nova-style-preview-viewer-image{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.nova-style-preview-viewer-image.actual{max-width:none;max-height:none}
        .nova-style-empty{grid-column:1/-1;align-self:center;justify-self:center;color:#98a3b7;font-size:16px;text-align:center}
        .nova-style-foot{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid #303541;background:#1d2129}.nova-style-pages{display:flex;gap:6px;flex:1;justify-content:center}.nova-style-page{min-width:38px}
        .nova-style-standalone-launcher{position:fixed;right:22px;bottom:88px;z-index:99999;border:1px solid #668cff;border-radius:12px;background:#243f87;color:white;padding:10px 14px;font:700 13px Inter,Segoe UI,sans-serif;box-shadow:0 8px 24px #0008;cursor:grab;touch-action:none;user-select:none;pointer-events:auto}
        .nova-style-standalone-launcher.dragging{cursor:grabbing}
        .nova-style-standalone-launcher:hover{background:#315fcf}
        @media(max-width:850px){.nova-style-controls{grid-template-columns:1fr 1fr auto}.nova-style-content{grid-template-columns:1fr}.nova-style-detail{display:none}}
    `;
    document.head.append(style);
}

function setSelectedStyle(node, item) {
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

async function waitForGeneratedImage(promptId, onProgress) {
    const deadline = Date.now() + GENERATED_PREVIEW_TIMEOUT_MS;
    while (Date.now() < deadline) {
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

function applyStandaloneStyle(item, csv) {
    const compatible = graphNodes().filter((candidate) =>
        widget(candidate, "medium_selection") || widget(candidate, "style")
    );
    const selected = app.canvas?.current_node;
    const target = compatible.includes(selected)
        ? selected
        : (compatible.length === 1 ? compatible[0] : null);
    if (!target) {
        throw new Error(
            "Open this browser from Prompt Stack or a Style Loader, or select the one target node before generating."
        );
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
    setSelectedStyle(target, item);
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
    if (node) node.__novaStyleBrowser?.remove();
    else standaloneBrowser?.remove();

    const state = {
        page: 1,
        pageSize: 24,
        search: String(options.search ?? widget(node, "search")?.value ?? ""),
        category: String(options.category ?? widget(node, "category")?.value ?? "All"),
        favoritesOnly: false,
        historyOnly: false,
        list: false,
        selected: null,
        data: null,
        browserOnly: true,
        csv: String(options.csv ?? widget(node, "csv_file_path")?.value ?? DEFAULT_STANDALONE_LIBRARY),
        kind: String(options.kind || (isCharacterLoader(nodeData) ? "characters" : "styles")),
        previewSize: Number(options.previewSize || 512) === 1024 ? 1024 : 512,
        generating: false,
        batchRunning: false,
        batchCancelRequested: false,
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
    const generateAll = document.createElement("button");
    generateAll.textContent = "Generate all missing";
    generateAll.title = "Run the current workflow once for every style in this CSV/YAML that does not yet have a preview";
    controls.append(search, category, favorites, history, random, view, previewSize, generateAll);

    const content = document.createElement("div");
    content.className = "nova-style-content";
    const grid = document.createElement("div");
    grid.className = "nova-style-grid";
    const detail = document.createElement("aside");
    detail.className = "nova-style-detail";
    detail.innerHTML = "<h3>Select a style</h3><div class='text'>Click a card to select it. Double-click to select and close.</div>";
    content.append(grid, detail);

    const foot = document.createElement("footer");
    foot.className = "nova-style-foot";
    const status = document.createElement("span");
    status.textContent = "Loading…";
    const pages = document.createElement("div");
    pages.className = "nova-style-pages";
    foot.append(status, pages);
    dialog.append(head, controls, content, foot);
    overlay.append(dialog);
    document.body.append(overlay);

    const closeBrowser = () => {
        if (node?.__novaStyleBrowser === overlay) node.__novaStyleBrowser = null;
        if (standaloneBrowser === overlay) standaloneBrowser = null;
        overlay.remove();
    };
    close.onclick = closeBrowser;
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) closeBrowser();
    });
    overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeBrowser();
    });
    for (const eventName of ["wheel", "pointerdown", "pointermove", "pointerup"]) {
        dialog.addEventListener(eventName, (event) => event.stopPropagation());
    }

    function applySelection(item) {
        state.selected = item;
        if (typeof options.onSelect === "function") {
            options.onSelect(item);
        } else if (node) {
            setSelectedStyle(node, item);
        }
    }

    function updateVisiblePreview(item) {
        const visible = (state.data?.items || []).find((candidate) => candidate.name === item.name);
        if (visible) visible.preview_url = item.preview_url;
    }

    async function applyAndGenerate(item, batchPosition = "") {
        if (state.generating) return;
        state.generating = true;
        showDetail(item);
        try {
            if (options.standalone) applyStandaloneStyle(item, state.csv);
            else applySelection(item);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            status.textContent = `${batchPosition}Queueing ${item.clean_name || item.name} with the current workflow…`;
            const promptId = await queueCurrentWorkflow();
            status.textContent = `${batchPosition}Workflow queued. Waiting for its final image…`;
            const generated = await waitForGeneratedImage(promptId, () => {
                status.textContent = `${batchPosition}Generating preview…`;
            });
            status.textContent = `${batchPosition}Saving ${state.previewSize}×${state.previewSize} preview…`;
            const file = await downloadGeneratedImage(generated);
            const result = await uploadPreview(item, state.csv, state.previewSize, file);
            item.preview_url = result.preview_url;
            updateVisiblePreview(item);
            renderCards();
            status.textContent = `${batchPosition}Generated and saved ${result.size}×${result.size} preview`;
            return { ok: true };
        } catch (error) {
            const message = String(error?.message || "Preview generation failed");
            status.textContent = message;
            return { ok: false, message };
        } finally {
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
            pageSize: 60,
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
        if (state.batchRunning) {
            state.batchCancelRequested = true;
            generateAll.textContent = "Stopping after current preview…";
            generateAll.disabled = true;
            return;
        }
        try {
            generateAll.disabled = true;
            status.textContent = "Checking the complete CSV/YAML for missing previews…";
            const allItems = await fetchWholeLibrary();
            const missing = allItems.filter((item) => canGeneratePreview(item) && !item.preview_url);
            if (!missing.length) {
                status.textContent = "Every style in this CSV/YAML already has a preview.";
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
                status.textContent = "Whole-library preview generation was cancelled.";
                return;
            }
            state.batchRunning = true;
            state.batchCancelRequested = false;
            generateAll.disabled = false;
            generateAll.textContent = "Stop after current";
            let completed = 0;
            for (const item of missing) {
                if (state.batchCancelRequested) break;
                const position = `[${completed + 1}/${missing.length}] `;
                const result = await applyAndGenerate(item, position);
                if (!result?.ok) {
                    status.textContent = `${position}Stopped: ${result?.message || "preview generation failed"}`;
                    break;
                }
                completed += 1;
            }
            if (state.batchCancelRequested) {
                status.textContent = `Stopped after ${completed.toLocaleString()} of ${missing.length.toLocaleString()} missing previews. Run again to resume the remaining styles.`;
            } else if (completed === missing.length) {
                status.textContent = `Completed all ${completed.toLocaleString()} missing previews.`;
            }
        } catch (error) {
            status.textContent = String(error?.message || "Whole-library preview generation failed");
        } finally {
            state.batchRunning = false;
            state.batchCancelRequested = false;
            generateAll.disabled = false;
            generateAll.textContent = "Generate all missing";
            if (state.selected && overlay.isConnected) showDetail(state.selected);
        }
    }

    function openLargePreview(item) {
        if (!item.preview_url) return;
        const viewer = document.createElement("div");
        viewer.className = "nova-style-preview-viewer";
        viewer.tabIndex = -1;
        const panel = document.createElement("section");
        panel.className = "nova-style-preview-viewer-panel";
        const viewerHead = document.createElement("header");
        viewerHead.className = "nova-style-preview-viewer-head";
        const viewerTitle = document.createElement("div");
        viewerTitle.className = "nova-style-preview-viewer-title";
        viewerTitle.textContent = item.clean_name || item.name;
        const sizeToggle = document.createElement("button");
        sizeToggle.textContent = "Actual size";
        const closeViewer = document.createElement("button");
        closeViewer.textContent = "Close ×";
        const stage = document.createElement("div");
        stage.className = "nova-style-preview-viewer-stage";
        const image = document.createElement("img");
        image.className = "nova-style-preview-viewer-image";
        image.src = item.preview_url;
        image.alt = `${item.clean_name || item.name} large preview`;
        image.draggable = false;
        image.onload = () => {
            viewerTitle.textContent = `${item.clean_name || item.name} · ${image.naturalWidth}×${image.naturalHeight}`;
        };
        image.onerror = () => {
            viewerTitle.textContent = "Preview image could not be loaded";
            sizeToggle.disabled = true;
        };
        let actualSize = false;
        sizeToggle.onclick = () => {
            actualSize = !actualSize;
            image.classList.toggle("actual", actualSize);
            stage.classList.toggle("actual", actualSize);
            sizeToggle.textContent = actualSize ? "Fit to window" : "Actual size";
        };
        const closeLargePreview = () => viewer.remove();
        closeViewer.onclick = closeLargePreview;
        viewer.addEventListener("pointerdown", (event) => {
            if (event.target === viewer) closeLargePreview();
        });
        viewer.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                closeLargePreview();
            }
        });
        for (const eventName of ["wheel", "pointerdown", "pointermove", "pointerup"]) {
            panel.addEventListener(eventName, (event) => event.stopPropagation());
        }
        viewerHead.append(viewerTitle, sizeToggle, closeViewer);
        stage.append(image);
        panel.append(viewerHead, stage);
        viewer.append(panel);
        document.body.append(viewer);
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
        generateImage.disabled = state.generating || state.batchRunning;
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
        for (const item of items) {
            const card = document.createElement("div");
            card.className = `nova-style-card${state.selected?.name === item.name ? " selected" : ""}`;
            card.title = item.prompt || item.name;
            card.tabIndex = 0;
            card.setAttribute("role", "button");
            const swatch = previewElement(item);
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
            card.onclick = () => {
                state.selected = item;
                if (!options.standalone) applySelection(item);
                showDetail(item);
                renderCards();
                status.textContent = `Selected ${item.clean_name || item.name}`;
            };
            card.ondblclick = () => {
                if (options.standalone) {
                    void copyText(item.prompt).then(() => {
                        status.textContent = "Positive prompt copied";
                    });
                } else {
                    applySelection(item);
                    closeBrowser();
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
    };
    generateAll.onclick = () => void generateWholeLibrary();

    overlay.focus();
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
            csv: DEFAULT_STANDALONE_LIBRARY,
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
    name: "NovoLoko.CSVStyleVisualLibrary.v363",
    setup() {
        installStandaloneLauncher();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!isNovaStyleLoader(nodeData)) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            const node = this;

            if (!node.__novaCSVVisualBrowserAdded) {
                const browse = node.addWidget(
                    "button",
                    isCharacterLoader(nodeData) ? "Browse characters visually…" : "Browse styles visually…",
                    null,
                    () => openStyleBrowser(node, nodeData),
                );
                browse.serialize = false;
                const reload = node.addWidget(
                    "button",
                    "↻ Reload CSV / YAML",
                    null,
                    () => refreshNovaCSVDropdown(node, nodeData, false),
                );
                reload.serialize = false;
                node.__novaCSVVisualBrowserAdded = true;
            }

            for (const name of ["csv_file_path", "category", "search", "favorites_list", "use_saved_favorites"]) {
                wrapWidgetCallback(node, nodeData, name);
            }

            setTimeout(() => refreshNovaCSVDropdown(node, nodeData, true), 100);
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
