import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { precisionHalves, zoomPrecisionAtPointerLocked } from "./nova_precision_zoom.js";

const MODES = ["Split", "Side by Side", "Overlay", "Blink", "A Only", "B Only"];
const ORIENTATIONS = ["Vertical", "Horizontal"];
const SBS_STYLES = ["Native", "Precision Align"];
const DIFFERENCE_STYLES = ["Normal", "Difference", "Heatmap", "High Contrast", "Edges", "Multiply", "Screen"];
const SETTINGS_KEY = "nova.image.compare.pro.settings.v310";
const LEGACY_SETTINGS_KEYS = ["nova.image.compare.pro.settings.v300", "nova.image.compare.pro.settings.v2911", "nova.image.compare.pro.settings.v2910", "nova.image.compare.pro.settings.v299", "nova.image.compare.pro.settings.v298", "nova.image.compare.pro.settings.v290"];
const THEMES = {
    "NovoLoko Blue": { accent: "#4da3ff", panel: "#0f2034", panel2: "#101820", text: "#f4f8ff" },
    Charcoal: { accent: "#d2d6dc", panel: "#18191c", panel2: "#15171a", text: "#f5f5f5" },
    Purple: { accent: "#a78bfa", panel: "#25183c", panel2: "#1f1731", text: "#fbf8ff" },
    Emerald: { accent: "#34d399", panel: "#0a2b24", panel2: "#10251f", text: "#f1fff9" },
    Amber: { accent: "#fbbf24", panel: "#37260a", panel2: "#292014", text: "#fffaf0" },
    Rose: { accent: "#fb7185", panel: "#3c161f", panel2: "#2b171c", text: "#fff5f7" },
    Midnight: { accent: "#5ee7ff", panel: "#050d1c", panel2: "#091830", text: "#edfaff" },
    OLED: { accent: "#ffffff", panel: "#000000", panel2: "#080808", text: "#ffffff" },
    Graphite: { accent: "#9ca3af", panel: "#111318", panel2: "#1b1e25", text: "#f3f4f6" },
    Ocean: { accent: "#38bdf8", panel: "#082f49", panel2: "#0c4a6e", text: "#f0f9ff" },
    Teal: { accent: "#2dd4bf", panel: "#0f3d3a", panel2: "#115e59", text: "#f0fdfa" },
    Magenta: { accent: "#e879f9", panel: "#4a124f", panel2: "#701a75", text: "#fdf4ff" },
    Gold: { accent: "#facc15", panel: "#3f2d08", panel2: "#5f460b", text: "#fffbea" },
    Forest: { accent: "#4ade80", panel: "#12351f", panel2: "#14532d", text: "#f0fdf4" },
    Lavender: { accent: "#c4b5fd", panel: "#312e55", panel2: "#443c73", text: "#faf8ff" },
    Sunset: { accent: "#fb7185", panel: "#4b1d32", panel2: "#6b2737", text: "#fff7ed" },
};
const BUTTON_COLORS = {
    "Theme Accent": null, Blue: "#4da3ff", Sky: "#38bdf8", Cyan: "#22d3ee", Teal: "#2dd4bf",
    Green: "#34d399", Lime: "#a3e635", Yellow: "#fde047", Amber: "#fbbf24", Gold: "#facc15",
    Orange: "#fb923c", Copper: "#f59e6b", Red: "#ef4444", Rose: "#fb7185", Magenta: "#e879f9",
    Purple: "#a78bfa", Indigo: "#818cf8", Lavender: "#c4b5fd", Silver: "#d1d5db", White: "#f9fafb", Grey: "#9ca3af", Black: "#111827",
};
const TEXT_COLORS = {
    "Theme Text": null, White: "#ffffff", Black: "#07090d", Silver: "#d1d5db", Cyan: "#a5f3fc",
    Blue: "#bfdbfe", Green: "#bbf7d0", Lime: "#d9f99d", Gold: "#fef08a", Orange: "#fed7aa",
    Rose: "#fecdd3", Pink: "#f5d0fe", Lavender: "#ddd6fe",
};
const BUTTON_STYLES = ["Soft", "Solid", "Outline", "Glass", "Minimal"];
const BACKGROUNDS = ["Black", "OLED", "Checker", "Neutral", "White", "Deep Blue", "Warm Grey", "Gradient", "Studio Grey", "Paper", "Navy Grid", "Transparent"];
const DEFAULTS = Object.freeze({
    mode: "Split",
    orientation: "Vertical",
    position: 50,
    opacity: 50,
    lineOpacity: 96,
    guide: true,
    followMouse: false,
    sbsOverlap: 0,
    sbsStyle: "Native",
    resetFitOnChange: true,
    nodeView: "Fit",
    nodePixelated: false,
    swapped: false,
    blinkMs: 650,
    theme: "NovoLoko Blue",
    buttonColor: "Theme Accent",
    textColor: "Theme Text",
    buttonStyle: "Soft",
    background: "Black",
    differenceStyle: "Normal",
    precisionPanAX: 0, precisionPanAY: 0, precisionPanBX: 0, precisionPanBY: 0,
    precisionLinked: false,
    showSources: false,
    showLabels: true,
});

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
}

// The ComfyUI graph may be zoomed far beyond 100%. CSS transforms should scale
// the node visually, but must never multiply the canvas backing-store size.
// This keeps graph zoom unlimited while holding node rendering to a safe budget.
const NODE_PREVIEW_MAX_PIXELS = 3_200_000;
const NODE_PREVIEW_MAX_DPR = 2;

function nodePreviewMetrics(canvas) {
    const cssWidth = Math.max(
        1,
        Math.floor(canvas.clientWidth || canvas.parentElement?.clientWidth || 1),
    );
    const cssHeight = Math.max(
        1,
        Math.floor(canvas.clientHeight || canvas.parentElement?.clientHeight || 1),
    );
    const preferredDpr = Math.min(
        NODE_PREVIEW_MAX_DPR,
        Math.max(1, Number(window.devicePixelRatio || 1)),
    );
    const budgetDpr = Math.sqrt(
        NODE_PREVIEW_MAX_PIXELS / Math.max(1, cssWidth * cssHeight),
    );
    const dpr = Math.max(1, Math.min(preferredDpr, budgetDpr));
    return { cssWidth, cssHeight, dpr };
}

function loadGlobal() {
    try {
        let raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            for (const key of LEGACY_SETTINGS_KEYS) {
                raw = localStorage.getItem(key);
                if (raw) break;
            }
        }
        return { ...DEFAULTS, ...JSON.parse(raw || "{}") };
    } catch (_) {
        return { ...DEFAULTS };
    }
}

function saveGlobal(value) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
    } catch (_) {}
}

function notify(message, severity = "info") {
    try {
        if (app.extensionManager?.toast?.add) {
            app.extensionManager.toast.add({
                severity,
                summary: "NovoLoko Image Compare Pro",
                detail: String(message || ""),
                life: severity === "error" ? 6500 : 3500,
            });
            return;
        }
    } catch (_) {}
    if (severity === "error") console.error(`[NovoLoko Compare] ${message}`);
    else console.log(`[NovoLoko Compare] ${message}`);
}

function imageUrl(info) {
    const params = new URLSearchParams({
        filename: info?.filename || "",
        subfolder: info?.subfolder || "",
        type: info?.type || "temp",
        t: String(Date.now()),
    });
    return typeof api.apiURL === "function"
        ? api.apiURL(`/nova_compare/raw?${params.toString()}`)
        : `/nova_compare/raw?${params.toString()}`;
}

function loadImage(info) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = imageUrl(info);
    });
}

