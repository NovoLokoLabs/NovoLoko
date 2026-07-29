import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const BANNER_NODE = "NovaWorkflowBanner";
const GUIDE_NODE = "NovaWorkflowGuide";
const PRESENTATION_TYPES = new Set([BANNER_NODE, GUIDE_NODE]);
const PRESENTATION_SETTINGS_COMMAND = "NovoLoko.WorkflowPresentation.Settings";
const guideWheelEntries = new Set();
let guideWheelCaptureInstalled = false;
const FONT_CHOICES = [
    "Impact",
    "Arial Black",
    "Arial",
    "Segoe UI",
    "Trebuchet MS",
    "Georgia",
    "Consolas",
];

const DEFAULT_GUIDE_BODY = `NOVOLOKO AIO WORKFLOW GUIDE

1. INSTALL THE REQUIRED MODELS
- Use the model cards below. Click a model or resource name to open its download page.
- Click Open folder to open the exact local destination in Windows Explorer.
- Keep downloaded filenames unchanged so the loader selections in this workflow still match.
- Use ComfyUI Refresh Models after copying files. Restart ComfyUI if a new model is still missing.

2. INSTALL THE REQUIRED NODES AND DEPENDENCIES
- ComfyUI core nodes are built in and are used for model loading, sampling, latent upscale and VAE decode.
- ComfyUI-NovoLoko is required for the Prompt Stack, Seed Lab, LoRA Stack, Group Controller,
  Prompt Enhancer, Compare Studio, Media Studio, Voice TTS, Timer and presentation nodes.
- ComfyUI-Krea2T-Enhancer is required for the Krea2T enhancer node in this workflow.
- Text Encode (Krea2), package ID comfyui-krea2-text-encoder, is required for Krea2 conditioning
  and optional reference-image/mask inputs.
- Install each custom-node pack as one folder directly under ComfyUI/custom_nodes, then restart ComfyUI.
- NovoLoko requirements.txt supplies PyYAML and LokoBridge client support. The approved updater installs
  these automatically; manual ZIP installs must use ComfyUI's own Python environment.
- Kokoro and speech dictation are optional. Run INSTALL_NOVOLOKO_VOICE_AND_KOKORO.bat only when
  those features are wanted and their imports are missing.
- OmniLoko is a separate optional desktop app and is required only when Voice TTS uses OmniLoko.
- rgthree is not required by this workflow: NovoLoko Power LoRA Stack and Group Controller replace
  the rgthree Power LoRA Loader and group-control nodes used in older layouts.

3. LOAD THE WORKFLOW
- Open NovoLoko AIO v4.0.0 from ComfyUI Workflows.
- Red or missing loader selections mean the required file is absent or has a different name.
- The Group Controller can enable, bypass, solo and navigate the large workflow sections.
- Both Legacy and Nodes 2.0 save node positions and manually resized dimensions.

4. FIRST PASS - CORE GENERATION
- Load Diffusion Model: selects the main image-generation model.
- Load CLIP: selects the text encoder used to understand the prompt.
- Load VAE: decodes the generated latent into a visible image.
- NovoLoko Power LoRA Stack: enable LoRAs, set separate Model/CLIP strengths, save triggers,
  reorder rows, use a random pool, inspect CivitAI information, and save/load presets.
- Resolution controls the first-pass latent width, height and aspect ratio.
- First-pass sampler settings control steps, CFG, sampler, scheduler and denoise.

5. BUILD THE PROMPT
- Manual Prompt accepts your own positive and negative prompt plus optional CSV/YAML styling.
- Prompt Stack AIO Pro combines Medium, Subject, Pose, Action, Clothing, Location and Character.
- Each Prompt Stack slot has its own file, category, search and selection control.
- all_slots_enabled turns the complete stack on or off without disconnecting it.
- all_names includes the manual prompt and selected entry names for notes or display.
- Browse Medium styles visually opens the style viewer. CSV and YAML files can be refreshed.
- Prompt Source chooses Manual, Enhanced, Stack, or Stack + Enhanced for the generation.

6. SEEDS AND REPEATABLE RESULTS
- Seed Lab records the exact seed that was actually used.
- Manual Random Seed creates a new seed and queues from that point.
- Fixed Seed Run repeats the fixed seed for a controlled comparison.
- Copy seed in Media Studio copies the seed attached to the selected history item.
- A fixed seed is repeatable only when the model, prompt, dimensions and generation settings match.

7. OPTIONAL PROMPT ENHANCER
- Enable or bypass the enhancer from the Control Panel.
- Choose a saved preset, length, creativity, maximum length and custom instructions.
- Fixed seed keeps the enhancer result stable when the supplied idea and settings are unchanged.
- The Enhanced Prompt and Enhancer Status displays show exactly what was produced.

8. RUN PASS 1
- Confirm the intended Prompt Source, Seed Lab mode, resolution and first-pass sampler settings.
- Queue the workflow. Pass 1 Preview displays the base image without changing its pipeline.
- Save/Memory nodes can keep the full-resolution image and metadata for later comparison.

9. SECOND PASS - UPSCALE OR REFINE
- Pass 2 receives the first-pass latent/image and applies the configured upscale/refine settings.
- Compare Studio shows Pass 1 and Pass 2 in Split, Side-by-Side, Overlay or Blink views.
- Guide controls the draggable handle. Line controls divider opacity independently.
- Node preview and full-screen Compare settings are saved separately.

10. MEDIA STUDIO
- Media Studio keeps generated images, labels, manual/enhanced prompts, voice and history together.
- Click its image to open the full-screen gallery and inspection tools.
- Use Image Folder or the configured media folder to organise different projects.
- filename_prefix controls the generated filename inside the selected media folder.
- Copy prompt and Copy seed reproduce the selected history item more easily.
- Autoplay, slideshow, shuffle and Follow New Runs control how new results are presented.

11. VOICE AND OMNILOKO
- Voice TTS can use OmniLoko, Kokoro, or remain Off.
- Refresh Voices reloads available voices. Open OmniLoko launches its desktop application.
- Dictate into selected prompt sends speech recognition text to the active prompt field.
- Media Studio can play the generated narration with the matching image and prompt.

12. STYLES, NOTES AND PRESENTATION
- The floating Styles button opens searchable style libraries and generated previews.
- NovoLoko Text Display provides a resizable, scrollable prompt/status note with Copy.
- Workflow Banner and Workflow Cheat Sheet settings are available from the node action/ellipsis
  menu and the right-click node menu. Their text, links, fonts, colours and sizing are saved.

13. TROUBLESHOOTING
- Missing model: verify its filename and folder, refresh models, then restart if needed.
- Missing NovoLoko node: run the approved NovoLoko updater and restart ComfyUI.
- Missing Krea2T enhancer or Text Encode (Krea2): install the matching dependency card below,
  restart ComfyUI and reload the workflow.
- Old frontend appearance: fully reload the workflow after switching Legacy or Nodes 2.0.
- Different result with the same seed: compare prompt, model, LoRAs, size, sampler and scheduler.
- Do not rename model files when sharing this workflow unless you also update every loader.`;

const DEFAULT_LINKS = [
    {
        label: "YouTube",
        url: "https://www.youtube.com/@NovoLokoLabs",
        folder: "",
    },
    {
        label: "Patreon",
        url: "https://www.patreon.com/NovoLokoLabs",
        folder: "",
    },
];

