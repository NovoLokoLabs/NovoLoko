import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LORA_NODE = "NovaPowerLoraStack";
const GROUP_NODE = "NovaGroupController";
const PANEL = "nova-lora-stack-panel-v1";

const css = `
.${PANEL}{height:100%;min-height:120px;box-sizing:border-box;display:flex;flex-direction:column;gap:7px;padding:8px;border:1px solid var(--nova-accent,#3c6f91);border-radius:8px;background:var(--nova-panel-bg,#08111b);color:#eaf4ff;font:12px/1.25 system-ui;overflow:hidden}
.${PANEL} *{box-sizing:border-box}.nova-lora-tools{display:flex;flex-wrap:wrap;gap:5px}.nova-lora-tools button,.nova-lora-row button,.nova-group-row button{border:1px solid var(--nova-accent,#456e8d);border-radius:5px;background:#17324a;color:#f4f8ff;padding:5px 8px;font-weight:700;cursor:pointer}
.nova-lora-tools button:hover,.nova-lora-row button:hover,.nova-group-row button:hover{background:#24577b}.nova-lora-list,.nova-group-list{display:flex;flex:1 1 0;min-height:60px;flex-direction:column;gap:5px;overflow:auto;padding-right:2px}.nova-lora-list{cursor:grab}.nova-lora-list.drag-scrolling{cursor:grabbing;user-select:none}.nova-group-name{cursor:pointer;user-select:none}.nova-group-name:hover{text-decoration:underline}
.nova-lora-item{display:flex;flex-direction:column;gap:4px;padding:5px;border:1px solid color-mix(in srgb,var(--nova-accent,#3c6f91) 65%,#1c3345);border-radius:6px;background:var(--nova-row-bg,#0d1c29)}.nova-lora-row{display:grid;grid-template-columns:24px minmax(130px,1fr) 70px 70px 30px auto;gap:5px;align-items:center}.nova-lora-row-actions{display:flex;gap:4px}.nova-lora-row-actions button{min-width:28px;padding:5px}.nova-lora-row input[type=number],.nova-group-filter,.nova-group-sort{width:100%;min-width:0;border:1px solid #3d607a;border-radius:4px;background:#111c27;color:#fff;padding:5px}.nova-lora-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}.nova-lora-triggers{padding:3px 7px;border-left:3px solid var(--nova-accent,#3c6f91);color:#b9d6ec;overflow-wrap:anywhere}.nova-lora-triggers.empty{color:#748a9b}
.nova-lora-empty{margin:auto;color:#9db1c4;text-align:center}.nova-lora-status{color:#a9c4d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nova-lora-modal{position:fixed;z-index:100000;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78);padding:24px}.nova-lora-dialog{width:min(1100px,96vw);height:min(760px,92vh);display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid #4f7d9e;border-radius:12px;background:#101923;color:#fff;box-shadow:0 18px 70px #000}
.nova-lora-dialog-head{display:flex;gap:8px;align-items:center}.nova-lora-dialog-head h2{margin:0;flex:1}.nova-lora-dialog input,.nova-lora-dialog select{border:1px solid #466b87;border-radius:6px;background:#182532;color:#fff;padding:8px}.nova-lora-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;overflow:auto}
.nova-lora-card{display:flex;flex-direction:column;gap:6px;padding:9px;border:1px solid #304d62;border-radius:8px;background:#0b141d}.nova-lora-card img{width:100%;height:150px;object-fit:cover;border-radius:6px;background:#020508}.nova-lora-card h3{margin:0;font-size:13px}.nova-lora-card small{color:#9fb3c5}.nova-lora-card-actions{display:flex;gap:6px}.nova-lora-card-actions>*{flex:1}
.nova-lora-info{display:flex;min-height:0;flex:1;flex-direction:column;gap:12px;overflow:auto;padding:2px}.nova-lora-info-summary{display:flex;flex-wrap:wrap;gap:7px;align-items:center}.nova-lora-badge{display:inline-flex;align-items:center;border:1px solid #5b7890;border-radius:6px;background:#21384b;color:#eff8ff;padding:5px 9px;font-weight:800}.nova-lora-badge.type{border-color:#735b91;background:#3a2950}.nova-lora-trigger-banner{padding:10px 12px;border:1px solid #466b87;border-radius:7px;background:#13293a;color:#eaf5ff;font-weight:800}.nova-lora-info-table{display:table!important;width:100%;border-collapse:separate;border-spacing:0;border:1px solid #3a5266;border-radius:8px;overflow:hidden}.nova-lora-info-table tr{display:table-row!important}.nova-lora-info-table th,.nova-lora-info-table td{display:table-cell!important;padding:9px 12px;border-bottom:1px solid #31475a;text-align:left;vertical-align:top}.nova-lora-info-table th{width:180px;background:#162532;color:#bfd0de}.nova-lora-info-table td{background:#0c1620;color:#f4f8fb;overflow-wrap:anywhere}.nova-lora-info-table tr:last-child>*{border-bottom:0}.nova-lora-info-table a{color:#72bdff;font-weight:800}.nova-lora-info-actions{display:flex;flex-wrap:wrap;gap:8px}.nova-lora-info-actions button,.nova-lora-info-actions a{border:1px solid #456e8d;border-radius:6px;background:#17324a;color:#f4f8ff;padding:7px 11px;font-weight:800;text-decoration:none;cursor:pointer}.nova-lora-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.nova-lora-gallery-card{display:flex;min-width:0;flex-direction:column;gap:5px}.nova-lora-gallery-card>a{display:block;min-height:220px;border:1px solid #344e62;border-radius:8px;overflow:hidden;background:#03070a}.nova-lora-gallery img{display:block;width:100%;height:100%;max-height:420px;object-fit:contain;background:#03070a}.nova-lora-gallery-card button{border:1px solid #456e8d;border-radius:5px;background:#17324a;color:#f4f8ff;padding:6px;font-weight:800}
.nova-lora-options{display:grid;grid-template-columns:repeat(2,minmax(220px,1fr));gap:10px;overflow:auto}.nova-lora-option-group{display:flex;flex-direction:column;gap:7px;padding:10px;border:1px solid #304d62;border-radius:8px;background:#0b141d}.nova-lora-option-group h3{margin:0}.nova-lora-option-group label{display:flex;gap:8px;align-items:center;justify-content:space-between}.nova-lora-option-group input[type=color]{width:64px;height:34px;padding:2px}.nova-lora-meta{white-space:pre-wrap;overflow-wrap:anywhere}
.nova-group-row{display:grid;grid-template-columns:26px minmax(100px,1fr) 36px 34px 34px;gap:5px;align-items:center;padding:5px;border:1px solid color-mix(in srgb,var(--nova-accent,#3c6f91) 65%,#1c3345);border-radius:6px;background:var(--nova-row-bg,#0d1c29)}.nova-group-color-picker{width:32px;height:26px;padding:1px;border:0;background:transparent}.nova-group-controls{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:6px}
@media(max-width:620px){.nova-lora-row{grid-template-columns:24px minmax(110px,1fr) 58px 58px 28px}.nova-lora-row-actions{grid-column:2/-1}.nova-lora-options{grid-template-columns:1fr}.nova-lora-info-table th,.nova-lora-info-table td{display:block!important;width:100%}.nova-lora-info-table th{border-bottom:0}}
`;