async function loadCompareFileInfo(info) {
    if (!info?.filename) return {};
    const params = new URLSearchParams({
        filename: info.filename || "",
        subfolder: info.subfolder || "",
        type: info.type || "temp",
        t: String(Date.now()),
    });
    const url = typeof api.apiURL === "function"
        ? api.apiURL(`/nova_compare/info?${params.toString()}`)
        : `/nova_compare/info?${params.toString()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json();
}

function serializableImageRef(info) {
    if (!info || typeof info !== "object") return null;
    const filename = String(info.filename || "").trim();
    if (!filename) return null;
    return {
        filename,
        subfolder: String(info.subfolder || ""),
        type: String(info.type || "temp"),
    };
}

function rememberCompareImages(node, refs, info) {
    if (!node) return;
    node.properties ||= {};
    node.properties.novaCompareImageRefs = (refs || [])
        .map(serializableImageRef)
        .filter(Boolean)
        .slice(0, 3);
    const safeInfo = info && typeof info === "object"
        ? { ...info }
        : {};
    delete safeInfo.png_metadata;
    node.properties.novaCompareInfo = JSON.parse(JSON.stringify(safeInfo));
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

async function restoreCompareImages(node, force = false) {
    if (!node || node.__novaCompareRestorePending) return;
    const refs = Array.isArray(node.properties?.novaCompareImageRefs)
        ? node.properties.novaCompareImageRefs
        : [];
    if (!refs.length) return;
    if (!force && node._novaCompareA?.complete && node._novaCompareA?.naturalWidth > 0) {
        node.__novaCompareUI?.refresh?.();
        return;
    }

    node.__novaCompareRestorePending = true;
    try {
        const [loaded, fileInfo] = await Promise.all([
            Promise.all(refs.map(loadImage)),
            loadCompareFileInfo(refs[0]).catch(() => ({})),
        ]);
        const info = {
            ...(node.properties?.novaCompareInfo || {}),
            png_metadata: fileInfo?.png_metadata || {},
        };
        node._novaCompareA = loaded[0] || null;
        node._novaCompareB = info?.has_b === false ? null : (loaded[1] || null);
        node._novaCompareDiff = info?.has_b === false ? null : (loaded[2] || null);
        node._novaCompareInfo = info;
        node.__novaCompareUI?.refresh?.();
        node.setDirtyCanvas?.(true, true);
    } catch (error) {
        console.warn("[NovoLoko Compare] could not restore persisted tab images", error);
    } finally {
        node.__novaCompareRestorePending = false;
    }
}

function makeButton(text, title = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.style.cssText = "cursor:pointer;padding:4px 8px;min-height:28px;border-radius:5px;white-space:nowrap";
    return button;
}

let activeCompareDropdown = null;

function closeCompareDropdown() {
    activeCompareDropdown?.remove?.();
    activeCompareDropdown = null;
}

function makeFloatingSelect(values, initialValue, title = "") {
    const options = [...values].map(String);
    const button = document.createElement("button");
    button.type = "button";
    button.title = title;
    button.dataset.novaCompareDropdown = "1";
    button.style.cssText = [
        "cursor:pointer",
        "min-height:28px",
        "padding:3px 22px 3px 7px",
        "border-radius:5px",
        "min-width:86px",
        "max-width:190px",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
        "position:relative",
        "text-align:left",
    ].join(";");

    let current = options.includes(String(initialValue))
        ? String(initialValue)
        : (options[0] || "");

    const render = () => {
        button.textContent = `${current} ▾`;
        button.dataset.value = current;
    };

    Object.defineProperty(button, "value", {
        configurable: true,
        enumerable: true,
        get: () => current,
        set: (next) => {
            const clean = String(next ?? "");
            current = options.includes(clean) ? clean : clean;
            render();
        },
    });
    button.options = { values: options };

    function openMenu(event) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (button.disabled) return;

        if (activeCompareDropdown?.dataset?.owner === String(button.__novaDropdownId)) {
            closeCompareDropdown();
            return;
        }
        closeCompareDropdown();

        const rect = button.getBoundingClientRect();
        const menu = document.createElement("div");
        menu.dataset.owner = String(button.__novaDropdownId);
        menu.style.cssText = [
            "position:fixed",
            `left:${Math.max(4, Math.min(rect.left, window.innerWidth - 270))}px`,
            `top:${Math.min(window.innerHeight - 12, rect.bottom + 3)}px`,
            `min-width:${Math.max(150, rect.width)}px`,
            "max-width:270px",
            "max-height:min(62vh,420px)",
            "overflow:auto",
            "z-index:2147483000",
            "padding:5px",
            "border-radius:8px",
            "border:1px solid #4f7697",
            "background:#101820",
            "box-shadow:0 14px 40px rgba(0,0,0,.65)",
            "font:12px/1.25 system-ui",
            "color:#f4f8ff",
        ].join(";");

        for (const item of options) {
            const choice = document.createElement("button");
            choice.type = "button";
            choice.textContent = item === current ? `✓ ${item}` : item;
            choice.title = item;
            choice.style.cssText = [
                "display:block",
                "width:100%",
                "padding:7px 9px",
                "border:0",
                "border-radius:5px",
                "background:transparent",
                "color:inherit",
                "text-align:left",
                "cursor:pointer",
                "white-space:normal",
            ].join(";");
            choice.addEventListener("mouseenter", () => {
                choice.style.background = "rgba(77,163,255,.24)";
            });
            choice.addEventListener("mouseleave", () => {
                choice.style.background = "transparent";
            });
            choice.addEventListener("click", (choiceEvent) => {
                choiceEvent.preventDefault();
                choiceEvent.stopPropagation();
                current = item;
                render();
                closeCompareDropdown();
                button.dispatchEvent(new Event("change", { bubbles: true }));
            });
            menu.append(choice);
        }

        document.body.append(menu);
        activeCompareDropdown = menu;

        requestAnimationFrame(() => {
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.bottom > window.innerHeight - 6) {
                menu.style.top = `${Math.max(6, rect.top - menuRect.height - 3)}px`;
            }
        });
    }

    button.__novaDropdownId = `${Date.now()}_${Math.random()}`;
    button.addEventListener("click", openMenu);
    button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            openMenu(event);
        } else if (event.key === "Escape") {
            closeCompareDropdown();
        }
    });

    render();
    return button;
}

document.addEventListener("pointerdown", (event) => {
    if (!activeCompareDropdown) return;
    if (activeCompareDropdown.contains(event.target)) return;
    if (event.target?.closest?.('[data-nova-compare-dropdown="1"]')) return;
    closeCompareDropdown();
}, true);
window.addEventListener("resize", closeCompareDropdown);
window.addEventListener("blur", closeCompareDropdown);

function makeSelect(values, value, title = "", floating = false) {
    if (floating) return makeFloatingSelect(values, value, title);

    const select = document.createElement("select");
    select.title = title;
    select.style.cssText = [
        "cursor:pointer",
        "min-height:28px",
        "padding:3px 5px",
        "border-radius:5px",
        "min-width:0",
        "background:#101820",
        "color:#f4f8ff",
        "border:1px solid #4f7697",
    ].join(";");
    for (const item of values) {
        const option = document.createElement("option");
        option.value = item;
        option.textContent = item;
        option.style.background = "#101820";
        option.style.color = "#f4f8ff";
        select.append(option);
    }
    select.value = value;
    return select;
}

function makeRange(min, max, value, title = "") {
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = "1";
    input.value = String(value);
    input.title = title;
    input.style.cssText = "width:100%;min-width:70px;cursor:pointer";
    return input;
}

function themeFor(state) {
    return THEMES[state.theme] || THEMES[DEFAULTS.theme];
}

function buttonAccent(state) {
    return BUTTON_COLORS[state.buttonColor] || themeFor(state).accent;
}

function textColorFor(state) {
    return TEXT_COLORS[state.textColor] || themeFor(state).text;
}

function buttonContrast(accent) {
    const value = String(accent || "#ffffff").replace("#", "");
    if (value.length !== 6) return "#07111d";
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#07111d" : "#ffffff";
}

function styleCompareButton(button, state, active = false) {
    const accent = buttonAccent(state);
    const text = textColorFor(state);
    const style = BUTTON_STYLES.includes(state.buttonStyle) ? state.buttonStyle : "Soft";
    button.style.opacity = active ? "1" : ".82";
    button.style.fontWeight = active ? "800" : "500";
    button.style.borderColor = `${accent}aa`;
    button.style.boxShadow = "none";
    button.style.backdropFilter = "none";
    if (style === "Solid") {
        button.style.background = active ? accent : `${accent}cc`;
        button.style.color = buttonContrast(accent);
    } else if (style === "Outline") {
        button.style.background = active ? `${accent}22` : "transparent";
        button.style.color = active ? accent : text;
    } else if (style === "Glass") {
        button.style.background = active ? `${accent}55` : "rgba(255,255,255,.08)";
        button.style.color = text;
        button.style.backdropFilter = "blur(10px)";
        button.style.boxShadow = active ? `0 0 14px ${accent}55` : "none";
    } else if (style === "Minimal") {
        button.style.background = "transparent";
        button.style.color = active ? accent : text;
        button.style.borderColor = active ? accent : "transparent";
    } else {
        button.style.background = active ? `${accent}dd` : `${accent}20`;
        button.style.color = active ? buttonContrast(accent) : text;
    }
}

function backgroundStyle(state) {
    const map = {
        Black: { color: "#05070a" }, OLED: { color: "#000000" }, Neutral: { color: "#25272c" },
        White: { color: "#e8eaee" }, "Deep Blue": { color: "#071426" }, "Warm Grey": { color: "#302d2a" },
        "Studio Grey": { color: "#1d2025" }, Paper: { color: "#ddd7ca" }, Transparent: { color: "transparent" },
    };
    return map[state.background] || map.Black;
}

function applyChecker(element, state) {
    const bg = backgroundStyle(state);
    element.style.backgroundColor = bg.color;
    element.style.backgroundImage = "none";
    if (state.background === "Checker") {
        element.style.backgroundColor = "#181a1e";
        element.style.backgroundImage = "linear-gradient(45deg,#252830 25%,transparent 25%),linear-gradient(-45deg,#252830 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#252830 75%),linear-gradient(-45deg,transparent 75%,#252830 75%)";
        element.style.backgroundSize = "24px 24px";
        element.style.backgroundPosition = "0 0,0 12px,12px -12px,-12px 0";
    } else if (state.background === "Gradient") {
        element.style.backgroundImage = "radial-gradient(circle at 50% 35%,#24344b 0,#10151e 45%,#030507 100%)";
    } else if (state.background === "Studio Grey") {
        element.style.backgroundImage = "linear-gradient(135deg,#2f333a,#171a1f)";
    } else if (state.background === "Navy Grid") {
        element.style.backgroundColor = "#071426";
        element.style.backgroundImage = "linear-gradient(#173251 1px,transparent 1px),linear-gradient(90deg,#173251 1px,transparent 1px)";
        element.style.backgroundSize = "32px 32px";
    }
}

function nodeState(node) {
    const global = loadGlobal();
    const props = node.properties || (node.properties = {});
    return {
        node,
        a: node._novaCompareA || null,
        b: node._novaCompareB || null,
        d: node._novaCompareDiff || null,
        info: node._novaCompareInfo || {},
        mode: (() => {
            const value = props.novaCompareMode || global.mode || DEFAULTS.mode;
            return value === "Difference"
                ? "Overlay"
                : (MODES.includes(value) ? value : DEFAULTS.mode);
        })(),
        orientation: props.novaCompareOrientation || global.orientation || DEFAULTS.orientation,
        position: clamp(Number(props.novaComparePosition ?? global.position / 100) * 100, 0, 100),
        opacity: clamp(Number(props.novaCompareOpacity ?? global.opacity / 100) * 100, 0, 100),
        lineOpacity: clamp(Number(props.novaCompareLineOpacity ?? global.lineOpacity / 100) * 100, 0, 100),
        guide: props.novaCompareGuide ?? global.guide ?? DEFAULTS.guide,
        followMouse: Boolean(props.novaCompareFollowMouse ?? global.followMouse ?? DEFAULTS.followMouse),
        sbsOverlap: clamp(props.novaCompareSbsOverlap ?? global.sbsOverlap ?? DEFAULTS.sbsOverlap, 0, 90),
        sbsStyle: (() => {
            const value = props.novaCompareSbsStyle || global.sbsStyle || DEFAULTS.sbsStyle;
            return value === "Classic Fit" ? "Precision Align" : (SBS_STYLES.includes(value) ? value : "Native");
        })(),
        precisionPanAX: Number(props.novaComparePrecisionPanAX ?? global.precisionPanAX ?? 0),
        precisionPanAY: Number(props.novaComparePrecisionPanAY ?? global.precisionPanAY ?? 0),
        precisionPanBX: Number(props.novaComparePrecisionPanBX ?? global.precisionPanBX ?? 0),
        precisionPanBY: Number(props.novaComparePrecisionPanBY ?? global.precisionPanBY ?? 0),
        precisionLinked: Boolean(props.novaComparePrecisionLinked ?? global.precisionLinked ?? DEFAULTS.precisionLinked),
        resetFitOnChange: Boolean(props.novaCompareResetFitOnChange ?? global.resetFitOnChange ?? DEFAULTS.resetFitOnChange),
        nodeView: props.novaCompareNodeView || DEFAULTS.nodeView,
        nodePixelated: Boolean(props.novaCompareNodePixelated ?? DEFAULTS.nodePixelated),
        swapped: Boolean(props.novaCompareSwapped ?? global.swapped ?? DEFAULTS.swapped),
        blinkMs: clamp(props.novaCompareBlinkMs ?? global.blinkMs ?? DEFAULTS.blinkMs, 100, 10000),
        theme: props.novaCompareTheme || global.theme || DEFAULTS.theme,
        buttonColor: props.novaCompareButtonColor || global.buttonColor || DEFAULTS.buttonColor,
        textColor: props.novaCompareTextColor || global.textColor || DEFAULTS.textColor,
        buttonStyle: props.novaCompareButtonStyle || global.buttonStyle || DEFAULTS.buttonStyle,
        background: props.novaCompareBackground || global.background || DEFAULTS.background,
        differenceStyle: (() => {
            const value = props.novaCompareDifferenceStyle || global.differenceStyle || DEFAULTS.differenceStyle;
            return value === "Absolute" ? "Normal" : value;
        })(),
        showSources: Boolean(props.novaCompareShowSources ?? global.showSources ?? DEFAULTS.showSources),
        showLabels: Boolean(props.novaCompareShowLabels ?? global.showLabels ?? DEFAULTS.showLabels),
        blinkPhase: 0,
    };
}

function persistState(state) {
    const picked = {
        mode: state.mode,
        orientation: state.orientation,
        position: state.position,
        opacity: state.opacity,
        lineOpacity: state.lineOpacity,
        guide: state.guide,
        followMouse: state.followMouse,
        sbsOverlap: state.sbsOverlap,
        sbsStyle: state.sbsStyle,
        precisionPanAX: state.precisionPanAX,
        precisionPanAY: state.precisionPanAY,
        precisionPanBX: state.precisionPanBX,
        precisionPanBY: state.precisionPanBY,
        precisionLinked: state.precisionLinked,
        resetFitOnChange: state.resetFitOnChange,
        swapped: state.swapped,
        blinkMs: state.blinkMs,
        theme: state.theme,
        buttonColor: state.buttonColor,
        textColor: state.textColor,
        buttonStyle: state.buttonStyle,
        background: state.background,
        differenceStyle: state.differenceStyle,
        showSources: state.showSources,
        showLabels: state.showLabels,
    };
    saveGlobal(picked);
    const node = state.node;
    if (node) {
        node.properties = node.properties || {};
        Object.assign(node.properties, {
            novaCompareMode: state.mode,
            novaCompareOrientation: state.orientation,
            novaComparePosition: state.position / 100,
            novaCompareOpacity: state.opacity / 100,
            novaCompareLineOpacity: state.lineOpacity / 100,
            novaCompareGuide: state.guide,
            novaCompareFollowMouse: state.followMouse,
            novaCompareSbsOverlap: state.sbsOverlap,
            novaCompareSbsStyle: state.sbsStyle,
            novaComparePrecisionPanAX: state.precisionPanAX,
            novaComparePrecisionPanAY: state.precisionPanAY,
            novaComparePrecisionPanBX: state.precisionPanBX,
            novaComparePrecisionPanBY: state.precisionPanBY,
            novaComparePrecisionLinked: state.precisionLinked,
            novaCompareResetFitOnChange: state.resetFitOnChange,
            novaCompareNodeView: state.nodeView,
            novaCompareNodePixelated: state.nodePixelated,
            novaCompareSwapped: state.swapped,
            novaCompareBlinkMs: state.blinkMs,
            novaCompareTheme: state.theme,
            novaCompareButtonColor: state.buttonColor,
            novaCompareTextColor: state.textColor,
            novaCompareButtonStyle: state.buttonStyle,
            novaCompareBackground: state.background,
            novaCompareDifferenceStyle: state.differenceStyle,
            novaCompareShowSources: state.showSources,
            novaCompareShowLabels: state.showLabels,
        });
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
    }
}

function hasSecondImage(state) {
    return Boolean(state?.info?.has_b !== false && state?.b);
}

function currentImages(state) {
    if (!hasSecondImage(state)) {
        return {
            a: state.a,
            b: null,
            labelA: state.info?.label_a || "IMAGE",
            labelB: "",
        };
    }
    return state.swapped
        ? { a: state.b, b: state.a, labelA: state.info?.label_b || "B", labelB: state.info?.label_a || "A" }
        : { a: state.a, b: state.b, labelA: state.info?.label_a || "A", labelB: state.info?.label_b || "B" };
}


function zoomPrecisionAtPointer(state, rect, clientX, clientY, newZoom, linkBoth = false, inset = 0) {
    const images = currentImages(state);
    const halves = precisionHalves(rect, state.orientation, inset);
    const solved = zoomPrecisionAtPointerLocked({
        images: [images.a, images.b],
        halves,
        pans: {
            panAX: state.precisionPanAX, panAY: state.precisionPanAY,
            panBX: state.precisionPanBX, panBY: state.precisionPanBY,
        },
        orientation: state.orientation,
        clientX, clientY, oldZoom: state.zoom, newZoom, linkBoth,
    });
    state.precisionPanAX = solved.panAX;
    state.precisionPanAY = solved.panAY;
    state.precisionPanBX = solved.panBX;
    state.precisionPanBY = solved.panBY;
    state.zoom = newZoom;
}

function compositionDimensions(state) {
    const images = currentImages(state);
    const width = images.a?.naturalWidth || 1;
    const height = images.a?.naturalHeight || 1;
    if (state.mode === "Side by Side") {
        if (state.sbsStyle === "Precision Align") return { width, height };
        const factor = 2 - clamp(state.sbsOverlap, 0, 90) / 100;
        return state.orientation === "Vertical"
            ? { width: width * factor, height }
            : { width, height: height * factor };
    }
    return { width, height };
}

function drawBackground(ctx, width, height, state) {
    const bg = backgroundStyle(state);
    if (state.background === "Transparent") {
        ctx.clearRect(0, 0, width, height);
    } else if (state.background === "Gradient") {
        const gradient = ctx.createRadialGradient(width * 0.5, height * 0.35, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.75);
        gradient.addColorStop(0, "#24344b");
        gradient.addColorStop(0.48, "#10151e");
        gradient.addColorStop(1, "#030507");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else if (state.background === "Studio Grey") {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#2f333a");
        gradient.addColorStop(1, "#171a1f");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = bg.color;
        ctx.fillRect(0, 0, width, height);
    }

    if (state.background === "Checker") {
        const size = Math.max(8, Math.round(Math.min(width, height) / 32));
        ctx.fillStyle = "#181a1e";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = "#252830";
        for (let y = 0; y < height; y += size) {
            for (let x = 0; x < width; x += size) {
                if (((x / size) + (y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
            }
        }
    } else if (state.background === "Navy Grid") {
        const size = Math.max(16, Math.round(Math.min(width, height) / 24));
        ctx.fillStyle = "#071426";
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = "#173251";
        ctx.lineWidth = 1;
        for (let x = 0; x <= width; x += size) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 0; y <= height; y += size) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
    }
}

function differenceFilter(style) {
    if (style === "Heatmap") return "grayscale(1) contrast(260%) sepia(1) saturate(850%) hue-rotate(300deg)";
    if (style === "High Contrast") return "grayscale(1) contrast(430%) brightness(175%)";
    if (style === "Edges") return "grayscale(1) contrast(700%) invert(1)";
    return "none";
}

function effectBlend(style, fallback = "source-over") {
    if (style === "Multiply") return "multiply";
    if (style === "Screen") return "screen";
    return fallback;
}

function isDifferenceMapStyle(style) {
    return ["Difference", "Heatmap", "High Contrast", "Edges"].includes(style);
}

function effectImageFor(state, fallbackB) {
    if (state.peekOriginal) return fallbackB;
    return isDifferenceMapStyle(state.differenceStyle) ? (state.d || fallbackB) : fallbackB;
}

function drawEffectPanel(ctx, state, a, b, x, y, width, height) {
    const style = state.differenceStyle || "Normal";
    if (style === "Normal") {
        ctx.drawImage(b, x, y, width, height);
        return;
    }
    if (isDifferenceMapStyle(style)) {
        ctx.save();
        ctx.globalAlpha = clamp(state.opacity, 0, 100) / 100;
        ctx.filter = differenceFilter(style);
        if (state.d) {
            ctx.globalCompositeOperation = "source-over";
            ctx.drawImage(state.d, x, y, width, height);
        } else {
            ctx.drawImage(a, x, y, width, height);
            ctx.globalCompositeOperation = "difference";
            ctx.drawImage(b, x, y, width, height);
        }
        ctx.restore();
        return;
    }
    ctx.save();
    ctx.drawImage(a, x, y, width, height);
    ctx.globalAlpha = clamp(state.opacity, 0, 100) / 100;
    ctx.globalCompositeOperation = effectBlend(style);
    ctx.drawImage(b, x, y, width, height);
    ctx.restore();
}

function drawComposition(ctx, state, x, y, width, height, options = {}) {
    const { includeLabels = false, includeGuide = true } = options;
    const { a, b, labelA, labelB } = currentImages(state);
    if (!a) return;

    if (!b) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.clip();
        ctx.drawImage(a, x, y, width, height);
        ctx.restore();
        return;
    }

    const mode = state.mode;
    const savedStyle = state.differenceStyle;
    if (state.peekOriginal) state.differenceStyle = "Normal";
    const vertical = state.orientation === "Vertical";
    const position = clamp(state.position, 0, 100) / 100;
    const opacity = clamp(state.opacity, 0, 100) / 100;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();

    if (mode === "A Only") {
        ctx.drawImage(a, x, y, width, height);
    } else if (mode === "B Only") {
        ctx.drawImage(b, x, y, width, height);
    } else if (mode === "Side by Side" && state.sbsStyle === "Precision Align") {
        const halves = vertical
            ? [{ x, y, width: width / 2, height }, { x: x + width / 2, y, width: width / 2, height }]
            : [{ x, y, width, height: height / 2 }, { x, y: y + height / 2, width, height: height / 2 }];
        const precisionGeometry = (img, half, panX, panY) => {
            const fit = Math.min(half.width / Math.max(1, img.naturalWidth), half.height / Math.max(1, img.naturalHeight));
            const scale = fit * Math.max(.005, state.zoom || 1);
            const width = img.naturalWidth * scale;
            const height = img.naturalHeight * scale;
            return {
                x: half.x + half.width / 2 - width / 2 + Number(panX || 0) * scale,
                y: half.y + half.height / 2 - height / 2 + Number(panY || 0) * scale,
                width,
                height,
            };
        };
        const drawPrecisionImage = (img, half, panX, panY) => {
            const g = precisionGeometry(img, half, panX, panY);
            ctx.drawImage(img, g.x, g.y, g.width, g.height);
        };
        const drawPrecisionPanelLayer = (img, half, panX, panY, panelImage) => {
            const fit = Math.min(
                half.width / Math.max(1, img.naturalWidth),
                half.height / Math.max(1, img.naturalHeight),
            );
            const panelFit = Math.min(
                half.width / Math.max(1, panelImage.naturalWidth),
                half.height / Math.max(1, panelImage.naturalHeight),
            );
            const zoom = Math.max(.005, state.zoom || 1);
            const scale = fit * zoom;
            const width = img.naturalWidth * scale;
            const height = img.naturalHeight * scale;
            const screenX = Number(panX || 0) * panelFit * zoom;
            const screenY = Number(panY || 0) * panelFit * zoom;
            ctx.drawImage(
                img,
                half.x + half.width / 2 - width / 2 + screenX,
                half.y + half.height / 2 - height / 2 + screenY,
                width,
                height,
            );
        };
        ctx.save();
        ctx.beginPath(); ctx.rect(halves[0].x, halves[0].y, halves[0].width, halves[0].height); ctx.clip();
        drawPrecisionImage(a, halves[0], state.precisionPanAX, state.precisionPanAY);
        ctx.restore();

        ctx.save();
        ctx.beginPath(); ctx.rect(halves[1].x, halves[1].y, halves[1].width, halves[1].height); ctx.clip();
        if (state.differenceStyle === "Normal") {
            drawPrecisionImage(b, halves[1], state.precisionPanBX, state.precisionPanBY);
        } else if (isDifferenceMapStyle(state.differenceStyle)) {
            ctx.globalAlpha = opacity;
            ctx.filter = differenceFilter(state.differenceStyle);
            if (state.d) {
                ctx.globalCompositeOperation = "source-over";
                drawPrecisionPanelLayer(
                    state.d, halves[1],
                    state.precisionPanBX, state.precisionPanBY,
                    b,
                );
            } else {
                drawPrecisionPanelLayer(
                    a, halves[1],
                    state.precisionPanBX, state.precisionPanBY,
                    b,
                );
                ctx.globalCompositeOperation = "difference";
                drawPrecisionImage(b, halves[1], state.precisionPanBX, state.precisionPanBY);
            }
        } else {
            // The reference/base and effect image are one movable B-panel
            // composite. With Link Move off, moving B no longer leaves the
            // overlay base behind.
            drawPrecisionPanelLayer(
                a, halves[1],
                state.precisionPanBX, state.precisionPanBY,
                b,
            );
            ctx.globalAlpha = opacity;
            ctx.globalCompositeOperation = effectBlend(state.differenceStyle);
            drawPrecisionImage(b, halves[1], state.precisionPanBX, state.precisionPanBY);
        }
        ctx.restore();
    } else if (mode === "Side by Side") {
            const overlap = clamp(state.sbsOverlap, 0, 90) / 100;
            const factor = 2 - overlap;
            if (vertical) {
                const imageWidth = width / factor;
                const separation = imageWidth * (1 - overlap);
                ctx.drawImage(a, x, y, imageWidth, height);
                drawEffectPanel(ctx, state, a, b, x + separation, y, imageWidth, height);
            } else {
                const imageHeight = height / factor;
                const separation = imageHeight * (1 - overlap);
                ctx.drawImage(a, x, y, width, imageHeight);
                drawEffectPanel(ctx, state, a, b, x, y + separation, width, imageHeight);
            }
    } else if (mode === "Overlay") {
        ctx.drawImage(a, x, y, width, height);
        ctx.globalAlpha = opacity;
        if (isDifferenceMapStyle(state.differenceStyle)) {
            ctx.filter = differenceFilter(state.differenceStyle);
            if (state.d) {
                ctx.globalCompositeOperation = "screen";
                ctx.drawImage(state.d, x, y, width, height);
            } else {
                ctx.globalCompositeOperation = "difference";
                ctx.drawImage(b, x, y, width, height);
            }
        } else {
            ctx.globalCompositeOperation = effectBlend(state.differenceStyle);
            ctx.drawImage(b, x, y, width, height);
        }
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    } else if (mode === "Difference") {
        // Difference is always an actual difference-map view. The style only
        // changes how that map is coloured; it no longer turns Overlay into
        // another copy of Difference.
        ctx.filter = differenceFilter(state.differenceStyle === "Normal" ? "Difference" : state.differenceStyle);
        if (state.d) {
            ctx.globalAlpha = Math.max(0.04, 0.16 * (1 - opacity));
            ctx.drawImage(a, x, y, width, height);
            ctx.globalAlpha = Math.max(0.08, opacity);
            ctx.globalCompositeOperation = "screen";
            ctx.drawImage(state.d, x, y, width, height);
        } else {
            ctx.globalAlpha = Math.max(0.08, opacity);
            ctx.drawImage(a, x, y, width, height);
            ctx.globalCompositeOperation = "difference";
            ctx.drawImage(b, x, y, width, height);
        }
        ctx.filter = "none";
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    } else if (mode === "Blink") {
        if (state.blinkPhase) drawEffectPanel(ctx, state, a, b, x, y, width, height);
        else ctx.drawImage(a, x, y, width, height);
    } else {
        ctx.drawImage(a, x, y, width, height);
        ctx.save();
        ctx.beginPath();
        if (vertical) ctx.rect(x + width * position, y, width * (1 - position), height);
        else ctx.rect(x, y + height * position, width, height * (1 - position));
        ctx.clip();
        drawEffectPanel(ctx, state, a, b, x, y, width, height);
        ctx.restore();

        if (includeGuide) {
            const theme = themeFor(state);
            ctx.globalAlpha = clamp(state.lineOpacity, 0, 100) / 100;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = Math.max(2, Math.min(width, height) / 350);
            ctx.shadowColor = "#000";
            ctx.shadowBlur = 8;
            ctx.beginPath();
            if (vertical) {
                const lineX = x + width * position;
                ctx.moveTo(lineX, y);
                ctx.lineTo(lineX, y + height);
            } else {
                const lineY = y + height * position;
                ctx.moveTo(x, lineY);
                ctx.lineTo(x + width, lineY);
            }
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;

            if (state.guide) {
                const cx = vertical ? x + width * position : x + width / 2;
                const cy = vertical ? y + height / 2 : y + height * position;
                const radius = Math.max(9, Math.min(width, height) / 36);
                ctx.fillStyle = theme.accent;
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = "#07111d";
                ctx.font = `700 ${Math.max(12, radius)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(vertical ? "↔" : "↕", cx, cy + 1);
            }
        }
    }

    if (includeLabels) {
        const fontSize = Math.max(12, Math.min(28, Math.min(width, height) / 24));
        ctx.font = `700 ${fontSize}px sans-serif`;
        ctx.textBaseline = "middle";
        const padding = fontSize * 0.55;
        const chipH = fontSize * 1.8;
        const labels = mode === "Side by Side" && !vertical
            ? [
                { text: labelA, px: x + padding, py: y + padding, align: "left" },
                { text: labelB, px: x + padding, py: y + height / 2 + padding, align: "left" },
            ]
            : [
                { text: labelA, px: x + padding, py: y + padding, align: "left" },
                { text: labelB, px: x + width - padding, py: y + padding, align: "right" },
            ];
        for (const item of labels) {
            const textW = ctx.measureText(item.text).width;
            const chipW = Math.min(width * 0.42, textW + padding * 1.2);
            const chipX = item.align === "right" ? item.px - chipW : item.px;
            ctx.fillStyle = "rgba(0,0,0,.66)";
            ctx.fillRect(chipX, item.py, chipW, chipH);
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = item.align;
            ctx.fillText(item.text, item.px, item.py + chipH / 2);
        }
    }

    ctx.restore();
    state.differenceStyle = savedStyle;
}

