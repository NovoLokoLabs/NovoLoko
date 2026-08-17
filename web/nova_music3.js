import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";


const CONTROLS_NODE = "NovaMusicControls";
const LIBRARY_NODE = "NovaMusicAudioLibrary";
const WRITER_NODE = "NovaMusicWriterOllamaLoader";
const SAVER_NODE = "NovaMusicSaveAudioMetadata";
const NONE = "None / No preference";
const CUSTOM = "Custom...";
const RANDOM = "Random";
const DEFAULT_FOLDER = "audio/NovoLoko";
const playerNodes = new Set();
const musicControlsNodes = new Set();
const RESPONSIVE_PANEL_GAP = 8;
const VISUALIZER_STYLES = [
    "Neon Waveform", "Spectrum Bars", "Mirrored Bass", "Radial Pulse",
    "Frequency Ribbon", "Minimal Line",
];
const MUSIC_TIMING_LABELS = [
    "Enhancer/model load", "Lyric enhancer", "Lyrics generator",
    "Music caption enhancer", "MiniMax Music 3 generation", "Save", "Cleanup",
];
let musicTimingRun = null;
let musicTimingEventsInstalled = false;


function booleanValue(value, fallback = false) {
    if (typeof value === "string") {
        const lowered = value.trim().toLocaleLowerCase();
        if (["true", "1", "yes", "on"].includes(lowered)) return true;
        if (["false", "0", "no", "off", ""].includes(lowered)) return false;
    }
    return value == null ? fallback : Boolean(value);
}


function comboValue(item, fallback = "") {
    const values = Array.isArray(item?.options?.values) ? item.options.values : [];
    const raw = item?.value;
    if (Number.isInteger(raw) && raw >= 0 && raw < values.length) return String(values[raw]);
    const text = String(raw ?? "");
    return values.includes(text) || !values.length ? text : fallback;
}


function musicPlayerEndAction({ repeat = "off", autoNext = false, index = -1, trackCount = 0 } = {}) {
    const mode = ["off", "one", "all"].includes(String(repeat)) ? String(repeat) : "off";
    if (mode === "one") return "repeat-one";
    if (mode === "all" && trackCount > 0) return "play-next";
    if (autoNext && index >= 0 && index < trackCount - 1) return "play-next";
    return "stop";
}


function eventNodeId(event) {
    const detail = event?.detail;
    return detail && typeof detail === "object" ? (detail.node ?? detail.node_id ?? detail.id) : detail;
}


function musicStageForNode(node) {
    const type = String(node?.comfyClass || node?.type || "");
    const title = String(node?.title || "").toLocaleLowerCase();
    if ((type === "CLIPLoader" && title.includes("text writer")) || type === "NovaMusicWriterOllamaLoader") return "Enhancer/model load";
    if (type === "NovaMusicLyricEnhancer") return "Lyric enhancer";
    if (type === "NovaMusicLyricsGenerator") return "Lyrics generator";
    if (type === "NovaMusicCaptionEnhancer") return "Music caption enhancer";
    if (title.includes("minimax music 3 generator")) return "MiniMax Music 3 generation";
    if (type === "NovaMusicSaveAudioMetadata") return "Save";
    if (type === "NovaMemoryManager") return "Cleanup";
    return null;
}


function finishMusicTimingStage(now = performance.now()) {
    if (!musicTimingRun?.activeStage) return;
    const elapsed = Math.max(0, now - musicTimingRun.activeStartedAt);
    musicTimingRun.timings[musicTimingRun.activeStage] =
        (musicTimingRun.timings[musicTimingRun.activeStage] || 0) + elapsed;
    musicTimingRun.activeStage = null;
}


function publishMusicTimings(outcome = "DONE") {
    if (!musicTimingRun) return;
    finishMusicTimingStage();
    const payload = {
        outcome,
        totalMs: Math.max(0, performance.now() - musicTimingRun.startedAt),
        timings: { ...musicTimingRun.timings },
        completedAt: new Date().toISOString(),
    };
    for (const node of [...musicControlsNodes]) {
        if (!node?.graph) { musicControlsNodes.delete(node); continue; }
        node.properties ||= {};
        node.properties.novaMusicStageTimings = payload;
        node.__novaMusic3RenderTimings?.();
        dirty(node);
    }
    musicTimingRun = null;
}


function installMusicTimingEvents() {
    if (musicTimingEventsInstalled) return;
    musicTimingEventsInstalled = true;
    api.addEventListener("execution_start", () => {
        musicTimingRun = {
            startedAt: performance.now(), activeStage: null, activeStartedAt: 0,
            lastKnownAt: performance.now(), timings: {},
        };
        for (const node of musicControlsNodes) node.__novaMusic3RenderTimings?.(true);
    });
    api.addEventListener("executing", (event) => {
        if (!musicTimingRun) return;
        const id = eventNodeId(event);
        if (id == null) return publishMusicTimings("DONE");
        const graph = app.graph || app.canvas?.graph;
        const node = graph?.getNodeById?.(id) || graph?._nodes_by_id?.[id];
        // Unknown IDs are commonly internal subgraph nodes. Keep the current
        // top-level MiniMax stage running until the next known graph node.
        if (!node) return;
        const now = performance.now();
        finishMusicTimingStage(now);
        const stage = musicStageForNode(node);
        if (stage === "Save" && musicTimingRun.timings["MiniMax Music 3 generation"] == null) {
            // Some ComfyUI builds emit only the internal subgraph node IDs.
            // Those IDs are not in the top-level graph, so the gap between the
            // last known text node and Save is the observable MiniMax stage.
            musicTimingRun.timings["MiniMax Music 3 generation"] =
                Math.max(0, now - musicTimingRun.lastKnownAt);
        }
        musicTimingRun.lastKnownAt = now;
        if (stage) {
            musicTimingRun.activeStage = stage;
            musicTimingRun.activeStartedAt = now;
        }
    });
    api.addEventListener("execution_success", () => {
        for (const node of musicControlsNodes) node.__novaMusic3RunFinished?.();
        publishMusicTimings("DONE");
    });
    api.addEventListener("execution_error", () => publishMusicTimings("ERROR"));
    api.addEventListener("execution_interrupted", () => publishMusicTimings("STOPPED"));
}


function nodeWidget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}


function dirty(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}


function setWidgetValue(node, item, value) {
    if (!item || item.value === value) return;
    item.value = value;
    item.callback?.call(item, value, app.canvas, node, undefined, undefined);
    dirty(node);
}


function hideNativeWidget(item) {
    if (!item || item.__novaMusic3Hidden) return;
    item.__novaMusic3Hidden = true;
    item.__novaMusic3OriginalType = item.type;
    item.__novaMusic3OriginalHidden = item.hidden;
    item.options ||= {};
    item.__novaMusic3OriginalOptionHidden = item.options.hidden;
    item.type = "hidden";
    item.hidden = true;
    item.options.hidden = true;
    item.computeSize = () => [0, -4];
    item.draw = () => {};
    item.serializeValue = async () => item.value;
    const element = item.element || item.inputEl;
    if (element?.style) {
        element.style.display = "none";
        element.style.pointerEvents = "none";
        element.hidden = true;
    }
}


function refreshNodes2Widgets(node) {
    if (!Array.isArray(node.widgets)) return;
    const widgets = [...node.widgets];
    node.widgets = [];
    node.widgets = widgets;
}


function installFlexibleControlsPanel(node, dom, root, allocated = null) {
    const minWidth = 420;
    const minNodeHeight = 480;
    const defaultSize = [620, 760];
    const corruptLimit = 4096;
    const heightProperty = "novaMusicControlsPanelHeight";
    let applyingSize = false;
    let frame = 0;

    const saneDimension = (value, minimum, fallback) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= minimum && numeric <= corruptLimit
            ? Math.round(numeric)
            : fallback;
    };
    const clampNodeSize = () => {
        const width = saneDimension(node.size?.[0], minWidth, defaultSize[0]);
        const height = saneDimension(node.size?.[1], minNodeHeight, defaultSize[1]);
        if (Number(node.size?.[0]) === width && Number(node.size?.[1]) === height) return;
        applyingSize = true;
        node.setSize?.([width, height]);
        applyingSize = false;
    };
    const syncAllocatedHeight = () => {
        frame = 0;
        const wrapper = root.parentElement;
        // Nodes 2.0 lays DOM widgets out in a CSS grid.  Without size
        // containment the panel's scrollable contents become the grid row's
        // intrinsic minimum and feed back into --node-height, which can turn a
        // saved 760px node into a 1200px+ node after a tab switch.  The wrapper
        // must accept the height allocated by LiteGraph instead of requesting
        // the height of all of its children.
        if (wrapper?.style) {
            wrapper.style.minWidth = "0";
            wrapper.style.minHeight = "0";
            wrapper.style.overflow = "hidden";
            wrapper.style.contain = "size layout";
        }
        // Legacy/classic exposes the exact body allocation on computedHeight.
        // Nodes 2.0 exposes the wrapper box. Prefer the allocated LiteGraph
        // value so a stale intrinsic wrapper cannot leave a short scrolling
        // list inside a much taller node.
        const computed = Number(dom.computedHeight || 0);
        const measured = Number(wrapper?.getBoundingClientRect?.().height || root.getBoundingClientRect?.().height || 0);
        const allocatedHeight = Number.isFinite(computed) && computed >= 260 && computed < corruptLimit
            ? computed
            : measured;
        if (Number.isFinite(allocatedHeight) && allocatedHeight > 0 && allocatedHeight < corruptLimit) {
            node.properties ||= {};
            node.properties[heightProperty] = Math.round(allocatedHeight);
            root.style.height = `${Math.round(allocatedHeight)}px`;
            root.style.maxHeight = `${Math.round(allocatedHeight)}px`;
        }
        const applyContentCeiling = () => {
            const contentMax = Number(root.dataset.contentMaxHeight || 0);
            if (!(Number.isFinite(contentMax) && contentMax >= 260 && Number.isFinite(allocatedHeight))) return;
            const nodeHeight = Number(node.size?.[1] || defaultSize[1]);
            // Music Controls has many typed output sockets, so its real
            // renderer-owned chrome is taller than a normal DOM-widget node
            // (about 166px classic / 202px Nodes 2.0 in the supported build).
            const chromeHeight = Math.max(24, Math.min(360, nodeHeight - allocatedHeight));
            const maxNodeHeight = Math.max(minNodeHeight, Math.ceil(contentMax + chromeHeight));
            const oldMax = Array.isArray(node.max_size) ? node.max_size : [8192, 8192];
            node.max_size = [Math.max(minWidth, Number(oldMax[0]) || 8192), maxNodeHeight];
            if (nodeHeight > maxNodeHeight + 1 && !applyingSize) {
                applyingSize = true;
                node.setSize?.([Math.max(minWidth, Number(node.size?.[0]) || defaultSize[0]), maxNodeHeight]);
                applyingSize = false;
            }
        };
        allocated?.();
        applyContentCeiling();
        // The adaptive allocator runs on the next frame. Re-read its stable
        // natural-content measurement once it has published the new ceiling.
        requestAnimationFrame(applyContentCeiling);
    };
    const scheduleSync = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(syncAllocatedHeight);
    };

    const oldMin = Array.isArray(node.min_size) ? node.min_size : [0, 0];
    node.min_size = [
        Math.max(minWidth, Number(oldMin[0]) || 0),
        Math.max(minNodeHeight, Number(oldMin[1]) || 0),
    ];
    dom.options ||= {};
    dom.options.getMinHeight = () => 260;
    dom.options.afterResize = scheduleSync;
    dom.options.onDraw = scheduleSync;

    const previousResize = node.onResize;
    node.onResize = function (...args) {
        const result = previousResize?.apply(this, args);
        if (!applyingSize) scheduleSync();
        return result;
    };
    const previousCollapse = node.collapse;
    node.collapse = function (...args) {
        const collapsing = !this.flags?.collapsed;
        if (collapsing) {
            this.properties ||= {};
            this.properties.novaMusicControlsExpandedSize = [
                Math.max(minWidth, Number(this.size?.[0]) || defaultSize[0]),
                Math.max(minNodeHeight, Number(this.size?.[1]) || defaultSize[1]),
            ];
        }
        const result = previousCollapse?.apply(this, args);
        if (!collapsing) {
            const saved = this.properties?.novaMusicControlsExpandedSize;
            if (Array.isArray(saved) && saved.length >= 2) {
                requestAnimationFrame(() => {
                    applyingSize = true;
                    this.setSize?.([saneDimension(saved[0], minWidth, defaultSize[0]), saneDimension(saved[1], minNodeHeight, defaultSize[1])]);
                    applyingSize = false;
                    scheduleSync();
                    dirty(this);
                });
            }
        }
        return result;
    };
    const previousConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        this.__novaMusic3Configuring = true;
        let result;
        try {
            result = previousConfigure?.apply(this, args);
        } finally {
            this.__novaMusic3Configuring = false;
        }
        this.__novaMusic3RepairControlWidgets?.(args[0]);
        requestAnimationFrame(() => {
            clampNodeSize();
            scheduleSync();
            refreshNodes2Widgets(this);
            dirty(this);
        });
        return result;
    };

    const observer = typeof ResizeObserver === "function"
        ? new ResizeObserver(scheduleSync)
        : null;
    observer?.observe(root);
    if (root.parentElement) observer?.observe(root.parentElement);
    node.__novaMusic3ControlsResizeObserver = observer;

    clampNodeSize();
    scheduleSync();
    setTimeout(scheduleSync, 0);
    setTimeout(scheduleSync, 120);
    setTimeout(scheduleSync, 500);
}