const DEFAULT_MODEL_LINKS = [
    {
        label: "Main diffusion model",
        name: "krea2_turbo_int8_convrot.safetensors",
        url: "",
        folder: "ComfyUI/models/diffusion_models",
    },
    {
        label: "Text encoder / CLIP",
        name: "qwen3VLInstruct4bHeretic_v10.safetensors",
        url: "",
        folder: "ComfyUI/models/text_encoders",
    },
    {
        label: "VAE",
        name: "krea2RealVae_v10.safetensors",
        url: "",
        folder: "ComfyUI/models/vae",
    },
    {
        label: "Optional LoRAs",
        name: "NovoLoko Power LoRA Stack collection",
        url: "",
        folder: "ComfyUI/models/loras",
    },
    {
        label: "Required custom nodes",
        name: "ComfyUI-NovoLoko",
        url: "https://github.com/NovoLokoLabs/NovoLoko",
        folder: "ComfyUI/custom_nodes",
    },
    {
        label: "Required custom node",
        name: "ComfyUI-Krea2T-Enhancer",
        url: "https://github.com/capitan01R/ComfyUI-Krea2T-Enhancer",
        folder: "ComfyUI/custom_nodes",
    },
    {
        label: "Required custom node",
        name: "Text Encode (Krea2)",
        url: "https://github.com/ethanfel/ComfyUI-Krea2TextEncoder",
        folder: "ComfyUI/custom_nodes",
    },
    {
        label: "Optional voice dependencies",
        name: "INSTALL_NOVOLOKO_VOICE_AND_KOKORO.bat",
        url: "",
        folder: "ComfyUI/custom_nodes/ComfyUI-NovoLoko",
    },
    {
        label: "Video guide",
        name: "Open the NovoLokoLabs YouTube channel",
        url: "https://www.youtube.com/@NovoLokoLabs",
        folder: "",
    },
    {
        label: "Support and downloads",
        name: "Open NovoLokoLabs on Patreon",
        url: "https://www.patreon.com/NovoLokoLabs",
        folder: "",
    },
];

function dirty(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || minimum));
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

function installGuideWheelCapture() {
    if (guideWheelCaptureInstalled) return;
    guideWheelCaptureInstalled = true;
    window.addEventListener("wheel", (event) => {
        if (!globalThis.LiteGraph?.vueNodesMode) return;
        for (const entry of guideWheelEntries) {
            if (!entry.root?.isConnected) {
                guideWheelEntries.delete(entry);
                continue;
            }
            if (!entry.root.contains(event.target)) continue;
            if (!nodeSelected(entry.node)) return;
            const scroller = entry.scroller;
            if (!scroller || scroller.scrollHeight <= scroller.clientHeight + 2) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            scroller.scrollTop += Number(event.deltaY || 0);
            return;
        }
    }, { capture: true, passive: false });
}

function safeLinks(value, defaults = []) {
    const source = Array.isArray(value) ? value : defaults;
    return source.slice(0, 50).map((item) => ({
        label: String(item?.label || "").slice(0, 120),
        name: String(item?.name || item?.model || "").slice(0, 300),
        url: String(item?.url || "").slice(0, 2000),
        folder: String(item?.folder || "").slice(0, 300),
    }));
}

function safeUrl(value) {
    const text = String(value || "").trim();
    if (!/^https?:\/\//i.test(text)) return "";
    try {
        return new URL(text).href;
    } catch (_) {
        return "";
    }
}

function openLink(value) {
    const url = safeUrl(value);
    if (!url) return false;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;
    return true;
}

async function copyPlainText(value) {
    const text = String(value || "");
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.cssText = "position:fixed;left:-10000px;top:-10000px";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Clipboard copy was not available.");
}

async function openFolder(value) {
    const folder = String(value || "").trim();
    if (!folder) throw new Error("No folder was supplied.");
    const endpoint = api?.apiURL
        ? api.apiURL("/nova_workflow/open_folder")
        : "/nova_workflow/open_folder";
    const response = await api.fetchApi(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
    });
    let payload = {};
    try {
        payload = await response.json();
    } catch (_) {}
    if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || `Could not open folder (${response.status})`);
    }
    return payload;
}

function modalShell(title) {
    const overlay = document.createElement("div");
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483600",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "padding:24px",
        "box-sizing:border-box",
        "background:rgba(0,0,0,.76)",
        "color:#eef6ff",
        "font:14px/1.35 system-ui",
    ].join(";");

    const panel = document.createElement("section");
    panel.style.cssText = [
        "width:min(920px,96vw)",
        "max-height:92vh",
        "overflow:auto",
        "padding:18px",
        "box-sizing:border-box",
        "border:1px solid #4f8eb8",
        "border-radius:12px",
        "background:#101a24",
        "box-shadow:0 24px 80px rgba(0,0,0,.72)",
    ].join(";");

    const header = document.createElement("header");
    header.style.cssText = "display:flex;align-items:center;gap:12px;margin-bottom:16px";
    const heading = document.createElement("h2");
    heading.textContent = title;
    heading.style.cssText = "flex:1;margin:0;font-size:22px";
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close x";
    close.style.cssText = "padding:7px 11px;cursor:pointer";
    header.append(heading, close);
    panel.append(header);
    overlay.append(panel);
    document.body.append(overlay);

    const destroy = () => overlay.remove();
    close.addEventListener("click", destroy);
    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) destroy();
    });
    return { overlay, panel, destroy };
}

function settingsGrid(panel) {
    const grid = document.createElement("div");
    grid.style.cssText = [
        "display:grid",
        "grid-template-columns:repeat(2,minmax(0,1fr))",
        "gap:11px 14px",
    ].join(";");
    panel.append(grid);
    return grid;
}

function field(grid, label, value, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.style.cssText = [
        "display:flex",
        "flex-direction:column",
        "gap:5px",
        options.wide ? "grid-column:1/-1" : "",
    ].join(";");
    const caption = document.createElement("span");
    caption.textContent = label;
    caption.style.fontWeight = "700";
    let input;
    if (options.choices) {
        input = document.createElement("select");
        for (const choice of options.choices) {
            const option = document.createElement("option");
            option.value = choice;
            option.textContent = choice;
            input.append(option);
        }
        input.value = String(value ?? options.choices[0]);
    } else if (options.multiline) {
        input = document.createElement("textarea");
        input.rows = options.rows || 10;
        input.value = String(value ?? "");
        input.style.resize = "vertical";
    } else {
        input = document.createElement("input");
        input.type = options.type || "text";
        input.value = String(value ?? "");
        if (options.min != null) input.min = String(options.min);
        if (options.max != null) input.max = String(options.max);
        if (options.step != null) input.step = String(options.step);
    }
    input.style.cssText += [
        "width:100%",
        "min-height:36px",
        "padding:7px 9px",
        "box-sizing:border-box",
        "border:1px solid #456985",
        "border-radius:6px",
        "background:#07111b",
        "color:#f3f8ff",
        "font:inherit",
    ].join(";");
    wrapper.append(caption, input);
    grid.append(wrapper);
    return input;
}