function installCSS() {
    if (document.getElementById("nova-lora-stack-css-v1")) return;
    const style = document.createElement("style");
    style.id = "nova-lora-stack-css-v1";
    style.textContent = css;
    document.head.append(style);
}

const LORA_OPTION_DEFAULTS = Object.freeze({
    nameAction: "Info",
    showInstalled: true,
    showCivitai: true,
    showImport: true,
    showBulk: true,
    showPresets: true,
    showMove: true,
    showInfo: true,
    showDuplicate: true,
    showRemove: true,
    showTriggers: true,
    accent: "#3c6f91",
    panel: "#08111b",
    row: "#0d1c29",
});

const GROUP_OPTION_DEFAULTS = Object.freeze({
    showColorFilter: true,
    showEnableAll: true,
    showBypassAll: true,
    showRandom: true,
    showColorPicker: true,
    showSolo: true,
    showNavigate: true,
    accent: "#3c6f91",
    panel: "#08111b",
    row: "#0d1c29",
});

function loraOptions(node) {
    node.properties ||= {};
    return { ...LORA_OPTION_DEFAULTS, ...(node.properties.novaLoraOptions || {}) };
}

function saveLoraOptions(node, options) {
    node.properties ||= {};
    node.properties.novaLoraOptions = { ...LORA_OPTION_DEFAULTS, ...options };
    node.graph?.change?.();
    node.setDirtyCanvas?.(true, true);
}

function applyLoraColors(root, options) {
    root.style.setProperty("--nova-accent", options.accent);
    root.style.setProperty("--nova-panel-bg", options.panel);
    root.style.setProperty("--nova-row-bg", options.row);
}

function groupOptions(node) {
    node.properties ||= {};
    return { ...GROUP_OPTION_DEFAULTS, ...(node.properties.novaGroupOptions || {}) };
}

function saveGroupOptions(node, options) {
    node.properties ||= {};
    node.properties.novaGroupOptions = { ...GROUP_OPTION_DEFAULTS, ...options };
    node.graph?.change?.();
    node.setDirtyCanvas?.(true, true);
}

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function hideWidget(node, name) {
    const item = widget(node, name);
    if (!item) return;
    item.hidden = true;
    item.options ||= {};
    item.options.hidden = true;
    item.computeSize = () => [0, -4];
    if (globalThis.LiteGraph?.vueNodesMode) {
        const items = [...(node.widgets || [])];
        node.widgets = [];
        node.widgets = items;
    }
}

function parseRows(node) {
    try {
        const rows = JSON.parse(String(widget(node, "stack_json")?.value || "[]"));
        return Array.isArray(rows) ? rows : [];
    } catch {
        return [];
    }
}

function storeRows(node, rows) {
    const item = widget(node, "stack_json");
    if (!item) return;
    item.value = JSON.stringify(rows);
    item.callback?.(item.value);
    node.properties ||= {};
    node.properties.novaLoraRowCount = rows.length;
    node.graph?.change?.();
    node.setDirtyCanvas?.(true, true);
}

function modal(title) {
    const overlay = document.createElement("div");
    overlay.className = "nova-lora-modal";
    const dialog = document.createElement("section");
    dialog.className = "nova-lora-dialog";
    const head = document.createElement("header");
    head.className = "nova-lora-dialog-head";
    const heading = document.createElement("h2");
    heading.textContent = title;
    const close = document.createElement("button");
    close.textContent = "Close ×";
    close.onclick = () => overlay.remove();
    head.append(heading, close);
    dialog.append(head);
    overlay.append(dialog);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) overlay.remove();
    });
    document.body.append(overlay);
    return { overlay, dialog, head };
}

function addRow(node, lora, extra = {}) {
    const rows = parseRows(node);
    rows.push({
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        lora,
        enabled: true,
        random_pool: false,
        strength_model: 1,
        strength_clip: 1,
        triggers: [],
        ...extra,
    });
    storeRows(node, rows);
    node.__novaLoraRender?.();
}