function exportCanvas(state) {
    const dims = compositionDimensions(state);
    const width = Math.max(1, Math.round(dims.width));
    const height = Math.max(1, Math.round(dims.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    drawBackground(ctx, width, height, state);
    drawComposition(ctx, state, 0, 0, width, height, { includeLabels: state.showLabels, includeGuide: true });
    return canvas;
}

function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG could not be created.")), "image/png");
    });
}

async function copyCurrentView(state) {
    try {
        if (!state.a) throw new Error("Connect image A and run the node first.");
        const blob = await canvasBlob(exportCanvas(state));
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
            throw new Error("Image clipboard is not available in this frontend.");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        notify("Current comparison copied as PNG.");
    } catch (error) {
        notify(error?.message || String(error), "error");
    }
}

async function saveCurrentView(state) {
    try {
        if (!state.a) throw new Error("Connect image A and run the node first.");
        const blob = await canvasBlob(exportCanvas(state));
        const form = new FormData();
        form.append("filename_prefix", "NovoLokoCompare");
        form.append("metadata", JSON.stringify(state.info?.png_metadata || {}));
        form.append("image", blob, "nova_compare.png");
        const response = await api.fetchApi("/nova_compare/save", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Comparison could not be saved.");
        state.node._novaCompareLastSavedFilename = data.filename;
        notify(`Saved ${data.filename}`);
    } catch (error) {
        notify(error?.message || String(error), "error");
    }
}

async function openCompareFolder(state, reveal = false) {
    try {
        const response = await api.fetchApi("/nova_compare/open_folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reveal,
                filename: reveal ? String(state.node?._novaCompareLastSavedFilename || "") : "",
            }),
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Compare folder could not be opened.");
    } catch (error) {
        notify(error?.message || String(error), "error");
    }
}