function linksEditor(panel, links, title = "Clickable links", options = {}) {
    const headingRow = document.createElement("div");
    headingRow.style.cssText = "display:flex;align-items:center;gap:10px;margin:18px 0 8px";
    const heading = document.createElement("h3");
    heading.textContent = title;
    heading.style.cssText = "flex:1;margin:0";
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+ Add link";
    add.style.cssText = "padding:7px 12px;cursor:pointer;font-weight:800";
    headingRow.append(heading, add);
    panel.append(headingRow);

    const hint = document.createElement("div");
    hint.textContent = options.modelFields
        ? "Type, model/file name, webpage URL and local ComfyUI folder. Add as many rows as needed."
        : "Button label and webpage URL. Add as many rows as needed.";
    hint.style.cssText = "margin:-2px 0 9px;opacity:.72";
    panel.append(hint);

    const rows = document.createElement("div");
    rows.style.cssText = "display:flex;flex-direction:column;gap:8px";
    panel.append(rows);

    const inputs = [];
    const removeRow = (record) => {
        const index = inputs.indexOf(record);
        if (index >= 0) inputs.splice(index, 1);
        record.row.remove();
    };
    const addRow = (item = {}) => {
        if (inputs.length >= 50) return;
        const row = document.createElement("div");
        row.style.cssText = options.modelFields
            ? "display:grid;grid-template-columns:1fr 1.5fr 2fr 1.4fr auto;gap:8px"
            : "display:grid;grid-template-columns:1fr 2fr auto;gap:8px";
        const label = document.createElement("input");
        label.placeholder = options.modelFields ? "Type / purpose" : "Button label";
        label.value = String(item.label || "");
        const name = document.createElement("input");
        name.placeholder = "Model, file or resource name";
        name.value = String(item.name || item.model || "");
        const url = document.createElement("input");
        url.placeholder = "https://... (leave blank until final)";
        url.value = String(item.url || "");
        const folder = document.createElement("input");
        folder.placeholder = "ComfyUI/models/... (optional)";
        folder.value = String(item.folder || "");
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.style.cssText = "padding:7px 9px;cursor:pointer";
        const editable = options.modelFields
            ? [label, name, url, folder]
            : [label, url];
        for (const input of editable) {
            input.style.cssText = [
                "min-width:0",
                "padding:7px 9px",
                "border:1px solid #456985",
                "border-radius:6px",
                "background:#07111b",
                "color:#f3f8ff",
                "font:inherit",
            ].join(";");
        }
        if (options.modelFields) row.append(label, name, url, folder, remove);
        else row.append(label, url, remove);
        rows.append(row);
        const record = { row, label, name, url, folder };
        inputs.push(record);
        remove.addEventListener("click", () => removeRow(record));
    };

    for (const item of safeLinks(links)) addRow(item);
    if (!inputs.length) addRow();
    add.addEventListener("click", () => addRow());

    return () => inputs
        .map((row) => ({
            label: row.label.value.trim(),
            name: options.modelFields ? row.name.value.trim() : "",
            url: row.url.value.trim(),
            folder: options.modelFields ? row.folder.value.trim() : "",
        }))
        .filter((item) => item.label || item.name || item.url || item.folder);
}

function actionRow(panel, save, reset) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:18px";
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Reset defaults";
    resetButton.style.cssText = "padding:8px 12px;cursor:pointer";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.style.cssText = "padding:8px 18px;cursor:pointer;font-weight:800";
    resetButton.addEventListener("click", reset);
    saveButton.addEventListener("click", save);
    row.append(resetButton, saveButton);
    panel.append(row);
}

function graphNavigation(root, node, controller, scrollElement = null) {
    root.addEventListener("wheel", (event) => {
        const canScroll = scrollElement
            && scrollElement.scrollHeight > scrollElement.clientHeight + 2;
        if (canScroll && nodeSelected(node)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            event.stopPropagation();
            scrollElement.scrollTop += Number(event.deltaY || 0);
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        app.canvas?.processMouseWheel?.(event);
    }, { passive: false, signal: controller.signal });

    root.addEventListener("pointerdown", (event) => {
        if (event.button === 1) {
            if (!globalThis.LiteGraph?.vueNodesMode) {
                event.preventDefault();
                event.stopPropagation();
                app.canvas?.processMouseDown?.(event);
            }
            return;
        }
        if (event.target.closest?.("button,a,input,textarea,select")) return;
        app.canvas?.selectNode?.(node);
        app.canvas?.bringToFront?.(node);
        event.stopPropagation();
    }, { signal: controller.signal });

    root.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        node.__novaPresentationSelectedText = String(
            globalThis.getSelection?.()?.toString?.() || "",
        );
        app.canvas?.selectNode?.(node);
        app.canvas?.bringToFront?.(node);
        app.canvas?.processContextMenu?.(node, event);
    }, { signal: controller.signal });

    for (const eventName of ["pointermove", "pointerup"]) {
        root.addEventListener(eventName, (event) => {
            if (event.button !== 1 && (Number(event.buttons || 0) & 4) === 0) return;
            if (globalThis.LiteGraph?.vueNodesMode) return;
            event.preventDefault();
            event.stopPropagation();
            if (eventName === "pointermove") app.canvas?.processMouseMove?.(event);
            else app.canvas?.processMouseUp?.(event);
        }, { signal: controller.signal });
    }
}

function setNodePosition(node, x, y) {
    const nextX = Number.isFinite(Number(x)) ? Number(x) : Number(node.pos?.[0] || 0);
    const nextY = Number.isFinite(Number(y)) ? Number(y) : Number(node.pos?.[1] || 0);
    if (typeof node.setPos === "function") node.setPos(nextX, nextY);
    else node.pos = [nextX, nextY];
}

function setNodeSize(node, width, height) {
    const next = [
        Math.max(1, Number(width) || 1),
        Math.max(1, Number(height) || 1),
    ];
    if (typeof node.setSize === "function") node.setSize(next);
    else node.size = next;
}

function beginFrameChange(node) {
    app.canvas?.selectNode?.(node);
    app.canvas?.bringToFront?.(node);
    app.graph?.beforeChange?.();
}

function finishFrameChange(node) {
    app.graph?.afterChange?.();
    dirty(node);
}