async function installedBrowser(node) {
    const { dialog, head } = modal("Installed LoRAs");
    const search = document.createElement("input");
    search.placeholder = "Search installed LoRAs and folders…";
    search.style.flex = "1";
    head.insertBefore(search, head.lastChild);
    const results = document.createElement("div");
    results.className = "nova-lora-results";
    dialog.append(results);
    let items = [];
    try {
        const response = await api.fetchApi("/nova_lora/installed", { cache: "no-store" });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        items = data.items || [];
    } catch (error) {
        results.textContent = error?.message || String(error);
        return;
    }
    const render = () => {
        const term = search.value.trim().toLowerCase();
        results.replaceChildren();
        for (const name of items.filter((value) => value.toLowerCase().includes(term)).slice(0, 800)) {
            const card = document.createElement("article");
            card.className = "nova-lora-card";
            const label = document.createElement("h3");
            label.textContent = name;
            const add = document.createElement("button");
            add.textContent = "Add to stack";
            add.onclick = () => {
                addRow(node, name);
                add.textContent = "Added ✓";
            };
            const info = document.createElement("button");
            info.textContent = "CivitAI info";
            info.onclick = () => showLocalInfo(node, name);
            card.append(label, add, info);
            results.append(card);
        }
    };
    search.oninput = render;
    render();
}

function firstImage(model) {
    for (const version of model?.modelVersions || []) {
        for (const image of version?.images || []) {
            if (String(image?.url || "").startsWith("https://")) return image.url;
        }
    }
    return "";
}

function primaryVersion(model) {
    return (model?.modelVersions || [])[0] || null;
}

function appendInfoRow(table, label, value, href = "") {
    const row = document.createElement("tr");
    const key = document.createElement("th");
    key.textContent = label;
    const detail = document.createElement("td");
    if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = value;
        detail.append(link);
    } else {
        detail.textContent = value;
    }
    row.append(key, detail);
    table.append(row);
}

function safeCivitaiModelUrl(item) {
    const modelId = Number(item?.modelId);
    const versionId = Number(item?.id);
    if (!Number.isSafeInteger(modelId) || modelId <= 0) return "";
    const url = new URL(`https://civitai.com/models/${modelId}`);
    if (Number.isSafeInteger(versionId) && versionId > 0) {
        url.searchParams.set("modelVersionId", String(versionId));
    }
    return url.href;
}

async function civitaiBrowser(node) {
    const { dialog, head } = modal("CivitAI LoRA Browser");
    const search = document.createElement("input");
    search.placeholder = "Search CivitAI LoRAs…";
    search.style.flex = "1";
    const nsfw = document.createElement("label");
    nsfw.innerHTML = '<input type="checkbox"> Show mature';
    head.insertBefore(search, head.lastChild);
    head.insertBefore(nsfw, head.lastChild);
    const results = document.createElement("div");
    results.className = "nova-lora-results";
    dialog.append(results);

    const run = async () => {
        const term = search.value.trim();
        if (!term) return;
        results.textContent = "Searching CivitAI…";
        try {
            const params = new URLSearchParams({
                query: term,
                limit: "30",
                nsfw: nsfw.querySelector("input").checked ? "1" : "0",
            });
            const response = await api.fetchApi(`/nova_lora/civitai/search?${params}`, { cache: "no-store" });
            const data = await response.json();
            if (!data.ok) throw new Error(data.error);
            results.replaceChildren();
            for (const model of data.items || []) {
                const version = primaryVersion(model);
                if (!version) continue;
                const card = document.createElement("article");
                card.className = "nova-lora-card";
                const imageUrl = firstImage(model);
                if (imageUrl) {
                    const image = document.createElement("img");
                    image.src = imageUrl;
                    image.loading = "lazy";
                    card.append(image);
                }
                const name = document.createElement("h3");
                name.textContent = model.name || "Untitled LoRA";
                const detail = document.createElement("small");
                detail.textContent = `${version.name || "Latest"} • ${model.creator?.username || "Unknown creator"}`;
                const words = document.createElement("small");
                words.textContent = (version.trainedWords || []).join(", ") || "No trigger words listed";
                const actions = document.createElement("div");
                actions.className = "nova-lora-card-actions";
                const page = document.createElement("button");
                page.textContent = "Open page";
                page.onclick = () => {
                    window.open(
                        safeCivitaiModelUrl({ modelId: model.id, id: version.id }),
                        "_blank",
                        "noopener,noreferrer",
                    );
                };
                const download = document.createElement("button");
                download.textContent = "Download + add";
                download.onclick = async () => {
                    download.disabled = true;
                    download.textContent = "Downloading…";
                    try {
                        const file = (version.files || []).find((item) => item.primary) || (version.files || [])[0];
                        const response = await api.fetchApi("/nova_lora/civitai/download", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                versionId: version.id,
                                filename: file?.name || `${model.name}-${version.name}.safetensors`,
                            }),
                        });
                        const data = await response.json();
                        if (!data.ok) throw new Error(data.error);
                        addRow(node, data.name, { triggers: version.trainedWords || [] });
                        download.textContent = "Downloaded + added ✓";
                    } catch (error) {
                        download.disabled = false;
                        const message = error?.message || String(error);
                        download.textContent = message.includes("requires an account")
                            ? "Requires CivitAI access — open page"
                            : `Failed: ${message}`;
                        download.title = message;
                    }
                };
                actions.append(page, download);
                card.append(name, detail, words, actions);
                results.append(card);
            }
        } catch (error) {
            results.textContent = error?.message || String(error);
        }
    };
    let timer = 0;
    search.oninput = () => {
        clearTimeout(timer);
        timer = setTimeout(run, 450);
    };
    nsfw.onchange = run;
    search.focus();
}