function updateControls(ui, state) {
    ui.mode.value = state.mode;
    ui.orientation.value = state.orientation;
    ui.position.value = String(state.position);
    ui.opacity.value = String(state.opacity);
    ui.lineOpacity.value = String(state.lineOpacity);
    ui.blink.value = String(state.blinkMs);
    ui.sbsOverlap.value = String(state.sbsOverlap);
    ui.theme.value = state.theme;
    ui.buttonColor.value = state.buttonColor;
    ui.textColor.value = state.textColor;
    ui.buttonStyle.value = state.buttonStyle;
    ui.background.value = state.background;
    ui.differenceStyle.value = state.differenceStyle;
    ui.positionValue.textContent = `${Math.round(state.position)}%`;
    ui.opacityValue.textContent = `${Math.round(state.opacity)}%`;
    ui.lineValue.textContent = `${Math.round(state.lineOpacity)}%`;
    ui.blinkValue.textContent = state.blinkMs >= 1000 ? `${(state.blinkMs / 1000).toFixed(1)}s` : `${Math.round(state.blinkMs)}ms`;
    ui.sbsOverlapValue.textContent = `${Math.round(state.sbsOverlap)}%`;
    ui.guide.textContent = `Guide ${state.guide ? "On" : "Off"}`;
    ui.followMouse.textContent = `Follow ${state.followMouse ? "On" : "Off"}`;
    ui.sbsStyle.textContent = `SBS: ${state.sbsStyle === "Precision Align" ? "Precision" : "Native"}`;
    ui.linkPan.textContent = state.controlHeld ? "SEAM LOCK: CTRL" : `Link Move ${state.precisionLinked ? "On" : "Off"}`;
    ui.effectCycle.textContent = `Layer: ${state.differenceStyle}`;
    ui.resetFitChange.textContent = `Reset Change ${state.resetFitOnChange ? "On" : "Off"}`;
    ui.sbsStyle.disabled = state.mode !== "Side by Side";
    ui.swap.textContent = state.swapped ? "Swap: B/A" : "Swap: A/B";
    ui.sources.textContent = `Sources ${state.showSources ? "On" : "Off"}`;
    ui.labels.textContent = `Labels ${state.showLabels ? "On" : "Off"}`;
    ui.position.disabled = state.mode !== "Split";
    ui.lineOpacity.disabled = state.mode !== "Split";
    ui.opacity.disabled = !["Split", "Side by Side", "Overlay", "Difference", "Blink"].includes(state.mode);
    ui.blink.disabled = state.mode !== "Blink";
    ui.sbsOverlap.disabled = state.mode !== "Side by Side";
    ui.differenceStyle.disabled = !["Split", "Side by Side", "Overlay", "Difference", "Blink"].includes(state.mode);
    ui.linkPan.disabled = !(state.mode === "Side by Side" && state.sbsStyle === "Precision Align");

    const active = (button, on) => styleCompareButton(button, state, on);
    active(ui.guide, state.guide);
    active(ui.followMouse, state.followMouse);
    active(ui.sbsStyle, state.sbsStyle !== "Native");
    active(ui.linkPan, state.precisionLinked);
    active(ui.effectCycle, state.differenceStyle !== "Normal");
    active(ui.resetFitChange, state.resetFitOnChange);
    active(ui.swap, state.swapped);
    active(ui.sources, state.showSources);
    active(ui.labels, state.showLabels);
}

function createControlUI(state, compact = false) {
    const root = document.createElement("div");
    root.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;box-sizing:border-box";

    const main = document.createElement("div");
    main.style.cssText = "display:flex;align-items:center;gap:5px;flex-wrap:wrap";
    const mode = makeSelect(MODES, state.mode, "Compare mode • Q/W/E/T hotkeys in full screen", compact);
    const orientation = makeSelect(ORIENTATIONS, state.orientation, "Orientation • H toggles in full screen", compact);
    const guide = makeButton("Guide On", "Show or hide the split guide • G");
    const followMouse = makeButton("Follow Off", "Move the split line with the pointer • N");
    const sbsStyle = makeButton("SBS: Native", "Cycle Native and Precision Align • W");
    const linkPan = makeButton("Link Move Off", "Precision Align seam-lock • L toggles • hold Ctrl for temporary lock");
    const effectCycle = makeButton("Layer: Normal", "Cycle B-layer style for Split, SBS, Overlay and Blink • K");
    const resetFitChange = makeButton("Reset Change On", "Reset to Fit when input images change");
    const swap = makeButton("Swap: A/B", "Swap images A and B atomically • X");
    const centre = makeButton("50/50", "Centre split or reset Precision alignment • C");
    const fullscreen = makeButton("Full Screen", "Open full-screen comparison");
    const copy = makeButton("Copy", "Copy the current comparison as PNG");
    const save = makeButton("Save", "Save current comparison to output/NovoLokoCompare");
    const folder = makeButton("Saved Folder", "Open the NovoLokoCompare output folder");
    const sources = makeButton("Sources Off", "Show or hide A, B and Difference thumbnails below the main preview");
    const labels = makeButton("Labels On", "Show or hide A/B labels in the comparison and exported image");
    if (compact) {
        // Node preview intentionally stays light: Native SBS only. Precision,
        // Follow Mouse and linked movement belong to the full-screen studio.
        main.append(mode, orientation, guide, followMouse, effectCycle, resetFitChange, swap, centre, labels, fullscreen, copy, save, folder);
        sbsStyle.style.display = "none";
        linkPan.style.display = "none";
    } else {
        main.append(mode, orientation, guide, followMouse, sbsStyle, linkPan, effectCycle, resetFitChange, swap, centre, sources, labels, fullscreen, copy, save, folder);
    }

    const advanced = document.createElement("div");
    advanced.style.cssText = "display:grid;grid-template-columns:auto minmax(70px,1fr) auto auto minmax(70px,1fr) auto;gap:3px 6px;align-items:center;font:11px/1 sans-serif";
    const position = makeRange(0, 100, state.position, "Split position");
    const opacity = makeRange(0, 100, state.opacity, "Overlay / Difference strength");
    const lineOpacity = makeRange(0, 100, state.lineOpacity, "Split line transparency");
    const blink = makeRange(100, 10000, state.blinkMs, "Blink speed from 0.1 to 10 seconds");
    const sbsOverlap = makeRange(0, 90, state.sbsOverlap, "Side-by-side image overlap for precise comparison");
    const positionValue = document.createElement("span");
    const opacityValue = document.createElement("span");
    const lineValue = document.createElement("span");
    const blinkValue = document.createElement("span");
    const sbsOverlapValue = document.createElement("span");
    const addSlider = (label, slider, value) => {
        const text = document.createElement("span");
        text.textContent = label;
        advanced.append(text, slider, value);
    };
    addSlider("Split", position, positionValue);
    addSlider("Blend", opacity, opacityValue);
    addSlider("Line", lineOpacity, lineValue);
    addSlider("Blink", blink, blinkValue);
    addSlider("SBS overlap", sbsOverlap, sbsOverlapValue);

    const styleRow = document.createElement("div");
    styleRow.style.cssText = "display:flex;align-items:center;gap:5px;flex-wrap:wrap;font:11px/1 sans-serif";
    const theme = makeSelect(Object.keys(THEMES), state.theme, "Colour theme", compact);
    const buttonColor = makeSelect(Object.keys(BUTTON_COLORS), state.buttonColor, "Button colour", compact);
    const textColor = makeSelect(Object.keys(TEXT_COLORS), state.textColor, "Interface text colour", compact);
    const buttonStyle = makeSelect(BUTTON_STYLES, state.buttonStyle, "Button style", compact);
    const background = makeSelect(BACKGROUNDS, state.background, "Preview background", compact);
    const differenceStyle = makeSelect(DIFFERENCE_STYLES, state.differenceStyle, "Effect for Split, SBS, Overlay and Blink • K", compact);
    const reset = makeButton("Reset", "Reset comparison controls");
    styleRow.append(
        document.createTextNode("Theme"), theme,
        document.createTextNode("Buttons"), buttonColor,
        document.createTextNode("Text"), textColor,
        document.createTextNode("Style"), buttonStyle,
        document.createTextNode("Background"), background,
        document.createTextNode("B Layer"), differenceStyle,
        reset,
    );

    if (compact) {
        const details = document.createElement("details");
        details.style.cssText = "width:100%";
        const summary = document.createElement("summary");
        summary.textContent = compact ? "Node appearance" : "Compare controls";
        summary.style.cssText = "cursor:pointer;font:600 11px/1.2 sans-serif;padding:2px 0";
        details.append(summary, advanced, styleRow);
        root.append(main, details);
    } else {
        root.append(main, advanced, styleRow);
    }

    return {
        root,
        main,
        mode,
        orientation,
        guide,
        followMouse,
        sbsStyle,
        linkPan,
        effectCycle,
        resetFitChange,
        swap,
        centre,
        fullscreen,
        copy,
        save,
        folder,
        sources,
        labels,
        position,
        opacity,
        lineOpacity,
        blink,
        sbsOverlap,
        positionValue,
        opacityValue,
        lineValue,
        blinkValue,
        sbsOverlapValue,
        theme,
        buttonColor,
        textColor,
        buttonStyle,
        background,
        differenceStyle,
        reset,
    };
}

function bindControls(ui, state, callbacks = {}) {
    const changed = () => {
        persistState(state);
        updateControls(ui, state);
        callbacks.render?.();
    };
    ui.mode.addEventListener("change", () => {
        state.mode = ui.mode.value === "Difference" ? "Overlay" : ui.mode.value;
        changed();
    });
    ui.orientation.addEventListener("change", () => { state.orientation = ui.orientation.value; changed(); });
    ui.guide.addEventListener("click", () => { state.guide = !state.guide; changed(); });
    ui.followMouse.addEventListener("click", () => { state.followMouse = !state.followMouse; if (state.followMouse) state.mode = "Split"; changed(); });
    ui.sbsStyle.addEventListener("click", () => {
        state.sbsStyle = state.sbsStyle === "Native" ? "Precision Align" : "Native";
        state.mode = "Side by Side";
        changed();
        callbacks.fit?.();
    });
    ui.linkPan.addEventListener("click", () => { state.precisionLinked = !state.precisionLinked; changed(); });
    ui.effectCycle.addEventListener("click", () => {
        const index = DIFFERENCE_STYLES.indexOf(state.differenceStyle);
        state.differenceStyle = DIFFERENCE_STYLES[(index + 1) % DIFFERENCE_STYLES.length];
        changed();
    });
    ui.resetFitChange.addEventListener("click", () => { state.resetFitOnChange = !state.resetFitOnChange; changed(); });
    ui.swap.addEventListener("click", () => {
        if (callbacks.swap) callbacks.swap();
        else { state.blinkPhase = 0; state.swapped = !state.swapped; changed(); }
    });
    ui.sources.addEventListener("click", () => { state.showSources = !state.showSources; changed(); });
    ui.labels.addEventListener("click", () => { state.showLabels = !state.showLabels; changed(); });
    ui.centre.addEventListener("click", () => { state.position = 50; state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0; changed(); });
    ui.position.addEventListener("input", () => { state.position = Number(ui.position.value); changed(); });
    ui.opacity.addEventListener("input", () => { state.opacity = Number(ui.opacity.value); changed(); });
    ui.lineOpacity.addEventListener("input", () => { state.lineOpacity = Number(ui.lineOpacity.value); changed(); });
    ui.blink.addEventListener("input", () => { state.blinkMs = Number(ui.blink.value); changed(); });
    ui.sbsOverlap.addEventListener("input", () => { state.sbsOverlap = Number(ui.sbsOverlap.value); changed(); });
    ui.theme.addEventListener("change", () => { state.theme = ui.theme.value; changed(); });
    ui.buttonColor.addEventListener("change", () => { state.buttonColor = ui.buttonColor.value; changed(); });
    ui.textColor.addEventListener("change", () => { state.textColor = ui.textColor.value; changed(); });
    ui.buttonStyle.addEventListener("change", () => { state.buttonStyle = ui.buttonStyle.value; changed(); });
    ui.background.addEventListener("change", () => { state.background = ui.background.value; changed(); });
    ui.differenceStyle.addEventListener("change", () => { state.differenceStyle = ui.differenceStyle.value; changed(); });
    ui.reset.addEventListener("click", () => {
        Object.assign(state, { ...DEFAULTS, node: state.node, a: state.a, b: state.b, d: state.d, info: state.info, blinkPhase: 0 });
        changed();
        callbacks.fit?.();
    });
    ui.copy.addEventListener("click", () => copyCurrentView(state));
    ui.save.addEventListener("click", () => saveCurrentView(state));
    ui.folder.addEventListener("click", () => openCompareFolder(state, Boolean(state.node?._novaCompareLastSavedFilename)));
    ui.fullscreen.addEventListener("click", () => callbacks.fullscreen?.());
    updateControls(ui, state);
}

function fittedCompositionRect(canvas, state, zoom = 1, panX = 0, panY = 0) {
    const rect = canvas.getBoundingClientRect();
    const dims = compositionDimensions(state);
    const scale = Math.min(
        Math.max(1, rect.width - 24) / dims.width,
        Math.max(1, rect.height - 24) / dims.height,
    ) * zoom;
    const width = dims.width * scale;
    const height = dims.height * scale;
    return {
        left: rect.left + (rect.width - width) / 2 + panX,
        top: rect.top + (rect.height - height) / 2 + panY,
        width,
        height,
        viewport: rect,
    };
}

function drawFittedCanvas(canvas, state) {
    const { cssWidth, cssHeight, dpr } = nodePreviewMetrics(canvas);
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
    });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    drawBackground(ctx, cssWidth, cssHeight, state);
    const dims = compositionDimensions(state);
    const scale = Math.min(cssWidth / dims.width, cssHeight / dims.height);
    const drawW = dims.width * scale;
    const drawH = dims.height * scale;
    drawComposition(ctx, state, (cssWidth - drawW) / 2, (cssHeight - drawH) / 2, drawW, drawH, { includeLabels: false, includeGuide: true });
}

let fullViewer = null;