function installFrameInteractionHandles(root, node, controller, readFrameSize) {
    const dragHandles = {};
    for (const edge of ["top", "right", "bottom", "left"]) {
        const handle = document.createElement("div");
        handle.dataset.novaFrameDrag = edge;
        handle.style.cssText = [
            "position:absolute",
            "z-index:20",
            "display:block",
            "background:transparent",
            "pointer-events:auto",
            "touch-action:none",
            "cursor:move",
        ].join(";");
        root.append(handle);
        dragHandles[edge] = handle;

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const startX = Number(event.clientX || 0);
            const startY = Number(event.clientY || 0);
            const startNodeX = Number(node.pos?.[0] || 0);
            const startNodeY = Number(node.pos?.[1] || 0);
            beginFrameChange(node);
            handle.setPointerCapture?.(event.pointerId);

            const move = (moveEvent) => {
                const scale = Math.max(.01, Number(app.canvas?.ds?.scale || 1));
                setNodePosition(
                    node,
                    startNodeX + (Number(moveEvent.clientX || 0) - startX) / scale,
                    startNodeY + (Number(moveEvent.clientY || 0) - startY) / scale,
                );
                dirty(node);
            };
            const finish = (finishEvent) => {
                handle.releasePointerCapture?.(finishEvent.pointerId);
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", finish, true);
                window.removeEventListener("pointercancel", finish, true);
                finishFrameChange(node);
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", finish, true);
            window.addEventListener("pointercancel", finish, true);
        }, { signal: controller.signal });
    }

    const resizeHandles = {};
    for (const corner of ["nw", "ne", "se", "sw"]) {
        const handle = document.createElement("div");
        handle.dataset.novaFrameResize = corner;
        handle.style.cssText = [
            "position:absolute",
            "z-index:30",
            "display:block",
            "background:transparent",
            "pointer-events:auto",
            "touch-action:none",
            `cursor:${corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize"}`,
        ].join(";");
        root.append(handle);
        resizeHandles[corner] = handle;

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const startX = Number(event.clientX || 0);
            const startY = Number(event.clientY || 0);
            const startNodeX = Number(node.pos?.[0] || 0);
            const startNodeY = Number(node.pos?.[1] || 0);
            const startWidth = Math.max(1, Number(node.size?.[0] || 1));
            const startHeight = Math.max(1, Number(node.size?.[1] || 1));
            const minWidth = Math.max(1, Number(node.min_size?.[0] || 1));
            const minHeight = Math.max(1, Number(node.min_size?.[1] || 1));
            const west = corner.includes("w");
            const north = corner.includes("n");
            beginFrameChange(node);
            handle.setPointerCapture?.(event.pointerId);

            const move = (moveEvent) => {
                const scale = Math.max(.01, Number(app.canvas?.ds?.scale || 1));
                const dx = (Number(moveEvent.clientX || 0) - startX) / scale;
                const dy = (Number(moveEvent.clientY || 0) - startY) / scale;
                const width = Math.max(minWidth, startWidth + (west ? -dx : dx));
                const height = Math.max(minHeight, startHeight + (north ? -dy : dy));
                const x = west ? startNodeX + startWidth - width : startNodeX;
                const y = north ? startNodeY + startHeight - height : startNodeY;
                setNodePosition(node, x, y);
                setNodeSize(node, width, height);
                dirty(node);
            };
            const finish = (finishEvent) => {
                handle.releasePointerCapture?.(finishEvent.pointerId);
                window.removeEventListener("pointermove", move, true);
                window.removeEventListener("pointerup", finish, true);
                window.removeEventListener("pointercancel", finish, true);
                finishFrameChange(node);
            };
            window.addEventListener("pointermove", move, true);
            window.addEventListener("pointerup", finish, true);
            window.addEventListener("pointercancel", finish, true);
        }, { signal: controller.signal });
    }

    return () => {
        const size = clamp(readFrameSize(), 2, 32);
        const dragDepth = Math.max(8, size);
        const cornerSize = Math.max(18, size + 8);
        Object.assign(dragHandles.top.style, {
            top: "0px", left: `${cornerSize}px`, right: `${cornerSize}px`, height: `${dragDepth}px`,
        });
        Object.assign(dragHandles.bottom.style, {
            bottom: "0px", left: `${cornerSize}px`, right: `${cornerSize}px`, height: `${dragDepth}px`,
        });
        Object.assign(dragHandles.left.style, {
            left: "0px", top: `${cornerSize}px`, bottom: `${cornerSize}px`, width: `${dragDepth}px`,
        });
        Object.assign(dragHandles.right.style, {
            right: "0px", top: `${cornerSize}px`, bottom: `${cornerSize}px`, width: `${dragDepth}px`,
        });
        Object.assign(resizeHandles.nw.style, {
            top: "0px", left: "0px", width: `${cornerSize}px`, height: `${cornerSize}px`,
        });
        Object.assign(resizeHandles.ne.style, {
            top: "0px", right: "0px", width: `${cornerSize}px`, height: `${cornerSize}px`,
        });
        Object.assign(resizeHandles.se.style, {
            right: "0px", bottom: "0px", width: `${cornerSize}px`, height: `${cornerSize}px`,
        });
        Object.assign(resizeHandles.sw.style, {
            left: "0px", bottom: "0px", width: `${cornerSize}px`, height: `${cornerSize}px`,
        });
    };
}

function suppressPresentationBadges(node) {
    if (node.__novaPresentationBadgesSuppressed) return;
    node.__novaPresentationBadgesSuppressed = true;
    const badges = [];
    Object.defineProperty(badges, "push", {
        configurable: false,
        value: () => 0,
    });
    try {
        Object.defineProperty(node, "badges", {
            configurable: true,
            get: () => badges,
            set: () => {
                badges.length = 0;
            },
        });
    } catch (_) {
        node.badges = badges;
    }
}

function installPresentationChrome(root, node, controller) {
    if (!document.getElementById("nova-workflow-presentation-css")) {
        const style = document.createElement("style");
        style.id = "nova-workflow-presentation-css";
        style.textContent = `
            .lg-node[data-nova-presentation="true"] {
                margin-top: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                outline: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                box-sizing: border-box !important;
            }
            .lg-node[data-nova-presentation="true"] > :not([data-testid="node-inner-wrapper"]):not([role="button"]) {
                display: none !important;
            }
            .lg-node[data-nova-presentation="true"] > [data-testid="node-inner-wrapper"] {
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                outline: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                overflow: visible !important;
            }
            .lg-node[data-nova-presentation="true"] > [data-testid="node-inner-wrapper"] > :not([data-testid^="node-body-"]) {
                display: none !important;
            }
            .lg-node[data-nova-presentation="true"] [data-testid^="node-body-"] {
                gap: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
                overflow: visible !important;
            }
            .lg-node[data-nova-presentation="true"] [data-testid^="node-body-"] > .mt-auto {
                display: none !important;
            }
        `;
        document.head.append(style);
    }

    let observedTarget = null;
    const observer = new MutationObserver(() => apply());
    const observeTarget = (target) => {
        if (!(target instanceof Node) || target === observedTarget) return;
        observer.disconnect();
        observedTarget = target;
        observer.observe(target, { childList: true, subtree: true });
    };
    const findHost = () => {
        const ancestor = root.closest?.(".lg-node[data-node-id]")
            || root.closest?.("[data-node-id]");
        if (ancestor instanceof HTMLElement) return ancestor;
        const nodeId = String(node.id ?? "");
        if (!nodeId) return null;
        return [...document.querySelectorAll(".lg-node[data-node-id]")]
            .find((candidate) => String(candidate.dataset.nodeId || "") === nodeId)
            || null;
    };
    const apply = () => {
        node.flags ||= {};
        node.flags.no_title = true;
        node.title = "";
        node.color = "rgba(0,0,0,0)";
        node.bgcolor = "rgba(0,0,0,0)";
        node.boxcolor = "rgba(0,0,0,0)";
        suppressPresentationBadges(node);
        const host = findHost();
        if (host instanceof HTMLElement) {
            host.dataset.novaPresentation = "true";
            for (const [name, value] of [
                ["margin", "0"],
                ["padding", "0"],
                ["border", "0"],
                ["outline", "0"],
                ["background", "transparent"],
                ["box-shadow", "none"],
                ["box-sizing", "border-box"],
            ]) {
                host.style.setProperty(name, value, "important");
            }
            const inner = host.querySelector?.('[data-testid="node-inner-wrapper"]');
            if (inner instanceof HTMLElement) {
                for (const [name, value] of [
                    ["margin", "0"],
                    ["padding", "0"],
                    ["border", "0"],
                    ["outline", "0"],
                    ["background", "transparent"],
                    ["box-shadow", "none"],
                ]) {
                    inner.style.setProperty(name, value, "important");
                }
            }
            for (const candidate of host.querySelectorAll?.("*") || []) {
                if (
                    root.contains(candidate)
                    || candidate.children.length
                    || String(candidate.textContent || "").trim() !== "NovoLoko"
                ) continue;
                const badgeRow = candidate.closest?.(
                    ".flex.h-5.w-full.gap-2.px-2.text-muted-foreground",
                );
                const badge = badgeRow instanceof HTMLElement ? badgeRow : candidate;
                badge.style.setProperty("display", "none", "important");
            }
            observeTarget(host.parentElement || document.body);
        }
    };
    observeTarget(document.body);
    apply();
    let frames = 0;
    const settle = () => {
        if (controller.signal.aborted) return;
        apply();
        frames += 1;
        if (frames < 30) requestAnimationFrame(settle);
    };
    requestAnimationFrame(settle);
    node.__novaPresentationChromeRefresh = apply;
    controller.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}