function showImageInfo(itemImage, modelName) {
    const { dialog } = modal(`Generation Info — ${modelName}`);
    const body = document.createElement("div");
    body.className = "nova-lora-info";
    const meta = itemImage?.meta && typeof itemImage.meta === "object" ? itemImage.meta : {};
    const prompt = [
        meta.prompt,
        meta.positivePrompt,
        meta["Positive prompt"],
        meta.Prompt,
    ].find((value) => typeof value === "string" && value.trim());
    const promptTitle = document.createElement("h3");
    promptTitle.textContent = "Prompt used";
    const promptText = document.createElement("div");
    promptText.className = "nova-lora-meta";
    promptText.textContent = prompt || "No prompt was included in the CivitAI image metadata.";
    body.append(promptTitle, promptText);
    const table = document.createElement("table");
    table.className = "nova-lora-info-table";
    const details = [
        ["Resolution", itemImage?.width && itemImage?.height ? `${itemImage.width} × ${itemImage.height}` : ""],
        ["Seed", meta.seed],
        ["Steps", meta.steps],
        ["CFG", meta.cfgScale ?? meta.cfg],
        ["Sampler", meta.sampler],
        ["Scheduler", meta.scheduler],
        ["Model", meta.Model ?? meta.model],
        ["Denoise", meta.denoise],
    ];
    for (const [label, value] of details) {
        if (value !== undefined && value !== null && String(value).trim()) {
            appendInfoRow(table, label, String(value));
        }
    }
    if (table.rows.length) body.append(table);
    dialog.append(body);
}

async function showLocalInfo(node, name, rowId = "") {
    const { dialog } = modal(`LoRA Info — ${name}`);
    const body = document.createElement("div");
    body.className = "nova-lora-info";
    body.textContent = "Reading file hash and CivitAI metadata…";
    dialog.append(body);
    try {
        const params = new URLSearchParams({ name, refresh: "1" });
        const response = await api.fetchApi(`/nova_lora/info?${params}`, { cache: "no-store" });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);
        const item = data.item || {};
        const triggers = item.trainedWords || item.triggerWords || [];
        body.replaceChildren();

        const summary = document.createElement("div");
        summary.className = "nova-lora-info-summary";
        const type = document.createElement("span");
        type.className = "nova-lora-badge type";
        type.textContent = item.model?.type || "LoRA";
        const base = document.createElement("span");
        base.className = "nova-lora-badge";
        base.textContent = item.baseModel || "Unknown base model";
        summary.append(type, base);
        body.append(summary);

        const rows = parseRows(node);
        const findStackRow = (items) => items.find((row) =>
            rowId
                ? String(row.id) === String(rowId)
                : String(row.lora) === String(name)
        ) || null;
        const stackRow = findStackRow(rows);
        const civitaiUrl = safeCivitaiModelUrl(item);
        const triggerBanner = document.createElement("div");
        triggerBanner.className = "nova-lora-trigger-banner";
        triggerBanner.textContent = `Trigger words: ${triggers.join(", ") || "none listed"}`;
        body.append(triggerBanner);
        const table = document.createElement("table");
        table.className = "nova-lora-info-table";
        appendInfoRow(table, "File", item.localName || name);
        appendInfoRow(table, "Hash (SHA-256)", item.sha256 || "unavailable");
        if (civitaiUrl) appendInfoRow(table, "CivitAI", "View this model version on CivitAI", civitaiUrl);
        appendInfoRow(table, "Name", item.model?.name || item.name || name);
        appendInfoRow(table, "Version", item.name || "not listed");
        appendInfoRow(table, "Base model", item.baseModel || "not listed");
        appendInfoRow(table, "Trigger words", triggers.join(", ") || "none listed");
        if (stackRow) {
            appendInfoRow(table, "Model strength", String(stackRow.strength_model ?? 1));
            appendInfoRow(table, "CLIP strength", String(stackRow.strength_clip ?? 1));
        }
        if (item.stats) {
            appendInfoRow(
                table,
                "CivitAI activity",
                `${Number(item.stats.downloadCount || 0).toLocaleString()} downloads • ${Number(item.stats.thumbsUpCount || 0).toLocaleString()} likes`,
            );
        }
        if (item.error) appendInfoRow(table, "CivitAI status", item.error);
        body.append(table);

        const actions = document.createElement("div");
        actions.className = "nova-lora-info-actions";
        if (civitaiUrl) {
            const open = document.createElement("a");
            open.href = civitaiUrl;
            open.target = "_blank";
            open.rel = "noopener noreferrer";
            open.textContent = "Open on CivitAI";
            actions.append(open);
        }
        if (stackRow && triggers.length) {
            const use = document.createElement("button");
            use.textContent = "Save trigger words to this row";
            use.onclick = () => {
                const currentRows = parseRows(node);
                const currentRow = findStackRow(currentRows);
                if (!currentRow) {
                    use.textContent = "Row no longer exists";
                    return;
                }
                currentRow.triggers = [...triggers];
                storeRows(node, currentRows);
                node.__novaLoraRender?.();
                use.textContent = `Saved ${triggers.length} trigger word${triggers.length === 1 ? "" : "s"} ✓`;
            };
            actions.append(use);
        }
        if (actions.childElementCount) body.append(actions);

        const images = (Array.isArray(item.images) ? item.images : [])
            .filter((image) => image?.type === "image" && String(image?.url || "").startsWith("https://"))
            .slice(0, 12);
        if (images.length) {
            const gallery = document.createElement("div");
            gallery.className = "nova-lora-gallery";
            for (const itemImage of images) {
                const card = document.createElement("article");
                card.className = "nova-lora-gallery-card";
                const link = document.createElement("a");
                link.href = itemImage.url;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                const image = document.createElement("img");
                image.src = itemImage.url;
                image.loading = "lazy";
                image.referrerPolicy = "no-referrer";
                image.alt = item.model?.name || name;
                link.append(image);
                const info = document.createElement("button");
                info.textContent = "ⓘ Prompt & generation info";
                info.onclick = () => showImageInfo(itemImage, item.model?.name || name);
                card.append(link, info);
                gallery.append(card);
            }
            body.append(gallery);
        }
    } catch (error) {
        body.textContent = error?.message || String(error);
    }
}