function ensureFullViewer() {
    if (fullViewer) return fullViewer;

    const overlay = document.createElement("div");
    overlay.style.cssText = "display:none;position:fixed;inset:0;z-index:2147483645;color:#fff;user-select:none";

    const toolbar = document.createElement("div");
    toolbar.style.cssText = [
        "position:absolute", "left:0", "right:0", "top:0", "z-index:12",
        "display:flex", "gap:7px", "align-items:center", "flex-wrap:wrap",
        "padding:7px 12px", "border-bottom:1px solid rgba(255,255,255,.15)"
    ].join(";");

    const title = document.createElement("strong");
    title.style.cssText = "flex:1 1 280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    title.textContent = "NovoLoko Compare Studio";

    const addFilesButton = makeButton("Add Files", "Load one image into Target, or two images into A and B • I");
    const targetButton = makeButton("Target: A", "Choose whether a single file or pasted image replaces A or B");
    const restoreButton = makeButton("Node Images", "Restore the images supplied by the ComfyUI node");
    const hotkeysButton = makeButton("?", "Show keyboard and mouse shortcuts • ?");
    const hideUI = makeButton("Hide UI", "Hide controls; right-click restores them • U");
    const fitWidthButton = makeButton("Width", "Fit width • 2");
    const fitHeightButton = makeButton("Height", "Fit height • 3");
    const actualPixels = makeButton("1:1", "Show one source pixel per screen pixel • 1");
    const zoomButton = makeButton("100%", "Enter an exact source-image zoom percentage");
    const interpolationButton = makeButton("Smooth", "Toggle Smooth/Pixel interpolation • M");
    const close = makeButton("Close", "Close full-screen comparison • Esc");

    const state = {
        ...loadGlobal(),
        node: null,
        a: null,
        b: null,
        d: null,
        info: {},
        blinkPhase: 0,
        zoom: 1,
        panX: 0,
        panY: 0,
        dragging: false,
        lineDragging: false,
        startX: 0,
        startY: 0,
        startPanX: 0,
        startPanY: 0,
        blinkTimer: 0,
        uiHidden: false,
        precisionLinked: Boolean(loadGlobal().precisionLinked),
        precisionMoveTogether: false,
        galleryTarget: "A",
        nodeSnapshot: null,
        swapToken: 0,
        peekOriginal: false,
        controlHeld: false,
        pixelated: (() => {
            try { return localStorage.getItem("nova_compare_pixelated") === "1"; }
            catch (_) { return false; }
        })(),
    };

    const controls = createControlUI(state, false);
    controls.root.style.flex = "0 1 auto";
    controls.fullscreen.remove();
    controls.sources.remove();
    controls.mode.remove();
    controls.orientation.remove();

    const modeGroup = document.createElement("div");
    modeGroup.style.cssText = "display:flex;gap:3px;flex-wrap:wrap;padding:2px;border-radius:7px;background:rgba(255,255,255,.08)";
    const modeButtons = {};
    const modeHotkeys = { "Split":"Q", "Side by Side":"W", "Overlay":"E", "Blink":"T", "A Only":"A", "B Only":"Z" };
    const modeTooltips = {
        "Split": "Draggable reveal line • Q",
        "Side by Side": "Native or Precision Align comparison • W",
        "Overlay": "Blend the B Layer over A • E",
        "Blink": "Alternate A and B • T",
        "A Only": "Show image A only • A",
        "B Only": "Show image B only • Z",
    };
    for (const mode of MODES) {
        const button = makeButton(mode, modeTooltips[mode] || `Switch to ${mode} • ${modeHotkeys[mode] || ""}`);
        button.style.minWidth = mode === "Side by Side" ? "92px" : "62px";
        modeButtons[mode] = button;
        modeGroup.append(button);
    }

    const orientationGroup = document.createElement("div");
    orientationGroup.style.cssText = "display:flex;gap:3px;padding:2px;border-radius:7px;background:rgba(255,255,255,.08)";
    const orientationButtons = {};
    for (const orientation of ORIENTATIONS) {
        const button = makeButton(orientation, `${orientation} layout • H toggles`);
        orientationButtons[orientation] = button;
        orientationGroup.append(button);
    }

    controls.main.prepend(orientationGroup);
    controls.main.prepend(modeGroup);
    toolbar.append(
        title, controls.root,
        addFilesButton, targetButton, restoreButton, hotkeysButton,
        fitWidthButton, fitHeightButton, actualPixels, zoomButton, interpolationButton, hideUI, close,
    );

    const infoBar = document.createElement("div");
    infoBar.style.cssText = [
        "position:absolute", "left:0", "right:0", "z-index:11", "display:flex",
        "justify-content:space-between", "gap:12px", "padding:7px 16px",
        "box-sizing:border-box", "background:rgba(5,7,10,.88)",
        "border-bottom:1px solid rgba(255,255,255,.12)", "pointer-events:none"
    ].join(";");

    const infoA = document.createElement("div");
    const infoB = document.createElement("div");
    for (const item of [infoA, infoB]) {
        item.style.cssText = [
            "max-width:48%", "overflow:hidden", "text-overflow:ellipsis", "white-space:nowrap",
            "padding:5px 9px", "border-radius:6px", "font:700 12px/1 sans-serif",
            "background:rgba(255,255,255,.08)", "border:1px solid rgba(255,255,255,.15)"
        ].join(";");
    }
    infoB.style.textAlign = "right";
    infoBar.append(infoA, infoB);

    // External files are intentionally limited to the two active slots.
    // NovoLoko no longer builds an in-memory folder gallery.

    const helpPanel = document.createElement("div");
    helpPanel.style.cssText = [
        "display:none", "position:absolute", "left:50%", "top:50%", "transform:translate(-50%,-50%)", "z-index:40",
        "max-width:min(760px,90vw)", "padding:18px 22px", "border-radius:12px", "background:rgba(5,8,13,.98)",
        "border:1px solid rgba(255,255,255,.2)", "box-shadow:0 20px 70px rgba(0,0,0,.7)", "font:14px/1.55 sans-serif", "white-space:pre-line"
    ].join(";");
    helpPanel.textContent = "Q Split   W Side by Side   E Overlay   T Blink\nH Orientation   X Swap   G Guide   N Follow Mouse   K Layer Style\nL Link Move   C Centre/Align Reset   F Fit   1 Actual Pixels   2 Width   3 Height\nM Smooth/Pixel   U Hide UI   I Add Files\nCtrl+Wheel locks both Precision images to mirrored cursor anchors\nCtrl+Left/Middle drag moves both images together\nDrop up to two files on the viewer • Paste an image to the selected Target\nHold Alt to temporarily peek Original B without the selected layer style";

    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*"; fileInput.multiple = true; fileInput.style.display = "none";

    const viewport = document.createElement("div");
    viewport.style.cssText = "position:absolute;left:0;right:0;bottom:0;overflow:hidden;cursor:crosshair;touch-action:none";
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;touch-action:none";
    const backCanvas = document.createElement("canvas");
    viewport.append(canvas);
    overlay.append(toolbar, infoBar, viewport, helpPanel, fileInput);
    document.body.append(overlay);

    function setButtonActive(button, active) {
        styleCompareButton(button, state, active);
        button.style.outline = active ? "1px solid rgba(255,255,255,.5)" : "none";
    }

    function updateQuickButtons() {
        const single = !hasSecondImage(state);
        modeGroup.style.display = single ? "none" : "flex";
        orientationGroup.style.display = single ? "none" : "flex";

        for (const control of [
            controls.guide,
            controls.followMouse,
            controls.sbsStyle,
            controls.linkPan,
            controls.effectCycle,
            controls.swap,
            controls.centre,
            controls.sources,
        ]) {
            control.style.display = single ? "none" : "";
        }

        for (const [mode, button] of Object.entries(modeButtons)) {
            setButtonActive(button, state.mode === mode);
        }
        for (const [orientation, button] of Object.entries(orientationButtons)) {
            setButtonActive(button, state.orientation === orientation);
            const useful = !single && (state.mode === "Split" || state.mode === "Side by Side");
            button.disabled = !useful;
            button.style.opacity = useful ? "1" : ".45";
        }
    }

    function displayDimensions() {
        const swapped = Boolean(state.swapped);
        return {
            a: swapped
                ? `${state.info?.b_width || state.b?.naturalWidth || "?"}×${state.info?.b_height || state.b?.naturalHeight || "?"}`
                : `${state.info?.a_width || state.a?.naturalWidth || "?"}×${state.info?.a_height || state.a?.naturalHeight || "?"}`,
            b: swapped
                ? `${state.info?.a_width || state.a?.naturalWidth || "?"}×${state.info?.a_height || state.a?.naturalHeight || "?"}`
                : `${state.info?.b_width || state.b?.naturalWidth || "?"}×${state.info?.b_height || state.b?.naturalHeight || "?"}`,
        };
    }

    function updateInfoBar() {
        const images = currentImages(state);
        const dims = displayDimensions();
        const single = !hasSecondImage(state);
        infoA.textContent = `${images.labelA}  •  ${dims.a}`;
        infoB.textContent = single ? "" : `${images.labelB}  •  ${dims.b}`;
        infoA.style.maxWidth = single ? "100%" : "48%";
        infoA.style.flex = single ? "1 1 100%" : "";
        infoB.style.display = single ? "none" : "block";
        infoBar.style.justifyContent = single ? "center" : "space-between";
        infoBar.style.display = state.showLabels && !state.uiHidden ? "flex" : "none";
    }

    function updateLayout() {
        const toolbarHeight = state.uiHidden ? 0 : Math.max(0, toolbar.offsetHeight || 0);
        infoBar.style.top = `${toolbarHeight}px`;
        const infoHeight = state.uiHidden || !state.showLabels ? 0 : Math.max(0, infoBar.offsetHeight || 0);
        viewport.style.top = `${toolbarHeight + infoHeight}px`;
    }

    function performSwap() {
        if (!hasSecondImage(state)) return;
        clearTimeout(state.blinkTimer);
        state.blinkTimer = 0;
        state.blinkPhase = 0;
        state.swapped = !state.swapped;
        state.swapToken += 1;
        persistState(state);
        render();
    }

    function render() {
        clearTimeout(state.blinkTimer);
        state.blinkTimer = 0;

        const rect = viewport.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.floor(rect.width));
        const cssHeight = Math.max(1, Math.floor(rect.height));
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
        const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));
        if (backCanvas.width !== pixelWidth || backCanvas.height !== pixelHeight) {
            backCanvas.width = pixelWidth;
            backCanvas.height = pixelHeight;
        }
        const back = backCanvas.getContext("2d", { alpha: false, desynchronized: true });
        back.setTransform(dpr, 0, 0, dpr, 0, 0);
        back.imageSmoothingEnabled = !state.pixelated;
        back.imageSmoothingQuality = state.pixelated ? "low" : "high";
        drawBackground(back, cssWidth, cssHeight, state);

        if (state.a) {
            if (state.mode === "Side by Side" && state.sbsStyle === "Precision Align" && hasSecondImage(state)) {
                drawComposition(back, state, 12, 12, Math.max(1, cssWidth - 24), Math.max(1, cssHeight - 24), { includeLabels:false, includeGuide:false });
            } else {
                const dims = compositionDimensions(state);
                const fitScale = Math.min(
                    Math.max(1, cssWidth - 24) / dims.width,
                    Math.max(1, cssHeight - 24) / dims.height,
                );
                const scale = fitScale * state.zoom;
                const drawW = dims.width * scale;
                const drawH = dims.height * scale;
                const x = (cssWidth - drawW) / 2 + state.panX;
                const y = (cssHeight - drawH) / 2 + state.panY;
                drawComposition(back, state, x, y, drawW, drawH, { includeLabels:false, includeGuide:true });
            }
        }

        // Commit a complete frame in one operation. Swaps and imported B images
        // can no longer expose a half-drawn A frame.
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
            canvas.width = pixelWidth;
            canvas.height = pixelHeight;
        }
        const visible = canvas.getContext("2d", { alpha: false, desynchronized: true });
        visible.setTransform(1, 0, 0, 1, 0, 0);
        visible.drawImage(backCanvas, 0, 0);

        const dims = compositionDimensions(state);
        const actualScale = Math.min(
            Math.max(1, cssWidth - 24) / dims.width,
            Math.max(1, cssHeight - 24) / dims.height,
        ) * state.zoom;
        const actualPercent = Math.max(0.1, actualScale * 100);
        zoomButton.textContent = actualPercent >= 1000
            ? `${Math.round(actualPercent)}%`
            : `${actualPercent.toFixed(actualPercent < 10 ? 1 : 0)}%`;
        interpolationButton.textContent = state.pixelated ? "Pixel" : "Smooth";
        setButtonActive(interpolationButton, state.pixelated);
        title.textContent = hasSecondImage(state)
            ? `NovoLoko Compare Studio • ${state.mode} • ${state.orientation} • ${zoomButton.textContent}`
            : `NovoLoko Image Studio • Single Image • ${zoomButton.textContent}`;
        toolbar.style.background = themeFor(state).panel;
        toolbar.style.backdropFilter = "none";
        infoBar.style.background = themeFor(state).panel2;
        infoBar.style.backdropFilter = "none";
        infoBar.style.color = textColorFor(state);
        overlay.style.color = textColorFor(state);
        for (const button of toolbar.querySelectorAll("button")) styleCompareButton(button, state, false);
        updateQuickButtons();
        applyChecker(viewport, state);
        updateControls(controls, state);
        updateQuickButtons();
        updateInfoBar();
        updateLayout();

        if (state.mode === "Blink" && overlay.style.display !== "none") {
            state.blinkTimer = setTimeout(() => {
                if (overlay.style.display === "none" || state.mode !== "Blink") return;
                state.blinkPhase = state.blinkPhase ? 0 : 1;
                render();
            }, Math.max(100, Math.min(10000, Number(state.blinkMs || 650))));
        }
    }

    function resetView() {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0;
        render();
    }

    function viewGeometry() {
        const rect = viewport.getBoundingClientRect();
        const dims = compositionDimensions(state);
        const availableWidth = Math.max(1, rect.width - 24);
        const availableHeight = Math.max(1, rect.height - 24);
        const fitScale = Math.min(
            availableWidth / dims.width,
            availableHeight / dims.height,
        );
        return { rect, dims, availableWidth, availableHeight, fitScale };
    }

    function fitWidth() {
        if (!state.a) return;
        const geometry = viewGeometry();
        const desiredScale = geometry.availableWidth / geometry.dims.width;
        state.zoom = clamp(desiredScale / Math.max(0.0001, geometry.fitScale), 0.005, 200);
        state.panX = 0;
        state.panY = 0;
        render();
    }

    function fitHeight() {
        if (!state.a) return;
        const geometry = viewGeometry();
        const desiredScale = geometry.availableHeight / geometry.dims.height;
        state.zoom = clamp(desiredScale / Math.max(0.0001, geometry.fitScale), 0.005, 200);
        state.panX = 0;
        state.panY = 0;
        render();
    }

    function setExactZoom(percent) {
        if (!state.a) return;
        const geometry = viewGeometry();
        const desiredScale = clamp(Number(percent) / 100, 0.005, 200);
        state.zoom = clamp(desiredScale / Math.max(0.0001, geometry.fitScale), 0.005, 200);
        state.panX = 0;
        state.panY = 0;
        render();
    }

    function toggleInterpolation() {
        state.pixelated = !state.pixelated;
        try { localStorage.setItem("nova_compare_pixelated", state.pixelated ? "1" : "0"); } catch (_) {}
        render();
    }

    function showActualPixels() {
        if (!state.a) return;
        const geometry = viewGeometry();
        state.zoom = clamp(1 / Math.max(0.0001, geometry.fitScale), 0.005, 200);
        state.panX = 0;
        state.panY = 0;
        render();
    }

    function setUIHidden(hidden) {
        state.uiHidden = Boolean(hidden);
        toolbar.style.display = state.uiHidden ? "none" : "flex";
        infoBar.style.display = state.uiHidden ? "none" : (state.showLabels ? "flex" : "none");
        updateLayout();
        requestAnimationFrame(render);
    }

    const externalSlots = { A: null, B: null };

    function releaseExternal(side) {
        const entry = externalSlots[side];
        if (entry?.url?.startsWith("blob:")) {
            try { URL.revokeObjectURL(entry.url); } catch (_) {}
        }
        externalSlots[side] = null;
    }

    function releaseAllExternal() {
        releaseExternal("A");
        releaseExternal("B");
    }

    async function fileEntry(file) {
        if (!file || !String(file.type || "").startsWith("image/")) return null;
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        try { await img.decode(); }
        catch (error) { URL.revokeObjectURL(url); throw error; }
        return { name: file.name || `image-${Date.now()}`, url, img };
    }

    function assignImported(entry, side = state.galleryTarget) {
        if (!entry?.img) return;
        const target = side === "B" ? "B" : "A";
        releaseExternal(target);
        externalSlots[target] = entry;
        state.info = { ...(state.info || {}) };
        if (target === "A") {
            state.a = entry.img;
            state.info.a_width = entry.img.naturalWidth;
            state.info.a_height = entry.img.naturalHeight;
            state.info.label_a = entry.name;
        } else {
            state.b = entry.img;
            state.info.b_width = entry.img.naturalWidth;
            state.info.b_height = entry.img.naturalHeight;
            state.info.label_b = entry.name;
            state.info.has_b = true;
            if (state.mode === "A Only") state.mode = "Split";
        }
        state.d = null;
        state.blinkPhase = 0;
        if (state.resetFitOnChange) resetView(); else render();
    }

    async function addFiles(files, forcedSide = null) {
        const selected = Array.from(files || []).filter((file) => String(file.type || "").startsWith("image/")).slice(0, 2);
        if (!selected.length) return;
        const entries = [];
        for (const file of selected) {
            try { entries.push(await fileEntry(file)); }
            catch (error) { notify(`Could not load ${file?.name || "image"}: ${error?.message || error}`, "error"); }
        }
        if (!entries.length) return;
        if (entries.length === 1) {
            assignImported(entries[0], forcedSide || state.galleryTarget);
        } else {
            assignImported(entries[0], forcedSide || "A");
            assignImported(entries[1], forcedSide === "B" ? "A" : "B");
        }
    }

    async function snapshotImage(reference, src) {
        if (reference?.complete && reference?.naturalWidth) return reference;
        if (!src) return null;
        const img = new Image(); img.src = src;
        try { await img.decode(); return img; } catch (_) { return reference || null; }
    }

    async function restoreNodeImages() {
        const snap = state.nodeSnapshot;
        if (!snap) return;
        releaseAllExternal();
        const [a, b, d] = await Promise.all([
            snapshotImage(snap.a, snap.aSrc), snapshotImage(snap.b, snap.bSrc), snapshotImage(snap.d, snap.dSrc),
        ]);
        state.a = a; state.b = b; state.d = d; state.info = { ...snap.info };
        state.mode = snap.mode; state.swapped = snap.swapped; state.blinkPhase = 0;
        resetView();
    }

    function toggleHelp() { helpPanel.style.display = helpPanel.style.display === "none" ? "block" : "none"; }

    addFilesButton.addEventListener("click", () => fileInput.click());
    targetButton.addEventListener("click", () => {
        state.galleryTarget = state.galleryTarget === "A" ? "B" : "A";
        targetButton.textContent = `Target: ${state.galleryTarget}`;
    });
    restoreButton.addEventListener("click", restoreNodeImages);
    hotkeysButton.addEventListener("click", toggleHelp);
    helpPanel.addEventListener("click", toggleHelp);
    fileInput.addEventListener("change", async () => { await addFiles(fileInput.files); fileInput.value = ""; });

    viewport.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
    viewport.addEventListener("drop", async (event) => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const side = state.orientation === "Horizontal"
            ? (event.clientY < rect.top + rect.height / 2 ? "A" : "B")
            : (event.clientX < rect.left + rect.width / 2 ? "A" : "B");
        state.galleryTarget = side;
        targetButton.textContent = `Target: ${side}`;
        await addFiles(event.dataTransfer?.files, side);
    });

    window.addEventListener("paste", async (event) => {
        if (overlay.style.display === "none") return;
        const item = Array.from(event.clipboardData?.items || []).find((entry) => String(entry.type || "").startsWith("image/"));
        const file = item?.getAsFile?.();
        if (!file) return;
        event.preventDefault();
        try { assignImported(await fileEntry(file), state.galleryTarget); }
        catch (error) { notify(error?.message || String(error), "error"); }
    });

    function open(node) {
        releaseAllExternal();
        const latest = nodeState(node);
        Object.assign(state, latest);
        state.info = { ...(latest.info || {}) };
        state.nodeSnapshot = {
            a: state.a, b: state.b, d: state.d,
            aSrc: String(state.a?.src || ""), bSrc: String(state.b?.src || ""), dSrc: String(state.d?.src || ""),
            info: { ...state.info }, mode: state.mode, swapped: state.swapped,
        };
        helpPanel.style.display = "none";
        if (!hasSecondImage(state)) {
            state.mode = "A Only";
            state.swapped = false;
        }
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        state.uiHidden = false;
        overlay.style.display = "block";
        setUIHidden(false);
        updateControls(controls, state);
        requestAnimationFrame(render);
    }

    function closeViewer() {
        overlay.style.display = "none";
        releaseAllExternal();
        clearTimeout(state.blinkTimer);
        state.blinkTimer = 0;
        state.dragging = false;
        state.lineDragging = false;
        state.node?._novaCompareUI?.refresh?.();
    }

    bindControls(controls, state, {
        render,
        fit: resetView,
        fullscreen: () => {},
        swap: performSwap,
    });

    function selectMode(mode) {
        if (!hasSecondImage(state)) return;
        state.mode = mode === "Difference" ? "Overlay" : mode;
        persistState(state);
        render();
    }
    for (const [mode, button] of Object.entries(modeButtons)) {
        button.addEventListener("click", () => selectMode(mode));
    }
    for (const [orientation, button] of Object.entries(orientationButtons)) {
        button.addEventListener("click", () => {
            state.orientation = orientation;
            persistState(state);
            render();
        });
    }

    fitWidthButton.addEventListener("click", fitWidth);
    fitHeightButton.addEventListener("click", fitHeight);
    actualPixels.addEventListener("click", showActualPixels);
    zoomButton.addEventListener("click", () => {
        const geometry = viewGeometry();
        const current = geometry.fitScale * state.zoom * 100;
        const entered = window.prompt("Enter exact source-image zoom percentage (0.5 to 20,000)", String(Number(current.toFixed(1))));
        if (entered == null) return;
        const value = Number(String(entered).replace(/%/g, "").trim());
        if (Number.isFinite(value) && value > 0) setExactZoom(value);
    });
    interpolationButton.addEventListener("click", toggleInterpolation);
    hideUI.addEventListener("click", () => setUIHidden(true));
    close.addEventListener("click", closeViewer);

    canvas.addEventListener("wheel", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const rect = viewport.getBoundingClientRect();
        const localX = event.clientX - rect.left - rect.width / 2;
        const localY = event.clientY - rect.top - rect.height / 2;
        const oldZoom = state.zoom;
        const newZoom = clamp(oldZoom * Math.exp(-event.deltaY * 0.0019), 0.005, 200);
        const precision = state.mode === "Side by Side" && state.sbsStyle === "Precision Align";
        if (precision) {
            const temporaryLock = Boolean(
                event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            zoomPrecisionAtPointer(
                state, rect, event.clientX, event.clientY, newZoom,
                Boolean(state.precisionLinked || temporaryLock), 12,
            );
            persistState(state);
        } else {
            const pointX = (localX - state.panX) / oldZoom;
            const pointY = (localY - state.panY) / oldZoom;
            state.zoom = newZoom;
            state.panX = localX - pointX * newZoom;
            state.panY = localY - pointY * newZoom;
        }
        render();
    }, { passive: false, capture: true });

    canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 && event.button !== 1) return;
        const rect = fittedCompositionRect(canvas, state, state.zoom, state.panX, state.panY);
        if (event.button === 0 && state.mode === "Split") {
            const linePosition = state.orientation === "Vertical"
                ? rect.left + rect.width * state.position / 100
                : rect.top + rect.height * state.position / 100;
            const distance = state.orientation === "Vertical"
                ? Math.abs(event.clientX - linePosition)
                : Math.abs(event.clientY - linePosition);
            if (distance <= 28) {
                state.lineDragging = true;
                canvas.setPointerCapture?.(event.pointerId);
                event.preventDefault();
                return;
            }
        }
        state.dragging = true;
        state.startX = event.clientX;
        state.startY = event.clientY;
        const precision = state.mode === "Side by Side" && state.sbsStyle === "Precision Align";
        if (precision) {
            const vr = viewport.getBoundingClientRect();
            state.precisionSide = state.orientation === "Vertical"
                ? (event.clientX < vr.left + vr.width / 2 ? "A" : "B")
                : (event.clientY < vr.top + vr.height / 2 ? "A" : "B");
            state.precisionMoveTogether = Boolean(
                state.precisionLinked
                || event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            state.startPanAX = state.precisionPanAX; state.startPanAY = state.precisionPanAY;
            state.startPanBX = state.precisionPanBX; state.startPanBY = state.precisionPanBY;
            state.startPanX = state.precisionSide === "A" ? state.precisionPanAX : state.precisionPanBX;
            state.startPanY = state.precisionSide === "A" ? state.precisionPanAY : state.precisionPanBY;
        } else {
            state.startPanX = state.panX;
            state.startPanY = state.panY;
        }
        viewport.style.cursor = "grabbing";
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    canvas.addEventListener("pointermove", (event) => {
        if (state.followMouse && state.mode === "Split" && !state.dragging && !state.lineDragging) {
            const rect = fittedCompositionRect(canvas, state, state.zoom, state.panX, state.panY);
            if (event.clientX >= rect.left && event.clientX <= rect.left + rect.width
                && event.clientY >= rect.top && event.clientY <= rect.top + rect.height) {
                state.position = clamp(
                    state.orientation === "Vertical"
                        ? (event.clientX - rect.left) / Math.max(1, rect.width) * 100
                        : (event.clientY - rect.top) / Math.max(1, rect.height) * 100,
                    0,
                    100,
                );
                render();
            }
            return;
        }
        if (state.lineDragging) {
            const rect = fittedCompositionRect(canvas, state, state.zoom, state.panX, state.panY);
            state.position = clamp(
                state.orientation === "Vertical"
                    ? (event.clientX - rect.left) / rect.width * 100
                    : (event.clientY - rect.top) / rect.height * 100,
                0,
                100,
            );
            persistState(state);
            render();
            return;
        }
        if (state.dragging) {
            const dx = event.clientX - state.startX;
            const dy = event.clientY - state.startY;
            if (state.mode === "Side by Side" && state.sbsStyle === "Precision Align") {
                const halfW = Math.max(1, viewport.clientWidth / (state.orientation === "Vertical" ? 2 : 1));
                const halfH = Math.max(1, viewport.clientHeight / (state.orientation === "Horizontal" ? 2 : 1));
                const images = currentImages(state);
                const fitA = Math.min(halfW / Math.max(1, images.a?.naturalWidth || 1), halfH / Math.max(1, images.a?.naturalHeight || 1));
                const fitB = Math.min(halfW / Math.max(1, images.b?.naturalWidth || 1), halfH / Math.max(1, images.b?.naturalHeight || 1));
                const sourcePerPixelA = 1 / Math.max(.0001, fitA * state.zoom);
                const sourcePerPixelB = 1 / Math.max(.0001, fitB * state.zoom);
                const moveTogetherNow = Boolean(
                state.precisionMoveTogether
                || event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            if (moveTogetherNow) {
                    state.precisionPanAX = state.startPanAX + dx * sourcePerPixelA;
                    state.precisionPanAY = state.startPanAY + dy * sourcePerPixelA;
                    state.precisionPanBX = state.startPanBX + dx * sourcePerPixelB;
                    state.precisionPanBY = state.startPanBY + dy * sourcePerPixelB;
                } else if (state.precisionSide === "A") {
                    state.precisionPanAX = state.startPanX + dx * sourcePerPixelA;
                    state.precisionPanAY = state.startPanY + dy * sourcePerPixelA;
                } else {
                    state.precisionPanBX = state.startPanX + dx * sourcePerPixelB;
                    state.precisionPanBY = state.startPanY + dy * sourcePerPixelB;
                }
                persistState(state);
            } else {
                state.panX = state.startPanX + dx;
                state.panY = state.startPanY + dy;
            }
            render();
        }
    });

    const endPointer = (event) => {
        state.dragging = false;
        state.lineDragging = false;
        viewport.style.cursor = "crosshair";
        try { canvas.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    canvas.addEventListener("pointerup", endPointer);
    canvas.addEventListener("pointercancel", endPointer);
    canvas.addEventListener("dblclick", () => {
        const geometry = viewGeometry();
        const actualScale = geometry.fitScale * state.zoom;
        if (Math.abs(actualScale - 1) < 0.01) resetView();
        else showActualPixels();
    });

    overlay.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.uiHidden) setUIHidden(false);
        else closeViewer();
    });

    window.addEventListener("keydown", (event) => {
        if (overlay.style.display === "none") return;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
        const key = event.key.toLowerCase();
        if (event.key === "Control") {
            state.controlHeld = true;
            render();
            return;
        }
        if (event.key === "Alt") { state.peekOriginal = true; render(); return; }
        if (event.key === "Escape") closeViewer();
        else if (key === "q") selectMode("Split");
        else if (key === "w") selectMode("Side by Side");
        else if (key === "e") selectMode("Overlay");
        else if (key === "t") selectMode("Blink");
        else if (key === "a") { state.mode = "A Only"; persistState(state); render(); }
        else if (key === "z") { state.mode = "B Only"; persistState(state); render(); }
        else if (key === "h") { state.orientation = state.orientation === "Vertical" ? "Horizontal" : "Vertical"; persistState(state); render(); }
        else if (key === "x" || key === "s") performSwap();
        else if (key === "g") { state.guide = !state.guide; persistState(state); render(); }
        else if (key === "n") { state.followMouse = !state.followMouse; if (state.followMouse) state.mode = "Split"; persistState(state); render(); }
        else if (key === "l") { state.precisionLinked = !state.precisionLinked; persistState(state); render(); }
        else if (key === "k") { const i = DIFFERENCE_STYLES.indexOf(state.differenceStyle); state.differenceStyle = DIFFERENCE_STYLES[(i + 1) % DIFFERENCE_STYLES.length]; persistState(state); render(); }
        else if (key === "c") { state.position = 50; state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0; persistState(state); render(); }
        else if (key === "f") resetView();
        else if (key === "1") showActualPixels();
        else if (key === "2") fitWidth();
        else if (key === "3") fitHeight();
        else if (key === "m") toggleInterpolation();
        else if (key === "u") setUIHidden(!state.uiHidden);
        else if (key === "i") fileInput.click();
        else if (key === "?") helpPanel.style.display = helpPanel.style.display === "none" ? "block" : "none";
    });

    window.addEventListener("keyup", (event) => {
        if (overlay.style.display === "none") return;
        if (event.key === "Control") {
            state.controlHeld = false;
            render();
            return;
        }
        if (event.key === "Alt") {
            state.peekOriginal = false;
            render();
        }
    });

    const observer = new ResizeObserver(() => {
        updateLayout();
        if (overlay.style.display !== "none") render();
    });
    observer.observe(toolbar);
    observer.observe(infoBar);

    fullViewer = { overlay, open, close: closeViewer };
    return fullViewer;
}