function selectedPresentationNode() {
    const canvas = app.canvas;
    if (!canvas) return null;
    const candidates = [];
    if (canvas.selectedItems) candidates.push(...canvas.selectedItems);
    if (canvas.selected_nodes) candidates.push(...Object.values(canvas.selected_nodes));
    return candidates.find((item) =>
        PRESENTATION_TYPES.has(String(item?.comfyClass || item?.type || ""))
        && typeof item?.__novaPresentationOpenSettings === "function"
    ) || null;
}

function installSettingsMenu(node, label, openSettings, copyText = null) {
    node.__novaPresentationOpenSettings = openSettings;
    node.__novaPresentationCopyText = copyText;
    node.__novaPresentationCopySelectedText = () => copyPlainText(
        node.__novaPresentationSelectedText || "",
    );
    if (node.__novaPresentationSettingsMenuInstalled) return;
    node.__novaPresentationSettingsMenuInstalled = true;
    const previous = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_canvas, options) {
        const result = previous?.apply(this, arguments);
        const menu = Array.isArray(options) ? options : [];
        const presentationOptions = [];
        if (typeof this.__novaPresentationCopyText === "function") {
            presentationOptions.push({
                content: "Copy text",
                callback: () => Promise.resolve(this.__novaPresentationCopyText?.())
                    .catch((error) => console.warn("[NovoLoko] Copy text failed:", error)),
            });
        }
        presentationOptions.push({
            content: "Copy selected text",
            disabled: !String(this.__novaPresentationSelectedText || ""),
            callback: () => Promise.resolve(this.__novaPresentationCopySelectedText?.())
                .catch((error) => console.warn("[NovoLoko] Copy selected text failed:", error)),
        });
        presentationOptions.push(
            {
                content: `NovoLoko ${label} Settings...`,
                callback: () => this.__novaPresentationOpenSettings?.(),
            },
            null,
        );
        menu.unshift(...presentationOptions);
        return result;
    };
}

function bannerDefaults(node) {
    node.properties ||= {};
    const properties = node.properties;
    properties.novaBannerTitle ??= "NovoLoko";
    properties.novaBannerSubtitle ??= "";
    properties.novaBannerLinks = safeLinks(
        properties.novaBannerLinks,
        DEFAULT_LINKS,
    );
    properties.novaBannerFont ??= "Impact";
    properties.novaBannerTitleSize ??= 128;
    properties.novaBannerLinkSize ??= 24;
    properties.novaBannerTitleColor ??= "#c075f6";
    properties.novaBannerBackground ??= "#581c87";
    properties.novaBannerLinkColor ??= "#581c87";
    properties.novaBannerLinkBackground ??= "#c075f6";
    properties.novaBannerBorderColor ??= "#7a36a7";
    properties.novaBannerBorderSize ??= 0;
    properties.novaBannerFrameColor ??= "#050505";
    properties.novaBannerFrameSize ??= 10;
    properties.novaBannerAlign ??= "Center";
    properties.novaBannerPadding ??= 12;
    properties.novaBannerRadius ??= 8;
    properties.novaBannerGap ??= 10;
}

function openBannerSettings(node, refresh) {
    bannerDefaults(node);
    const properties = node.properties;
    const modal = modalShell("NovoLoko Workflow Banner Settings");
    const grid = settingsGrid(modal.panel);
    const title = field(grid, "Title", properties.novaBannerTitle, { wide: true });
    const subtitle = field(grid, "Subtitle", properties.novaBannerSubtitle, { wide: true });
    const font = field(grid, "Font", properties.novaBannerFont, { choices: FONT_CHOICES });
    const align = field(grid, "Alignment", properties.novaBannerAlign, {
        choices: ["Left", "Center", "Right"],
    });
    const titleSize = field(grid, "Title size", properties.novaBannerTitleSize, {
        type: "number", min: 12, max: 320, step: 1,
    });
    const linkSize = field(grid, "Link size", properties.novaBannerLinkSize, {
        type: "number", min: 9, max: 96, step: 1,
    });
    const padding = field(grid, "Padding", properties.novaBannerPadding, {
        type: "number", min: 0, max: 80, step: 1,
    });
    const gap = field(grid, "Spacing", properties.novaBannerGap, {
        type: "number", min: 0, max: 60, step: 1,
    });
    const radius = field(grid, "Corner radius", properties.novaBannerRadius, {
        type: "number", min: 0, max: 80, step: 1,
    });
    const borderSize = field(grid, "Border size", properties.novaBannerBorderSize, {
        type: "number", min: 0, max: 20, step: 1,
    });
    const frameSize = field(grid, "Outer grab frame size", properties.novaBannerFrameSize, {
        type: "number", min: 2, max: 32, step: 1,
    });
    const titleColor = field(grid, "Title colour", properties.novaBannerTitleColor, { type: "color" });
    const background = field(grid, "Background colour", properties.novaBannerBackground, { type: "color" });
    const linkColor = field(grid, "Link text colour", properties.novaBannerLinkColor, { type: "color" });
    const linkBackground = field(grid, "Link background", properties.novaBannerLinkBackground, { type: "color" });
    const borderColor = field(grid, "Border colour", properties.novaBannerBorderColor, { type: "color" });
    const frameColor = field(grid, "Outer grab frame colour", properties.novaBannerFrameColor, { type: "color" });
    const readLinks = linksEditor(modal.panel, properties.novaBannerLinks);

    actionRow(modal.panel, () => {
        Object.assign(properties, {
            novaBannerTitle: title.value,
            novaBannerSubtitle: subtitle.value,
            novaBannerFont: font.value,
            novaBannerAlign: align.value,
            novaBannerTitleSize: clamp(titleSize.value, 12, 320),
            novaBannerLinkSize: clamp(linkSize.value, 9, 96),
            novaBannerPadding: clamp(padding.value, 0, 80),
            novaBannerGap: clamp(gap.value, 0, 60),
            novaBannerRadius: clamp(radius.value, 0, 80),
            novaBannerTitleColor: titleColor.value,
            novaBannerBackground: background.value,
            novaBannerLinkColor: linkColor.value,
            novaBannerLinkBackground: linkBackground.value,
            novaBannerBorderColor: borderColor.value,
            novaBannerBorderSize: clamp(borderSize.value, 0, 20),
            novaBannerFrameColor: frameColor.value,
            novaBannerFrameSize: clamp(frameSize.value, 2, 32),
            novaBannerLinks: readLinks(),
        });
        refresh();
        dirty(node);
        modal.destroy();
    }, () => {
        delete properties.novaBannerTitle;
        delete properties.novaBannerSubtitle;
        delete properties.novaBannerLinks;
        delete properties.novaBannerFont;
        delete properties.novaBannerTitleSize;
        delete properties.novaBannerLinkSize;
        delete properties.novaBannerTitleColor;
        delete properties.novaBannerBackground;
        delete properties.novaBannerLinkColor;
        delete properties.novaBannerLinkBackground;
        delete properties.novaBannerBorderColor;
        delete properties.novaBannerBorderSize;
        delete properties.novaBannerFrameColor;
        delete properties.novaBannerFrameSize;
        delete properties.novaBannerAlign;
        delete properties.novaBannerPadding;
        delete properties.novaBannerRadius;
        delete properties.novaBannerGap;
        bannerDefaults(node);
        refresh();
        dirty(node);
        modal.destroy();
    });
}