function installAdaptiveControlsBody(root, ideaPanel, ideaInput, list, fixedElements = []) {
    let frame = 0;
    let lastRenderableHeight = 0;
    const allocate = () => {
        frame = 0;
        if (!root.isConnected || !list.isConnected) return;
        const rootHeight = Number(root.getBoundingClientRect?.().height || root.clientHeight || 0);
        const rootWidth = Number(root.getBoundingClientRect?.().width || root.clientWidth || 0);
        // ComfyUI may keep a DOM node connected while culling it completely
        // offscreen. Those roots report a zero box. Never replace a known-good
        // category allocation with 0px while hidden; the visibility observer
        // below schedules a fresh measurement when the node re-enters.
        if (!(rootHeight > 1 && rootWidth > 1)) {
            root.dataset.measurementDeferred = "offscreen-zero-size";
            return;
        }
        lastRenderableHeight = rootHeight;
        root.dataset.lastRenderableHeight = String(Math.round(lastRenderableHeight));
        delete root.dataset.measurementDeferred;
        const compactHeight = rootHeight > 0 && rootHeight < 400;
        root.dataset.compactHeight = compactHeight ? "true" : "false";
        // The stage timing strip is supplementary. At the deliberately tiny
        // 420x480 acceptance size it yields its space so the editable controls
        // and an internally scrolling category list stay inside the body.
        const timings = fixedElements.at(-1);
        if (timings?.style) timings.style.display = compactHeight ? "none" : "block";
        // Always reset the textarea before measuring. Otherwise the previous
        // allocation becomes part of the next allocation and creates a growth
        // feedback loop.
        const baseTextareaHeight = compactHeight ? 54 : 76;
        ideaInput.style.height = `${baseTextareaHeight}px`;
        const ideaHeight = Number(ideaPanel.getBoundingClientRect?.().height || ideaPanel.offsetHeight || 0);
        const ideaChrome = Math.max(0, ideaHeight - baseTextareaHeight);
        const fixedHeight = fixedElements.reduce((total, element) => (
            total + Math.max(0, Number(element?.getBoundingClientRect?.().height || element?.offsetHeight || 0))
        ), 0);
        // scrollHeight is at least clientHeight, so it cannot describe natural
        // content after the list has been enlarged. Measure the rendered rows
        // themselves to keep the content ceiling stable at very tall sizes.
        const listRect = list.getBoundingClientRect?.();
        const lastRow = list.lastElementChild;
        const lastRect = lastRow?.getBoundingClientRect?.();
        const listStyle = globalThis.getComputedStyle?.(list) || {};
        const paddingBottom = Number.parseFloat(listStyle.paddingBottom || "0") || 0;
        const rowsHeight = listRect && lastRect
            ? Math.max(0, lastRect.bottom - listRect.top + paddingBottom)
            : 0;
        const scrollHeight = Math.max(0, Number(list.scrollHeight || 0));
        const clientHeight = Math.max(0, Number(list.clientHeight || 0));
        const overflowingScrollHeight = scrollHeight > clientHeight + 2 ? scrollHeight : 0;
        const measuredWidth = Math.round(Number(listRect?.width || list.clientWidth || 0));
        if (Number(root.dataset.listMeasureWidth || 0) !== measuredWidth) {
            root.dataset.listMeasureWidth = String(measuredWidth);
            root.dataset.naturalListFloor = "0";
        }
        if (overflowingScrollHeight > 0) {
            root.dataset.naturalListFloor = String(Math.max(
                Number(root.dataset.naturalListFloor || 0),
                overflowingScrollHeight,
            ));
        }
        const measuredContentHeight = Math.max(
            rowsHeight,
            overflowingScrollHeight,
            Number(root.dataset.naturalListFloor || 0),
        );
        const naturalListHeight = Math.max(0, Math.ceil(measuredContentHeight || scrollHeight));
        const baseIdeaPanelHeight = ideaChrome + baseTextareaHeight;
        const surplus = rootHeight - fixedHeight - baseIdeaPanelHeight - naturalListHeight;
        const textareaHeight = Math.max(54, Math.min(280, baseTextareaHeight + Math.max(0, surplus)));
        ideaInput.style.height = `${Math.round(textareaHeight)}px`;
        ideaInput.style.maxHeight = "280px";
        const adjustedIdea = ideaChrome + textareaHeight;
        const availableList = Math.max(0, rootHeight - fixedHeight - adjustedIdea);
        const fullyVisible = availableList + 2 >= naturalListHeight;
        list.style.overflowY = fullyVisible ? "hidden" : "auto";
        list.style.scrollbarGutter = fullyVisible ? "auto" : "stable";
        list.style.flexBasis = `${Math.max(0, Math.min(availableList, naturalListHeight || availableList))}px`;
        list.dataset.allCategoriesVisible = fullyVisible ? "true" : "false";
        root.dataset.ideaExpanded = textareaHeight > 76 ? "true" : "false";
        root.dataset.fixedHeight = String(Math.round(fixedHeight));
        root.dataset.naturalListHeight = String(Math.round(naturalListHeight));
        root.dataset.contentMaxHeight = String(Math.ceil(fixedHeight + ideaChrome + 280 + naturalListHeight + 2));
    };
    const schedule = () => {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(allocate);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(root);
    observer?.observe(list);
    const visibilityObserver = typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry?.isIntersecting || Number(entry?.intersectionRatio || 0) > 0)) {
                schedule();
                requestAnimationFrame(schedule);
            }
        }, { root: null, threshold: [0, 0.001] })
        : null;
    visibilityObserver?.observe(root);
    schedule();
    setTimeout(schedule, 0);
    setTimeout(schedule, 120);
    return {
        schedule,
        disconnect: () => {
            observer?.disconnect?.();
            visibilityObserver?.disconnect?.();
        },
    };
}


function ensureMusicControlsStyles() {
    if (document.getElementById("nova-music3-controls-layout")) return;
    const style = document.createElement("style");
    style.id = "nova-music3-controls-layout";
    style.textContent = `
        .nova-music3-controls-v461 { container-type: inline-size; }
        .nova-music3-controls-v461 .nova-music3-category-list { overscroll-behavior: contain; }
        @container (max-width: 520px) {
            .nova-music3-controls-v461 .nova-music3-idea-panel { grid-template-columns: 76px minmax(0, 1fr) !important; }
            .nova-music3-controls-v461 .nova-music3-preset-browser { grid-template-columns: minmax(100px, .7fr) minmax(0, 1fr) !important; }
            .nova-music3-controls-v461 .nova-music3-preset-description { grid-column: 1 / -1 !important; }
            .nova-music3-controls-v461 .nova-music3-toolbar { grid-template-columns: 1fr 1fr !important; }
            .nova-music3-controls-v461 .nova-music3-toolbar input { grid-column: 1 / -1; }
            .nova-music3-controls-v461 .nova-music3-toolbar button { width: 100%; min-width: 0; }
            .nova-music3-controls-v461 .nova-music3-random-preset { grid-template-columns: auto minmax(82px, .7fr) minmax(100px, 1fr) !important; }
            .nova-music3-controls-v461 .nova-music3-policy-line { grid-template-columns: 1fr 1fr !important; }
            .nova-music3-controls-v461 .nova-music3-category-row { grid-template-columns: minmax(86px, 112px) minmax(0, 1fr) !important; }
        }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-idea-panel,
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-preset-browser,
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-toolbar { padding-top: 4px !important; padding-bottom: 4px !important; gap: 4px !important; }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-random-preset,
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-policy-line { padding-top: 3px !important; padding-bottom: 3px !important; gap: 4px !important; }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-category-list { padding-top: 2px !important; padding-bottom: 2px !important; }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-preset-description { display: none !important; }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-toolbar { grid-template-columns: 1.8fr 1fr 1fr !important; }
        .nova-music3-controls-v461[data-compact-height="true"] .nova-music3-toolbar input { grid-column: 1 / -1; }
    `;
    document.head.append(style);
}


function installResponsivePanel(node, dom, root, options = {}) {
    const minWidth = Number(options.minWidth || 420);
    const minPanelHeight = Number(options.minPanelHeight || 300);
    const defaultNodeHeight = Number(options.defaultNodeHeight || 700);
    const chromeHeight = Number(options.chromeHeight || 100);
    const maxNodeHeight = Number(options.maxNodeHeight || 2400);
    const heightProperty = String(options.heightProperty || "novaResponsivePanelHeight");
    const flag = String(options.flag || "__novaResponsivePanelInstalled");

    const minNodeHeight = minPanelHeight + chromeHeight;
    const clampNodeHeight = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < minNodeHeight || numeric > maxNodeHeight) return defaultNodeHeight;
        return Math.round(numeric);
    };
    const savedPanelHeight = Number(node.properties?.[heightProperty]);
    const savedPanelHeightIsSane = Number.isFinite(savedPanelHeight)
        && savedPanelHeight >= minPanelHeight
        && savedPanelHeight <= maxNodeHeight - chromeHeight;
    let stablePanelHeight = savedPanelHeightIsSane
        ? Math.round(savedPanelHeight)
        : clampNodeHeight(node.size?.[1]) - chromeHeight;
    let applyingSize = false;
    const panelHeight = () => stablePanelHeight;
    const apply = () => {
        const height = panelHeight();
        root.style.height = `${height}px`;
        root.style.minHeight = `${minPanelHeight}px`;
        root.style.maxHeight = `${height}px`;
        dom.computeSize = () => [
            Math.max(minWidth, Number(node.size?.[0]) || minWidth),
            height + RESPONSIVE_PANEL_GAP,
        ];
        dom.options ||= {};
        dom.options.getMinHeight = () => minPanelHeight + RESPONSIVE_PANEL_GAP;
        dom.options.getHeight = () => stablePanelHeight + RESPONSIVE_PANEL_GAP;
        node.properties ||= {};
        node.properties[heightProperty] = stablePanelHeight;
        dirty(node);
    };

    const oldMin = Array.isArray(node.min_size) ? node.min_size : [0, 0];
    node.min_size = [
        Math.max(minWidth, Number(oldMin[0]) || 0),
        minNodeHeight,
    ];
    if (!node[flag]) {
        node[flag] = true;
        const previousResize = node.onResize;
        node.onResize = function (...args) {
            const result = previousResize?.apply(this, args);
            if (!applyingSize) {
                const requested = Number(this.size?.[1]);
                const expected = stablePanelHeight + chromeHeight;
                const userSized = app.canvas?.resizing_node === this || Math.abs(requested - expected) >= 48;
                if (userSized && Number.isFinite(requested) && requested >= minNodeHeight && requested <= maxNodeHeight) {
                    stablePanelHeight = Math.max(minPanelHeight, Math.round(requested - chromeHeight));
                }
            }
            requestAnimationFrame(apply);
            return result;
        };
    }
    const repairedNodeHeight = clampNodeHeight(node.size?.[1]);
    if (Number(node.size?.[1]) !== repairedNodeHeight) {
        applyingSize = true;
        node.setSize?.([
            Math.max(minWidth, Number(node.size?.[0]) || minWidth),
            repairedNodeHeight,
        ]);
        applyingSize = false;
    }
    apply();
    setTimeout(apply, 0);
    setTimeout(apply, 120);
    return apply;
}


function makeButton(label, title = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.style.cssText = [
        "border:1px solid #365d79", "border-radius:6px", "background:#173149",
        "color:#edf7ff", "padding:5px 8px", "font:600 11px/1.2 system-ui",
        "cursor:pointer", "white-space:nowrap",
    ].join(";");
    return button;
}


function makeSelect() {
    const select = document.createElement("select");
    select.style.cssText = "width:100%;min-width:0;border:1px solid #335873;border-radius:5px;background:#0c1c29;color:#ecf7ff;padding:4px;font:11px system-ui";
    return select;
}


function makeTextInput(placeholder = "") {
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.style.cssText = "width:100%;min-width:0;box-sizing:border-box;border:1px solid #335873;border-radius:5px;background:#07131e;color:#ecf7ff;padding:5px 7px;font:11px system-ui";
    return input;
}


async function responseJson(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body?.ok === false) {
        throw new Error(body?.error || `NovoLoko request failed (${response.status}).`);
    }
    return body;
}


async function fetchControls() {
    return responseJson(await api.fetchApi("/nova_music3/controls"));
}