function presets(node, action) {
    const key = "novoloko.lora.presets.v1";
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { saved = {}; }
    if (action === "save") {
        const name = prompt("Preset name:");
        if (!name?.trim()) return;
        saved[name.trim()] = parseRows(node);
        localStorage.setItem(key, JSON.stringify(saved));
        return;
    }
    const names = Object.keys(saved).sort();
    if (!names.length) return alert("No saved LoRA presets yet.");
    const name = prompt(`Load preset:\n${names.join("\n")}`, names[0]);
    if (!name || !saved[name]) return;
    storeRows(node, saved[name]);
    node.__novaLoraRender?.();
}

function importRgthree(node) {
    const source = (app.graph?._nodes || []).find((item) =>
        String(item.type || "").includes("Power Lora Loader")
    );
    if (!source) return alert("No rgthree Power LoRA Loader was found in this graph.");
    const rows = (source.widgets || [])
        .filter((item) => item?.value?.lora)
        .map((item) => ({
            id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
            lora: item.value.lora,
            enabled: item.value.on !== false,
            random_pool: false,
            strength_model: Number(item.value.strength ?? 1),
            strength_clip: Number(item.value.strengthTwo ?? item.value.strength ?? 1),
            triggers: [],
        }));
    storeRows(node, rows);
    node.__novaLoraRender?.();
}

function loraOptionsDialog(node, rerender) {
    const { overlay, dialog } = modal("NovoLoko LoRA Stack Options");
    const body = document.createElement("div");
    body.className = "nova-lora-options";
    let options = loraOptions(node);
    const update = () => {
        saveLoraOptions(node, options);
        rerender();
    };
    const group = (title) => {
        const section = document.createElement("section");
        section.className = "nova-lora-option-group";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading);
        body.append(section);
        return section;
    };
    const checkbox = (section, label, key) => {
        const row = document.createElement("label");
        const text = document.createElement("span");
        text.textContent = label;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = options[key] !== false;
        input.onchange = () => {
            options[key] = input.checked;
            update();
        };
        row.append(text, input);
        section.append(row);
    };

    const navigation = group("Navigation and row order");
    const nameRow = document.createElement("label");
    const nameLabel = document.createElement("span");
    nameLabel.textContent = "Clicking a LoRA name";
    const nameAction = document.createElement("select");
    for (const value of ["Info", "Installed browser", "Nothing"]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        nameAction.append(option);
    }
    nameAction.value = options.nameAction;
    nameAction.onchange = () => {
        options.nameAction = nameAction.value;
        update();
    };
    nameRow.append(nameLabel, nameAction);
    navigation.append(nameRow);
    const sortAz = document.createElement("button");
    sortAz.textContent = "Sort rows A → Z";
    sortAz.onclick = () => {
        const rows = parseRows(node).sort((a, b) => String(a.lora).localeCompare(String(b.lora)));
        storeRows(node, rows);
        rerender();
    };
    const sortZa = document.createElement("button");
    sortZa.textContent = "Sort rows Z → A";
    sortZa.onclick = () => {
        const rows = parseRows(node).sort((a, b) => String(b.lora).localeCompare(String(a.lora)));
        storeRows(node, rows);
        rerender();
    };
    navigation.append(sortAz, sortZa);

    const rowButtons = group("Row controls");
    checkbox(rowButtons, "Move up / down", "showMove");
    checkbox(rowButtons, "Info button", "showInfo");
    checkbox(rowButtons, "Duplicate button", "showDuplicate");
    checkbox(rowButtons, "Remove button", "showRemove");
    checkbox(rowButtons, "Saved trigger words", "showTriggers");

    const toolbar = group("Toolbar buttons");
    checkbox(toolbar, "Installed browser", "showInstalled");
    checkbox(toolbar, "CivitAI browser", "showCivitai");
    checkbox(toolbar, "Import rgthree", "showImport");
    checkbox(toolbar, "All On / All Off", "showBulk");
    checkbox(toolbar, "Save / Load Preset", "showPresets");

    const colors = group("Node colors");
    const colorOption = (label, key) => {
        const row = document.createElement("label");
        const text = document.createElement("span");
        text.textContent = label;
        const input = document.createElement("input");
        input.type = "color";
        input.value = options[key];
        input.oninput = () => {
            options[key] = input.value;
            update();
        };
        row.append(text, input);
        colors.append(row);
    };
    colorOption("Accent", "accent");
    colorOption("Panel background", "panel");
    colorOption("Row background", "row");
    const reset = document.createElement("button");
    reset.textContent = "Restore NovoLoko defaults";
    reset.onclick = () => {
        options = { ...LORA_OPTION_DEFAULTS };
        saveLoraOptions(node, options);
        overlay.remove();
        rerender();
    };
    colors.append(reset);

    dialog.append(body);
}

function enableLeftDragScroll(element) {
    let drag = null;
    element.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest("button,input,select,a,label")) return;
        drag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            scrollTop: element.scrollTop,
            moved: false,
        };
        element.setPointerCapture?.(event.pointerId);
        element.classList.add("drag-scrolling");
    });
    element.addEventListener("pointermove", (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const distance = event.clientY - drag.startY;
        if (Math.abs(distance) > 3) drag.moved = true;
        if (!drag.moved) return;
        event.preventDefault();
        event.stopPropagation();
        element.scrollTop = drag.scrollTop - distance;
    });
    const finish = (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        element.releasePointerCapture?.(event.pointerId);
        element.classList.remove("drag-scrolling");
        drag = null;
    };
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
}