function addCompareWidget(node) {
    if (node.__novaCompareWidgetAdded || typeof node.addDOMWidget !== "function") return;
    node.__novaCompareWidgetAdded = true;

    const state = nodeState(node);
    const root = document.createElement("div");
    root.style.cssText = [
        "width:100%", "height:100%", "min-height:360px", "display:flex", "flex-direction:column",
        "gap:6px", "box-sizing:border-box", "padding:7px 7px 16px", "overflow:hidden",
        "border-radius:8px", "pointer-events:auto", "background:rgba(0,0,0,.22)"
    ].join(";");

    const controls = createControlUI(state, true);
    const studioBanner = document.createElement("button");
    studioBanner.type = "button";
    studioBanner.textContent = "NOVOLOKO IMAGE / COMPARE STUDIO — native-resolution preview • click for full screen";
    studioBanner.title = "Open the full-screen NovoLoko Compare Studio";
    studioBanner.style.cssText = "width:100%;padding:6px 9px;border-radius:6px;cursor:zoom-in;font:800 12px/1.2 sans-serif;letter-spacing:.035em;background:rgba(77,163,255,.14);border:1px solid rgba(77,163,255,.38)";

    const nodeViewBar = document.createElement("div");
    nodeViewBar.style.cssText = "display:flex;gap:5px;align-items:center;flex-wrap:wrap";
    const nodeFitButton = makeButton("Node Fit", "Fit the complete comparison in the node");
    const nodeActualButton = makeButton("Node 1:1", "Inspect actual generated pixels inside the node");
    const nodeSmoothButton = makeButton(state.nodePixelated ? "Node Pixel" : "Node Smooth", "Toggle node preview interpolation");
    const nodeResetButton = makeButton(`Reset Change ${state.resetFitOnChange ? "On" : "Off"}`, "Reset node preview to Fit when images change");
    const nodeResolution = document.createElement("span");
    nodeResolution.style.cssText = "margin-left:auto;font:700 11px/1.2 sans-serif;opacity:.82";
    nodeViewBar.append(nodeFitButton,nodeActualButton,nodeSmoothButton,nodeResetButton,nodeResolution);

    const labelBar = document.createElement("div");
    labelBar.style.cssText = "display:flex;justify-content:space-between;gap:8px;min-height:28px";
    const labelA = document.createElement("div");
    const labelB = document.createElement("div");
    for (const label of [labelA, labelB]) {
        label.style.cssText = [
            "flex:1 1 0", "min-width:0", "overflow:hidden", "text-overflow:ellipsis",
            "white-space:nowrap", "padding:6px 8px", "border-radius:6px",
            "background:rgba(0,0,0,.38)", "border:1px solid rgba(255,255,255,.12)",
            "font:700 11px/1.1 sans-serif"
        ].join(";");
    }
    labelB.style.textAlign = "right";
    labelBar.append(labelA, labelB);

    const preview = document.createElement("div");
    preview.style.cssText = "position:relative;flex:1 1 auto;min-height:260px;overflow:hidden;border-radius:7px;border:1px solid rgba(255,255,255,.14);touch-action:none";

    const stage = document.createElement("div");
    stage.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);overflow:hidden;pointer-events:none";

    function makeLayerImage() {
        const img = document.createElement("img");
        img.draggable = false;
        img.decoding = "async";
        img.style.cssText = "display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:fill;pointer-events:none;will-change:opacity,clip-path,filter";
        return img;
    }

    const layerA = makeLayerImage();
    const layerB = makeLayerImage();
    const layerD = makeLayerImage();

    const sideWrap = document.createElement("div");
    sideWrap.style.cssText = "display:none;position:absolute;inset:0;gap:0;overflow:hidden";
    const sideA = document.createElement("img");
    const sideB = document.createElement("img");
    for (const img of [sideA, sideB]) {
        img.draggable = false;
        img.decoding = "async";
        img.style.cssText = "display:block;width:100%;height:100%;min-width:0;min-height:0;object-fit:fill;pointer-events:none";
    }
    sideWrap.append(sideA, sideB);

    const guideLine = document.createElement("div");
    guideLine.style.cssText = "display:none;position:absolute;z-index:4;background:#fff;box-shadow:0 0 8px rgba(0,0,0,.9);pointer-events:none";
    const guideHandle = document.createElement("div");
    guideHandle.style.cssText = "display:none;position:absolute;z-index:5;width:38px;height:38px;border-radius:50%;transform:translate(-50%,-50%);align-items:center;justify-content:center;background:#4da3ff;color:#07111d;border:2px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.75);font:800 18px/1 sans-serif;pointer-events:none";
    const guideHit = document.createElement("div");
    guideHit.style.cssText = "display:none;position:absolute;z-index:6;touch-action:none;pointer-events:auto;background:transparent";

    stage.append(layerA, layerB, layerD, sideWrap, guideLine, guideHandle, guideHit);

    const placeholder = document.createElement("div");
    placeholder.textContent = "Connect image A for a full-resolution viewer • image B is optional for comparison";
    placeholder.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font:600 13px/1.4 sans-serif;opacity:.72;pointer-events:none";
    preview.append(stage, placeholder);

    const sourceStrip = document.createElement("div");
    sourceStrip.style.cssText = "display:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;min-height:104px;max-height:150px";
    const sourceCards = {};
    for (const key of ["A", "B"]) {
        const card = document.createElement("button");
        card.type = "button";
        card.title = `Show image ${key} only`;
        card.style.cssText = "position:relative;min-width:0;overflow:hidden;padding:0;border-radius:6px;cursor:pointer;background:#05070a;border:1px solid rgba(255,255,255,.14)";
        const img = document.createElement("img");
        img.draggable = false;
        img.style.cssText = "display:block;width:100%;height:100%;max-height:142px;object-fit:contain;pointer-events:none";
        const caption = document.createElement("span");
        caption.textContent = key;
        caption.style.cssText = "position:absolute;left:5px;bottom:5px;padding:3px 6px;border-radius:5px;background:rgba(0,0,0,.72);color:#fff;font:700 10px/1 sans-serif;pointer-events:none";
        card.append(img, caption);
        card.addEventListener("click", () => {
            state.mode = key === "A" ? "A Only" : "B Only";
            persistState(state);
            refresh();
        });
        sourceCards[key] = { card, img, caption };
        sourceStrip.append(card);
    }

    root.append(controls.root, studioBanner, nodeViewBar, labelBar, preview, sourceStrip);

    let blinkTimer = 0;
    let draggingLine = false;
    let refreshFrame = 0;

    function setImageSource(img, sourceImage) {
        const src = String(sourceImage?.src || "");
        if (src && img.src !== src) img.src = src;
        if (!src) img.removeAttribute("src");
    }

    function resetLayers() {
        for (const img of [layerA, layerB, layerD]) {
            img.style.display = "none";
            img.style.opacity = "1";
            img.style.clipPath = "none";
            img.style.filter = "none";
            img.style.mixBlendMode = "normal";
        }
        sideWrap.style.display = "none";
        guideLine.style.display = "none";
        guideHandle.style.display = "none";
        guideHit.style.display = "none";
    }

    function updateGuide() {
        if (state.mode !== "Split") return;
        const position = clamp(state.position, 0, 100);
        const vertical = state.orientation === "Vertical";
        const opacity = clamp(state.lineOpacity, 0, 100) / 100;
        guideLine.style.display = "block";
        guideLine.style.opacity = String(opacity);
        guideHandle.style.display = state.guide ? "flex" : "none";
        guideHandle.style.background = themeFor(state).accent;
        guideHit.style.display = "block";

        if (vertical) {
            layerB.style.clipPath = `polygon(${position}% 0,100% 0,100% 100%,${position}% 100%)`;
            Object.assign(guideLine.style, {
                left: `${position}%`, top: "0", bottom: "0", width: "2px", height: "auto",
                transform: "translateX(-1px)",
            });
            Object.assign(guideHandle.style, {
                left: `${position}%`, top: "50%", transform: "translate(-50%,-50%)",
            });
            guideHandle.textContent = "↔";
            Object.assign(guideHit.style, {
                left: `${position}%`, top: "0", bottom: "0", width: "42px", height: "auto",
                transform: "translateX(-50%)", cursor: "ew-resize",
            });
        } else {
            layerB.style.clipPath = `polygon(0 ${position}%,100% ${position}%,100% 100%,0 100%)`;
            Object.assign(guideLine.style, {
                left: "0", right: "0", top: `${position}%`, bottom: "auto", width: "auto", height: "2px",
                transform: "translateY(-1px)",
            });
            Object.assign(guideHandle.style, {
                left: "50%", top: `${position}%`, transform: "translate(-50%,-50%)",
            });
            guideHandle.textContent = "↕";
            Object.assign(guideHit.style, {
                left: "0", right: "0", top: `${position}%`, bottom: "auto", width: "auto", height: "42px",
                transform: "translateY(-50%)", cursor: "ns-resize",
            });
        }
    }

    function applyStyle() {
        const theme = themeFor(state);
        root.style.color = textColorFor(state);
        root.style.background = theme.panel;
        applyChecker(preview, state);
        for (const button of root.querySelectorAll("button")) styleCompareButton(button, state, false);
        updateControls(controls, state);
    }

    function renderNativePreview() {
        const latest = nodeState(node);
        for (const key of [
            "mode", "orientation", "position", "opacity", "lineOpacity",
            "guide", "followMouse", "sbsOverlap", "swapped", "blinkMs", "theme",
            "buttonColor", "textColor", "buttonStyle", "background",
            "differenceStyle", "showSources", "showLabels", "precisionLinked",
        ]) state[key] = latest[key];

        // The graph node is deliberately Native-only. Full-screen owns
        // Precision Align, Follow Mouse and linked movement.
        state.sbsStyle = "Native";
        state.precisionLinked = false;
        state.a = node._novaCompareA || null;
        state.b = node._novaCompareB || null;
        state.d = node._novaCompareDiff || null;
        state.info = node._novaCompareInfo || {};
        const singleImageMode = !hasSecondImage(state);
        if (singleImageMode) {
            state.mode = "A Only";
            state.swapped = false;
        }

        clearTimeout(blinkTimer);
        blinkTimer = 0;
        resetLayers();
        applyStyle();

        const hasImages = Boolean(state.a);
        const hasB = hasSecondImage(state);
        placeholder.style.display = hasImages ? "none" : "flex";
        stage.style.display = hasImages ? "block" : "none";
        labelBar.style.display = state.showLabels && hasImages ? "flex" : "none";
        labelB.style.display = hasB ? "block" : "none";
        labelA.style.textAlign = hasB ? "left" : "center";
        sourceStrip.style.display = state.showSources && hasB ? "grid" : "none";
        studioBanner.textContent = hasB
            ? "NOVOLOKO COMPARE STUDIO — Native SBS preview • full-screen Precision inspection"
            : "NOVOLOKO IMAGE STUDIO — image B optional • click for full-screen 1:1 inspection";
        if (!hasImages) return;

        const images = currentImages(state);
        const effectSource = effectImageFor(state, images.b);
        setImageSource(layerA, images.a);
        setImageSource(layerB, effectSource);
        setImageSource(layerD, state.d || images.b);
        setImageSource(sideA, images.a);
        setImageSource(sideB, effectSource);
        const effectFilterValue = differenceFilter(state.differenceStyle);
        layerB.style.filter = effectFilterValue;
        sideB.style.filter = effectFilterValue;
        layerB.style.mixBlendMode = ["Multiply", "Screen"].includes(state.differenceStyle) ? state.differenceStyle.toLowerCase() : "normal";
        sideB.style.mixBlendMode = layerB.style.mixBlendMode;
        const nodeEffectOpacity = state.differenceStyle === "Normal" ? 1 : clamp(state.opacity, 0, 100) / 100;
        layerB.style.opacity = String(nodeEffectOpacity);
        sideB.style.opacity = String(nodeEffectOpacity);

        const dims = compositionDimensions(state);
        const width = Math.max(1, preview.clientWidth || 1);
        const height = Math.max(1, preview.clientHeight || 1);
        const actualNode = state.nodeView === "1:1";
        const scale = actualNode ? 1 : Math.min(
            Math.max(1, width - 2) / Math.max(1, dims.width),
            Math.max(1, height - 2) / Math.max(1, dims.height),
        );
        stage.style.width = `${Math.max(1, dims.width * scale)}px`;
        stage.style.height = `${Math.max(1, dims.height * scale)}px`;
        stage.style.transform = `translate(-50%,-50%) translate(${Number(state.nodePanX || 0)}px,${Number(state.nodePanY || 0)}px)`;
        for (const img of [layerA,layerB,layerD,sideA,sideB]) img.style.imageRendering = state.nodePixelated ? "pixelated" : "auto";
        nodeResolution.textContent = `${state.info?.a_width || images.a?.naturalWidth || "?"}×${state.info?.a_height || images.a?.naturalHeight || "?"} • ${actualNode ? "1:1 native" : `Fit ${Math.max(.1,scale*100).toFixed(scale*100<10?1:0)}%`}`;

        const dimsA = state.swapped
            ? `${state.info?.b_width || images.a?.naturalWidth || "?"}×${state.info?.b_height || images.a?.naturalHeight || "?"}`
            : `${state.info?.a_width || images.a?.naturalWidth || "?"}×${state.info?.a_height || images.a?.naturalHeight || "?"}`;
        const dimsB = hasB
            ? (state.swapped
                ? `${state.info?.a_width || images.b?.naturalWidth || "?"}×${state.info?.a_height || images.b?.naturalHeight || "?"}`
                : `${state.info?.b_width || images.b?.naturalWidth || "?"}×${state.info?.b_height || images.b?.naturalHeight || "?"}`)
            : "";
        labelA.textContent = `${images.labelA}  •  ${dimsA}`;
        labelB.textContent = hasB ? `${images.labelB}  •  ${dimsB}` : "";

        sourceCards.A.img.src = state.a.src;
        if (hasB && state.b) sourceCards.B.img.src = state.b.src;

        if (!hasB) {
            layerA.style.display = "block";
        } else if (state.mode === "Side by Side") {
            sideWrap.style.display = "block";
            sideWrap.style.position = "absolute";
            sideWrap.style.inset = "0";
            const overlap = clamp(state.sbsOverlap, 0, 90) / 100;
            const factor = 2 - overlap;
            if (state.orientation === "Vertical") {
                const imageWidth = 100 / factor;
                const separation = imageWidth * (1 - overlap);
                for (const img of [sideA, sideB]) {
                    img.style.position = "absolute";
                    img.style.top = "0";
                    img.style.width = `${imageWidth}%`;
                    img.style.height = "100%";
                }
                sideA.style.left = "0";
                sideB.style.left = `${separation}%`;
            } else {
                const imageHeight = 100 / factor;
                const separation = imageHeight * (1 - overlap);
                for (const img of [sideA, sideB]) {
                    img.style.position = "absolute";
                    img.style.left = "0";
                    img.style.width = "100%";
                    img.style.height = `${imageHeight}%`;
                }
                sideA.style.top = "0";
                sideB.style.top = `${separation}%`;
            }
        } else if (state.mode === "A Only") {
            layerA.style.display = "block";
        } else if (state.mode === "B Only") {
            layerB.style.display = "block";
        } else if (state.mode === "Overlay") {
            layerA.style.display = "block";
            layerB.style.display = "block";
            layerB.style.opacity = String(clamp(state.opacity, 0, 100) / 100);
        } else if (state.mode === "Difference") {
            layerA.style.display = "block";
            layerD.style.display = "block";
            layerA.style.opacity = String(Math.max(0.08, 1 - clamp(state.opacity, 0, 100) / 100 * 0.75));
            layerD.style.opacity = String(Math.max(0.05, clamp(state.opacity, 0, 100) / 100));
            layerD.style.mixBlendMode = "screen";
            layerD.style.filter = differenceFilter(state.differenceStyle);
        } else if (state.mode === "Blink") {
            const showB = Boolean(state.blinkPhase);
            const effectActive = state.differenceStyle !== "Normal";
            layerA.style.display = showB && !effectActive ? "none" : "block";
            layerB.style.display = showB ? "block" : "none";
            blinkTimer = setTimeout(() => {
                if (state.mode !== "Blink" || !state.a || !state.b) return;
                state.blinkPhase = state.blinkPhase ? 0 : 1;
                refresh();
            }, Math.max(100, Math.min(10000, Number(state.blinkMs || 650))));
        } else {
            layerA.style.display = "block";
            layerB.style.display = "block";
            updateGuide();
        }
    }

    function refresh() {
        if (refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
            refreshFrame = 0;
            renderNativePreview();
        });
    }

    function openFull() {
        refresh();
        ensureFullViewer().open(node);
    }

    studioBanner.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openFull();
    });
    preview.title = "Native-resolution node preview • Native SBS only • double-click for full-screen Precision tools";

    bindControls(controls, state, {
        render: refresh,
        fit: refresh,
        swap: async () => {
            clearTimeout(blinkTimer); blinkTimer = 0; state.blinkPhase = 0;
            preview.style.opacity = "0";
            state.swapped = !state.swapped;
            persistState(state);
            refresh();
            await new Promise((resolve) => requestAnimationFrame(resolve));
            await Promise.allSettled([layerA, layerB, layerD, sideA, sideB].map((img) => img.decode?.()));
            requestAnimationFrame(() => { preview.style.opacity = "1"; });
        },
        fullscreen: openFull,
    });

    guideHit.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || state.mode !== "Split") return;
        draggingLine = true;
        guideHit.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });
    guideHit.addEventListener("pointermove", (event) => {
        if (!draggingLine) return;
        const rect = stage.getBoundingClientRect();
        state.position = clamp(
            state.orientation === "Vertical"
                ? (event.clientX - rect.left) / Math.max(1, rect.width) * 100
                : (event.clientY - rect.top) / Math.max(1, rect.height) * 100,
            0,
            100,
        );
        persistState(state);
        refresh();
        event.preventDefault();
        event.stopPropagation();
    });
    const endLineDrag = (event) => {
        if (!draggingLine) return;
        draggingLine = false;
        try { guideHit.releasePointerCapture?.(event.pointerId); } catch (_) {}
    };
    guideHit.addEventListener("pointerup", endLineDrag);
    guideHit.addEventListener("pointercancel", endLineDrag);
    let followDirty = false;
    const followPointer = (event) => {
        if (!state.followMouse || state.mode !== "Split" || draggingLine || (event.buttons & 4) !== 0) {
            return;
        }

        const rect = stage.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right
            || event.clientY < rect.top || event.clientY > rect.bottom) {
            return;
        }

        state.position = clamp(
            state.orientation === "Vertical"
                ? (event.clientX - rect.left) / Math.max(1, rect.width) * 100
                : (event.clientY - rect.top) / Math.max(1, rect.height) * 100,
            0,
            100,
        );
        node.properties ||= {};
        node.properties.novaComparePosition = state.position / 100;
        followDirty = true;
        refresh();
    };

    /*
     * Capture phase makes Follow Mouse work even when the transparent guide
     * hit strip or another preview layer is the event target.
     */
    root.addEventListener("pointermove", followPointer, true);
    root.addEventListener("pointerleave", () => {
        if (!followDirty) return;
        followDirty = false;
        persistState(state);
    }, true);

    nodeFitButton.addEventListener("click", (event) => { event.stopPropagation(); state.nodeView="Fit"; state.nodePanX=0; state.nodePanY=0; persistState(state); refresh(); });
    nodeActualButton.addEventListener("click", (event) => { event.stopPropagation(); state.nodeView="1:1"; state.nodePanX=0; state.nodePanY=0; persistState(state); refresh(); });
    nodeSmoothButton.addEventListener("click", (event) => { event.stopPropagation(); state.nodePixelated=!state.nodePixelated; nodeSmoothButton.textContent=state.nodePixelated?"Node Pixel":"Node Smooth"; persistState(state); refresh(); });
    nodeResetButton.addEventListener("click", (event) => { event.stopPropagation(); state.resetFitOnChange=!state.resetFitOnChange; nodeResetButton.textContent=`Reset Change ${state.resetFitOnChange?"On":"Off"}`; persistState(state); });

    let nodePanDragging=false, nodePanMoved=false, nodePanStartX=0, nodePanStartY=0, nodePanBaseX=0, nodePanBaseY=0;
    preview.addEventListener("pointerdown", (event) => {
        if (event.button!==0 || event.target===guideHit) return;
        nodePanDragging=true; nodePanMoved=false; nodePanStartX=event.clientX; nodePanStartY=event.clientY;
        nodePanBaseX=Number(state.nodePanX||0); nodePanBaseY=Number(state.nodePanY||0);
        preview.setPointerCapture?.(event.pointerId); event.preventDefault(); event.stopPropagation();
    });
    preview.addEventListener("pointermove", (event) => {
        if (!nodePanDragging || state.nodeView!=="1:1") return;
        const dx=event.clientX-nodePanStartX, dy=event.clientY-nodePanStartY;
        if (Math.hypot(dx,dy)>4) nodePanMoved=true;
        state.nodePanX=nodePanBaseX+dx; state.nodePanY=nodePanBaseY+dy; refresh();
        event.preventDefault(); event.stopPropagation();
    });
    preview.addEventListener("pointerup", (event) => {
        if (!nodePanDragging || event.button!==0) return;
        nodePanDragging=false; try{preview.releasePointerCapture?.(event.pointerId);}catch(_){}
        if (!nodePanMoved) openFull();
        event.preventDefault(); event.stopPropagation();
    });

    // Graph navigation remains native ComfyUI behaviour over the DOM preview.
    preview.addEventListener("wheel", (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.canvas.processMouseWheel(event);
    }, { passive: false });
    preview.addEventListener("pointerdown", (event) => {
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseDown(event);
        }
    });
    preview.addEventListener("pointermove", (event) => {
        if ((event.buttons & 4) !== 0) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseMove(event);
        }
    });
    preview.addEventListener("pointerup", (event) => {
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseUp(event);
        }
    });

    const dom = node.addDOMWidget("novaComparePro", "novaComparePro", root, {
        hideOnZoom: false,
        getMinHeight: () => 360,
        getHeight: () => Math.max(360, Number(node.size?.[1] || 720) - 210),
        afterResize: () => requestAnimationFrame(refresh),
    });
    dom.serialize = false;
    dom.options.serialize = false;

    node.__novaCompareUI = { root, stage, controls, state, refresh, openFull };
    new ResizeObserver(refresh).observe(preview);
    requestAnimationFrame(() => {
        refresh();
        restoreCompareImages(node);
    });
}