function installMusicControls(node) {
    if (node.__novaMusic3ControlsInstalled || typeof node.addDOMWidget !== "function") return;
    node.__novaMusic3ControlsInstalled = true;
    node.properties ||= {};
    const native = {
        preset: nodeWidget(node, "preset"),
        randomize_all: nodeWidget(node, "randomize_all"),
        seed: nodeWidget(node, "seed"),
        control_after_generate: nodeWidget(node, "control_after_generate"),
        allow_random_none: nodeWidget(node, "allow_random_none"),
        random_preset_scope: nodeWidget(node, "random_preset_scope"),
        random_preset_filter: nodeWidget(node, "random_preset_filter"),
        idea: nodeWidget(node, "idea"),
        control_overrides_json: nodeWidget(node, "control_overrides_json"),
        seed_after_run: nodeWidget(node, "seed_after_run"),
    };
    node.__novaMusic3RepairControlWidgets = (info) => {
        if (!Array.isArray(info?.widgets_values)) return false;
        const values = [...info.widgets_values];
        const controlModes = new Set(["fixed", "randomize", "increment", "decrement"]);
        let repaired = false;
        // v4.6.1/v4.6.2 workflows pre-date the explicit ComfyUI
        // control_after_generate slot. Their genre value appears at index 3 and
        // would otherwise shift every remaining control by one position.
        if (!controlModes.has(String(values[3] || "").toLocaleLowerCase())) {
            values.splice(3, 0, "fixed");
            repaired = true;
        }
        if (!["Fixed", "Randomize Seed"].includes(String(values.at(-1) || ""))) {
            values.push("Fixed");
            repaired = true;
        }
        if (!repaired) return false;
        info.widgets_values = values;
        const serialized = (node.widgets || []).filter((item) => item?.serialize !== false && !String(item?.name || "").startsWith("nova_music3_"));
        serialized.forEach((item, index) => {
            if (index < values.length) item.value = values[index];
        });
        const policy = nodeWidget(node, "seed_after_run");
        const control = nodeWidget(node, "control_after_generate");
        if (policy) policy.value = "Fixed";
        if (control) control.value = "fixed";
        return true;
    };
    musicControlsNodes.add(node);
    installMusicTimingEvents();
    ensureMusicControlsStyles();
    // Hide every serialized backend widget before Nodes 2.0 can lay them out.
    // Their objects, values, callbacks, and order remain untouched for workflow compatibility.
    for (const item of [...(node.widgets || [])]) hideNativeWidget(item);
    const root = document.createElement("section");
    root.className = "nova-music3-controls-v461";
    root.style.cssText = [
        "height:100%", "min-height:0", "max-height:100%", "display:flex", "flex-direction:column",
        "width:100%", "min-width:0", "max-width:100%",
        "box-sizing:border-box", "border:1px solid #315b7b", "border-radius:9px",
        "background:#07121c", "color:#e9f5ff", "overflow:hidden", "font:11px/1.35 system-ui",
        "contain:size layout paint", "min-block-size:0", "max-block-size:100%",
    ].join(";");

    const ideaPanel = document.createElement("div");
    ideaPanel.className = "nova-music3-idea-panel";
    ideaPanel.style.cssText = "display:grid;grid-template-columns:96px minmax(0,1fr);gap:7px;align-items:start;padding:7px 8px;border-bottom:1px solid #31546d;background:#0a1b28";
    const ideaLabel = document.createElement("strong");
    ideaLabel.className = "nova-music3-idea-label";
    ideaLabel.textContent = "SONG IDEA";
    ideaLabel.style.cssText = "padding-top:5px;color:#71d8ff;letter-spacing:.04em";
    const ideaInput = document.createElement("textarea");
    ideaInput.value = String(native.idea?.value || "");
    ideaInput.placeholder = "Type the song concept, story, feeling, hook, or lyrical premise...";
    ideaInput.style.cssText = "width:100%;height:76px;min-height:54px;max-height:280px;resize:none;box-sizing:border-box;border:1px solid #37617d;border-radius:6px;background:#050d14;color:#f1f8ff;padding:7px;font:11px/1.35 ui-monospace,Consolas,monospace";
    ideaInput.oninput = () => setWidgetValue(node, native.idea, ideaInput.value);
    ideaPanel.append(ideaLabel, ideaInput);

    const presetBrowser = document.createElement("div");
    presetBrowser.className = "nova-music3-preset-browser";
    presetBrowser.style.cssText = "min-width:0;max-width:100%;display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1fr) minmax(0,1.4fr);gap:6px;padding:8px 8px 6px;box-sizing:border-box;overflow:hidden;border-bottom:1px solid #29495f;background:#0d1c29";
    const presetSearch = makeTextInput("Search Pearl Jam, grunge, techno, spoken...");
    presetSearch.type = "search";
    const presetFolder = makeSelect();
    const presetSelect = makeSelect();
    const presetDescription = document.createElement("div");
    presetDescription.className = "nova-music3-preset-description";
    presetDescription.style.cssText = "grid-column:1/-1;min-height:16px;color:#91b7ce;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    presetBrowser.append(presetFolder, presetSearch, presetSelect, presetDescription);

    const toolbar = document.createElement("div");
    toolbar.className = "nova-music3-toolbar";
    toolbar.style.cssText = "min-width:0;max-width:100%;display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:6px;padding:8px;box-sizing:border-box;overflow:hidden;border-bottom:1px solid #29495f;background:#0d1c29";
    const presetName = makeTextInput("Name current resolved preset...");
    const save = makeButton("Save Current as Preset");
    const rename = makeButton("Rename");
    const remove = makeButton("Delete");
    toolbar.append(presetName, save, rename, remove);

    const randomPresetLine = document.createElement("div");
    randomPresetLine.className = "nova-music3-random-preset";
    randomPresetLine.style.cssText = "display:grid;grid-template-columns:auto minmax(130px,.7fr) minmax(150px,1fr);gap:7px;align-items:center;padding:6px 9px;border-bottom:1px solid #233f54;background:#091722;color:#bcd3e4";
    const randomPresetLabel = document.createElement("strong");
    randomPresetLabel.textContent = "Random named preset";
    const randomPresetScope = makeSelect();
    for (const value of ["Off", "All Presets", "Preset Folder", "Genre"]) {
        const option = document.createElement("option"); option.value = value; option.textContent = value; randomPresetScope.append(option);
    }
    randomPresetScope.value = comboValue(native.random_preset_scope, "Off") || "Off";
    const randomPresetFilter = makeSelect();
    randomPresetLine.append(randomPresetLabel, randomPresetScope, randomPresetFilter);

    const randomLine = document.createElement("div");
    randomLine.className = "nova-music3-policy-line";
    randomLine.style.cssText = "display:grid;grid-template-columns:auto minmax(130px,190px) minmax(155px,210px) minmax(170px,1fr);align-items:center;gap:8px;padding:6px 9px;border-bottom:1px solid #233f54;background:#091722;color:#bcd3e4";
    const randomAllLabel = document.createElement("label");
    randomAllLabel.style.cssText = "display:flex;align-items:center;gap:6px;white-space:nowrap";
    const randomAll = document.createElement("input");
    randomAll.type = "checkbox";
    randomAll.checked = Boolean(native.randomize_all?.value);
    randomAllLabel.append(randomAll, document.createTextNode("Randomize all 19"));
    const seedLabel = document.createElement("label");
    seedLabel.style.cssText = "display:grid;grid-template-columns:auto minmax(80px,1fr);align-items:center;gap:6px;white-space:nowrap";
    const seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.min = "0";
    seedInput.max = "9007199254740991";
    seedInput.step = "1";
    seedInput.value = String(Number(native.seed?.value || 0));
    seedInput.style.cssText = "min-width:0;width:100%;box-sizing:border-box;border:1px solid #335873;border-radius:5px;background:#0c1c29;color:#ecf7ff;padding:4px;font:11px system-ui";
    const seedCaption = document.createElement("span");
    seedCaption.textContent = "Seed";
    seedLabel.append(seedCaption, seedInput);
    const afterRunLabel = document.createElement("label");
    afterRunLabel.style.cssText = "display:grid;grid-template-columns:auto minmax(100px,1fr);align-items:center;gap:6px;white-space:nowrap";
    const afterRun = makeSelect();
    for (const value of ["Fixed", "Randomize Seed"]) {
        const option = document.createElement("option"); option.value = value; option.textContent = value; afterRun.append(option);
    }
    afterRun.value = comboValue(native.seed_after_run, "Fixed") || "Fixed";
    afterRun.options[0].textContent = "Keep fixed";
    afterRun.options[1].textContent = "Randomize after each run";
    afterRun.title = "The current run uses the current seed. After it completes, this field shows the new seed that the very next run will use. The 19 controls never change.";
    afterRunLabel.append(document.createTextNode("Next run seed"), afterRun);
    const randomNoneLabel = document.createElement("label");
    randomNoneLabel.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
    const randomNone = document.createElement("input");
    randomNone.type = "checkbox";
    randomNone.checked = Boolean(native.allow_random_none?.value);
    randomNoneLabel.append(randomNone, document.createTextNode("Allow Random to choose None / no preference"));
    randomLine.append(randomAllLabel, seedLabel, afterRunLabel, randomNoneLabel);

    const status = document.createElement("div");
    status.style.cssText = "min-height:17px;padding:4px 9px;color:#91bdd7;background:#07121c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    status.textContent = "Loading the expanded NovoLoko music library...";

    const timings = document.createElement("div");
    timings.style.cssText = "min-height:31px;padding:5px 9px;box-sizing:border-box;border-bottom:1px solid #233f54;background:#061019;color:#9fc4da;font:10px/1.35 ui-monospace,Consolas,monospace;white-space:normal";

    const list = document.createElement("div");
    list.className = "nova-music3-category-list";
    list.style.cssText = "min-width:0;max-width:100%;min-height:0;flex:1 1 auto;overflow-x:hidden;overflow-y:auto;padding:6px 8px 10px;box-sizing:border-box";
    root.append(ideaPanel, presetBrowser, toolbar, randomPresetLine, randomLine, status, timings, list);
    const adaptiveBody = installAdaptiveControlsBody(
        root, ideaPanel, ideaInput, list,
        [presetBrowser, toolbar, randomPresetLine, randomLine, status, timings],
    );
    node.__novaMusic3AllocateControlsBody = adaptiveBody.schedule;

    const state = {
        config: null, rows: new Map(), userPresets: new Set(), presetEntries: [],
        applyingPreset: false,
        overrides: new Set(),
    };
    const categoryWidgets = new Map();
    const customWidgets = new Map();
    for (const item of node.widgets || []) {
        if (String(item.name || "").startsWith("custom_")) customWidgets.set(item.name.slice(7), item);
    }

    function setStatus(message, error = false) {
        status.textContent = message;
        status.style.color = error ? "#ff9c9c" : "#91d7b6";
    }

    function setAfterRunPolicy(value, announce = false) {
        const policy = value === "Randomize Seed" ? "Randomize Seed" : "Fixed";
        afterRun.value = policy;
        setWidgetValue(node, native.seed_after_run, policy);
        setWidgetValue(
            node,
            native.control_after_generate,
            externalSeedActive ? "fixed" : (policy === "Randomize Seed" ? "randomize" : "fixed"),
        );
        if (announce) {
            setStatus(policy === "Randomize Seed"
                ? "Current run uses the current seed. After completion, the displayed seed is ready for the very next run; all 19 controls stay unchanged."
                : "Current and next run use this fixed seed.");
        }
    }

    function linkedSeedSource() {
        const input = (node.inputs || []).find((item) => item?.name === "seed");
        const linkId = input?.link;
        if (linkId === undefined || linkId === null) return null;
        const link = node.graph?.links?.[linkId] || node.graph?._links?.[linkId];
        const originId = link?.origin_id ?? link?.originId;
        const origin = node.graph?._nodes_by_id?.[originId]
            || (node.graph?._nodes || []).find((item) => item?.id === originId);
        return {
            linkId,
            seedLab: origin?.type === "NovaSeedLab",
            title: String(origin?.title || origin?.type || "linked INT source"),
        };
    }

    let externalSeedActive = false;
    function syncExternalSeedState(announce = false) {
        const source = linkedSeedSource();
        externalSeedActive = Boolean(source);
        seedInput.disabled = externalSeedActive;
        afterRun.disabled = externalSeedActive;
        afterRunLabel.style.opacity = externalSeedActive ? ".55" : "1";
        seedLabel.title = externalSeedActive
            ? "The upstream seed source owns this value. Disconnect it to edit the internal seed again."
            : "Internal deterministic seed.";
        if (externalSeedActive) {
            seedCaption.textContent = source.seedLab
                ? "External seed — NovoLoko Seed Lab"
                : `External seed — ${source.title}`;
            setWidgetValue(node, native.control_after_generate, "fixed");
            if (announce) setStatus("External seed is linked. Internal seed editing and after-run randomization are suppressed.");
        } else {
            seedCaption.textContent = "Seed";
            setWidgetValue(
                node,
                native.control_after_generate,
                comboValue(native.seed_after_run, "Fixed") === "Randomize Seed" ? "randomize" : "fixed",
            );
            if (announce) setStatus("Internal Music Controls seed is active again.");
        }
    }

    const previousConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (...args) {
        const result = previousConnectionsChange?.apply(this, args);
        requestAnimationFrame(() => syncExternalSeedState(true));
        return result;
    };
    node.__novaMusic3SyncExternalSeed = syncExternalSeedState;
    requestAnimationFrame(() => syncExternalSeedState(false));

    node.__novaMusic3RunFinished = () => {
        syncExternalSeedState(false);
        if (externalSeedActive) {
            setStatus("External seed source completed this run and already owns the next seed; no dummy run is needed.");
            return;
        }
        const nextSeed = Number(native.seed?.value || 0);
        seedInput.value = String(nextSeed);
        if (comboValue(native.seed_after_run, "Fixed") === "Randomize Seed") {
            setStatus(`Next run seed set to ${nextSeed}. No extra setup run is needed; all 19 controls are unchanged.`);
        }
    };

    function readOverrides() {
        try {
            const parsed = JSON.parse(String(native.control_overrides_json?.value || "[]"));
            state.overrides = new Set(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch (_error) {
            state.overrides = new Set();
        }
    }

    function writeOverrides() {
        const ordered = (state.config?.categories || [])
            .map((category) => category.key)
            .filter((key) => state.overrides.has(key));
        setWidgetValue(node, native.control_overrides_json, JSON.stringify(ordered));
    }

    function markOverride(key) {
        if (state.applyingPreset) return;
        const selectedPreset = state.config?.presets?.find((item) => item.name === String(native.preset?.value || ""));
        if (!selectedPreset || selectedPreset.hidden) return;
        state.overrides.add(key);
        writeOverrides();
        const row = state.rows.get(key);
        if (row?.help) row.help.dataset.override = "true";
        setStatus(`Manual override: ${row?.label || key}. Other preset DNA remains active.`);
    }

    function renderTimings(running = false) {
        const saved = node.properties?.novaMusicStageTimings;
        if (running) {
            timings.textContent = "Stage timing: measuring enhancer load → lyric → lyrics → caption → MiniMax → save → cleanup...";
            return;
        }
        if (!saved?.timings) {
            timings.textContent = "Stage timing: run once to identify the slowest music stage.";
            return;
        }
        const parts = MUSIC_TIMING_LABELS
            .filter((label) => Number.isFinite(Number(saved.timings[label])))
            .map((label) => `${label}: ${(Number(saved.timings[label]) / 1000).toFixed(2)}s`);
        timings.textContent = `Last ${saved.outcome || "run"} • total ${(Number(saved.totalMs || 0) / 1000).toFixed(2)}s • ${parts.join(" • ")}`;
    }
    node.__novaMusic3RenderTimings = renderTimings;
    renderTimings();

    function applyPreset(name) {
        if (!state.config) return;
        syncPresetBrowser(name);
        state.applyingPreset = true;
        state.overrides.clear();
        writeOverrides();
        const applyPolicy = (policy = {}) => {
            const scope = ["Off", "All Presets", "Preset Folder", "Genre"].includes(String(policy.random_preset_scope))
                ? String(policy.random_preset_scope) : "Off";
            setWidgetValue(node, native.randomize_all, booleanValue(policy.randomize_all, false));
            setWidgetValue(node, native.allow_random_none, booleanValue(policy.allow_random_none, false));
            setWidgetValue(node, native.seed, Number.isFinite(Number(policy.seed)) ? Number(policy.seed) : Number(native.seed?.value || 0));
            setAfterRunPolicy(policy.seed_after_run || comboValue(native.seed_after_run, "Fixed"));
            setWidgetValue(node, native.random_preset_scope, scope);
            setWidgetValue(node, native.random_preset_filter, String(policy.random_preset_filter || ""));
            randomAll.checked = booleanValue(policy.randomize_all, false);
            seedInput.value = String(Number.isFinite(Number(policy.seed)) ? Number(policy.seed) : Number(native.seed?.value || 0));
            randomNone.checked = booleanValue(policy.allow_random_none, false);
            randomPresetScope.value = scope;
            updateRandomPresetFilters();
        };
        if (name === NONE) {
            applyPolicy();
            for (const category of state.config.categories) {
                setWidgetValue(node, categoryWidgets.get(category.key), NONE);
                state.rows.get(category.key)?.sync();
            }
            state.applyingPreset = false;
            return;
        }
        if (name === state.config.special_presets?.[2]) {
            applyPolicy({ randomize_all: true });
            for (const category of state.config.categories) {
                setWidgetValue(node, categoryWidgets.get(category.key), RANDOM);
                state.rows.get(category.key)?.sync();
            }
            state.applyingPreset = false;
            return;
        }
        const preset = state.config.presets.find((item) => item.name === name);
        if (!preset) { state.applyingPreset = false; return; }
        applyPolicy(preset.policy || {});
        for (const category of state.config.categories) {
            setWidgetValue(node, categoryWidgets.get(category.key), preset.selections?.[category.key] || category.default);
            setWidgetValue(node, customWidgets.get(category.key), preset.custom_values?.[category.key] || "");
            state.rows.get(category.key)?.sync();
        }
        state.applyingPreset = false;
    }

    function presetEntrySearchText(entry) {
        return [entry.name, entry.display_name, entry.folder, entry.reference, entry.keywords, entry.description, entry.base_preset]
            .filter(Boolean).join(" ").toLocaleLowerCase();
    }

    function presetDisplayName(entry) {
        if (entry?.display_name) return String(entry.display_name);
        if (entry?.reference_mode === "Clone") return `${entry.reference || String(entry.name || "").replace(/\s+—\s+Clone$/, "")} — Strong reference`;
        if (entry?.reference_mode === "Like") return `${entry.reference || String(entry.name || "").replace(/\s+—\s+Like$/, "")} — Loose reference`;
        return String(entry?.name || "");
    }

    function syncPresetBrowser(name) {
        const entry = state.presetEntries.find((item) => item.name === name);
        if (!entry) return;
        if ([...presetSelect.options].some((option) => option.value === name)) presetSelect.value = name;
        const reference = entry.reference ? `Reference: ${entry.reference}. ` : "";
        const mode = entry.reference_mode ? `${entry.reference_mode_label || entry.reference_mode} — ${entry.reference_strength || "descriptive steering"}. ` : "";
        presetDescription.textContent = `${reference}${mode}${entry.description || "Choose this preset to load all resolved music controls."}`;
        presetDescription.title = entry.reference
            ? "The reference name is for finding the sound. NovoLoko sends descriptive musical traits to the generator, not an instruction to copy the artist."
            : presetDescription.textContent;
    }

    function renderPresetBrowser(preferredName = String(native.preset?.value || "")) {
        const folder = presetFolder.value || "All preset folders";
        const query = presetSearch.value.trim().toLocaleLowerCase();
        const filtered = state.presetEntries.filter((entry) =>
            (folder === "All preset folders" || entry.folder === folder)
            && (!query || presetEntrySearchText(entry).includes(query))
        );
        presetSelect.replaceChildren();
        for (const entry of filtered) {
            const option = document.createElement("option");
            option.value = entry.name;
            option.textContent = presetDisplayName(entry);
            presetSelect.append(option);
        }
        if (!filtered.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No presets match this folder/search";
            presetSelect.append(option);
            presetDescription.textContent = "Try All preset folders or a broader search.";
            return;
        }
        const selected = filtered.some((entry) => entry.name === preferredName) ? preferredName : filtered[0].name;
        presetSelect.value = selected;
        syncPresetBrowser(selected);
    }

    function updatePresetOptions() {
        if (!native.preset || !state.config) return;
        const restoredPreset = comboValue(native.preset, String(native.preset.value || ""));
        const builtins = state.config.presets.filter((item) => item.source === "built-in").map((item) => item.name);
        const users = state.config.presets.filter((item) => item.source === "user").map((item) => item.name);
        state.userPresets = new Set(users);
        const [customPreset, nonePreset, randomPreset] = state.config.special_presets;
        const values = [customPreset, nonePreset, ...builtins, ...users, randomPreset];
        native.preset.options ||= {};
        native.preset.options.values = values;
        const restoredEntry = state.config.presets.find((item) => item.name === restoredPreset);
        const migratedPreset = restoredEntry?.hidden && restoredEntry.migration_target
            ? restoredEntry.migration_target : restoredPreset;
        if (values.includes(migratedPreset)) native.preset.value = migratedPreset;
        else if (!values.includes(native.preset.value)) setWidgetValue(node, native.preset, customPreset);
        state.presetEntries = [
            { name: customPreset, folder: "Quick Start", description: "Use the 19 category controls below." },
            { name: nonePreset, folder: "Quick Start", description: "No preset preference; each category resolves to no contribution." },
            { name: randomPreset, folder: "Quick Start", description: "Seed-stable random choice across every category." },
            ...state.config.presets.filter((item) => !item.hidden).map((item) => ({ ...item, folder: item.folder || (item.source === "user" ? "My Presets" : "More Presets") })),
        ];
        const folders = ["All preset folders", ...new Set(state.presetEntries.map((item) => item.folder))];
        const oldFolder = presetFolder.value;
        presetFolder.replaceChildren();
        for (const value of folders) {
            const option = document.createElement("option"); option.value = value; option.textContent = value; presetFolder.append(option);
        }
        presetFolder.value = folders.includes(oldFolder) ? oldFolder : "All preset folders";
        updateRandomPresetFilters();
        renderPresetBrowser(String(native.preset.value || customPreset));
    }

    function updateRandomPresetFilters() {
        const scope = randomPresetScope.value;
        const previous = String(native.random_preset_filter?.value || randomPresetFilter.value || "");
        let values = [];
        if (scope === "Preset Folder") {
            values = [...new Set(state.config.presets.filter((item) => !item.hidden).map((item) => item.folder).filter(Boolean))].sort();
        } else if (scope === "Genre") {
            values = [...new Set(state.config.presets.filter((item) => !item.hidden).map((item) => item.selections?.genre).filter(Boolean))].sort();
        }
        randomPresetFilter.replaceChildren();
        if (!values.length) {
            const option = document.createElement("option"); option.value = ""; option.textContent = scope === "Off" ? "Random presets disabled" : "All matching presets"; randomPresetFilter.append(option);
        } else {
            for (const value of values) {
                const option = document.createElement("option"); option.value = value; option.textContent = value; randomPresetFilter.append(option);
            }
        }
        randomPresetFilter.disabled = scope === "Off" || scope === "All Presets";
        randomPresetFilter.value = values.includes(previous) ? previous : (values[0] || "");
        setWidgetValue(node, native.random_preset_scope, scope);
        setWidgetValue(node, native.random_preset_filter, randomPresetFilter.value);
    }

    function buildRows() {
        list.replaceChildren();
        state.rows.clear();
        for (const category of state.config.categories) {
            const choiceWidget = nodeWidget(node, category.key);
            const customWidget = nodeWidget(node, `custom_${category.key}`);
            categoryWidgets.set(category.key, choiceWidget);
            customWidgets.set(category.key, customWidget);
            hideNativeWidget(choiceWidget);
            hideNativeWidget(customWidget);

            const row = document.createElement("div");
            row.className = "nova-music3-category-row";
            row.style.cssText = "min-width:0;max-width:100%;display:grid;grid-template-columns:minmax(96px,128px) minmax(0,1fr);gap:5px 8px;align-items:center;padding:5px 2px;box-sizing:border-box;overflow:hidden;border-bottom:1px solid rgba(70,111,139,.25)";
            const label = document.createElement("label");
            label.textContent = category.label;
            label.title = category.description || category.label;
            label.style.cssText = "font-weight:700;color:#bed4e5";
            const select = makeSelect();
            const specialOptions = state.config.special_choices.map((value) => ({
                value,
                label: value === NONE ? "None — no preference" : value === CUSTOM ? "Custom — type your own" : "Random — seed-stable",
                description: value === NONE
                    ? "Adds no prompt contribution for this control."
                    : value === CUSTOM
                    ? "Uses the custom text field below."
                    : "Selects one built-in value deterministically from the seed.",
            }));
            for (const entry of [...specialOptions, ...category.options]) {
                const option = document.createElement("option");
                const value = typeof entry === "string" ? entry : entry.value;
                option.value = value;
                option.textContent = typeof entry === "string" ? entry : (entry.label || value);
                option.dataset.description = typeof entry === "string" ? "" : (entry.description || "");
                select.append(option);
            }
            const custom = makeTextInput(`Type your own ${category.label.toLowerCase()}...`);
            custom.style.gridColumn = "2";
            const help = document.createElement("div");
            help.style.cssText = "grid-column:2;min-width:0;color:#86a9bf;font:10px/1.25 system-ui;white-space:normal;padding:0 2px 2px";
            const sync = () => {
                const selected = comboValue(choiceWidget, category.default) || category.default;
                select.value = [...select.options].some((option) => option.value === selected) ? selected : category.default;
                custom.value = String(customWidget?.value || "");
                custom.style.display = select.value === CUSTOM ? "block" : "none";
                const selectedOption = select.selectedOptions?.[0];
                const overridePrefix = state.overrides.has(category.key) ? "Manual override — " : "";
                help.textContent = `${overridePrefix}${selectedOption?.dataset?.description || category.description || ""}`;
                help.title = help.textContent;
            };
            select.onchange = () => {
                setWidgetValue(node, choiceWidget, select.value);
                custom.style.display = select.value === CUSTOM ? "block" : "none";
                markOverride(category.key);
                sync();
                if (select.value === CUSTOM) setTimeout(() => custom.focus(), 0);
            };
            custom.oninput = () => { setWidgetValue(node, customWidget, custom.value); markOverride(category.key); sync(); };
            row.append(label, select, custom, help);
            list.append(row);
            state.rows.set(category.key, { row, select, custom, help, label: category.label, sync });
            sync();
        }
        randomNone.checked = Boolean(native.allow_random_none?.value);
        randomAll.checked = Boolean(native.randomize_all?.value);
        seedInput.value = String(Number(native.seed?.value || 0));
        setAfterRunPolicy(comboValue(native.seed_after_run, "Fixed"));
        adaptiveBody.schedule();
    }

    async function refresh(message = "Music controls refreshed.") {
        try {
            state.config = await fetchControls();
            readOverrides();
            updatePresetOptions();
            buildRows();
            setStatus(`${message} ${state.config.categories.reduce((total, item) => total + item.options.length, 0)} built-in choices; ${state.config.presets.length} presets.`);
        } catch (error) {
            setStatus(error.message, true);
        }
    }

    async function presetAction(body) {
        const response = await api.fetchApi("/nova_music3/presets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (response.status === 409) {
            const payload = await response.json();
            if (confirm(`${payload.error}\n\nReplace it with the current resolved settings?`)) {
                return presetAction({ ...body, overwrite: true });
            }
            return null;
        }
        return responseJson(response);
    }

    randomNone.onchange = () => setWidgetValue(node, native.allow_random_none, randomNone.checked);
    randomAll.onchange = () => setWidgetValue(node, native.randomize_all, randomAll.checked);
    afterRun.onchange = () => setAfterRunPolicy(afterRun.value, true);
    seedInput.onchange = () => {
        const numeric = Number(seedInput.value);
        const value = Number.isFinite(numeric) ? Math.max(0, Math.min(9007199254740991, Math.trunc(numeric))) : 0;
        seedInput.value = String(value);
        setWidgetValue(node, native.seed, value);
    };
    randomPresetScope.onchange = () => updateRandomPresetFilters();
    randomPresetFilter.onchange = () => setWidgetValue(node, native.random_preset_filter, randomPresetFilter.value);
    presetFolder.onchange = () => renderPresetBrowser();
    presetSearch.oninput = () => renderPresetBrowser();
    presetSelect.onchange = () => {
        if (!presetSelect.value) return;
        setWidgetValue(node, native.preset, presetSelect.value);
        syncPresetBrowser(presetSelect.value);
    };
    save.onclick = async () => {
        try {
            const name = presetName.value.trim();
            const selections = {};
            const customValues = {};
            for (const category of state.config.categories) {
                selections[category.key] = categoryWidgets.get(category.key)?.value;
                customValues[category.key] = customWidgets.get(category.key)?.value || "";
            }
            const result = await presetAction({
                action: "save", name, preset: native.preset?.value,
                randomize_all: native.randomize_all?.value, seed: native.seed?.value,
                seed_after_run: comboValue(native.seed_after_run, "Fixed"),
                allow_random_none: native.allow_random_none?.value,
                random_preset_scope: native.random_preset_scope?.value,
                random_preset_filter: native.random_preset_filter?.value,
                selections, custom_values: customValues,
            });
            if (!result) return;
            state.config = result.controls;
            updatePresetOptions();
            setWidgetValue(node, native.preset, result.result.name);
            presetName.value = "";
            applyPreset(result.result.name);
            setStatus(`Saved user preset: ${result.result.name}`);
        } catch (error) {
            setStatus(error.message, true);
        }
    };
    rename.onclick = async () => {
        const current = String(native.preset?.value || "");
        if (!state.userPresets.has(current)) return setStatus("Select a saved user preset to rename.", true);
        const value = prompt("Rename user preset:", current);
        if (!value?.trim() || value.trim() === current) return;
        try {
            const result = await presetAction({ action: "rename", name: current, new_name: value.trim() });
            state.config = result.controls;
            updatePresetOptions();
            setWidgetValue(node, native.preset, result.result.name);
            setStatus(`Renamed preset to: ${result.result.name}`);
        } catch (error) {
            setStatus(error.message, true);
        }
    };
    remove.onclick = async () => {
        const current = String(native.preset?.value || "");
        if (!state.userPresets.has(current)) return setStatus("Select a saved user preset to delete.", true);
        if (!confirm(`Delete the saved preset "${current}"? Built-in presets and songs are untouched.`)) return;
        try {
            const result = await presetAction({ action: "delete", name: current });
            state.config = result.controls;
            updatePresetOptions();
            setWidgetValue(node, native.preset, state.config.special_presets[0]);
            setStatus(`Deleted user preset: ${current}`);
        } catch (error) {
            setStatus(error.message, true);
        }
    };

    if (native.preset && !native.preset.__novaMusic3PresetCallback) {
        native.preset.__novaMusic3PresetCallback = true;
        const previous = native.preset.callback;
        native.preset.callback = function (value) {
            const result = previous?.apply(this, arguments);
            // Workflow configure restores every serialized category separately.
            // Re-applying the preset callback during that restore overwrites the
            // user's last per-control state (often with the saved artist preset).
            if (!node.__novaMusic3Configuring) applyPreset(value);
            return result;
        };
    }

    node.__novaMusic3ApplyRecipe = async function (recipe, trackName = "selected track") {
        if (!state.config) await refresh("Music controls ready.");
        if (!state.config || !recipe) throw new Error("Music Controls are not ready yet.");
        const customPreset = state.config.special_presets?.[0] || "Custom / CSV selections";
        setWidgetValue(node, native.preset, customPreset);
        state.overrides.clear();
        writeOverrides();
        setWidgetValue(node, native.randomize_all, booleanValue(recipe.randomize_all, false));
        setWidgetValue(node, native.seed, Number.isFinite(Number(recipe.seed)) ? Number(recipe.seed) : 0);
        setAfterRunPolicy(recipe.seed_after_run || "Fixed");
        setWidgetValue(node, native.allow_random_none, booleanValue(recipe.allow_random_none, false));
        const scope = ["Off", "All Presets", "Preset Folder", "Genre"].includes(String(recipe.random_preset_scope))
            ? String(recipe.random_preset_scope) : "Off";
        setWidgetValue(node, native.random_preset_scope, scope);
        setWidgetValue(node, native.random_preset_filter, String(recipe.random_preset_filter || ""));
        randomAll.checked = booleanValue(recipe.randomize_all, false);
        seedInput.value = String(Number.isFinite(Number(recipe.seed)) ? Number(recipe.seed) : 0);
        randomPresetScope.value = scope;
        updateRandomPresetFilters();
        for (const category of state.config.categories) {
            const requested = recipe.selections?.[category.key]
                || recipe.decisions?.[category.key]
                || recipe.resolved_selections?.[category.key]
                || NONE;
            setWidgetValue(node, categoryWidgets.get(category.key), requested);
            setWidgetValue(node, customWidgets.get(category.key), recipe.custom_values?.[category.key] || "");
            state.rows.get(category.key)?.sync();
        }
        const restoredIdea = String(recipe.original_idea || "");
        setWidgetValue(node, native.idea, restoredIdea);
        ideaInput.value = restoredIdea;
        randomNone.checked = booleanValue(recipe.allow_random_none, false);
        syncPresetBrowser(customPreset);
        const source = recipe.source_preset ? ` (original preset: ${recipe.source_preset})` : "";
        setStatus(`Loaded idea + exact 19-choice track recipe from ${trackName}${source}; Run when ready.`);
        dirty(node);
        return true;
    };

    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        musicControlsNodes.delete(this);
        delete this.__novaMusic3RenderTimings;
        delete this.__novaMusic3RunFinished;
        this.__novaMusic3ControlsResizeObserver?.disconnect?.();
        delete this.__novaMusic3ControlsResizeObserver;
        adaptiveBody.disconnect();
        delete this.__novaMusic3AllocateControlsBody;
        previousRemoved?.apply(this, arguments);
    };
    const dom = node.addDOMWidget("nova_music3_controls_v461", "NOVA_MUSIC3_CONTROLS", root, {
        serialize: false, hideOnZoom: false, getMinHeight: () => 260,
    });
    dom.serialize = false;
    dom.options.serialize = false;
    installFlexibleControlsPanel(node, dom, root, adaptiveBody.schedule);
    refreshNodes2Widgets(node);
    setTimeout(() => refreshNodes2Widgets(node), 0);
    refresh();
}


function formatTime(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return "--:--";
    const whole = Math.floor(value);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const rest = whole % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`;
}


function formatSize(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
    if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(0, Math.round(value / 1024))} KB`;
}


function installWriterModelPicker(node) {
    if (node.__novaMusicWriterPickerInstalled || typeof node.addDOMWidget !== "function") return;
    node.__novaMusicWriterPickerInstalled = true;
    const modelWidget = nodeWidget(node, "model");
    if (!modelWidget) return;
    hideNativeWidget(modelWidget);

    const root = document.createElement("section");
    root.style.cssText = "display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:6px;box-sizing:border-box;padding:8px;border:1px solid #315b7b;border-radius:8px;background:#071722;color:#dcecf7;font:11px/1.35 system-ui";
    const select = makeSelect();
    select.title = "Local Ollama writer models. FAST, BALANCED and GEMMA are friendly aliases when installed.";
    const refresh = makeButton("Refresh Models");
    const custom = makeTextInput("Advanced: exact Ollama model or alias...");
    custom.style.gridColumn = "1 / -1";
    custom.style.display = "none";
    const status = document.createElement("div");
    status.style.cssText = "grid-column:1 / -1;min-height:16px;color:#8ebbd4;white-space:normal";
    root.append(select, refresh, custom, status);
    let loading = false;

    const setStatus = (text, error = false) => {
        status.textContent = text;
        status.style.color = error ? "#ff9d9d" : "#8bcfb0";
    };
    const selectCurrent = (models) => {
        const current = String(modelWidget.value || "").trim();
        const installed = models.some((item) => item.name === current);
        if (installed) {
            select.value = current;
            custom.style.display = "none";
        } else {
            select.value = "__custom__";
            custom.style.display = "block";
            custom.value = current;
        }
    };
    const loadModels = async (quiet = false) => {
        if (loading) return;
        loading = true;
        try {
            const payload = await responseJson(await api.fetchApi("/nova_music3/ollama/models"));
            const models = Array.isArray(payload.models) ? payload.models : [];
            select.replaceChildren();
            for (const item of models) {
                const option = document.createElement("option");
                option.value = item.name; option.textContent = item.label || item.name; select.append(option);
            }
            const advanced = document.createElement("option");
            advanced.value = "__custom__"; advanced.textContent = "Advanced / custom model..."; select.append(advanced);
            selectCurrent(models);
            const missing = Array.isArray(payload.missing_recommended) && payload.missing_recommended.length
                ? ` Missing recommended aliases: ${payload.missing_recommended.join(", ")}. Any compatible local model can still be selected.`
                : " FAST / BALANCED / GEMMA are installed.";
            setStatus(`${payload.runtime || `${models.length} local model(s) found.`}${missing}`);
        } catch (error) {
            if (!select.options.length) {
                const advanced = document.createElement("option"); advanced.value = "__custom__"; advanced.textContent = "Advanced / custom model..."; select.append(advanced);
                select.value = "__custom__"; custom.style.display = "block"; custom.value = String(modelWidget.value || "");
            }
            if (!quiet) setStatus(`${error.message} Start Ollama or use Advanced after it is available.`, true);
        } finally {
            loading = false;
        }
    };
    select.onchange = () => {
        const advanced = select.value === "__custom__";
        custom.style.display = advanced ? "block" : "none";
        if (!advanced) setWidgetValue(node, modelWidget, select.value);
        else setTimeout(() => custom.focus(), 0);
    };
    custom.oninput = () => setWidgetValue(node, modelWidget, custom.value.trim());
    refresh.onclick = () => loadModels(false);
    const interval = setInterval(() => loadModels(true), 30000);
    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        clearInterval(interval);
        previousRemoved?.apply(this, arguments);
    };
    const dom = node.addDOMWidget("nova_music3_ollama_picker_v462", "NOVA_MUSIC3_OLLAMA_PICKER", root, {
        serialize: false, hideOnZoom: false, getMinHeight: () => 96, getHeight: () => 112,
    });
    dom.serialize = false;
    dom.options.serialize = false;
    loadModels(false);
}