function installLegacyGraphNavigation(root) {
    root.addEventListener("wheel", (event) => {
        if (globalThis.LiteGraph?.vueNodesMode) {
            event.stopPropagation();
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.processMouseWheel?.(event);
    }, { passive: false });
    root.addEventListener("pointerdown", (event) => {
        if (!globalThis.LiteGraph?.vueNodesMode && event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas?.processMouseDown?.(event);
            return;
        }
        event.stopPropagation();
    });
    root.addEventListener("pointermove", (event) => {
        if (globalThis.LiteGraph?.vueNodesMode || (Number(event.buttons || 0) & 4) === 0) return;
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.processMouseMove?.(event);
    });
    root.addEventListener("pointerup", (event) => {
        if (globalThis.LiteGraph?.vueNodesMode || event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.processMouseUp?.(event);
    });
}

function buildLoraPanel(node) {
    const root = document.createElement("section");
    root.className = PANEL;
    installLegacyGraphNavigation(root);
    const tools = document.createElement("div");
    tools.className = "nova-lora-tools";
    const list = document.createElement("div");
    list.className = "nova-lora-list";
    enableLeftDragScroll(list);
    const status = document.createElement("div");
    status.className = "nova-lora-status";
    const toolButtons = new Map();

    const button = (label, fn, visibilityKey = "") => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = label;
        item.onclick = fn;
        tools.append(item);
        if (visibilityKey) {
            if (!toolButtons.has(visibilityKey)) toolButtons.set(visibilityKey, []);
            toolButtons.get(visibilityKey).push(item);
        }
        return item;
    };
    button("+ Installed", () => installedBrowser(node), "showInstalled");
    button("CivitAI Search", () => civitaiBrowser(node), "showCivitai");
    button("Import rgthree", () => importRgthree(node), "showImport");
    button("All On", () => {
        const rows = parseRows(node); rows.forEach((row) => { row.enabled = true; });
        storeRows(node, rows); render();
    }, "showBulk");
    button("All Off", () => {
        const rows = parseRows(node); rows.forEach((row) => { row.enabled = false; });
        storeRows(node, rows); render();
    }, "showBulk");
    button("Save Preset", () => presets(node, "save"), "showPresets");
    button("Load Preset", () => presets(node, "load"), "showPresets");
    button("⚙ Options", () => loraOptionsDialog(node, render));

    const render = () => {
        const rows = parseRows(node);
        const options = loraOptions(node);
        applyLoraColors(root, options);
        for (const [key, items] of toolButtons) {
            for (const item of items) item.style.display = options[key] === false ? "none" : "";
        }
        list.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement("div");
            empty.className = "nova-lora-empty";
            empty.textContent = "Add an installed LoRA, browse CivitAI, or import the rgthree stack.";
            list.append(empty);
        }
        rows.forEach((row, index) => {
            const item = document.createElement("div");
            item.className = "nova-lora-item";
            const line = document.createElement("div");
            line.className = "nova-lora-row";
            const enabled = document.createElement("input");
            enabled.type = "checkbox"; enabled.checked = row.enabled !== false;
            enabled.title = "Enabled";
            enabled.onchange = () => { row.enabled = enabled.checked; storeRows(node, rows); };
            const name = document.createElement("button");
            name.className = "nova-lora-name"; name.textContent = row.lora; name.title = row.lora;
            name.onclick = () => {
                if (options.nameAction === "Info") showLocalInfo(node, row.lora, row.id);
                if (options.nameAction === "Installed browser") installedBrowser(node);
            };
            const model = document.createElement("input");
            model.type = "number"; model.step = ".05"; model.value = row.strength_model ?? 1; model.title = "Model strength";
            model.onchange = () => { row.strength_model = Number(model.value); storeRows(node, rows); };
            const clip = document.createElement("input");
            clip.type = "number"; clip.step = ".05"; clip.value = row.strength_clip ?? row.strength_model ?? 1; clip.title = "CLIP strength";
            clip.onchange = () => { row.strength_clip = Number(clip.value); storeRows(node, rows); };
            const pool = document.createElement("input");
            pool.type = "checkbox"; pool.checked = Boolean(row.random_pool); pool.title = "Include in seeded random pool";
            pool.onchange = () => { row.random_pool = pool.checked; storeRows(node, rows); };
            const actions = document.createElement("div");
            actions.className = "nova-lora-row-actions";
            const up = document.createElement("button"); up.textContent = "↑"; up.title = "Move LoRA earlier in stack";
            up.disabled = index === 0;
            up.onclick = () => {
                if (!index) return;
                [rows[index - 1], rows[index]] = [rows[index], rows[index - 1]];
                storeRows(node, rows);
                render();
            };
            const down = document.createElement("button"); down.textContent = "↓"; down.title = "Move LoRA later in stack";
            down.disabled = index === rows.length - 1;
            down.onclick = () => {
                if (index >= rows.length - 1) return;
                [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
                storeRows(node, rows);
                render();
            };
            const info = document.createElement("button"); info.textContent = "ⓘ"; info.className = "secondary";
            info.title = "CivitAI metadata, triggers, prompts, and images"; info.onclick = () => showLocalInfo(node, row.lora, row.id);
            const duplicate = document.createElement("button"); duplicate.textContent = "⧉"; duplicate.className = "secondary";
            duplicate.onclick = () => { rows.splice(index + 1, 0, { ...row, id: crypto.randomUUID?.() || `${Date.now()}` }); storeRows(node, rows); render(); };
            const remove = document.createElement("button"); remove.textContent = "×";
            remove.onclick = () => { rows.splice(index, 1); storeRows(node, rows); render(); };
            if (options.showMove !== false) actions.append(up, down);
            if (options.showInfo !== false) actions.append(info);
            if (options.showDuplicate !== false) actions.append(duplicate);
            if (options.showRemove !== false) actions.append(remove);
            line.append(enabled, name, model, clip, pool, actions);
            item.append(line);
            if (options.showTriggers !== false) {
                const triggerLine = document.createElement("div");
                const rowTriggers = Array.isArray(row.triggers) ? row.triggers.filter(Boolean) : [];
                triggerLine.className = `nova-lora-triggers${rowTriggers.length ? "" : " empty"}`;
                triggerLine.textContent = rowTriggers.length
                    ? `Triggers: ${rowTriggers.join(", ")}`
                    : "Triggers: none saved";
                item.append(triggerLine);
            }
            list.append(item);
        });
        const poolCount = rows.filter((row) => row.enabled !== false && row.random_pool).length;
        status.textContent = `${rows.length} LoRAs • ${rows.filter((row) => row.enabled !== false).length} enabled • ${poolCount} in random pool • Model / CLIP strengths`;
    };
    node.__novaLoraRender = render;
    root.append(tools, list, status);
    render();
    return root;
}

function groupNodes(group) {
    try { group.recomputeInsideNodes?.(); } catch {}
    if (group?._children) {
        return [...group._children].filter((item) => item?.mode != null);
    }
    return (group?._nodes || []).filter((item) => item?.mode != null);
}

function graphGroups() {
    const graph = app.canvas?.getCurrentGraph?.() || app.graph;
    return [...(graph?._groups || graph?.groups || [])];
}

function setGroup(group, enabled) {
    const mode = enabled ? (globalThis.LiteGraph?.ALWAYS ?? 0) : 4;
    for (const item of groupNodes(group)) item.mode = mode;
    app.graph?.change?.();
    app.canvas?.setDirty?.(true, true);
}

function groupOptionsDialog(node, rerender) {
    const { overlay, dialog } = modal("NovoLoko Group Controller Options");
    const body = document.createElement("div");
    body.className = "nova-lora-options";
    let options = groupOptions(node);
    const update = () => {
        saveGroupOptions(node, options);
        rerender();
    };
    const group = (title) => {
        const section = document.createElement("section");
        section.className = "nova-lora-option-group";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading);
        body.append(section);
        return section;
    };
    const checkbox = (section, label, key) => {
        const row = document.createElement("label");
        const text = document.createElement("span");
        text.textContent = label;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = options[key] !== false;
        input.onchange = () => {
            options[key] = input.checked;
            update();
        };
        row.append(text, input);
        section.append(row);
    };

    const controls = group("Visible controls");
    checkbox(controls, "Color filter", "showColorFilter");
    checkbox(controls, "Enable All", "showEnableAll");
    checkbox(controls, "Bypass All", "showBypassAll");
    checkbox(controls, "Random Group", "showRandom");
    checkbox(controls, "Group color pickers", "showColorPicker");
    checkbox(controls, "Solo buttons", "showSolo");
    checkbox(controls, "Navigate buttons", "showNavigate");

    const colors = group("Controller colors");
    const colorOption = (label, key) => {
        const row = document.createElement("label");
        const text = document.createElement("span");
        text.textContent = label;
        const input = document.createElement("input");
        input.type = "color";
        input.value = options[key];
        input.oninput = () => {
            options[key] = input.value;
            update();
        };
        row.append(text, input);
        colors.append(row);
    };
    colorOption("Accent", "accent");
    colorOption("Panel background", "panel");
    colorOption("Group row background", "row");
    const reset = document.createElement("button");
    reset.textContent = "Restore NovoLoko defaults";
    reset.onclick = () => {
        options = { ...GROUP_OPTION_DEFAULTS };
        saveGroupOptions(node, options);
        overlay.remove();
        rerender();
    };
    colors.append(reset);
    dialog.append(body);
}