function installBanner(node) {
    if (node.__novaWorkflowBannerInstalled || typeof node.addDOMWidget !== "function") return;
    node.__novaWorkflowBannerInstalled = true;
    bannerDefaults(node);
    node.flags ||= {};
    node.flags.no_title = true;
    node.color = "rgba(0,0,0,0)";
    node.bgcolor = "rgba(0,0,0,0)";
    node.min_size = [220, 24];
    node.widgets_start_y = 0;

    const controller = new AbortController();
    const root = document.createElement("section");
    root.style.cssText = [
        "position:relative",
        "width:100%",
        "height:100%",
        "min-width:0",
        "min-height:0",
        "box-sizing:border-box",
        "contain:size layout paint",
        "overflow:hidden",
        "pointer-events:none",
    ].join(";");
    const surface = document.createElement("div");
    surface.style.cssText = [
        "position:absolute",
        "min-width:0",
        "min-height:0",
        "display:flex",
        "flex-direction:column",
        "justify-content:center",
        "box-sizing:border-box",
        "overflow:hidden",
        "pointer-events:auto",
    ].join(";");
    const title = document.createElement("div");
    title.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const subtitle = document.createElement("div");
    subtitle.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const links = document.createElement("nav");
    links.style.cssText = "display:flex;align-items:center;justify-content:center;flex-wrap:wrap;min-width:0";
    surface.append(title, subtitle, links);
    root.append(surface);
    const refreshFrameHandles = installFrameInteractionHandles(
        root,
        node,
        controller,
        () => node.properties?.novaBannerFrameSize,
    );

    const refresh = () => {
        bannerDefaults(node);
        const p = node.properties;
        const alignment = String(p.novaBannerAlign || "Center").toLowerCase();
        const frameSize = clamp(p.novaBannerFrameSize, 2, 32);
        const radius = clamp(p.novaBannerRadius, 0, 80);
        root.style.background = String(p.novaBannerFrameColor || "#050505");
        root.style.borderRadius = `${Math.min(96, radius + Math.ceil(frameSize * .5))}px`;
        surface.style.inset = `${frameSize}px`;
        surface.style.padding = `${clamp(p.novaBannerPadding, 0, 80)}px`;
        surface.style.gap = `${clamp(p.novaBannerGap, 0, 60)}px`;
        surface.style.borderRadius = `${radius}px`;
        const borderSize = clamp(p.novaBannerBorderSize, 0, 20);
        surface.style.border = borderSize > 0
            ? `${borderSize}px solid ${p.novaBannerBorderColor}`
            : "none";
        surface.style.background = p.novaBannerBackground;
        surface.style.textAlign = alignment;
        title.textContent = String(p.novaBannerTitle || "");
        title.style.display = title.textContent ? "block" : "none";
        title.style.color = p.novaBannerTitleColor;
        title.style.fontFamily = p.novaBannerFont;
        title.style.fontSize = `${clamp(p.novaBannerTitleSize, 12, 320)}px`;
        title.style.fontWeight = "900";
        title.style.lineHeight = ".9";
        subtitle.textContent = String(p.novaBannerSubtitle || "");
        subtitle.style.display = subtitle.textContent ? "block" : "none";
        subtitle.style.color = p.novaBannerTitleColor;
        subtitle.style.fontFamily = p.novaBannerFont;
        subtitle.style.fontSize = `${Math.max(10, clamp(p.novaBannerLinkSize, 9, 96) * .82)}px`;
        links.style.gap = `${Math.max(2, clamp(p.novaBannerGap, 0, 60) * .6)}px`;
        links.style.justifyContent = alignment === "left"
            ? "flex-start"
            : alignment === "right" ? "flex-end" : "center";
        links.replaceChildren();
        const values = safeLinks(p.novaBannerLinks);
        links.style.display = values.length ? "flex" : "none";
        for (const item of values) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = item.label || "Link";
            const enabled = Boolean(safeUrl(item.url));
            button.title = enabled ? item.url : "Add this URL in Banner Settings";
            button.disabled = !enabled;
            button.style.cssText = [
                "max-width:100%",
                "padding:5px 11px",
                "overflow:hidden",
                "text-overflow:ellipsis",
                "white-space:nowrap",
                `border:1px solid ${p.novaBannerBorderColor}`,
                `border-radius:${Math.max(3, clamp(p.novaBannerRadius, 0, 80) * .55)}px`,
                `background:${p.novaBannerLinkBackground}`,
                `color:${p.novaBannerLinkColor}`,
                `font:${enabled ? "700" : "600"} ${clamp(p.novaBannerLinkSize, 9, 96)}px/1.05 ${p.novaBannerFont}`,
                `cursor:${enabled ? "pointer" : "default"}`,
                `opacity:${enabled ? "1" : ".55"}`,
            ].join(";");
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openLink(item.url);
            }, { signal: controller.signal });
            links.append(button);
        }
        node.min_size = [220, Math.max(24, frameSize * 2 + 4)];
        refreshFrameHandles();
        node.__novaPresentationChromeRefresh?.();
    };
    node.__novaWorkflowBannerRefresh = refresh;
    installSettingsMenu(node, "Banner", () => openBannerSettings(node, refresh));
    installPresentationChrome(root, node, controller);
    graphNavigation(root, node, controller);

    const dom = node.addDOMWidget("nova_workflow_banner", "NOVA_WORKFLOW_BANNER", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
        getMinHeight: () => 1,
        getHeight: () => Math.max(1, Number(node.size?.[1] || 160)),
        afterResize: () => requestAnimationFrame(refresh),
    });
    dom.serialize = false;
    dom.options.serialize = false;
    const observer = new ResizeObserver(refresh);
    observer.observe(root);
    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        controller.abort();
        observer.disconnect();
        previousRemoved?.apply(this, arguments);
    };
    requestAnimationFrame(refresh);
}