function installSaverLifecycle(node) {
    if (node.__novaMusicLifecycleInstalled) return;
    node.__novaMusicLifecycleInstalled = true;
    const legacy = nodeWidget(node, "cleanup_after_generation");
    const lifecycle = nodeWidget(node, "model_lifecycle");
    if (legacy) {
        legacy.label = "Legacy cleanup switch";
        legacy.options ||= {};
        legacy.options.label = "Legacy cleanup switch";
        legacy.options.tooltip = "Used only when lifecycle is Follow legacy cleanup switch.";
    }
    if (lifecycle) {
        lifecycle.label = "Writer/model lifecycle";
        lifecycle.options ||= {};
        lifecycle.options.label = "Writer/model lifecycle";
        const previous = lifecycle.callback;
        lifecycle.callback = function (value) {
            const result = previous?.apply(this, arguments);
            if (value === "One-off: clean after run" && legacy) legacy.value = true;
            if (value === "Batch: keep loaded" && legacy) legacy.value = false;
            dirty(node);
            return result;
        };
    }
}


function installAudioLibrary(node) {
    if (node.__novaMusic3LibraryInstalled || typeof node.addDOMWidget !== "function") return;
    node.__novaMusic3LibraryInstalled = true;
    playerNodes.add(node);
    node.properties ||= {};
    const folderWidget = nodeWidget(node, "folder");
    const autoplayWidget = nodeWidget(node, "auto_play_new");
    hideNativeWidget(folderWidget);
    hideNativeWidget(autoplayWidget);

    const root = document.createElement("section");
    root.className = "nova-music3-player-v440";
    root.style.cssText = "width:100%;min-width:0;max-width:100%;height:600px;min-height:300px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box;border:1px solid #315b7b;border-radius:10px;background:#06111a;color:#eaf6ff;font:11px/1.35 system-ui";
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const state = {
        tracks: [], index: -1, shuffle: Boolean(node.properties.novaMusicShuffle),
        repeat: String(node.properties.novaMusicRepeat || "off"),
        autoNext: Boolean(node.properties.novaMusicAutoNext),
        search: String(node.properties.novaMusicSearch || ""),
        sort: String(node.properties.novaMusicSort || "newest"), loading: false,
        favoritesOnly: Boolean(node.properties.novaMusicFavoritesOnly),
        visualizerEnabled: node.properties.novaMusicVisualizerEnabled !== false,
        visualizerStyle: VISUALIZER_STYLES.includes(node.properties.novaMusicVisualizerStyle)
            ? node.properties.novaMusicVisualizerStyle : VISUALIZER_STYLES[0],
        visualizerHeight: Math.max(60, Math.min(240, Number(node.properties.novaMusicVisualizerHeight || 110))),
        audioContext: null, analyser: null, mediaSource: null, animationFrame: 0,
        bassAverage: 0, beatTimes: [], bpmEstimate: 0,
        showLyrics: Boolean(node.properties.novaMusicShowLyrics),
        karaoke: Boolean(node.properties.novaMusicKaraoke),
        karaokeFollow: Boolean(node.properties.novaMusicKaraokeFollow),
        karaokeOffset: Math.max(-30, Math.min(30, Number(node.properties.novaMusicKaraokeOffset || 0))),
        lyricsHeight: Math.max(120, Math.min(520, Number(node.properties.novaMusicLyricsHeight || 220))),
        sidecar: null, lyricLines: [], activeLyricIndex: -1,
    };

    const folderLine = document.createElement("div");
    folderLine.style.cssText = "display:grid;grid-template-columns:minmax(150px,1fr) auto auto auto;gap:5px;padding:7px;border-bottom:1px solid #28495f;background:#0d1c29";
    const folderInput = makeTextInput("audio/NovoLoko");
    folderInput.value = String(node.properties.novaMusicFolder || folderWidget?.value || DEFAULT_FOLDER);
    const browse = makeButton("Browse...");
    const open = makeButton("Open Folder");
    const refreshButton = makeButton("Refresh");
    folderLine.append(folderInput, browse, open, refreshButton);

    const filterLine = document.createElement("div");
    filterLine.style.cssText = "display:grid;grid-template-columns:minmax(120px,1fr) 135px auto auto auto;gap:6px;padding:6px 7px;border-bottom:1px solid #203b4e";
    const search = makeTextInput("Search tracks...");
    search.type = "search";
    search.value = state.search;
    const sort = makeSelect();
    for (const [value, label] of [["newest", "Newest"], ["oldest", "Oldest"], ["name", "Name"], ["duration", "Duration"], ["favorites", "Favorites First"]]) {
        const option = document.createElement("option"); option.value = value; option.textContent = label; sort.append(option);
    }
    sort.value = state.sort;
    const autoLabel = document.createElement("label");
    autoLabel.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap;color:#c5d9e7";
    const autoplay = document.createElement("input"); autoplay.type = "checkbox"; autoplay.checked = Boolean(autoplayWidget?.value ?? true);
    autoLabel.append(autoplay, document.createTextNode("Auto-play new"));
    autoLabel.title = "Play a newly generated track when the Audio Library refreshes. This does not control what happens when the current track ends.";
    const autoNextLabel = document.createElement("label");
    autoNextLabel.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap;color:#c5d9e7";
    autoNextLabel.title = "When Repeat is Off, start the next track after the current track finishes. Default: Off.";
    const autoNext = document.createElement("input"); autoNext.type = "checkbox"; autoNext.checked = state.autoNext;
    autoNextLabel.append(autoNext, document.createTextNode("Play next automatically"));
    const favoritesOnlyLabel = document.createElement("label");
    favoritesOnlyLabel.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap;color:#ffd67a";
    const favoritesOnly = document.createElement("input"); favoritesOnly.type = "checkbox"; favoritesOnly.checked = state.favoritesOnly;
    favoritesOnlyLabel.append(favoritesOnly, document.createTextNode("Favorites only"));
    filterLine.append(search, sort, favoritesOnlyLabel, autoLabel, autoNextLabel);

    const now = document.createElement("div");
    now.style.cssText = "padding:8px 9px 5px;background:#081722;border-bottom:1px solid #203b4e";
    const title = document.createElement("div");
    title.textContent = "No track selected";
    title.style.cssText = "font:700 13px/1.3 system-ui;color:#f2f8ff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    const meta = document.createElement("div");
    meta.style.cssText = "margin-top:3px;color:#86aec7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    now.append(title, meta);

    const visualizerTools = document.createElement("div");
    visualizerTools.style.cssText = "display:grid;grid-template-columns:auto minmax(130px,180px) auto minmax(90px,1fr) auto;gap:7px;align-items:center;padding:5px 8px;background:#071520;border-bottom:1px solid #203b4e;color:#a9c4d6";
    const visualizerToggleLabel = document.createElement("label");
    visualizerToggleLabel.style.cssText = "display:flex;align-items:center;gap:5px;white-space:nowrap";
    const visualizerToggle = document.createElement("input"); visualizerToggle.type = "checkbox"; visualizerToggle.checked = state.visualizerEnabled;
    visualizerToggleLabel.append(visualizerToggle, document.createTextNode("Live visualizer"));
    const visualizerStyle = makeSelect();
    for (const value of VISUALIZER_STYLES) {
        const option = document.createElement("option"); option.value = value; option.textContent = value; visualizerStyle.append(option);
    }
    visualizerStyle.value = state.visualizerStyle;
    const heightText = document.createElement("span"); heightText.textContent = "Height";
    const visualizerHeight = document.createElement("input"); visualizerHeight.type = "range"; visualizerHeight.min = "60"; visualizerHeight.max = "240"; visualizerHeight.step = "5"; visualizerHeight.value = String(state.visualizerHeight);
    const visualizerReadout = document.createElement("span");
    visualizerReadout.style.cssText = "min-width:78px;text-align:right;color:#72d9ff;white-space:nowrap";
    visualizerTools.append(visualizerToggleLabel, visualizerStyle, heightText, visualizerHeight, visualizerReadout);

    const visualizer = document.createElement("canvas");
    visualizer.style.cssText = `display:block;width:100%;height:${state.visualizerHeight}px;flex:0 0 auto;background:#030a10;border-bottom:1px solid #203b4e;pointer-events:none`;
    visualizer.setAttribute("aria-label", "Live audio visualizer");
    const visualizerContext = visualizer.getContext("2d");

    const progressLine = document.createElement("div");
    progressLine.style.cssText = "display:grid;grid-template-columns:44px minmax(80px,1fr) 44px;gap:7px;align-items:center;padding:5px 8px;background:#081722";
    const currentTime = document.createElement("span"); currentTime.textContent = "0:00";
    const progress = document.createElement("input"); progress.type = "range"; progress.min = "0"; progress.max = "1000"; progress.value = "0";
    const totalTime = document.createElement("span"); totalTime.textContent = "--:--"; totalTime.style.textAlign = "right";
    progressLine.append(currentTime, progress, totalTime);

    const controls = document.createElement("div");
    controls.style.cssText = "display:grid;grid-template-columns:repeat(7,auto) minmax(80px,1fr) 44px auto;gap:5px;align-items:center;padding:6px 8px;border-bottom:1px solid #244257;background:#0b1a27";
    const previous = makeButton("⏮", "Previous");
    const back = makeButton("−10s", "Skip back 10 seconds");
    const play = makeButton("▶ Play", "Play or pause");
    const forward = makeButton("+10s", "Skip forward 10 seconds");
    const next = makeButton("⏭", "Next");
    const shuffle = makeButton(state.shuffle ? "Shuffle On" : "Shuffle Off");
    const repeat = makeButton(`Repeat ${state.repeat}`);
    const volume = document.createElement("input"); volume.type = "range"; volume.min = "0"; volume.max = "100"; volume.value = String(node.properties.novaMusicVolume ?? 85);
    const volumeReadout = document.createElement("span"); volumeReadout.textContent = `${volume.value}%`; volumeReadout.style.cssText = "text-align:right;color:#9fd5f2;white-space:nowrap";
    const mute = makeButton("Mute");
    controls.append(previous, back, play, forward, next, shuffle, repeat, volume, volumeReadout, mute);

    const actionLine = document.createElement("div");
    actionLine.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;padding:5px 8px;border-bottom:1px solid #203b4e;background:#081722";
    const rename = makeButton("Rename Selected");
    const reveal = makeButton("Show Selected in Folder");
    const favorite = makeButton("☆ Favorite", "Favorite the selected track without modifying its audio or metadata");
    const loadRecipe = makeButton("Load Track Recipe", "Restore this track's exact saved Music Controls selections and seed");
    const showLyrics = makeButton(state.showLyrics ? "Hide Lyrics" : "Show Lyrics");
    const karaoke = makeButton(state.karaoke ? "Estimated Karaoke On" : "Estimated Karaoke Off", "Highlights lyric lines using estimated progress; the audio has no lyric timestamps");
    const karaokeFollow = makeButton(state.karaokeFollow ? "Follow Lyrics On" : "Follow Lyrics Off", "Off keeps the player and canvas still. On scrolls only inside the lyrics box.");
    const remove = makeButton("Move Selected to Trash");
    const status = document.createElement("span");
    status.style.cssText = "min-width:0;flex:1;align-self:center;color:#8bbbd5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    actionLine.append(favorite, rename, reveal, loadRecipe, showLyrics, karaoke, karaokeFollow, remove, status);

    const lyricsPanel = document.createElement("section");
    lyricsPanel.style.cssText = `display:none;min-width:0;max-width:100%;flex:0 0 ${state.lyricsHeight + 35}px;min-height:120px;overflow:hidden;border-bottom:1px solid #29495f;background:#050d14`;
    const lyricsHeader = document.createElement("div");
    lyricsHeader.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:5px 8px;border-bottom:1px solid #1c3547;background:#0a1824;color:#b9d7e9";
    const lyricsTitle = document.createElement("strong"); lyricsTitle.textContent = "Matched lyrics";
    const lyricsNote = document.createElement("span"); lyricsNote.textContent = "Karaoke timing is estimated from track progress."; lyricsNote.style.cssText = "min-width:0;flex:1;color:#789eb6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    const copyLyrics = makeButton("Copy Lyrics");
    const syncLabel = document.createElement("span"); syncLabel.textContent = "Sync";
    const karaokeOffset = document.createElement("input"); karaokeOffset.type = "range"; karaokeOffset.min = "-30"; karaokeOffset.max = "30"; karaokeOffset.step = "0.5"; karaokeOffset.value = String(state.karaokeOffset); karaokeOffset.style.width = "120px";
    const karaokeOffsetReadout = document.createElement("span"); karaokeOffsetReadout.textContent = `${state.karaokeOffset >= 0 ? "+" : ""}${state.karaokeOffset.toFixed(1)}s`; karaokeOffsetReadout.style.cssText = "min-width:42px;color:#73d7ff";
    const lyricsHeightLabel = document.createElement("span"); lyricsHeightLabel.textContent = "Lyrics height";
    const lyricsHeight = document.createElement("input"); lyricsHeight.type = "range"; lyricsHeight.min = "120"; lyricsHeight.max = "520"; lyricsHeight.step = "10"; lyricsHeight.value = String(state.lyricsHeight); lyricsHeight.style.width = "110px";
    const lyricsHeightReadout = document.createElement("span"); lyricsHeightReadout.textContent = `${state.lyricsHeight}px`; lyricsHeightReadout.style.cssText = "min-width:42px;color:#73d7ff";
    lyricsHeader.append(lyricsTitle, lyricsNote, syncLabel, karaokeOffset, karaokeOffsetReadout, lyricsHeightLabel, lyricsHeight, lyricsHeightReadout, copyLyrics);
    const lyricsBody = document.createElement("div");
    lyricsBody.style.cssText = `height:${state.lyricsHeight}px;overflow:auto;overflow-anchor:none;overscroll-behavior:contain;contain:layout paint;scrollbar-gutter:stable;padding:8px 10px;box-sizing:border-box;white-space:pre-wrap;user-select:text;color:#cbdce8;font:11px/1.5 ui-monospace,Consolas,monospace`;
    lyricsPanel.append(lyricsHeader, lyricsBody);

    const library = document.createElement("div");
    library.style.cssText = "min-height:0;flex:1 1 auto;overflow-y:auto;scrollbar-gutter:stable;padding:5px";
    root.append(folderLine, filterLine, now, visualizerTools, visualizer, progressLine, controls, actionLine, lyricsPanel, library, audio);

    function setStatus(message, error = false) {
        status.textContent = message;
        status.style.color = error ? "#ff9d9d" : "#8bcfb0";
    }

    function currentTrack() {
        return state.index >= 0 ? state.tracks[state.index] : null;
    }

    function fileUrl(track) {
        const params = new URLSearchParams({ folder: folderInput.value, name: track.name });
        return api.apiURL(`/nova_music3/library/file?${params}`);
    }

    function controlsNodeForPlayer() {
        const nodes = app.graph?._nodes || app.canvas?.graph?._nodes || [];
        const candidates = nodes.filter((candidate) => (candidate.comfyClass || candidate.type) === CONTROLS_NODE);
        if (!candidates.length) return null;
        const playerX = Number(node.pos?.[0] || 0);
        const playerY = Number(node.pos?.[1] || 0);
        candidates.sort((left, right) => {
            const leftDistance = Math.hypot(Number(left.pos?.[0] || 0) - playerX, Number(left.pos?.[1] || 0) - playerY);
            const rightDistance = Math.hypot(Number(right.pos?.[0] || 0) - playerX, Number(right.pos?.[1] || 0) - playerY);
            return leftDistance - rightDistance;
        });
        return candidates[0];
    }

    async function loadSelectedSidecar(quiet = false) {
        const track = currentTrack();
        if (!track) {
            state.sidecar = null;
            state.lyricLines = [];
            if (!quiet) setStatus("Select a track first.", true);
            return null;
        }
        try {
            const params = new URLSearchParams({ folder: folderInput.value, name: track.name });
            state.sidecar = await responseJson(await api.fetchApi(`/nova_music3/library/sidecar?${params}`));
            return state.sidecar;
        } catch (error) {
            state.sidecar = null;
            state.lyricLines = [];
            if (!quiet) setStatus(error.message, true);
            return null;
        }
    }

    function renderLyrics() {
        lyricsPanel.style.display = state.showLyrics ? "block" : "none";
        showLyrics.textContent = state.showLyrics ? "Hide Lyrics" : "Show Lyrics";
        karaoke.textContent = state.karaoke ? "Estimated Karaoke On" : "Estimated Karaoke Off";
        karaokeFollow.textContent = state.karaokeFollow ? "Follow Lyrics On" : "Follow Lyrics Off";
        if (!state.showLyrics) return;
        const text = String(state.sidecar?.lyrics || "").trim();
        lyricsBody.replaceChildren();
        state.lyricLines = [];
        state.activeLyricIndex = -1;
        if (!text) {
            const empty = document.createElement("div");
            empty.textContent = state.sidecar ? "No final lyrics were saved for this track." : "Loading matched lyrics...";
            empty.style.color = "#789eb6";
            lyricsBody.append(empty);
            return;
        }
        for (const lineText of text.split(/\r?\n/).filter((line) => line.trim())) {
            const element = document.createElement("div");
            const section = /^\s*\[[^\]]+\]\s*$/.test(lineText);
            element.textContent = lineText;
            element.style.cssText = section
                ? "margin:7px 0 3px;color:#73d7ff;font-weight:700"
                : "margin:1px 0;padding:1px 4px;border-radius:4px;transition:background .12s,color .12s";
            lyricsBody.append(element);
            state.lyricLines.push({
                element,
                section,
                weight: section ? 0 : Math.max(1, lineText.replace(/[^\p{L}\p{N}'-]+/gu, " ").trim().split(/\s+/).length),
            });
        }
        updateKaraoke();
    }

    function setLyricsHeight(value) {
        state.lyricsHeight = Math.max(120, Math.min(520, Number(value || 220)));
        lyricsHeight.value = String(state.lyricsHeight);
        lyricsHeightReadout.textContent = `${state.lyricsHeight}px`;
        lyricsBody.style.height = `${state.lyricsHeight}px`;
        lyricsPanel.style.flexBasis = `${state.lyricsHeight + 35}px`;
        dirty(node);
    }

    function updateKaraoke() {
        if (!state.showLyrics || !state.lyricLines.length) return;
        if (!state.karaoke || !Number.isFinite(audio.duration) || audio.duration <= 0) {
            for (const line of state.lyricLines) {
                if (!line.section) line.element.style.cssText = "margin:1px 0;padding:1px 4px;border-radius:4px;transition:background .12s,color .12s";
            }
            state.activeLyricIndex = -1;
            return;
        }
        const timedLines = state.lyricLines.filter((line) => !line.section);
        if (!timedLines.length) return;
        const totalWeight = timedLines.reduce((total, line) => total + line.weight, 0);
        const vocalStart = Math.min(12, audio.duration * 0.06);
        const vocalEnd = Math.max(vocalStart + 1, audio.duration * 0.96);
        const adjustedTime = audio.currentTime + state.karaokeOffset;
        const target = Math.max(0, Math.min(1, (adjustedTime - vocalStart) / (vocalEnd - vocalStart))) * totalWeight;
        let running = 0;
        let activeIndex = timedLines.length - 1;
        for (let index = 0; index < timedLines.length; index += 1) {
            running += timedLines[index].weight;
            if (target <= running) { activeIndex = index; break; }
        }
        if (activeIndex === state.activeLyricIndex) return;
        timedLines.forEach((line, index) => {
            if (line.section) return;
            line.element.style.background = index === activeIndex ? "#164967" : "transparent";
            line.element.style.color = index === activeIndex ? "#ffffff" : "#cbdce8";
        });
        state.activeLyricIndex = activeIndex;
        const active = timedLines[activeIndex]?.element;
        if (active && state.karaokeFollow) {
            const bodyRect = lyricsBody.getBoundingClientRect();
            const activeRect = active.getBoundingClientRect();
            const margin = Math.min(42, bodyRect.height * 0.25);
            if (activeRect.top < bodyRect.top + margin) lyricsBody.scrollTop -= bodyRect.top + margin - activeRect.top;
            else if (activeRect.bottom > bodyRect.bottom - margin) lyricsBody.scrollTop += activeRect.bottom - (bodyRect.bottom - margin);
        }
    }

    function visualizerSize() {
        const ratio = Math.max(1, Math.min(2, Number(window.devicePixelRatio || 1)));
        const width = Math.max(320, Math.floor(visualizer.clientWidth || root.clientWidth || 600));
        const height = state.visualizerHeight;
        const targetWidth = Math.floor(width * ratio);
        const targetHeight = Math.floor(height * ratio);
        if (visualizer.width !== targetWidth || visualizer.height !== targetHeight) {
            visualizer.width = targetWidth;
            visualizer.height = targetHeight;
        }
        visualizerContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
        return { width, height };
    }

    function updateVisualizerReadout() {
        visualizerReadout.textContent = state.bpmEstimate
            ? `${state.visualizerHeight}px • ~${state.bpmEstimate} BPM`
            : `${state.visualizerHeight}px • live audio`;
    }

    function setVisualizerHeight(value) {
        state.visualizerHeight = Math.max(60, Math.min(240, Number(value || 110)));
        visualizer.style.height = `${state.visualizerHeight}px`;
        visualizerHeight.value = String(state.visualizerHeight);
        updateVisualizerReadout();
        drawVisualizer(!audio.paused && !audio.ended);
    }

    function detectBeat(frequencies) {
        const limit = Math.max(4, Math.floor(frequencies.length * 0.08));
        let bass = 0;
        for (let index = 0; index < limit; index += 1) bass += frequencies[index];
        bass /= limit * 255;
        state.bassAverage = state.bassAverage ? state.bassAverage * 0.92 + bass * 0.08 : bass;
        const nowMs = performance.now();
        if (bass > Math.max(0.20, state.bassAverage * 1.30) && nowMs - (state.beatTimes.at(-1) || 0) > 280) {
            state.beatTimes.push(nowMs);
            state.beatTimes = state.beatTimes.slice(-12);
            const intervals = state.beatTimes.slice(1).map((time, index) => time - state.beatTimes[index]).filter((value) => value >= 300 && value <= 1200);
            if (intervals.length >= 3) {
                const sorted = [...intervals].sort((a, b) => a - b);
                let bpm = Math.round(60000 / sorted[Math.floor(sorted.length / 2)]);
                while (bpm < 70) bpm *= 2;
                while (bpm > 190) bpm = Math.round(bpm / 2);
                state.bpmEstimate = bpm;
            }
        }
        return bass;
    }

    function drawVisualizer(continueAnimation = true) {
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
        state.animationFrame = 0;
        if (!visualizerContext) return;
        const { width, height } = visualizerSize();
        const context = visualizerContext;
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#22d3ee"); gradient.addColorStop(0.5, "#8b5cf6"); gradient.addColorStop(1, "#ff4fa3");
        context.fillStyle = "#030a10"; context.fillRect(0, 0, width, height);
        if (!state.visualizerEnabled) {
            context.strokeStyle = "#18384a"; context.lineWidth = 1;
            context.beginPath(); context.moveTo(0, height / 2); context.lineTo(width, height / 2); context.stroke();
            visualizerReadout.textContent = `${state.visualizerHeight}px • off`;
            return;
        }

        const active = Boolean(state.analyser && !audio.paused && !audio.ended);
        const frequency = new Uint8Array(state.analyser?.frequencyBinCount || 128);
        const waveform = new Uint8Array(state.analyser?.fftSize || 256);
        if (active) {
            state.analyser.getByteFrequencyData(frequency);
            state.analyser.getByteTimeDomainData(waveform);
        } else {
            frequency.fill(8); waveform.fill(128);
        }
        const bass = active ? detectBeat(frequency) : 0.03;
        context.strokeStyle = gradient; context.fillStyle = gradient; context.lineWidth = 2;
        context.shadowColor = "#22d3ee"; context.shadowBlur = state.visualizerStyle === "Minimal Line" ? 0 : 9;

        if (state.visualizerStyle === "Spectrum Bars" || state.visualizerStyle === "Mirrored Bass") {
            const count = Math.min(72, frequency.length);
            const gap = 2; const barWidth = Math.max(2, width / count - gap);
            for (let index = 0; index < count; index += 1) {
                const amount = frequency[index] / 255;
                const barHeight = Math.max(2, amount * (state.visualizerStyle === "Mirrored Bass" ? height * 0.46 : height * 0.9));
                const x = index * (width / count);
                if (state.visualizerStyle === "Mirrored Bass") {
                    context.fillRect(x, height / 2 - barHeight, barWidth, barHeight);
                    context.fillRect(x, height / 2, barWidth, barHeight);
                } else context.fillRect(x, height - barHeight, barWidth, barHeight);
            }
        } else if (state.visualizerStyle === "Radial Pulse") {
            const centerX = width / 2; const centerY = height / 2;
            const radius = Math.max(12, Math.min(width, height) * (0.16 + bass * 0.16));
            const count = Math.min(96, frequency.length);
            for (let index = 0; index < count; index += 1) {
                const angle = index / count * Math.PI * 2;
                const outer = radius + frequency[index] / 255 * Math.min(70, height * 0.35);
                context.beginPath(); context.moveTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
                context.lineTo(centerX + Math.cos(angle) * outer, centerY + Math.sin(angle) * outer); context.stroke();
            }
        } else if (state.visualizerStyle === "Frequency Ribbon") {
            context.beginPath(); context.moveTo(0, height);
            const count = Math.min(100, frequency.length);
            for (let index = 0; index < count; index += 1) context.lineTo(index / (count - 1) * width, height - frequency[index] / 255 * height * 0.92);
            context.lineTo(width, height); context.closePath(); context.globalAlpha = 0.65; context.fill(); context.globalAlpha = 1;
        } else {
            context.lineWidth = state.visualizerStyle === "Minimal Line" ? 1.5 : 2.2;
            context.beginPath();
            for (let index = 0; index < waveform.length; index += 1) {
                const x = index / Math.max(1, waveform.length - 1) * width;
                const y = waveform[index] / 255 * height;
                if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
            }
            context.stroke();
        }
        context.shadowBlur = 0;
        updateVisualizerReadout();
        if (continueAnimation && active) state.animationFrame = requestAnimationFrame(() => drawVisualizer(true));
    }

    async function ensureAnalyser() {
        if (state.analyser) {
            if (state.audioContext?.state === "suspended") await state.audioContext.resume();
            return true;
        }
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
            setStatus("This ComfyUI browser does not expose Web Audio visualizers.", true);
            return false;
        }
        try {
            state.audioContext = new AudioContextClass();
            state.analyser = state.audioContext.createAnalyser();
            state.analyser.fftSize = 2048;
            state.analyser.smoothingTimeConstant = 0.78;
            state.mediaSource = state.audioContext.createMediaElementSource(audio);
            state.mediaSource.connect(state.analyser);
            state.analyser.connect(state.audioContext.destination);
            return true;
        } catch (error) {
            setStatus(`Visualizer unavailable: ${error.message}`, true);
            return false;
        }
    }

    function persist() {
        node.properties.novaMusicFolder = folderInput.value;
        node.properties.novaMusicSearch = search.value;
        node.properties.novaMusicSort = sort.value;
        node.properties.novaMusicFavoritesOnly = favoritesOnly.checked;
        node.properties.novaMusicShuffle = state.shuffle;
        node.properties.novaMusicRepeat = state.repeat;
        node.properties.novaMusicAutoNext = state.autoNext;
        node.properties.novaMusicVolume = Number(volume.value);
        node.properties.novaMusicVisualizerEnabled = state.visualizerEnabled;
        node.properties.novaMusicVisualizerStyle = state.visualizerStyle;
        node.properties.novaMusicVisualizerHeight = state.visualizerHeight;
        node.properties.novaMusicShowLyrics = state.showLyrics;
        node.properties.novaMusicKaraoke = state.karaoke;
        node.properties.novaMusicKaraokeFollow = state.karaokeFollow;
        node.properties.novaMusicKaraokeOffset = state.karaokeOffset;
        node.properties.novaMusicLyricsHeight = state.lyricsHeight;
        setWidgetValue(node, folderWidget, folderInput.value);
        setWidgetValue(node, autoplayWidget, autoplay.checked);
    }

    function updateNow() {
        const track = currentTrack();
        title.textContent = track?.name || "No track selected";
        favorite.textContent = track?.favorite ? "★ Favorited" : "☆ Favorite";
        favorite.style.color = track?.favorite ? "#ffd67a" : "#edf7ff";
        meta.textContent = track
            ? [track.format, formatTime(track.duration), track.sample_rate ? `${track.sample_rate} Hz` : "", track.channels ? `${track.channels} ch` : "", formatSize(track.size_bytes), track.has_txt ? "TXT" : "", track.has_json ? "JSON" : ""].filter(Boolean).join(" • ")
            : "Choose a track from the library.";
        for (const [index, element] of [...library.children].entries()) {
            element.style.background = index === state.index ? "#173a51" : "transparent";
            element.style.borderColor = index === state.index ? "#4a95be" : "rgba(69,106,130,.3)";
        }
    }

    function renderLibrary() {
        library.replaceChildren();
        state.tracks.forEach((track, index) => {
            const row = document.createElement("button");
            row.type = "button";
            row.style.cssText = "width:100%;display:grid;grid-template-columns:18px minmax(100px,1fr) auto auto;gap:8px;align-items:center;text-align:left;padding:6px 8px;margin:0 0 3px;border:1px solid rgba(69,106,130,.3);border-radius:6px;background:transparent;color:#dcecf7;cursor:pointer";
            const star = document.createElement("span"); star.textContent = track.favorite ? "★" : "☆"; star.style.color = track.favorite ? "#ffd67a" : "#66869a";
            const name = document.createElement("span"); name.textContent = track.name; name.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            const duration = document.createElement("span"); duration.textContent = formatTime(track.duration); duration.style.color = "#9bb9cc";
            const detail = document.createElement("span"); detail.textContent = `${track.format} • ${formatSize(track.size_bytes)}`; detail.style.color = "#789bb1";
            row.append(star, name, duration, detail);
            row.onclick = () => playIndex(index, true);
            library.append(row);
        });
        if (!state.tracks.length) {
            const empty = document.createElement("div");
            empty.textContent = "No MP3, WAV, FLAC, or OGG tracks found in this folder.";
            empty.style.cssText = "padding:18px;text-align:center;color:#799caf";
            library.append(empty);
        }
        updateNow();
    }

    async function playIndex(index, start = true) {
        if (!state.tracks.length) return;
        state.index = Math.max(0, Math.min(state.tracks.length - 1, index));
        const track = currentTrack();
        state.sidecar = null;
        state.lyricLines = [];
        state.activeLyricIndex = -1;
        state.bassAverage = 0;
        state.beatTimes = [];
        state.bpmEstimate = 0;
        audio.src = fileUrl(track);
        audio.load();
        updateNow();
        if (state.showLyrics) {
            renderLyrics();
            await loadSelectedSidecar(true);
            renderLyrics();
        }
        if (start) {
            try {
                await ensureAnalyser();
                await audio.play();
                setStatus(`Playing ${track.name}`);
            } catch (_) {
                setStatus("Ready. Click Play once to allow browser audio.");
            }
        }
    }

    function nextIndex(direction = 1) {
        if (!state.tracks.length) return -1;
        if (state.shuffle && state.tracks.length > 1) {
            let candidate = state.index;
            while (candidate === state.index) candidate = Math.floor(Math.random() * state.tracks.length);
            return candidate;
        }
        const candidate = state.index + direction;
        if (candidate >= 0 && candidate < state.tracks.length) return candidate;
        return state.repeat === "all" ? (candidate < 0 ? state.tracks.length - 1 : 0) : Math.max(0, Math.min(state.tracks.length - 1, candidate));
    }

    async function refreshLibrary(playName = "") {
        if (state.loading) return;
        state.loading = true;
        persist();
        try {
            const params = new URLSearchParams({ folder: folderInput.value || DEFAULT_FOLDER, sort: sort.value, search: search.value, favorites_only: favoritesOnly.checked ? "true" : "false" });
            const payload = await responseJson(await api.fetchApi(`/nova_music3/library?${params}`));
            folderInput.value = payload.folder;
            state.tracks = payload.tracks || [];
            state.sort = payload.sort;
            const previousName = playName || currentTrack()?.name || "";
            state.index = state.tracks.findIndex((item) => item.name === previousName);
            renderLibrary();
            setStatus(`${payload.count} track${payload.count === 1 ? "" : "s"} loaded.`);
            if (playName && state.index >= 0) await playIndex(state.index, true);
        } catch (error) {
            setStatus(error.message, true);
        } finally {
            state.loading = false;
        }
    }

    let searchTimer = 0;
    search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => refreshLibrary(), 250); };
    sort.onchange = () => refreshLibrary();
    favoritesOnly.onchange = () => { state.favoritesOnly = favoritesOnly.checked; refreshLibrary(); };
    autoplay.onchange = persist;
    autoNext.onchange = () => { state.autoNext = autoNext.checked; persist(); };
    visualizerToggle.onchange = () => { state.visualizerEnabled = visualizerToggle.checked; persist(); drawVisualizer(!audio.paused); };
    visualizerStyle.onchange = () => { state.visualizerStyle = visualizerStyle.value; persist(); drawVisualizer(!audio.paused); };
    visualizerHeight.oninput = () => { setVisualizerHeight(visualizerHeight.value); persist(); };
    folderInput.onchange = () => refreshLibrary();
    refreshButton.onclick = () => refreshLibrary();
    browse.onclick = async () => {
        try {
            const payload = await responseJson(await api.fetchApi("/nova_music3/library/browse", { method: "POST" }));
            if (payload.cancelled) return;
            folderInput.value = payload.folder;
            await refreshLibrary();
        } catch (error) { setStatus(error.message, true); }
    };
    open.onclick = async () => {
        try {
            await responseJson(await api.fetchApi("/nova_music3/library/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: folderInput.value }) }));
            setStatus("Opened the audio library folder.");
        } catch (error) { setStatus(error.message, true); }
    };
    reveal.onclick = async () => {
        const track = currentTrack();
        if (!track) return setStatus("Select a track first.", true);
        try {
            await responseJson(await api.fetchApi("/nova_music3/library/reveal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: folderInput.value, name: track.name }),
            }));
            setStatus(`Selected ${track.name} in File Explorer.`);
        } catch (error) { setStatus(error.message, true); }
    };
    loadRecipe.onclick = async () => {
        const track = currentTrack();
        if (!track) return setStatus("Select a track first.", true);
        const sidecar = state.sidecar || await loadSelectedSidecar();
        if (!sidecar?.recipe) return;
        const controlsNode = controlsNodeForPlayer();
        if (!controlsNode?.__novaMusic3ApplyRecipe) {
            return setStatus("Add or reload a NovoLoko MiniMax Music 3 Controls node, then try again.", true);
        }
        try {
            await controlsNode.__novaMusic3ApplyRecipe(sidecar.recipe, track.name);
            setStatus(`Loaded ${track.name}'s exact 19-choice recipe and seed into Music Controls.`);
        } catch (error) {
            setStatus(error.message, true);
        }
    };
    showLyrics.onclick = async () => {
        state.showLyrics = !state.showLyrics;
        persist();
        renderLyrics();
        if (state.showLyrics && !state.sidecar) {
            await loadSelectedSidecar();
            renderLyrics();
        }
    };
    karaoke.onclick = async () => {
        state.karaoke = !state.karaoke;
        if (state.karaoke) state.showLyrics = true;
        persist();
        renderLyrics();
        if (state.showLyrics && !state.sidecar) {
            await loadSelectedSidecar();
            renderLyrics();
        }
        updateKaraoke();
    };
    karaokeFollow.onclick = () => {
        state.karaokeFollow = !state.karaokeFollow;
        karaokeFollow.textContent = state.karaokeFollow ? "Follow Lyrics On" : "Follow Lyrics Off";
        persist();
        state.activeLyricIndex = -1;
        updateKaraoke();
    };
    karaokeOffset.oninput = () => {
        state.karaokeOffset = Number(karaokeOffset.value);
        karaokeOffsetReadout.textContent = `${state.karaokeOffset >= 0 ? "+" : ""}${state.karaokeOffset.toFixed(1)}s`;
        persist();
        state.activeLyricIndex = -1;
        updateKaraoke();
    };
    lyricsHeight.oninput = () => { setLyricsHeight(lyricsHeight.value); persist(); };
    copyLyrics.onclick = async () => {
        const text = String(state.sidecar?.lyrics || "");
        if (!text) return setStatus("This track has no saved final lyrics to copy.", true);
        try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied matched final lyrics.");
        } catch (error) {
            setStatus(`Could not copy lyrics: ${error.message}`, true);
        }
    };
    favorite.onclick = async () => {
        const track = currentTrack();
        if (!track) return setStatus("Select a track first.", true);
        const wanted = !Boolean(track.favorite);
        try {
            await responseJson(await api.fetchApi("/nova_music3/library/favorite", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ folder: folderInput.value, name: track.name, favorite: wanted }),
            }));
            const selectedName = track.name;
            await refreshLibrary();
            state.index = state.tracks.findIndex((item) => item.name === selectedName);
            updateNow();
            setStatus(wanted ? `Favorited ${selectedName}.` : `Removed ${selectedName} from favorites.`);
        } catch (error) { setStatus(error.message, true); }
    };
    play.onclick = async () => {
        if (!audio.src) return playIndex(state.index >= 0 ? state.index : 0, true);
        if (audio.paused) { await ensureAnalyser(); await audio.play().catch(() => setStatus("Click Play again if browser audio is still blocked.")); }
        else audio.pause();
    };
    previous.onclick = () => playIndex(nextIndex(-1), true);
    next.onclick = () => playIndex(nextIndex(1), true);
    back.onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 10); };
    forward.onclick = () => { audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 10); };
    shuffle.onclick = () => { state.shuffle = !state.shuffle; shuffle.textContent = state.shuffle ? "Shuffle On" : "Shuffle Off"; persist(); };
    repeat.onclick = () => { state.repeat = state.repeat === "off" ? "one" : state.repeat === "one" ? "all" : "off"; repeat.textContent = `Repeat ${state.repeat}`; persist(); };
    volume.oninput = () => { audio.volume = Number(volume.value) / 100; volumeReadout.textContent = `${volume.value}%`; if (audio.muted && Number(volume.value) > 0) audio.muted = false; persist(); };
    mute.onclick = () => { audio.muted = !audio.muted; mute.textContent = audio.muted ? "Unmute" : "Mute"; };
    progress.oninput = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = Number(progress.value) / 1000 * audio.duration; };
    audio.ontimeupdate = () => { currentTime.textContent = formatTime(audio.currentTime); progress.value = String(audio.duration ? Math.round(audio.currentTime / audio.duration * 1000) : 0); updateKaraoke(); };
    audio.onloadedmetadata = () => { totalTime.textContent = formatTime(audio.duration); play.textContent = audio.paused ? "▶ Play" : "⏸ Pause"; updateKaraoke(); };
    audio.onplay = () => { play.textContent = "⏸ Pause"; drawVisualizer(true); };
    audio.onpause = () => { play.textContent = "▶ Play"; drawVisualizer(false); };
    audio.onended = () => {
        const action = musicPlayerEndAction({
            repeat: state.repeat,
            autoNext: state.autoNext,
            index: state.index,
            trackCount: state.tracks.length,
        });
        if (action === "repeat-one") {
            audio.currentTime = 0;
            audio.play();
        } else if (action === "play-next") {
            playIndex(nextIndex(1), true);
        } else {
            play.textContent = "▶ Play";
            drawVisualizer(false);
            setStatus(state.autoNext
                ? `${currentTrack()?.name || "Track"} finished. There is no later track to play.`
                : `${currentTrack()?.name || "Track"} finished. Play next automatically is Off.`);
        }
    };
    rename.onclick = async () => {
        const track = currentTrack();
        if (!track) return setStatus("Select a track first.", true);
        const name = prompt("Rename audio and matched TXT/JSON sidecars:", track.stem);
        if (!name?.trim() || name.trim() === track.stem) return;
        try {
            const payload = await responseJson(await api.fetchApi("/nova_music3/library/rename", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: folderInput.value, name: track.name, new_name: name.trim() }) }));
            await refreshLibrary(payload.track.name);
            setStatus(`Renamed track and matched sidecars to ${payload.track.name}.`);
        } catch (error) { setStatus(error.message, true); }
    };
    remove.onclick = async () => {
        const track = currentTrack();
        if (!track) return setStatus("Select a track first.", true);
        if (!confirm(`Move "${track.name}" and its matched TXT/JSON sidecars to NovoLoko_Trash?`)) return;
        try {
            await responseJson(await api.fetchApi("/nova_music3/library/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder: folderInput.value, name: track.name, confirmed: true }) }));
            audio.pause(); audio.removeAttribute("src"); state.index = -1;
            await refreshLibrary();
            setStatus(`Moved ${track.name} and matched sidecars to recoverable NovoLoko_Trash.`);
        } catch (error) { setStatus(error.message, true); }
    };

    const previousExecuted = node.onExecuted;
    node.onExecuted = function (output) {
        previousExecuted?.apply(this, arguments);
        const payload = output?.nova_music_library?.[0];
        const playName = payload?.auto_play_new ? String(payload.newest || "") : "";
        if (payload?.folder) folderInput.value = payload.folder;
        refreshLibrary(playName);
    };
    const previousRemoved = node.onRemoved;
    node.onRemoved = function () {
        playerNodes.delete(this);
        if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
        state.resizeObserver?.disconnect?.();
        audio.pause();
        state.audioContext?.close?.().catch?.(() => {});
        previousRemoved?.apply(this, arguments);
    };

    audio.volume = Number(volume.value) / 100;
    setVisualizerHeight(state.visualizerHeight);
    if (typeof ResizeObserver === "function") {
        state.resizeObserver = new ResizeObserver(() => drawVisualizer(!audio.paused && !audio.ended));
        state.resizeObserver.observe(visualizer);
    }
    const dom = node.addDOMWidget("nova_music3_player_v440", "NOVA_MUSIC3_PLAYER", root, {
        serialize: false, hideOnZoom: false, getMinHeight: () => 308, getHeight: () => 608,
    });
    dom.serialize = false;
    dom.options.serialize = false;
    installResponsivePanel(node, dom, root, {
        flag: "__novaMusic3PlayerResponsiveInstalled",
        minWidth: 600,
        minPanelHeight: 300,
        defaultNodeHeight: 820,
        chromeHeight: 90,
        maxNodeHeight: 1800,
        heightProperty: "novaMusicPlayerPanelHeight",
    });
    refreshLibrary();
    drawVisualizer(false);
    renderLyrics();
}


app.registerExtension({
    name: "NovoLoko.MiniMaxMusic3.v462",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const installer = nodeData?.name === CONTROLS_NODE
            ? installMusicControls
            : nodeData?.name === LIBRARY_NODE
                ? installAudioLibrary
                : nodeData?.name === WRITER_NODE
                    ? installWriterModelPicker
                    : nodeData?.name === SAVER_NODE
                        ? installSaverLifecycle
                        : null;
        if (!installer) return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            try { installer(this); } catch (error) { console.error("[NovoLoko Music 3] Frontend setup failed:", error); }
        };
    },
    nodeCreated(node) {
        const name = node?.comfyClass || node?.type;
        try {
            if (name === CONTROLS_NODE) installMusicControls(node);
            if (name === LIBRARY_NODE) installAudioLibrary(node);
            if (name === WRITER_NODE) installWriterModelPicker(node);
            if (name === SAVER_NODE) installSaverLifecycle(node);
        } catch (error) {
            console.error("[NovoLoko Music 3] Frontend setup failed:", error);
        }
    },
});