function buildGroupPanel(node) {
    const root = document.createElement("section");
    root.className = PANEL;
    installLegacyGraphNavigation(root);
    const tools = document.createElement("div");
    tools.className = "nova-lora-tools";
    const filter = document.createElement("input");
    filter.className = "nova-group-filter";
    filter.placeholder = "Filter groups by title…";
    filter.value = node.properties?.novaGroupFilter || "";
    const sort = document.createElement("select");
    sort.className = "nova-group-sort";
    for (const [value, label] of [
        ["graph", "Graph order"],
        ["az", "Title A → Z"],
        ["za", "Title Z → A"],
        ["color", "Color"],
    ]) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        sort.append(option);
    }
    sort.value = node.properties?.novaGroupSort || "graph";
    const controls = document.createElement("div");
    controls.className = "nova-group-controls";
    controls.append(filter, sort);
    const colorTools = document.createElement("label");
    colorTools.style.display = "flex";
    colorTools.style.alignItems = "center";
    colorTools.style.gap = "7px";
    const useColor = document.createElement("input");
    useColor.type = "checkbox";
    useColor.checked = Boolean(node.properties?.novaGroupUseColorFilter);
    const colorFilter = document.createElement("input");
    colorFilter.type = "color";
    colorFilter.className = "nova-group-color-picker";
    colorFilter.value = /^#[0-9a-f]{6}$/i.test(node.properties?.novaGroupColorFilter || "")
        ? node.properties.novaGroupColorFilter
        : "#5bbd5c";
    const colorText = document.createElement("span");
    colorText.textContent = "Filter by group color";
    colorTools.append(useColor, colorFilter, colorText);
    const list = document.createElement("div");
    list.className = "nova-group-list";
    const toolButtons = new Map();
    const button = (label, fn, visibilityKey = "") => {
        const item = document.createElement("button");
        item.textContent = label; item.onclick = fn; tools.append(item);
        if (visibilityKey) toolButtons.set(visibilityKey, item);
        return item;
    };
    button("Enable All", () => { visible().forEach((group) => setGroup(group, true)); render(); }, "showEnableAll");
    button("Bypass All", () => { visible().forEach((group) => setGroup(group, false)); render(); }, "showBypassAll");
    button("Random Group", () => {
        const groups = visible();
        if (!groups.length) return;
        const seed = Number(node.properties?.novaGroupSeed || 0);
        const pick = groups[Math.abs(Math.imul(seed ^ 0x9e3779b9, 2654435761)) % groups.length];
        groups.forEach((group) => setGroup(group, group === pick));
        node.properties.novaGroupSeed = seed + 1;
        render();
    }, "showRandom");
    button("⚙ Options", () => groupOptionsDialog(node, render));
    const visible = () => {
        const term = filter.value.trim().toLowerCase();
        const selectedColor = colorFilter.value.toLowerCase();
        const options = groupOptions(node);
        const groups = graphGroups().filter((group) => {
            if (term && !String(group.title || "").toLowerCase().includes(term)) return false;
            if (options.showColorFilter === false || !useColor.checked) return true;
            return String(group.color || "").toLowerCase() === selectedColor;
        });
        if (sort.value === "az") groups.sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));
        if (sort.value === "za") groups.sort((a, b) => String(b.title || "").localeCompare(String(a.title || "")));
        if (sort.value === "color") groups.sort((a, b) => String(a.color || "").localeCompare(String(b.color || "")));
        return groups;
    };
    const render = () => {
        const options = groupOptions(node);
        applyLoraColors(root, options);
        colorTools.style.display = options.showColorFilter === false ? "none" : "flex";
        for (const [key, item] of toolButtons) {
            item.style.display = options[key] === false ? "none" : "";
        }
        list.replaceChildren();
        for (const group of visible()) {
            const nodes = groupNodes(group);
            const active = nodes.some((item) => item.mode === (globalThis.LiteGraph?.ALWAYS ?? 0));
            const row = document.createElement("div");
            row.className = "nova-group-row";
            const toggle = document.createElement("input");
            toggle.type = "checkbox"; toggle.checked = active;
            toggle.onchange = () => { setGroup(group, toggle.checked); render(); };
            const name = document.createElement("span");
            name.className = "nova-group-name";
            name.textContent = group.title || "Untitled group";
            name.title = active ? "Click to bypass this group" : "Click to enable this group";
            name.tabIndex = 0;
            name.setAttribute("role", "button");
            name.onclick = () => {
                setGroup(group, !active);
                render();
            };
            name.onkeydown = (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                name.click();
            };
            const color = document.createElement("input");
            color.type = "color";
            color.className = "nova-group-color-picker";
            color.value = /^#[0-9a-f]{6}$/i.test(group.color || "") ? group.color : "#708090";
            color.title = "Change this group color";
            color.oninput = () => {
                group.color = color.value;
                app.graph?.change?.();
                app.canvas?.setDirty?.(true, true);
                if (sort.value === "color" || useColor.checked) render();
            };
            const solo = document.createElement("button");
            solo.textContent = "S"; solo.title = "Solo this group";
            solo.onclick = () => { visible().forEach((item) => setGroup(item, item === group)); render(); };
            const nav = document.createElement("button");
            nav.textContent = "⌖"; nav.title = "Navigate to group";
            nav.onclick = () => app.canvas?.fitViewToNodes?.(nodes);
            row.append(toggle, name);
            if (options.showColorPicker !== false) row.append(color);
            if (options.showSolo !== false) row.append(solo);
            if (options.showNavigate !== false) row.append(nav);
            list.append(row);
        }
    };
    filter.oninput = () => {
        node.properties ||= {};
        node.properties.novaGroupFilter = filter.value;
        render();
    };
    const saveGroupView = () => {
        node.properties ||= {};
        node.properties.novaGroupColorFilter = colorFilter.value;
        node.properties.novaGroupUseColorFilter = useColor.checked;
        node.properties.novaGroupSort = sort.value;
        node.graph?.change?.();
        render();
    };
    colorFilter.oninput = saveGroupView;
    useColor.onchange = saveGroupView;
    sort.onchange = saveGroupView;
    node.__novaGroupRender = render;
    const refresh = setInterval(render, 1000);
    const removed = node.onRemoved;
    node.onRemoved = function () { clearInterval(refresh); removed?.apply(this, arguments); };
    root.append(controls, colorTools, tools, list);
    render();
    return root;
}