function guideDefaults(node) {
    node.properties ||= {};
    const p = node.properties;
    p.novaGuideTitle ??= "NovoLoko Workflow Cheat Sheet";
    p.novaGuideBody ??= DEFAULT_GUIDE_BODY;
    p.novaGuideLinks = safeLinks(p.novaGuideLinks, DEFAULT_MODEL_LINKS);
    p.novaGuideFont ??= "Segoe UI";
    p.novaGuideTitleSize ??= 28;
    p.novaGuideBodySize ??= 16;
    p.novaGuideBackground ??= "#101820";
    p.novaGuidePanel ??= "#162534";
    p.novaGuideTextColor ??= "#e7f2ff";
    p.novaGuideAccentColor ??= "#60b7ef";
    p.novaGuideLinkColor ??= "#bce5ff";
    p.novaGuideBorderColor ??= "#3f789f";
    p.novaGuideBorderSize ??= 1;
    p.novaGuidePadding ??= 18;
    p.novaGuideRadius ??= 10;
    p.novaGuideFrameColor ??= "#050505";
    p.novaGuideFrameSize ??= 10;
}

function guideTextForClipboard(node) {
    guideDefaults(node);
    const p = node.properties;
    const sections = [
        String(p.novaGuideTitle || "").trim(),
        String(p.novaGuideBody || "").trim(),
    ].filter(Boolean);
    for (const item of safeLinks(p.novaGuideLinks)) {
        const lines = [
            item.label,
            item.name,
            item.folder ? `Folder: ${item.folder}` : "",
            item.url ? `Link: ${item.url}` : "",
        ].map((value) => String(value || "").trim()).filter(Boolean);
        if (lines.length) sections.push(lines.join("\n"));
    }
    return sections.join("\n\n");
}

function openGuideSettings(node, refresh) {
    guideDefaults(node);
    const p = node.properties;
    const modal = modalShell("NovoLoko Workflow Cheat Sheet Settings");
    const grid = settingsGrid(modal.panel);
    const title = field(grid, "Title", p.novaGuideTitle, { wide: true });
    const body = field(grid, "Instructions", p.novaGuideBody, {
        wide: true, multiline: true, rows: 16,
    });
    const font = field(grid, "Font", p.novaGuideFont, { choices: FONT_CHOICES });
    const titleSize = field(grid, "Title size", p.novaGuideTitleSize, {
        type: "number", min: 12, max: 72,
    });
    const bodySize = field(grid, "Body size", p.novaGuideBodySize, {
        type: "number", min: 9, max: 42,
    });
    const padding = field(grid, "Padding", p.novaGuidePadding, {
        type: "number", min: 0, max: 80,
    });
    const radius = field(grid, "Corner radius", p.novaGuideRadius, {
        type: "number", min: 0, max: 80,
    });
    const borderSize = field(grid, "Border size", p.novaGuideBorderSize, {
        type: "number", min: 0, max: 20, step: 1,
    });
    const frameSize = field(grid, "Outer grab frame size", p.novaGuideFrameSize, {
        type: "number", min: 2, max: 32, step: 1,
    });
    const background = field(grid, "Background", p.novaGuideBackground, { type: "color" });
    const panel = field(grid, "Link-card background", p.novaGuidePanel, { type: "color" });
    const textColor = field(grid, "Text colour", p.novaGuideTextColor, { type: "color" });
    const accent = field(grid, "Accent colour", p.novaGuideAccentColor, { type: "color" });
    const linkColor = field(grid, "Link colour", p.novaGuideLinkColor, { type: "color" });
    const border = field(grid, "Border colour", p.novaGuideBorderColor, { type: "color" });
    const frameColor = field(grid, "Outer grab frame colour", p.novaGuideFrameColor, { type: "color" });
    const readLinks = linksEditor(
        modal.panel,
        p.novaGuideLinks,
        "Model and help links",
        { modelFields: true },
    );

    actionRow(modal.panel, () => {
        Object.assign(p, {
            novaGuideTitle: title.value,
            novaGuideBody: body.value,
            novaGuideFont: font.value,
            novaGuideTitleSize: clamp(titleSize.value, 12, 72),
            novaGuideBodySize: clamp(bodySize.value, 9, 42),
            novaGuidePadding: clamp(padding.value, 0, 80),
            novaGuideRadius: clamp(radius.value, 0, 80),
            novaGuideBackground: background.value,
            novaGuidePanel: panel.value,
            novaGuideTextColor: textColor.value,
            novaGuideAccentColor: accent.value,
            novaGuideLinkColor: linkColor.value,
            novaGuideBorderColor: border.value,
            novaGuideBorderSize: clamp(borderSize.value, 0, 20),
            novaGuideFrameColor: frameColor.value,
            novaGuideFrameSize: clamp(frameSize.value, 2, 32),
            novaGuideLinks: readLinks(),
        });
        refresh();
        dirty(node);
        modal.destroy();
    }, () => {
        for (const key of Object.keys(p)) {
            if (key.startsWith("novaGuide")) delete p[key];
        }
        guideDefaults(node);
        refresh();
        dirty(node);
        modal.destroy();
    });
}