app.registerExtension({
    name: "NovoLoko.ImageComparePro.v326NovaWidePanels",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== "NovaImageComparePro") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            const global = loadGlobal();
            this.properties = this.properties || {};
            this.properties.novaCompareMode ??= global.mode;
            this.properties.novaCompareOrientation ??= global.orientation;
            this.properties.novaComparePosition ??= global.position / 100;
            this.properties.novaCompareOpacity ??= global.opacity / 100;
            this.properties.novaCompareLineOpacity ??= global.lineOpacity / 100;
            this.properties.novaCompareGuide ??= global.guide;
            this.properties.novaCompareFollowMouse ??= global.followMouse;
            this.properties.novaCompareSbsOverlap ??= global.sbsOverlap;
            this.properties.novaCompareSbsStyle ??= (global.sbsStyle === "Classic Fit" ? "Precision Align" : (global.sbsStyle || "Native"));
            this.properties.novaComparePrecisionLinked ??= global.precisionLinked ?? false;
            this.properties.novaCompareResetFitOnChange ??= global.resetFitOnChange ?? true;
            this.properties.novaCompareNodeView ??= "Fit";
            this.properties.novaCompareNodePixelated ??= false;
            this.properties.novaCompareSwapped ??= global.swapped;
            this.properties.novaCompareBlinkMs ??= global.blinkMs;
            this.properties.novaCompareTheme ??= global.theme;
            this.properties.novaCompareButtonColor ??= global.buttonColor;
            this.properties.novaCompareTextColor ??= global.textColor;
            this.properties.novaCompareButtonStyle ??= global.buttonStyle;
            this.properties.novaCompareBackground ??= global.background;
            this.properties.novaCompareDifferenceStyle ??= global.differenceStyle;
            this.properties.novaCompareShowSources ??= global.showSources;
            this.properties.novaCompareShowLabels ??= global.showLabels;
            if (!this.size || this.size[0] < 520 || this.size[1] < 620) {
                this.setSize?.([Math.max(this.size?.[0] || 0, 520), Math.max(this.size?.[1] || 0, 620)]);
            }
            addCompareWidget(this);
            setTimeout(() => restoreCompareImages(this), 0);
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const result = originalConfigure?.apply(this, args);
            setTimeout(() => restoreCompareImages(this, true), 0);
            return result;
        };

        const originalExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = async function (output) {
            originalExecuted?.apply(this, arguments);
            const images = output?.nova_compare_images || output?.images || [];
            if (images.length < 1) return;
            try {
                const info = output?.nova_compare?.[0] || {};
                const refs = images.slice(0, 3).map(serializableImageRef).filter(Boolean);
                rememberCompareImages(this, refs, info);
                const loaded = await Promise.all(refs.map(loadImage));
                this._novaCompareA = loaded[0] || null;
                this._novaCompareB = info?.has_b === false ? null : (loaded[1] || null);
                this._novaCompareDiff = info?.has_b === false ? null : (loaded[2] || null);
                this._novaCompareInfo = info;
                if (this.properties?.novaCompareResetFitOnChange !== false) {
                    this.properties.novaCompareNodeView = "Fit";
                    if (this.__novaCompareUI?.state) {
                        this.__novaCompareUI.state.nodeView = "Fit";
                        this.__novaCompareUI.state.nodePanX = 0;
                        this.__novaCompareUI.state.nodePanY = 0;
                    }
                }
                this.imgs = null;
                this.__novaCompareUI?.refresh?.();
                this.setDirtyCanvas?.(true, true);
            } catch (error) {
                console.warn("[NovoLoko Image Compare Pro] image load failed", error);
                notify("Compare images could not be loaded.", "error");
            }
        };

        const originalResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function () {
            const result = originalResize?.apply(this, arguments);
            requestAnimationFrame(() => this.__novaCompareUI?.refresh?.());
            return result;
        };
    },
});