function installDOM(node, kind) {
    if (node.__novaStackDOM || typeof node.addDOMWidget !== "function") return;
    installCSS();
    hideWidget(node, kind === "lora" ? "stack_json" : "state_json");
    const root = kind === "lora" ? buildLoraPanel(node) : buildGroupPanel(node);
    const dom = node.addDOMWidget(`nova_${kind}_panel_v1`, "NOVA_PANEL", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 120,
        getHeight: () => Math.max(120, Number(node.size?.[1] || 280) - 150),
        selectOn: ["click", "focus"],
    });
    dom.serialize = false;
    dom.options ||= {};
    dom.options.serialize = false;
    node.__novaStackDOM = dom;
    node.min_size = [330, 230];
    node.getMinSize = () => [330, 230];
    requestAnimationFrame(() => {
        if (!Array.isArray(node.size) || node.size[0] < 330) node.setSize?.([520, 440]);
    });
}

app.registerExtension({
    name: "NovoLoko.PowerLoraAndGroups.v1",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const name = String(nodeData?.name || "");
        if (name !== LORA_NODE && name !== GROUP_NODE) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = created?.apply(this, arguments);
            setTimeout(() => installDOM(this, name === LORA_NODE ? "lora" : "group"), 0);
            return result;
        };
        const configured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function () {
            const result = configured?.apply(this, arguments);
            setTimeout(() => {
                installDOM(this, name === LORA_NODE ? "lora" : "group");
                this.__novaLoraRender?.();
                this.__novaGroupRender?.();
            }, 0);
            return result;
        };
    },
});