function installGuide(node) {
    if (node.__novaWorkflowGuideInstalled || typeof node.addDOMWidget !== "function") return;
    node.__novaWorkflowGuideInstalled = true;
    guideDefaults(node);
    node.flags ||= {};
    node.flags.no_title = true;
    node.color = "rgba(0,0,0,0)";
    node.bgcolor = "rgba(0,0,0,0)";
    node.min_size = [320, 80];
    node.widgets_start_y = 0;

    const controller = new AbortController();
    const root = document.createElement("section");
    root.style.cssText = [
        "position:relative",
        "width:100%",
        "height:100%",
        "min-width:0",
        "min-height:0",
        "box-sizing:border-box",
        "contain:size layout paint",
        "overflow:hidden",
        "pointer-events:none",
    ].join(";");
    const surface = document.createElement("div");
    surface.style.cssText = [
        "position:absolute",
        "min-width:0",
        "min-height:0",
        "box-sizing:border-box",
        "overflow:hidden",
        "pointer-events:auto",
    ].join(";");
    const scroller = document.createElement("div");
    scroller.style.cssText = [
        "position:absolute",
        "inset:0",
        "overflow:auto",
        "box-sizing:border-box",
        "user-select:text",
    ].join(";");
    const title = document.createElement("h2");
    const body = document.createElement("pre");
    body.style.cssText = [
        "margin:0 0 16px",
        "white-space:pre-wrap",
        "overflow-wrap:anywhere",
        "font:inherit",
        "user-select:text",
    ].join(";");
    const links = document.createElement("div");
    links.style.cssText = "display:flex;flex-direction:column;gap:8px";
    scroller.append(title, body, links);
    surface.append(scroller);
    root.append(surface);
    const guideWheelEntry = { node, root, scroller };
    guideWheelEntries.add(guideWheelEntry);
    installGuideWheelCapture();
    const refreshFrameHandles = installFrameInteractionHandles(
        root,
        node,
        controller,
        () => node.properties?.novaGuideFrameSize,
    );

    const refresh = () => {
        guideDefaults(node);
        const p = node.properties;
        const frameSize = clamp(p.novaGuideFrameSize, 2, 32);
        const radius = clamp(p.novaGuideRadius, 0, 80);
        root.style.background = String(p.novaGuideFrameColor || "#050505");
        root.style.borderRadius = `${Math.min(96, radius + Math.ceil(frameSize * .5))}px`;
        surface.style.inset = `${frameSize}px`;
        const borderSize = clamp(p.novaGuideBorderSize, 0, 20);
        surface.style.border = borderSize > 0
            ? `${borderSize}px solid ${p.novaGuideBorderColor}`
            : "none";
        surface.style.borderRadius = `${radius}px`;
        surface.style.background = p.novaGuideBackground;
        surface.style.color = p.novaGuideTextColor;
        surface.style.fontFamily = p.novaGuideFont;
        scroller.style.padding = `${clamp(p.novaGuidePadding, 0, 80)}px`;
        title.textContent = String(p.novaGuideTitle || "");
        title.style.cssText = [
            "margin:0 42px 16px 0",
            `color:${p.novaGuideAccentColor}`,
            `font:900 ${clamp(p.novaGuideTitleSize, 12, 72)}px/1.1 ${p.novaGuideFont}`,
        ].join(";");
        body.textContent = String(p.novaGuideBody || "");
        body.style.fontSize = `${clamp(p.novaGuideBodySize, 9, 42)}px`;
        body.style.lineHeight = "1.5";
        links.replaceChildren();
        for (const item of safeLinks(p.novaGuideLinks)) {
            const card = document.createElement("div");
            card.style.cssText = [
                "display:grid",
                "grid-template-columns:minmax(150px,.9fr) minmax(190px,1.4fr) auto",
                "gap:10px",
                "align-items:center",
                "padding:9px",
                `border:1px solid ${p.novaGuideBorderColor}`,
                `border-radius:${Math.max(4, clamp(p.novaGuideRadius, 0, 80) * .65)}px`,
                `background:${p.novaGuidePanel}`,
            ].join(";");
            const details = document.createElement("div");
            details.style.minWidth = "0";
            const label = document.createElement("strong");
            label.textContent = item.label || "Model";
            label.style.cssText = `display:block;color:${p.novaGuideLinkColor};font-size:${clamp(p.novaGuideBodySize, 9, 42)}px`;
            const folder = document.createElement("code");
            folder.textContent = item.folder || "No local folder required";
            folder.style.cssText = "display:block;margin-top:3px;opacity:.78;overflow-wrap:anywhere";
            details.append(label, folder);

            const model = document.createElement("button");
            model.type = "button";
            const modelName = item.name || item.label || "Model link pending";
            const modelUrl = safeUrl(item.url);
            model.textContent = modelName;
            model.disabled = !modelUrl;
            model.title = modelUrl
                ? `${modelName}\n${modelUrl}`
                : "Add the final webpage URL in Cheat Sheet Settings";
            model.style.cssText = [
                "min-width:0",
                "padding:8px 10px",
                "overflow-wrap:anywhere",
                "text-align:left",
                `border:1px solid ${p.novaGuideBorderColor}`,
                `border-radius:${Math.max(4, clamp(p.novaGuideRadius, 0, 80) * .5)}px`,
                `background:${p.novaGuideBackground}`,
                `color:${p.novaGuideLinkColor}`,
                `font:700 ${clamp(p.novaGuideBodySize, 9, 42)}px/1.2 ${p.novaGuideFont}`,
                `cursor:${modelUrl ? "pointer" : "default"}`,
                `opacity:${modelUrl ? "1" : ".62"}`,
            ].join(";");
            model.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                openLink(item.url);
            }, { signal: controller.signal });

            const folderButton = document.createElement("button");
            folderButton.type = "button";
            folderButton.textContent = item.folder ? "Open folder" : "No folder";
            folderButton.disabled = !item.folder;
            folderButton.title = item.folder
                ? `Open ${item.folder} in Windows Explorer`
                : "This resource does not need a local model folder";
            folderButton.style.cssText = "padding:7px 10px;cursor:pointer;white-space:nowrap";
            folderButton.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const original = folderButton.textContent;
                folderButton.disabled = true;
                folderButton.textContent = "Opening...";
                try {
                    await openFolder(item.folder);
                    folderButton.textContent = "Opened";
                } catch (error) {
                    folderButton.textContent = "Open failed";
                    folderButton.title = String(error?.message || error);
                } finally {
                    setTimeout(() => {
                        folderButton.textContent = original;
                        folderButton.disabled = !item.folder;
                    }, 1400);
                }
            }, { signal: controller.signal });
            card.append(details, model, folderButton);
            links.append(card);
        }
        node.min_size = [320, Math.max(40, frameSize * 2 + 4)];
        refreshFrameHandles();
        node.__novaPresentationChromeRefresh?.();
    };
    node.__novaWorkflowGuideRefresh = refresh;
    installSettingsMenu(
        node,
        "Cheat Sheet",
        () => openGuideSettings(node, refresh),
        () => copyPlainText(guideTextForClipboard(node)),
    );
    installPresentationChrome(root, node, controller);
    graphNavigation(root, node, controller, scroller);

    const dom = node.addDOMWidget("nova_workflow_guide", "NOVA_WORKFLOW_GUIDE", root, {
        serialize: false,
        hideOnZoom: false,
        margin: 0,
        getMinHeight: () => 1,
        getHeight: () => Math.max(1, Number(node.size?.[1] || 760)),
        afterResize: () => requestAnimationFrame(refresh),
    });
    dom.serialize = false;
    dom.options.serialize = false;
    const observer = new ResizeObserver(refresh);
    observer.observe(root);
    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        guideWheelEntries.delete(guideWheelEntry);
        controller.abort();
        observer.disconnect();
        previousRemoved?.apply(this, arguments);
    };
    requestAnimationFrame(refresh);
}

function installPresentationNode(node, type) {
    if (type === BANNER_NODE) installBanner(node);
    if (type === GUIDE_NODE) installGuide(node);
}

app.registerExtension({
    name: "NovoLoko.WorkflowPresentation.v400",
    commands: [
        {
            id: PRESENTATION_SETTINGS_COMMAND,
            label: "NovoLoko presentation settings",
            icon: "icon-[lucide--settings]",
            function: () => selectedPresentationNode()?.__novaPresentationOpenSettings?.(),
        },
    ],
    getSelectionToolboxCommands(item) {
        return PRESENTATION_TYPES.has(String(item?.comfyClass || item?.type || ""))
            ? [PRESENTATION_SETTINGS_COMMAND]
            : [];
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const type = String(nodeData?.name || "");
        if (!PRESENTATION_TYPES.has(type)) return;

        // Legacy LiteGraph reads the title mode from the registered node type,
        // not from node.flags. Define an own value because current ComfyUI can
        // expose the inherited title_mode as a getter without a setter.
        try {
            Object.defineProperty(nodeType, "title_mode", {
                configurable: true,
                value: globalThis.LiteGraph?.NO_TITLE ?? 1,
            });
        } catch (error) {
            console.warn(
                `[NovoLoko] Could not hide the Legacy title strip for ${type}:`,
                error,
            );
        }

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            installPresentationNode(this, type);
            return result;
        };

        const originalConfigured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function () {
            const result = originalConfigured?.apply(this, arguments);
            installPresentationNode(this, type);
            this.__novaWorkflowBannerRefresh?.();
            this.__novaWorkflowGuideRefresh?.();
            return result;
        };
    },
});
