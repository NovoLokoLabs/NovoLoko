import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SETTINGS_KEY = "nova.media.studio.settings.v291";
const LEGACY_SETTINGS_KEYS = [
    "nova.media.studio.settings.v290",
    "nova.media.studio.settings.v282",
    "nova.media.studio.settings.v281",
];
const DEFAULTS = Object.freeze({
    theme: "NovoLoko Blue",
    background: "Black",
    buttonColor: "Theme Accent",
    textColor: "Theme Text",
    buttonStyle: "Soft",
    autoplayEnabled: false,
    followNewGeneration: false,
    promptVisible: false,
    labelsVisible: true,
    promptMode: "Spoken",
    subtitles: "Off",
    subtitleFont: "Arial",
    subtitleSize: 24,
    subtitleColor: "#ffffff",
    subtitleHighlight: "#8ac6ff",
    subtitleBackground: 72,
    subtitleOffsetMs: -120,
    subtitleX: 50,
    subtitleY: 76,
    loop: false,
    slideshow: false,
    shuffle: false,
    slideDelay: 0,
    playbackRate: 1,
    volume: 1,
    autoplayAfter: "After First Pass",
});

const THEMES = {
    "NovoLoko Blue": { accent: "#4da3ff", accentSoft: "#8ac6ff", panel: "rgba(15,32,52,.98)", panel2: "rgba(20,43,68,.97)", text: "#f4f8ff" },
    Charcoal: { accent: "#d2d6dc", accentSoft: "#ffffff", panel: "rgba(24,25,28,.98)", panel2: "rgba(38,40,45,.97)", text: "#f5f5f5" },
    Purple: { accent: "#a78bfa", accentSoft: "#d8ccff", panel: "rgba(37,24,60,.98)", panel2: "rgba(55,35,84,.97)", text: "#fbf8ff" },
    Emerald: { accent: "#34d399", accentSoft: "#8af0c8", panel: "rgba(10,43,36,.98)", panel2: "rgba(13,62,51,.97)", text: "#f1fff9" },
    Amber: { accent: "#fbbf24", accentSoft: "#ffe08a", panel: "rgba(55,38,10,.98)", panel2: "rgba(77,52,13,.97)", text: "#fffaf0" },
    Rose: { accent: "#fb7185", accentSoft: "#ffb1bd", panel: "rgba(60,22,31,.98)", panel2: "rgba(83,30,42,.97)", text: "#fff5f7" },
    Midnight: { accent: "#5ee7ff", accentSoft: "#b4f4ff", panel: "rgba(5,13,28,.99)", panel2: "rgba(9,24,48,.98)", text: "#edfaff" },
    Cyan: { accent: "#22d3ee", accentSoft: "#a5f3fc", panel: "rgba(8,43,49,.98)", panel2: "rgba(12,61,69,.97)", text: "#effdff" },
    Crimson: { accent: "#ef4444", accentSoft: "#fca5a5", panel: "rgba(56,12,18,.98)", panel2: "rgba(78,17,25,.97)", text: "#fff5f5" },
    Lime: { accent: "#a3e635", accentSoft: "#d9f99d", panel: "rgba(29,47,8,.98)", panel2: "rgba(42,65,12,.97)", text: "#fbfff2" },
    Copper: { accent: "#f59e6b", accentSoft: "#ffd1b5", panel: "rgba(53,28,17,.98)", panel2: "rgba(76,39,23,.97)", text: "#fff8f3" },
    Ice: { accent: "#93c5fd", accentSoft: "#dbeafe", panel: "rgba(20,32,48,.98)", panel2: "rgba(31,48,70,.97)", text: "#f8fbff" },
    OLED: { accent: "#ffffff", accentSoft: "#d1d5db", panel: "#000000", panel2: "#080808", text: "#ffffff" },
    Graphite: { accent: "#9ca3af", accentSoft: "#e5e7eb", panel: "#111318", panel2: "#1b1e25", text: "#f3f4f6" },
    Ocean: { accent: "#38bdf8", accentSoft: "#bae6fd", panel: "#082f49", panel2: "#0c4a6e", text: "#f0f9ff" },
    Teal: { accent: "#2dd4bf", accentSoft: "#99f6e4", panel: "#0f3d3a", panel2: "#115e59", text: "#f0fdfa" },
    Magenta: { accent: "#e879f9", accentSoft: "#f5d0fe", panel: "#4a124f", panel2: "#701a75", text: "#fdf4ff" },
    Gold: { accent: "#facc15", accentSoft: "#fef08a", panel: "#3f2d08", panel2: "#5f460b", text: "#fffbea" },
    Forest: { accent: "#4ade80", accentSoft: "#bbf7d0", panel: "#12351f", panel2: "#14532d", text: "#f0fdf4" },
    Lavender: { accent: "#c4b5fd", accentSoft: "#ede9fe", panel: "#312e55", panel2: "#443c73", text: "#faf8ff" },
    Sunset: { accent: "#fb7185", accentSoft: "#fdba74", panel: "#4b1d32", panel2: "#6b2737", text: "#fff7ed" },
};

const BUTTON_COLORS = {
    "Theme Accent": null,
    Blue: "#4da3ff", Sky: "#38bdf8", Cyan: "#22d3ee", Teal: "#2dd4bf",
    Green: "#34d399", Lime: "#a3e635", Yellow: "#fde047", Amber: "#fbbf24", Gold: "#facc15",
    Orange: "#fb923c", Copper: "#f59e6b", Red: "#ef4444", Rose: "#fb7185",
    Magenta: "#e879f9", Purple: "#a78bfa", Indigo: "#818cf8", Lavender: "#c4b5fd",
    Silver: "#d1d5db", White: "#f9fafb", Grey: "#9ca3af", Black: "#111827",
};

const TEXT_COLORS = {
    "Theme Text": null, White: "#ffffff", Black: "#07090d", Silver: "#d1d5db",
    Cyan: "#a5f3fc", Blue: "#bfdbfe", Green: "#bbf7d0", Lime: "#d9f99d",
    Gold: "#fef08a", Orange: "#fed7aa", Rose: "#fecdd3", Pink: "#f5d0fe", Lavender: "#ddd6fe",
};

const BUTTON_STYLES = ["Soft", "Solid", "Outline", "Glass", "Minimal"];
const BACKGROUNDS = ["Black", "OLED", "Checker", "Neutral", "White", "Deep Blue", "Warm Grey", "Gradient", "Studio Grey", "Paper", "Navy Grid", "Transparent"];

const SUBTITLE_FONTS = {
    Arial: "Arial, Helvetica, sans-serif",
    Verdana: "Verdana, Geneva, sans-serif",
    Trebuchet: "'Trebuchet MS', Arial, sans-serif",
    Georgia: "Georgia, 'Times New Roman', serif",
    Serif: "'Times New Roman', Times, serif",
    Monospace: "Consolas, 'Courier New', monospace",
    Impact: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
}

function loadSettings() {
    try {
        let raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) {
            for (const key of LEGACY_SETTINGS_KEYS) {
                raw = localStorage.getItem(key);
                if (raw) break;
            }
        }
        raw ||= "{}";
        const parsed = JSON.parse(raw);
        return { ...DEFAULTS, ...(parsed && typeof parsed === "object" ? parsed : {}) };
    } catch (_) {
        return { ...DEFAULTS };
    }
}

function saveSettings(state) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state));
    } catch (_) {
        // Private browsing or a locked profile can block storage.
    }
}

function apiUrl(path) {
    return typeof api.apiURL === "function" ? api.apiURL(path) : path;
}

function audioUrl(filename) {
    const query = new URLSearchParams({
        filename: String(filename || ""),
        t: String(Date.now()),
    });
    return apiUrl(`/nova_voice/audio/file?${query.toString()}`);
}

function notify(message, severity = "info") {
    try {
        if (app.extensionManager?.toast?.add) {
            app.extensionManager.toast.add({
                severity,
                summary: "NovoLoko Media Studio",
                detail: String(message || ""),
                life: severity === "error" ? 6500 : 3800,
            });
            return;
        }
    } catch (_) {}
    if (severity === "error") console.error(`[NovoLoko Media Studio] ${message}`);
    else console.log(`[NovoLoko Media Studio] ${message}`);
}

function blockedNoticeOnce(message) {
    const key = "nova.autoplay.blocked.notice.once.v290";
    try {
        if (localStorage.getItem(key) === "1") return;
        localStorage.setItem(key, "1");
    } catch (_) {
        if (window.__novaAutoplayBlockedNoticeShown) return;
        window.__novaAutoplayBlockedNoticeShown = true;
    }
    notify(message, "error");
}

function currentItem(viewer) {
    return viewer?.node?.__novaCurrentHistoryItem || null;
}

function promptFor(item, mode) {
    if (!item) return "No prompt is available for this history entry.";
    if (mode === "Manual") {
        return String(item.manual_prompt || "").trim() || "No manual prompt was stored.";
    }
    if (mode === "Enhanced") {
        return String(item.enhanced_prompt || "").trim() || "No enhanced prompt was stored.";
    }
    return String(item.label || "").trim() || "No spoken prompt was stored.";
}

function makeButton(text, title = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.style.cssText = "cursor:pointer;padding:5px 9px;min-height:30px;border-radius:5px;white-space:nowrap";
    return button;
}

function makeSelect(values, value, title = "") {
    const select = document.createElement("select");
    select.title = title;
    select.style.cssText = "cursor:pointer;min-height:30px;padding:4px 6px;border-radius:5px";
    for (const optionValue of values) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
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
    input.style.cssText = "width:120px;cursor:pointer";
    return input;
}

function formatClock(value) {
    const seconds = Math.max(0, Number(value || 0));
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

function createStudio(viewer) {
    if (!viewer?.overlay || viewer.overlay.__novaMediaStudio) {
        return viewer?.overlay?.__novaMediaStudio || null;
    }

    const overlay = viewer.overlay;
    const toolbar = overlay.querySelector('[data-nova-role="toolbar"]');
    const viewport = overlay.querySelector('[data-nova-role="viewport"]');
    const historyNavigation = overlay.querySelector('[data-nova-role="history-navigation"]');
    if (!toolbar || !viewport) return null;

    const state = loadSettings();
    let lastOpen = false;
    let lastNode = null;
    let lastFilename = "";
    let lastIndex = -1;
    let subtitleFrame = 0;
    let subtitleKey = "";
    let karaoke = { text: "", words: [], cumulative: [], total: 0, sentences: [] };
    let slideshowTimer = 0;
    let audioLoadToken = 0;
    let sessionActive = false;
    let generationOverride = false;
    let activeRevoiceRequestId = "";
    let subtitleDragging = false;
    let subtitleMoved = false;
    let subtitlePointerId = null;
    let subtitleStartX = 0;
    let subtitleStartY = 0;
    let subtitleStartLeft = 0;
    let subtitleStartTop = 0;
    let uiHidden = false;
    let attachedNode = null;
    let attachedOriginalAudio = null;
    let silentSlideTimer = 0;
    let pendingGeneration = null;

    const options = document.createElement("div");
    options.dataset.novaStudio = "options";
    options.style.cssText = "display:flex;align-items:center;gap:5px;flex-wrap:wrap";

    const themeSelect = makeSelect(Object.keys(THEMES), state.theme, "Viewer colour theme");
    const backgroundSelect = makeSelect(BACKGROUNDS, state.background, "Image-area background");
    const buttonColorSelect = makeSelect(Object.keys(BUTTON_COLORS), state.buttonColor, "Active button colour");
    const textColorSelect = makeSelect(Object.keys(TEXT_COLORS), state.textColor, "Viewer text colour");
    const buttonStyleSelect = makeSelect(BUTTON_STYLES, state.buttonStyle, "Button appearance style");
    const promptButton = makeButton("Prompt", "Show or hide the stored prompt");
    const labelsButton = makeButton(
        `Labels ${state.labelsVisible ? "On" : "Off"}`,
        "Show or hide PASS 1 / PASS 2 labels"
    );
    const subtitleSelect = makeSelect(["Off", "Line", "Word"], state.subtitles, "Karaoke subtitles; timings are estimated from the real audio duration");
    const subtitleStyleButton = makeButton("Subtitle Style", "Font, size, colour, timing and position");
    const hideUIButton = makeButton("Hide UI", "Hide all controls; right-click restores them");
    const resetLayoutButton = makeButton("Studio Reset", "Reset media, subtitle and colour settings");

    const compactLabel = (text, control) => {
        const label = document.createElement("label");
        label.textContent = `${text} `;
        label.style.cssText = "font:12px/1 sans-serif;white-space:nowrap";
        label.append(control);
        return label;
    };

    options.append(
        compactLabel("Theme", themeSelect),
        compactLabel("Background", backgroundSelect),
        compactLabel("Buttons", buttonColorSelect),
        compactLabel("Text", textColorSelect),
        compactLabel("Button Style", buttonStyleSelect),
        promptButton,
        labelsButton,
        compactLabel("Subtitles", subtitleSelect),
        subtitleStyleButton,
        hideUIButton,
        resetLayoutButton,
    );
    toolbar.insertBefore(options, toolbar.lastElementChild);

    const promptPanel = document.createElement("aside");
    promptPanel.style.cssText = [
        "display:none", "position:absolute", "right:0", "width:min(430px,42vw)",
        "z-index:13", "padding:12px", "box-sizing:border-box", "overflow:hidden",
        "border-left:1px solid rgba(255,255,255,.15)", "backdrop-filter:blur(8px)"
    ].join(";");

    const promptHeader = document.createElement("div");
    promptHeader.style.cssText = "display:flex;align-items:center;gap:7px;margin-bottom:8px";
    const promptTitle = document.createElement("strong");
    promptTitle.textContent = "Stored prompt";
    promptTitle.style.flex = "1";
    const promptMode = makeSelect(["Spoken", "Manual", "Enhanced"], state.promptMode, "Prompt used for the panel and subtitles");
    const copyPrompt = makeButton("Copy", "Copy the visible prompt");
    const closePrompt = makeButton("×", "Hide prompt panel");
    promptHeader.append(promptTitle, promptMode, copyPrompt, closePrompt);

    const promptText = document.createElement("textarea");
    promptText.readOnly = true;
    promptText.spellcheck = false;
    promptText.style.cssText = [
        "width:100%", "height:calc(100% - 46px)", "resize:none", "box-sizing:border-box",
        "padding:12px", "border-radius:8px", "color:#d7e2ee", "background:#03060a",
        "border:1px solid rgba(104,178,228,.78)", "box-shadow:inset 0 0 0 1px rgba(218,237,250,.13)",
        "font:14px/1.55 sans-serif", "white-space:pre-wrap", "overflow-wrap:anywhere", "user-select:text",
        "visibility:visible", "opacity:1"
    ].join(";");
    promptText.classList.add("nova-dom-text-panel");
    for (const [name, value] of Object.entries({
        background: "#03060a",
        "background-color": "#03060a",
        color: "#d7e2ee",
        border: "1px solid rgba(104,178,228,.82)",
        "border-radius": "8px",
        "box-shadow": "inset 0 0 0 1px rgba(218,237,250,.14), 0 0 0 1px rgba(1,8,14,.88)",
        visibility: "visible",
        opacity: "1",
    })) {
        promptText.style.setProperty(name, value, "important");
    }
    promptPanel.append(promptHeader, promptText);

    const subtitleStylePanel = document.createElement("div");
    subtitleStylePanel.style.cssText = [
        "display:none", "position:absolute", "right:14px", "top:72px", "z-index:17",
        "width:min(390px,calc(100vw - 28px))", "padding:12px", "box-sizing:border-box",
        "border:1px solid rgba(255,255,255,.22)", "border-radius:10px",
        "box-shadow:0 10px 36px rgba(0,0,0,.65)", "backdrop-filter:blur(10px)"
    ].join(";");

    const styleTitle = document.createElement("div");
    styleTitle.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px";
    const styleTitleText = document.createElement("strong");
    styleTitleText.textContent = "Subtitle appearance";
    styleTitleText.style.flex = "1";
    const closeStyle = makeButton("×", "Close subtitle style panel");
    styleTitle.append(styleTitleText, closeStyle);

    const styleGrid = document.createElement("div");
    styleGrid.style.cssText = "display:grid;grid-template-columns:auto 1fr auto;gap:9px 8px;align-items:center;font:12px/1.2 sans-serif";
    const fontSelect = makeSelect(Object.keys(SUBTITLE_FONTS), state.subtitleFont, "Subtitle font");
    fontSelect.style.width = "100%";
    const sizeRange = makeRange(14, 48, state.subtitleSize, "Subtitle font size");
    const sizeValue = document.createElement("span");
    const textColor = document.createElement("input");
    textColor.type = "color";
    textColor.value = state.subtitleColor;
    textColor.title = "Subtitle text colour";
    const highlightColor = document.createElement("input");
    highlightColor.type = "color";
    highlightColor.value = state.subtitleHighlight;
    highlightColor.title = "Current-word highlight colour";
    const backgroundRange = makeRange(0, 95, state.subtitleBackground, "Subtitle background opacity");
    const backgroundValue = document.createElement("span");
    const syncRange = makeRange(-1500, 1500, state.subtitleOffsetMs, "Move karaoke timing earlier or later in milliseconds");
    const syncValue = document.createElement("span");
    const resetSubtitlePosition = makeButton("Reset Position", "Move subtitles above the bottom navigation");
    const centreSubtitle = makeButton("Centre", "Centre the subtitle horizontally");

    const addStyleRow = (labelText, control, valueControl = document.createElement("span")) => {
        const label = document.createElement("span");
        label.textContent = labelText;
        styleGrid.append(label, control, valueControl);
    };
    addStyleRow("Font", fontSelect);
    addStyleRow("Size", sizeRange, sizeValue);
    addStyleRow("Text", textColor);
    addStyleRow("Highlight", highlightColor);
    addStyleRow("Background", backgroundRange, backgroundValue);
    addStyleRow("Karaoke sync", syncRange, syncValue);

    const positionRow = document.createElement("div");
    positionRow.style.cssText = "display:flex;gap:7px;justify-content:flex-end;margin-top:12px";
    positionRow.append(centreSubtitle, resetSubtitlePosition);
    subtitleStylePanel.append(styleTitle, styleGrid, positionRow);

    const subtitleBox = document.createElement("div");
    subtitleBox.style.cssText = [
        "display:none", "position:absolute", "z-index:15", "max-width:min(1100px,82%)",
        "padding:11px 16px", "border-radius:10px", "border:1px solid rgba(255,255,255,.22)",
        "box-shadow:0 4px 24px rgba(0,0,0,.55)", "text-align:center", "pointer-events:auto",
        "text-shadow:0 2px 4px #000", "cursor:move", "touch-action:none", "will-change:left,top"
    ].join(";");
    subtitleBox.title = "Drag to reposition. Click without dragging to play or pause.";
    viewport.append(subtitleBox);

    const audioDock = document.createElement("section");
    audioDock.style.cssText = [
        "position:absolute", "left:0", "right:0", "bottom:0", "z-index:14", "display:flex",
        "align-items:center", "gap:7px", "flex-wrap:wrap", "padding:8px 12px",
        "box-sizing:border-box", "border-top:1px solid rgba(255,255,255,.15)",
        "backdrop-filter:blur(10px)"
    ].join(";");

    const audioCaption = document.createElement("div");
    audioCaption.textContent = "No audio loaded";
    audioCaption.style.cssText = "flex:1 1 250px;min-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 12px/1.2 sans-serif";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.style.cssText = "flex:4 1 520px;min-width:300px;height:36px";
    audio.volume = clamp(state.volume ?? 1, 0, 1);
    audio.playbackRate = Number(state.playbackRate || 1);
    audio.dataset.novaMediaStudio = "true";

    const timeLabel = document.createElement("span");
    timeLabel.textContent = "0:00 / 0:00";
    timeLabel.style.cssText = "min-width:92px;text-align:center;font:12px/1 sans-serif;font-variant-numeric:tabular-nums";

    const loopButton = makeButton("Loop", "Repeat the current voice entry");
    const slideshowButton = makeButton("Slideshow", "Advance through history. With Autoplay Off it advances silently.");
    const shuffleButton = makeButton("Shuffle", "Choose a random history entry during slideshow and when using Next / Previous");
    const speedSelect = makeSelect(["0.75×", "1×", "1.25×", "1.5×", "2×"], `${Number(state.playbackRate || 1)}×`, "Playback speed");
    if (![...speedSelect.options].some((entry) => entry.value === speedSelect.value)) speedSelect.value = "1×";
    const delaySelect = makeSelect(["0 sec", "1 sec", "3 sec", "5 sec"], `${Number(state.slideDelay || 0)} sec`, "Pause before the next slideshow item");
    const autoplayButton = makeButton(`Autoplay ${state.autoplayEnabled ? "On" : "Off"}`, "Master automatic audio playback switch");
    const autoplayAfter = makeSelect(["After Audio Ready", "After First Pass", "After Second Pass"], state.autoplayAfter, "New-generation autoplay timing");
    const followNewButton = makeButton(`Follow New Runs ${state.followNewGeneration ? "On" : "Off"}`, "On follows the newest generation. Off keeps the current manual selection or slideshow locked.");
    const openAudio = makeButton("Audio Folder", "Open NovoLokoVoice/Audio");
    const openImages = makeButton("Image Folder", "Open NovoLokoVoice/Audio/Images");
    const revealCurrent = makeButton("Reveal Current", "Reveal the current audio file in Explorer/Finder");
    const revoiceCurrent = makeButton("Revoice Current", "Create new speech while reusing the exact stored images and prompt");
    const deleteCurrent = makeButton("Delete Current", "Delete the selected Media Studio entry and unshared managed files");

    audioDock.append(
        audioCaption,
        audio,
        timeLabel,
        loopButton,
        slideshowButton,
        shuffleButton,
        speedSelect,
        delaySelect,
        autoplayButton,
        compactLabel("New generation", autoplayAfter),
        followNewButton,
        openAudio,
        openImages,
        revealCurrent,
        revoiceCurrent,
        deleteCurrent,
    );

    const revoicePanel = document.createElement("section");
    revoicePanel.style.cssText = [
        "display:none", "position:absolute", "z-index:30", "left:50%", "top:50%",
        "transform:translate(-50%,-50%)", "width:min(620px,92vw)", "max-height:86vh",
        "overflow:auto", "padding:16px", "border-radius:10px",
        "border:1px solid rgba(255,255,255,.24)", "box-shadow:0 12px 50px rgba(0,0,0,.72)"
    ].join(";");
    const revoiceTitle = document.createElement("strong");
    revoiceTitle.textContent = "Revoice Current";
    revoiceTitle.style.cssText = "display:block;font-size:17px;margin-bottom:12px";
    const revoiceGrid = document.createElement("div");
    revoiceGrid.style.cssText = "display:grid;grid-template-columns:150px minmax(220px,1fr);gap:8px;align-items:center";
    const revoicePrompt = makeSelect(["Spoken", "Manual", "Enhanced"], "Spoken", "Stored prompt source");
    const revoiceEngine = makeSelect(["OmniLoko", "Kokoro"], "OmniLoko", "Exactly one voice backend is used");
    const omniVoice = makeSelect(["Current OmniLoko Profile"], "Current OmniLoko Profile", "OmniLoko profile or saved preset");
    const kokoroVoice = makeSelect(["af_nova | NovoLoko (US Female)"], "af_nova | NovoLoko (US Female)", "Packaged Kokoro voice");
    const advancedToggle = document.createElement("input");
    advancedToggle.type = "checkbox";
    const prefixInput = document.createElement("input");
    prefixInput.type = "text";
    prefixInput.placeholder = "Optional prefix";
    const maxCharacters = document.createElement("input");
    maxCharacters.type = "number";
    maxCharacters.min = "1";
    maxCharacters.max = "20000";
    maxCharacters.value = "2000";
    const normalizeLoudness = document.createElement("input");
    normalizeLoudness.type = "checkbox";
    normalizeLoudness.checked = true;
    const timeoutSeconds = document.createElement("input");
    timeoutSeconds.type = "number";
    timeoutSeconds.min = "1";
    timeoutSeconds.max = "3600";
    timeoutSeconds.value = "300";
    const speedInput = document.createElement("input");
    speedInput.type = "number";
    speedInput.min = "0.5";
    speedInput.max = "2";
    speedInput.step = "0.05";
    speedInput.value = "1";
    const deviceSelect = makeSelect(["Auto", "CUDA", "CPU"], "Auto", "Kokoro device");
    const revoiceRows = {};
    function revoiceRow(key, label, control) {
        const labelElement = document.createElement("label");
        labelElement.textContent = label;
        const wrapper = document.createElement("div");
        wrapper.append(control);
        wrapper.style.minWidth = "0";
        control.style.width = control.type === "checkbox" ? "" : "100%";
        control.style.boxSizing = "border-box";
        revoiceGrid.append(labelElement, wrapper);
        revoiceRows[key] = [labelElement, wrapper];
    }
    revoiceRow("prompt", "Prompt source", revoicePrompt);
    revoiceRow("engine", "Engine", revoiceEngine);
    revoiceRow("omni", "OmniLoko voice", omniVoice);
    revoiceRow("kokoro", "Kokoro voice", kokoroVoice);
    revoiceRow("advanced", "Advanced", advancedToggle);
    revoiceRow("prefix", "Prefix", prefixInput);
    revoiceRow("max", "Max characters", maxCharacters);
    revoiceRow("normalize", "Normalize loudness", normalizeLoudness);
    revoiceRow("timeout", "Timeout seconds", timeoutSeconds);
    revoiceRow("speed", "Speed", speedInput);
    revoiceRow("device", "Device", deviceSelect);
    const revoiceStatus = document.createElement("div");
    revoiceStatus.style.cssText = "min-height:22px;margin-top:10px;font:12px/1.4 sans-serif";
    const revoiceActions = document.createElement("div");
    revoiceActions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px";
    const cancelRevoice = makeButton("Cancel", "Close or cancel active revoice generation");
    const generateRevoice = makeButton("Generate Revoice", "Generate audio only; image-generation nodes are not queued");
    revoiceActions.append(cancelRevoice, generateRevoice);
    revoicePanel.append(revoiceTitle, revoiceGrid, revoiceStatus, revoiceActions);
    overlay.append(promptPanel, subtitleStylePanel, revoicePanel, audioDock);

    function theme() {
        return THEMES[state.theme] || THEMES[DEFAULTS.theme];
    }

    function buttonAccent() {
        return BUTTON_COLORS[state.buttonColor] || theme().accent;
    }

    function viewerTextColor() {
        return TEXT_COLORS[state.textColor] || theme().text;
    }

    function buttonContrast(accent) {
        const value = String(accent || "#ffffff").replace("#", "");
        if (value.length !== 6) return "#07111d";
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? "#07111d" : "#ffffff";
    }

    function styleButton(button, active = false) {
        const accent = buttonAccent();
        const style = BUTTON_STYLES.includes(state.buttonStyle) ? state.buttonStyle : "Soft";
        const text = viewerTextColor();
        button.style.opacity = active ? "1" : ".82";
        button.style.fontWeight = active ? "750" : "500";
        button.style.borderColor = `${accent}aa`;
        button.style.boxShadow = "none";
        if (style === "Solid") {
            button.style.background = active ? accent : `${accent}cc`;
            button.style.color = buttonContrast(accent);
        } else if (style === "Outline") {
            button.style.background = active ? `${accent}22` : "transparent";
            button.style.color = active ? accent : text;
            button.style.borderWidth = "1px";
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

    function setButtonState(button, active) {
        styleButton(button, active);
        button.style.outline = active ? `1px solid ${theme().accentSoft}` : "none";
    }

    function applySubtitleStyle() {
        state.subtitleX = clamp(state.subtitleX, 8, 92);
        state.subtitleY = clamp(state.subtitleY, 12, 90);
        subtitleBox.style.left = `${state.subtitleX}%`;
        subtitleBox.style.top = `${state.subtitleY}%`;
        subtitleBox.style.transform = "translate(-50%,-50%)";
        subtitleBox.style.fontFamily = SUBTITLE_FONTS[state.subtitleFont] || SUBTITLE_FONTS.Arial;
        subtitleBox.style.fontSize = `${clamp(state.subtitleSize, 14, 48)}px`;
        subtitleBox.style.lineHeight = "1.42";
        subtitleBox.style.fontWeight = "600";
        subtitleBox.style.color = state.subtitleColor || "#ffffff";
        subtitleBox.style.background = `rgba(0,0,0,${clamp(state.subtitleBackground, 0, 95) / 100})`;
        sizeValue.textContent = `${Math.round(state.subtitleSize)}px`;
        backgroundValue.textContent = `${Math.round(state.subtitleBackground)}%`;
        syncValue.textContent = `${Math.round(state.subtitleOffsetMs)}ms`;
        fontSelect.value = state.subtitleFont;
        sizeRange.value = String(state.subtitleSize);
        textColor.value = state.subtitleColor;
        highlightColor.value = state.subtitleHighlight;
        backgroundRange.value = String(state.subtitleBackground);
        syncRange.value = String(state.subtitleOffsetMs);
    }

    function applyTheme() {
        const currentTheme = theme();
        const accent = buttonAccent();
        const textColour = viewerTextColor();
        overlay.style.color = textColour;
        toolbar.style.color = textColour;
        audioDock.style.color = textColour;
        promptPanel.style.color = textColour;
        subtitleStylePanel.style.color = textColour;
        toolbar.style.background = currentTheme.panel;
        audioDock.style.background = currentTheme.panel;
        promptPanel.style.background = currentTheme.panel2;
        subtitleStylePanel.style.background = currentTheme.panel2;
        revoicePanel.style.background = currentTheme.panel2;

        viewport.style.backgroundImage = "none";
        if (state.background === "Checker") {
            viewport.style.backgroundColor = "#181a1e";
            viewport.style.backgroundImage = "linear-gradient(45deg,#252830 25%,transparent 25%),linear-gradient(-45deg,#252830 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#252830 75%),linear-gradient(-45deg,transparent 75%,#252830 75%)";
            viewport.style.backgroundSize = "32px 32px";
            viewport.style.backgroundPosition = "0 0,0 16px,16px -16px,-16px 0";
        } else if (state.background === "Neutral") {
            viewport.style.background = "#25272c";
        } else if (state.background === "White") {
            viewport.style.background = "#e8eaee";
        } else if (state.background === "Deep Blue") {
            viewport.style.background = "#071426";
        } else if (state.background === "Warm Grey") {
            viewport.style.background = "#302d2a";
        } else if (state.background === "Gradient") {
            viewport.style.background = "radial-gradient(circle at 50% 35%,#24344b 0,#10151e 45%,#030507 100%)";
        } else if (state.background === "Studio Grey") {
            viewport.style.background = "linear-gradient(135deg,#2f333a,#171a1f)";
        } else if (state.background === "Paper") {
            viewport.style.background = "#ddd7ca";
        } else if (state.background === "Navy Grid") {
            viewport.style.backgroundColor = "#071426";
            viewport.style.backgroundImage = "linear-gradient(#173251 1px,transparent 1px),linear-gradient(90deg,#173251 1px,transparent 1px)";
            viewport.style.backgroundSize = "32px 32px";
        } else if (state.background === "OLED") {
            viewport.style.background = "#000000";
        } else if (state.background === "Transparent") {
            viewport.style.background = "transparent";
        } else {
            viewport.style.background = "#05070a";
        }

        for (const element of overlay.querySelectorAll("button")) {
            styleButton(element, element.dataset.novaActive === "true");
        }
        for (const element of overlay.querySelectorAll("select,input[type=number]")) {
            element.style.borderColor = `${accent}88`;
            element.style.color = textColour;
            element.style.backgroundColor = currentTheme.panel2;
        }
        setButtonState(promptButton, state.promptVisible);
        setButtonState(labelsButton, state.labelsVisible);
        labelsButton.textContent = `Labels ${state.labelsVisible ? "On" : "Off"}`;
        setButtonState(subtitleStyleButton, subtitleStylePanel.style.display !== "none");
        setButtonState(loopButton, state.loop);
        setButtonState(slideshowButton, state.slideshow);
        setButtonState(shuffleButton, state.shuffle);
        setButtonState(autoplayButton, state.autoplayEnabled);
        setButtonState(followNewButton, state.followNewGeneration);
        autoplayButton.textContent = `Autoplay ${state.autoplayEnabled ? "On" : "Off"}`;
        followNewButton.textContent = `Follow New Runs ${state.followNewGeneration ? "On" : "Off"}`;
        autoplayAfter.disabled = !state.autoplayEnabled;
        autoplayAfter.style.opacity = state.autoplayEnabled ? "1" : ".48";
        applySubtitleStyle();
    }

    function applyLabels() {
        viewer.setLabelsVisible?.(Boolean(state.labelsVisible));
    }

    function persist() {
        saveSettings(state);
        applyTheme();
        applyLabels();
    }

    function updateLayout(refit = false) {
        if (overlay.style.display === "none") return;
        const historyPrevious = overlay.querySelector('[data-nova-role="history-previous"]');
        const historyNext = overlay.querySelector('[data-nova-role="history-next"]');

        if (uiHidden) {
            toolbar.style.display = "none";
            audioDock.style.display = "none";
            promptPanel.style.display = "none";
            subtitleStylePanel.style.display = "none";
            if (historyNavigation) historyNavigation.style.display = "none";
            if (historyPrevious) historyPrevious.style.display = "none";
            if (historyNext) historyNext.style.display = "none";
            viewport.style.top = "0";
            viewport.style.bottom = "0";
            viewport.style.right = "0";
        } else {
            toolbar.style.display = "flex";
            audioDock.style.display = "flex";
            if (historyNavigation) historyNavigation.style.display = "flex";
            if (historyPrevious) historyPrevious.style.display = "block";
            if (historyNext) historyNext.style.display = "block";
            const top = Math.max(52, toolbar.offsetHeight || 52);
            const bottom = Math.max(58, audioDock.offsetHeight || 58);
            const panelWidth = state.promptVisible ? Math.min(430, window.innerWidth * 0.42) : 0;
            viewport.style.top = `${top}px`;
            viewport.style.bottom = `${bottom}px`;
            viewport.style.right = `${panelWidth}px`;
            promptPanel.style.top = `${top}px`;
            promptPanel.style.bottom = `${bottom}px`;
            promptPanel.style.display = state.promptVisible ? "block" : "none";
            subtitleStylePanel.style.top = `${top + 10}px`;
            if (historyNavigation) historyNavigation.style.bottom = `${bottom + 15}px`;
        }
        applySubtitleStyle();
        if (refit) setTimeout(() => viewer.refreshView?.(), 50);
    }

    function setUIHidden(hidden) {
        uiHidden = Boolean(hidden);
        hideUIButton.textContent = uiHidden ? "UI Hidden" : "Hide UI";
        updateLayout(true);
    }

    function moveSharedAudioToDock() {
        if (audio.parentElement !== audioDock) audioDock.insertBefore(audio, timeLabel);
        audio.style.cssText = "flex:4 1 520px;min-width:300px;height:36px";
    }

    function attachSharedAudioToNode(node) {
        if (!node) return;
        let original = node.__novaOriginalAudioElement || node.__novaAudioElement;
        if (!original || original === audio) original = node.__novaOriginalAudioElement;
        if (!original?.parentElement) return;

        if (attachedNode && attachedNode !== node && attachedOriginalAudio) {
            attachedNode.__novaAudioElement = attachedOriginalAudio;
            attachedOriginalAudio.style.display = "block";
        }

        node.__novaOriginalAudioElement = original;
        original.style.display = "none";
        node.__novaAudioElement = audio;
        original.parentElement.insertBefore(audio, original.nextSibling);
        audio.style.cssText = "display:block;width:100%;height:38px;min-height:38px;pointer-events:auto";
        attachedNode = node;
        attachedOriginalAudio = original;
    }

    function setPromptVisible(visible, refit = true) {
        state.promptVisible = Boolean(visible);
        persist();
        updateLayout(refit);
    }

    function setStylePanelVisible(visible) {
        subtitleStylePanel.style.display = visible ? "block" : "none";
        applyTheme();
    }

    function rebuildKaraoke() {
        const text = promptFor(currentItem(viewer), state.promptMode);
        if (karaoke.text === text) return;
        const words = text.match(/\S+/g) || [];
        const weights = words.map((word) => {
            const clean = word.replace(/[^\p{L}\p{N}'-]/gu, "");
            const vowelGroups = clean.toLowerCase().match(/[aeiouy]+/g)?.length || 1;
            const letters = Math.max(1, clean.length);
            let weight = 1.15 + vowelGroups * 1.55 + letters * 0.12;
            if (/[.!?]["')\]]*$/.test(word)) weight += 4.6;
            else if (/[,]["')\]]*$/.test(word)) weight += 1.6;
            else if (/[;:]["')\]]*$/.test(word)) weight += 1.0;
            else if (/[-—]$/.test(word)) weight += 0.55;
            return weight;
        });
        const cumulative = [];
        let total = 0;
        for (const weight of weights) {
            total += weight;
            cumulative.push(total);
        }
        const sentences = [];
        let start = 0;
        for (let index = 0; index < words.length; index += 1) {
            if (/[.!?]["')\]]*$/.test(words[index]) || index === words.length - 1) {
                sentences.push({
                    start,
                    end: index,
                    text: words.slice(start, index + 1).join(" "),
                });
                start = index + 1;
            }
        }
        karaoke = { text, words, cumulative, total: Math.max(1, total), sentences };
        subtitleKey = "";
    }

    function currentWordIndex() {
        rebuildKaraoke();
        if (!karaoke.words.length) return -1;
        const duration = Number(audio.duration || currentItem(viewer)?.duration || 0);
        if (!(duration > 0)) return 0;
        const adjustedTime = Math.max(0, Number(audio.currentTime || 0) + Number(state.subtitleOffsetMs || 0) / 1000);
        const progress = clamp(adjustedTime / duration, 0, 1);
        const target = progress * karaoke.total;
        let low = 0;
        let high = karaoke.cumulative.length - 1;
        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (karaoke.cumulative[mid] < target) low = mid + 1;
            else high = mid;
        }
        return low;
    }

    function renderSubtitle() {
        const mode = state.subtitles;
        if (mode === "Off" || !audio.src || overlay.style.display === "none") {
            subtitleBox.style.display = "none";
            return;
        }
        rebuildKaraoke();
        const index = currentWordIndex();
        const key = `${mode}:${index}:${karaoke.text}:${state.subtitleFont}:${state.subtitleSize}:${state.subtitleColor}:${state.subtitleHighlight}:${state.subtitleOffsetMs}`;
        subtitleBox.style.display = "block";
        applySubtitleStyle();
        if (key === subtitleKey) return;
        subtitleKey = key;
        subtitleBox.replaceChildren();

        if (mode === "Line") {
            const sentence = karaoke.sentences.find((entry) => index >= entry.start && index <= entry.end);
            subtitleBox.textContent = sentence?.text || karaoke.text;
            return;
        }

        const from = Math.max(0, index - 5);
        const to = Math.min(karaoke.words.length, index + 6);
        for (let i = from; i < to; i += 1) {
            const span = document.createElement("span");
            span.textContent = `${karaoke.words[i]} `;
            span.style.transition = "all .12s ease";
            if (i === index) {
                span.style.color = state.subtitleHighlight || theme().accentSoft;
                span.style.background = `${state.subtitleHighlight || theme().accent}33`;
                span.style.borderRadius = "5px";
                span.style.padding = "1px 4px";
                span.style.fontSize = "1.18em";
            } else if (i < index) {
                span.style.opacity = ".48";
            } else {
                span.style.opacity = ".88";
            }
            subtitleBox.append(span);
        }
    }

    function subtitleTick() {
        renderSubtitle();
        subtitleFrame = requestAnimationFrame(subtitleTick);
    }

    function updatePrompt() {
        const item = currentItem(viewer);
        const text = promptFor(item, state.promptMode);
        promptText.value = text;
        promptTitle.textContent = `${state.promptMode} prompt`;
        promptMode.value = state.promptMode;
        rebuildKaraoke();
        renderSubtitle();
    }

    function pauseOtherNovaAudio() {
        const sharedStudio = window.__novaMediaStudioAudio;
        if (sharedStudio && sharedStudio !== audio && !sharedStudio.paused) sharedStudio.pause();
        for (const other of document.querySelectorAll('audio[data-nova-autoplay-trigger="true"],audio[data-nova-media-studio="true"]')) {
            if (other !== audio && !other.paused) other.pause();
        }
        const nodes = viewer.node?.graph?._nodes || app.graph?._nodes || [];
        for (const node of nodes) {
            const other = node?.__novaAudioElement;
            if (other && other !== audio && !other.paused) other.pause();
        }
        const triggerAudio = document.querySelector('audio[data-nova-autoplay-trigger="true"]');
        if (triggerAudio && triggerAudio !== audio && !triggerAudio.paused) triggerAudio.pause();
        const active = window.__novaActiveAudioElement;
        if (active && active !== audio && !active.paused) active.pause();
        window.__novaActiveAudioElement = audio;
        window.__novaMediaStudioAudio = audio;
    }

    async function playAudio(showNotice = true) {
        if (!audio.src) return;
        pauseOtherNovaAudio();
        try {
            await audio.play();
        } catch (error) {
            const name = String(error?.name || "");
            if (showNotice && (name === "NotAllowedError" || name === "AbortError")) {
                blockedNoticeOnce("Autoplay is ready. Click Play once; this notice appears only once per session.");
            }
        }
    }

    function updateAudioButtons() {
        audio.loop = Boolean(state.loop && !state.slideshow);
        audio.playbackRate = Number(state.playbackRate || 1);
        setButtonState(loopButton, state.loop);
        setButtonState(slideshowButton, state.slideshow);
        setButtonState(shuffleButton, state.shuffle);
        setButtonState(autoplayButton, state.autoplayEnabled);
        setButtonState(followNewButton, state.followNewGeneration);
        autoplayButton.textContent = `Autoplay ${state.autoplayEnabled ? "On" : "Off"}`;
        followNewButton.textContent = `Follow New Runs ${state.followNewGeneration ? "On" : "Off"}`;
        autoplayAfter.disabled = !state.autoplayEnabled;
        autoplayAfter.style.opacity = state.autoplayEnabled ? "1" : ".48";
        shuffleButton.disabled = false;
        shuffleButton.style.pointerEvents = "auto";
    }

    function syncNodeLoop() {
        const loopWidget = viewer.node?.widgets?.find((entry) => entry.name === "loop");
        if (loopWidget) {
            loopWidget.value = Boolean(state.loop);
            loopWidget.callback?.(loopWidget.value);
        }
    }

    function syncAutoplaySettings() {
        const historyAutoplay = viewer.node?.widgets?.find((entry) => entry.name === "autoplay");
        if (historyAutoplay) {
            historyAutoplay.value = Boolean(state.autoplayEnabled);
            historyAutoplay.callback?.(historyAutoplay.value);
        }

        const nodes = viewer.node?.graph?._nodes || app.graph?._nodes || [];
        for (const node of nodes) {
            if (String(node?.type || node?.comfyClass || "") !== "NovaAudioAutoplayTrigger") continue;
            const trigger = node.widgets?.find((entry) => entry.name === "trigger_after");
            const enabled = node.widgets?.find((entry) => entry.name === "enabled");
            if (trigger) {
                trigger.value = state.autoplayAfter;
                trigger.callback?.(trigger.value);
            }
            if (enabled) {
                enabled.value = Boolean(state.autoplayEnabled);
                enabled.callback?.(enabled.value);
            }
            node.setDirtyCanvas?.(true, true);
        }
        app.graph?.setDirtyCanvas?.(true, true);
    }

    function scheduleSilentSlide(item) {
        clearTimeout(silentSlideTimer);
        if (!state.slideshow || state.autoplayEnabled) return;
        const displaySeconds = Math.max(3, Number(item?.duration || 0) || 6);
        silentSlideTimer = setTimeout(() => {
            if (!state.slideshow || state.autoplayEnabled) return;
            const nextIndex = nextSlideshowIndex();
            if (nextIndex >= 0) navigateToIndex(nextIndex, false);
        }, (displaySeconds + Math.max(0, Number(state.slideDelay || 0))) * 1000);
    }

    function loadItemAudio(item, playNow = false, carryTime = 0) {
        const filename = String(item?.filename || "").trim();
        const imageOnly = Boolean(item?.media_only || item?.has_audio === false);
        generationOverride = false;
        clearTimeout(silentSlideTimer);
        const token = ++audioLoadToken;

        if (imageOnly || !filename) {
            audio.pause();
            audio.removeAttribute("src");
            delete audio.dataset.filename;
            delete audio.dataset.sourceKind;
            audio.load?.();
            audioDock.style.display = imageOnly ? "none" : "";
            audioCaption.textContent = imageOnly
                ? "Image-only gallery entry"
                : "No audio stored for this entry";
            timeLabel.textContent = "0:00 / 0:00";
            scheduleSilentSlide(item);
            updateAudioButtons();
            updatePrompt();
            requestAnimationFrame(() => updateLayout(false));
            return;
        }

        audioDock.style.display = "";

        const same = audio.dataset.filename === filename && audio.dataset.sourceKind === "history";
        audioCaption.textContent = `${item.voice_code || item.voice || "Voice"} • ${filename}`;
        if (!same) {
            audio.pause();
            pauseOtherNovaAudio();
            audio.dataset.filename = filename;
            audio.dataset.sourceKind = "history";
            audio.src = audioUrl(filename);
            audio.load();
            audio.addEventListener("loadedmetadata", () => {
                if (token !== audioLoadToken) return;
                if (carryTime > 0 && Number.isFinite(audio.duration)) {
                    audio.currentTime = Math.min(carryTime, Math.max(0, audio.duration - 0.05));
                }
                if (playNow) playAudio();
                else scheduleSilentSlide(item);
            }, { once: true });
        } else if (playNow && audio.paused) {
            playAudio();
        } else if (!playNow) {
            audio.pause();
            scheduleSilentSlide(item);
        }
        updateAudioButtons();
        updatePrompt();
    }

    function stopNodeAudio() {
        const nodeAudio = viewer.node?.__novaAudioElement;
        if (!nodeAudio) return { wasPlaying: false, currentTime: 0 };
        const result = {
            wasPlaying: !nodeAudio.paused && !nodeAudio.ended,
            currentTime: Number(nodeAudio.currentTime || 0),
        };
        if (nodeAudio !== audio) nodeAudio.pause();
        if (viewer.node) {
            viewer.node.__novaAudioPlayToken = Number(viewer.node.__novaAudioPlayToken || 0) + 1;
        }
        return result;
    }

    function captureExternalPlayback() {
        const transfer = stopNodeAudio();
        const candidates = [
            document.querySelector('audio[data-nova-autoplay-trigger="true"]'),
            window.__novaActiveAudioElement,
        ];
        for (const candidate of candidates) {
            if (!candidate || candidate === audio || candidate.paused) continue;
            transfer.wasPlaying = true;
            transfer.currentTime = Math.max(transfer.currentTime, Number(candidate.currentTime || 0));
            candidate.pause();
        }
        return transfer;
    }

    function activeHistoryNode() {
        return viewer.node || lastNode || attachedNode || null;
    }

    function activeHistoryItem() {
        return activeHistoryNode()?.__novaCurrentHistoryItem || null;
    }

    function nextSlideshowIndex() {
        const node = activeHistoryNode();
        const items = node?.__novaHistoryItems || [];
        if (!items.length) return -1;
        const current = Number(node.__novaCurrentHistoryIndex || 0);
        if (state.shuffle && items.length > 1) {
            let next = current;
            for (let attempt = 0; attempt < 20 && next === current; attempt += 1) {
                next = Math.floor(Math.random() * items.length);
            }
            return next;
        }
        return (current + 1) % items.length;
    }

    function navigateToIndex(index, playNow = true) {
        const node = activeHistoryNode();
        if (!node) return;
        const current = Number(node.__novaCurrentHistoryIndex || 0);
        // nova-history-selection is cancelable and is handled by this studio,
        // so the node player never creates a second playing audio instance.
        viewer.navigate?.(Number(index) - current, Boolean(playNow));
    }

    function randomHistoryIndex() {
        const node = activeHistoryNode();
        const items = node?.__novaHistoryItems || [];
        if (!items.length) return -1;
        const current = Number(node.__novaCurrentHistoryIndex || 0);
        if (items.length === 1) return current;

        let next = current;
        for (let attempt = 0; attempt < 30 && next === current; attempt += 1) {
            next = Math.floor(Math.random() * items.length);
        }
        return next;
    }

    window.__novaMediaStudioNavigateHistory = (direction, playNow = true) => {
        const node = activeHistoryNode();
        if (!node) return false;

        if (state.shuffle) {
            const index = randomHistoryIndex();
            if (index < 0) return false;
            navigateToIndex(index, Boolean(playNow));
            return true;
        }

        viewer.navigate?.(Number(direction || 0), Boolean(playNow));
        return true;
    };

    overlay.addEventListener("click", (event) => {
        const target = event.target?.closest?.(
            '[data-nova-role="history-next"],[data-nova-role="history-previous"]'
        );
        if (!target || !state.shuffle) return;

        const index = randomHistoryIndex();
        if (index < 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        navigateToIndex(index, Boolean(state.autoplayEnabled));
    }, true);

    async function folderAction(kind, reveal = false) {
        const item = activeHistoryItem() || {};
        const filename = reveal ? String(item.filename || "") : "";
        try {
            const response = await api.fetchApi("/nova_voice/open_folder", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind, reveal, filename }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Folder could not be opened.");
        } catch (error) {
            notify(error?.message || String(error), "error");
        }
    }

    function setRevoiceRowVisible(key, visible) {
        for (const element of revoiceRows[key] || []) {
            element.style.display = visible ? "" : "none";
        }
    }

    function updateRevoiceFields() {
        const omni = revoiceEngine.value === "OmniLoko";
        const advanced = advancedToggle.checked;
        setRevoiceRowVisible("omni", omni);
        setRevoiceRowVisible("kokoro", !omni);
        setRevoiceRowVisible("prefix", advanced);
        setRevoiceRowVisible("max", advanced);
        setRevoiceRowVisible("normalize", advanced && omni);
        setRevoiceRowVisible("timeout", advanced && omni);
        setRevoiceRowVisible("speed", advanced && !omni);
        setRevoiceRowVisible("device", advanced && !omni);
    }

    function replaceSelectValues(select, values, fallback) {
        const selected = String(select.value || fallback);
        const clean = [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
        if (!clean.includes(fallback)) clean.unshift(fallback);
        if (selected && !clean.includes(selected)) clean.push(selected);
        select.replaceChildren();
        for (const value of clean) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            select.append(option);
        }
        select.value = selected || fallback;
    }

    async function refreshRevoiceVoices() {
        try {
            const response = await api.fetchApi("/nova_voice/voices", { cache: "no-store" });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Voice refresh failed.");
            replaceSelectValues(omniVoice, data.omniloko, "Current OmniLoko Profile");
            replaceSelectValues(kokoroVoice, data.kokoro, "af_nova | NovoLoko (US Female)");
            revoiceStatus.textContent = "";
        } catch (error) {
            revoiceStatus.textContent = `Voice refresh unavailable: ${error?.message || String(error)}`;
        }
    }

    async function openRevoicePanel() {
        if (!activeHistoryItem()) {
            notify("Select a Media Studio entry first.", "error");
            return;
        }
        revoicePrompt.value = state.promptMode || "Spoken";
        revoicePanel.style.display = "block";
        updateRevoiceFields();
        await refreshRevoiceVoices();
    }

    async function deleteCurrentEntry() {
        const node = activeHistoryNode();
        const item = activeHistoryItem();
        if (!node || !item?.filename) {
            notify("Select a Media Studio entry first.", "error");
            return;
        }
        if (!window.confirm(`Delete the current Media Studio entry?\n\n${item.filename}\n\nShared images used by other entries will be kept.`)) return;
        audio.pause();
        const previousIndex = Number(node.__novaCurrentHistoryIndex || 0);
        try {
            const response = await api.fetchApi("/nova_voice/audio/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: item.filename }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Delete failed.");
            node.__novaCurrentHistoryItem = null;
            const nearest = Math.max(0, Math.min(previousIndex, Math.max(0, Number(data.items?.length || 0) - 1)));
            await window.__novaReloadMediaHistory?.(node, false, nearest);
            notify(`Deleted ${item.filename}.`);
        } catch (error) {
            notify(error?.message || String(error), "error");
        }
    }

    async function generateRevoiceEntry() {
        const node = activeHistoryNode();
        const item = activeHistoryItem();
        if (!node || !item?.filename || activeRevoiceRequestId) return;
        const generatedRequestId = window.crypto?.randomUUID?.();
        activeRevoiceRequestId = generatedRequestId
            ? generatedRequestId.replaceAll("-", "")
            : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        generateRevoice.disabled = true;
        revoiceStatus.textContent = `Generating ${revoiceEngine.value} speech only…`;
        try {
            const response = await api.fetchApi("/nova_voice/audio/revoice", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requestId: activeRevoiceRequestId,
                    filename: item.filename,
                    promptSource: revoicePrompt.value,
                    engine: revoiceEngine.value,
                    voice: revoiceEngine.value === "OmniLoko" ? omniVoice.value : kokoroVoice.value,
                    advanced: advancedToggle.checked,
                    prefix: prefixInput.value,
                    maxCharacters: Number(maxCharacters.value || 2000),
                    normalizeLoudness: normalizeLoudness.checked,
                    timeoutSeconds: Number(timeoutSeconds.value || 300),
                    speed: Number(speedInput.value || 1),
                    device: deviceSelect.value,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) throw new Error(data.error || "Revoice failed.");
            await window.__novaReloadMediaHistory?.(node, true, 0);
            revoicePanel.style.display = "none";
            notify(`Revoiced with ${data.item?.voice_code || revoiceEngine.value}; stored images were reused.`);
        } catch (error) {
            revoiceStatus.textContent = error?.message || String(error);
            if (!String(error?.message || "").toLowerCase().includes("cancel")) {
                notify(error?.message || String(error), "error");
            }
        } finally {
            activeRevoiceRequestId = "";
            generateRevoice.disabled = false;
        }
    }

    async function cancelRevoiceEntry() {
        if (!activeRevoiceRequestId) {
            revoicePanel.style.display = "none";
            return;
        }
        revoiceStatus.textContent = "Cancelling…";
        try {
            await api.fetchApi("/nova_voice/audio/revoice/cancel", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestId: activeRevoiceRequestId }),
            });
        } catch (_) {
        }
    }

    function resetSubtitlePositionOnly() {
        state.subtitleX = DEFAULTS.subtitleX;
        state.subtitleY = DEFAULTS.subtitleY;
        persist();
        applySubtitleStyle();
    }

    function resetStudio() {
        Object.assign(state, { ...DEFAULTS });
        themeSelect.value = state.theme;
        backgroundSelect.value = state.background;
        buttonColorSelect.value = state.buttonColor;
        textColorSelect.value = state.textColor;
        buttonStyleSelect.value = state.buttonStyle;
        subtitleSelect.value = state.subtitles;
        promptMode.value = state.promptMode;
        speedSelect.value = "1×";
        delaySelect.value = "0 sec";
        autoplayAfter.value = state.autoplayAfter;
        audio.volume = 1;
        setPromptVisible(false, false);
        setStylePanelVisible(false);
        applyLabels();
        syncNodeLoop();
        syncAutoplaySettings();
        updateAudioButtons();
        persist();
        updatePrompt();
        setUIHidden(false);
        updateLayout(true);
    }

    // This hook is queried by the history node when a new generation finishes.
    // It is installed once, not inside Reset, so Follow New Off is authoritative.
    window.__novaMediaStudioShouldFollowNew = (node) => {
        if (node && lastNode && node !== lastNode && node !== attachedNode) return true;
        return Boolean(state.followNewGeneration);
    };

    window.addEventListener("nova-new-history-ready", (event) => {
        const detail = event.detail || {};
        if (lastNode && detail.node && detail.node !== lastNode && detail.node !== attachedNode) return;
        pendingGeneration = { node: detail.node, item: detail.item };
        if (!state.followNewGeneration) {
            audioCaption.textContent = "New generation saved • current gallery and slideshow kept • turn Follow New Runs on to switch";
        }
    });

    themeSelect.addEventListener("change", () => {
        state.theme = themeSelect.value;
        persist();
        renderSubtitle();
    });
    backgroundSelect.addEventListener("change", () => {
        state.background = backgroundSelect.value;
        persist();
    });
    buttonColorSelect.addEventListener("change", () => {
        state.buttonColor = buttonColorSelect.value;
        persist();
    });
    textColorSelect.addEventListener("change", () => {
        state.textColor = textColorSelect.value;
        persist();
    });
    buttonStyleSelect.addEventListener("change", () => {
        state.buttonStyle = buttonStyleSelect.value;
        persist();
    });
    hideUIButton.addEventListener("click", () => setUIHidden(true));
    promptButton.addEventListener("click", () => setPromptVisible(!state.promptVisible));
    labelsButton.addEventListener("click", () => {
        state.labelsVisible = !state.labelsVisible;
        persist();
    });
    closePrompt.addEventListener("click", () => setPromptVisible(false));
    subtitleSelect.addEventListener("change", () => {
        state.subtitles = subtitleSelect.value;
        persist();
        renderSubtitle();
    });
    subtitleStyleButton.addEventListener("click", () => {
        setStylePanelVisible(subtitleStylePanel.style.display === "none");
    });
    closeStyle.addEventListener("click", () => setStylePanelVisible(false));
    promptMode.addEventListener("change", () => {
        state.promptMode = promptMode.value;
        persist();
        updatePrompt();
    });
    copyPrompt.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(promptText.value || "");
            notify("Prompt copied.");
        } catch (_) {
            notify("Clipboard access was blocked.", "error");
        }
    });
    resetLayoutButton.addEventListener("click", resetStudio);

    fontSelect.addEventListener("change", () => {
        state.subtitleFont = fontSelect.value;
        persist();
        renderSubtitle();
    });
    sizeRange.addEventListener("input", () => {
        state.subtitleSize = Number(sizeRange.value);
        persist();
        renderSubtitle();
    });
    textColor.addEventListener("input", () => {
        state.subtitleColor = textColor.value;
        persist();
        renderSubtitle();
    });
    highlightColor.addEventListener("input", () => {
        state.subtitleHighlight = highlightColor.value;
        persist();
        renderSubtitle();
    });
    backgroundRange.addEventListener("input", () => {
        state.subtitleBackground = Number(backgroundRange.value);
        persist();
        renderSubtitle();
    });
    syncRange.addEventListener("input", () => {
        state.subtitleOffsetMs = Number(syncRange.value);
        persist();
        subtitleKey = "";
        renderSubtitle();
    });
    resetSubtitlePosition.addEventListener("click", resetSubtitlePositionOnly);
    centreSubtitle.addEventListener("click", () => {
        state.subtitleX = 50;
        persist();
        applySubtitleStyle();
    });

    loopButton.addEventListener("click", () => {
        state.loop = !state.loop;
        if (state.loop) state.slideshow = false;
        syncNodeLoop();
        persist();
        updateAudioButtons();
    });
    slideshowButton.addEventListener("click", () => {
        state.slideshow = !state.slideshow;
        if (state.slideshow) state.loop = false;
        clearTimeout(slideshowTimer);
        clearTimeout(silentSlideTimer);
        syncNodeLoop();
        persist();
        updateAudioButtons();
        if (state.slideshow && audio.paused) scheduleSilentSlide(activeHistoryItem());
    });
    shuffleButton.addEventListener("click", () => {
        state.shuffle = !state.shuffle;
        persist();
        updateAudioButtons();
    });
    speedSelect.addEventListener("change", () => {
        state.playbackRate = Number(speedSelect.value.replace("×", "")) || 1;
        audio.playbackRate = state.playbackRate;
        persist();
    });
    delaySelect.addEventListener("change", () => {
        state.slideDelay = Number(delaySelect.value.replace(" sec", "")) || 0;
        persist();
    });
    autoplayButton.addEventListener("click", () => {
        state.autoplayEnabled = !state.autoplayEnabled;
        clearTimeout(silentSlideTimer);
        persist();
        syncAutoplaySettings();
        updateAudioButtons();
        if (!state.autoplayEnabled && state.slideshow && audio.paused) scheduleSilentSlide(activeHistoryItem());
    });
    followNewButton.addEventListener("click", () => {
        state.followNewGeneration = !state.followNewGeneration;
        persist();
        updateAudioButtons();
        if (state.followNewGeneration && pendingGeneration) {
            const queued = pendingGeneration;
            pendingGeneration = null;
            if (queued.node && queued.item) {
                const items = queued.node.__novaHistoryItems || [];
                const index = Math.max(0, items.findIndex((item) => item?.filename === queued.item?.filename));
                if (typeof window.__novaSelectHistoryByIndex === "function") {
                    window.__novaSelectHistoryByIndex(queued.node, index, Boolean(state.autoplayEnabled));
                }
            }
        }
    });
    autoplayAfter.addEventListener("change", () => {
        state.autoplayAfter = autoplayAfter.value;
        persist();
        syncAutoplaySettings();
    });
    openAudio.addEventListener("click", () => folderAction("audio", false));
    openImages.addEventListener("click", () => folderAction("images", false));
    revealCurrent.addEventListener("click", () => folderAction("audio", true));
    deleteCurrent.addEventListener("click", deleteCurrentEntry);
    revoiceCurrent.addEventListener("click", openRevoicePanel);
    revoiceEngine.addEventListener("change", updateRevoiceFields);
    advancedToggle.addEventListener("change", updateRevoiceFields);
    generateRevoice.addEventListener("click", generateRevoiceEntry);
    cancelRevoice.addEventListener("click", cancelRevoiceEntry);

    audio.addEventListener("play", pauseOtherNovaAudio);
    audio.addEventListener("volumechange", () => {
        state.volume = audio.volume;
        saveSettings(state);
    });
    audio.addEventListener("ratechange", () => {
        state.playbackRate = audio.playbackRate;
        saveSettings(state);
    });
    audio.addEventListener("timeupdate", () => {
        timeLabel.textContent = `${formatClock(audio.currentTime)} / ${formatClock(audio.duration)}`;
        renderSubtitle();
    });
    audio.addEventListener("loadedmetadata", () => {
        timeLabel.textContent = `${formatClock(audio.currentTime)} / ${formatClock(audio.duration)}`;
        renderSubtitle();
    });
    audio.addEventListener("ended", () => {
        generationOverride = false;
        if (!state.slideshow) return;
        clearTimeout(slideshowTimer);
        slideshowTimer = setTimeout(() => {
            const nextIndex = nextSlideshowIndex();
            if (nextIndex >= 0) navigateToIndex(nextIndex, Boolean(state.autoplayEnabled));
        }, Math.max(0, Number(state.slideDelay || 0)) * 1000);
    });

    subtitleBox.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const viewportRect = viewport.getBoundingClientRect();
        subtitleDragging = true;
        subtitleMoved = false;
        subtitlePointerId = event.pointerId;
        subtitleStartX = event.clientX;
        subtitleStartY = event.clientY;
        subtitleStartLeft = viewportRect.left + viewportRect.width * state.subtitleX / 100;
        subtitleStartTop = viewportRect.top + viewportRect.height * state.subtitleY / 100;
        subtitleBox.setPointerCapture?.(event.pointerId);
    });
    subtitleBox.addEventListener("pointermove", (event) => {
        if (!subtitleDragging || event.pointerId !== subtitlePointerId) return;
        event.preventDefault();
        event.stopPropagation();
        const viewportRect = viewport.getBoundingClientRect();
        const dx = event.clientX - subtitleStartX;
        const dy = event.clientY - subtitleStartY;
        if (Math.abs(dx) + Math.abs(dy) > 4) subtitleMoved = true;
        const left = subtitleStartLeft + dx;
        const top = subtitleStartTop + dy;
        state.subtitleX = clamp((left - viewportRect.left) / Math.max(1, viewportRect.width) * 100, 8, 92);
        state.subtitleY = clamp((top - viewportRect.top) / Math.max(1, viewportRect.height) * 100, 12, 90);
        applySubtitleStyle();
    });
    const endSubtitleDrag = (event) => {
        if (!subtitleDragging || event.pointerId !== subtitlePointerId) return;
        subtitleDragging = false;
        try { subtitleBox.releasePointerCapture?.(event.pointerId); } catch (_) {}
        subtitlePointerId = null;
        if (subtitleMoved) {
            saveSettings(state);
        } else if (audio.paused) {
            playAudio(false);
        } else {
            audio.pause();
        }
    };
    subtitleBox.addEventListener("pointerup", endSubtitleDrag);
    subtitleBox.addEventListener("pointercancel", endSubtitleDrag);
    subtitleBox.addEventListener("lostpointercapture", (event) => {
        if (subtitleDragging) endSubtitleDrag(event);
    });

    window.addEventListener("nova-history-selection", (event) => {
        const detail = event.detail || {};
        if (!detail.node) return;
        if (viewer.node && detail.node !== viewer.node && detail.node !== attachedNode) return;

        // Prevent only the legacy/node audio element from loading.
        // The core viewer has already updated image, prompt, voice and counter.
        event.preventDefault();
        sessionActive = true;
        generationOverride = false;
        stopNodeAudio();

        lastNode = detail.node;
        attachedNode = detail.node;
        lastFilename = String(detail.item?.filename || "");
        lastIndex = Number(detail.index || 0);

        if (overlay.style.display === "none") attachSharedAudioToNode(detail.node);
        else moveSharedAudioToDock();

        // Master Autoplay Off also applies to manual history changes.
        // Manual browsing may select audio, but it must remain paused.
        loadItemAudio(detail.item, Boolean(detail.playNow && state.autoplayEnabled));
        queueMicrotask(() => {
            updatePrompt();
            if (overlay.style.display !== "none") updateLayout(false);
        });
    });

    window.addEventListener("nova-autoplay-trigger", (event) => {
        // One shared audio element owns all NovoLoko playback.
        event.preventDefault();
        const detail = event.detail || {};
        const src = String(detail.src || "");
        if (!src) return;

        sessionActive = true;
        const browsingLocked = !state.followNewGeneration;
        if (browsingLocked) {
            pendingGeneration = { ...detail };
            audioCaption.textContent = "New generation saved • current image, audio and slideshow remain locked";
            return;
        }

        generationOverride = true;
        pendingGeneration = null;
        clearTimeout(slideshowTimer);
        clearTimeout(silentSlideTimer);
        if (state.followNewGeneration) state.slideshow = false;
        updateAudioButtons();
        persist();
        stopNodeAudio();
        pauseOtherNovaAudio();

        const token = ++audioLoadToken;
        audio.pause();
        audio.dataset.filename = `trigger:${detail.filename || "latest"}`;
        audio.dataset.sourceKind = "generation";
        audio.src = src;
        audio.load();

        const timing = detail.trigger_after || "ready";
        if (!state.autoplayEnabled) {
            audio.pause();
            audioCaption.textContent = `New generation ready • autoplay off • ${timing}`;
            return;
        }

        audioCaption.textContent = `New generation • ${timing}`;
        audio.addEventListener("canplay", () => {
            if (token === audioLoadToken && state.autoplayEnabled) playAudio();
        }, { once: true });
    });

    window.addEventListener("keydown", (event) => {
        if (overlay.style.display === "none") return;
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
        const key = event.key.toLowerCase();
        if (event.code === "Space") {
            event.preventDefault();
            if (audio.paused) playAudio(false);
            else audio.pause();
        } else if (key === "q") {
            event.preventDefault();
            setPromptVisible(!state.promptVisible);
        } else if (key === "k") {
            event.preventDefault();
            const modes = ["Off", "Line", "Word"];
            state.subtitles = modes[(modes.indexOf(state.subtitles) + 1) % modes.length];
            subtitleSelect.value = state.subtitles;
            persist();
            renderSubtitle();
        } else if (key === "l") {
            event.preventDefault();
            loopButton.click();
        } else if (key === "j") {
            event.preventDefault();
            slideshowButton.click();
        } else if (key === "u") {
            event.preventDefault();
            setUIHidden(!uiHidden);
        }
    });

    overlay.addEventListener("contextmenu", (event) => {
        if (!uiHidden) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setUIHidden(false);
    }, true);

    const resizeObserver = new ResizeObserver(() => updateLayout(false));
    resizeObserver.observe(toolbar);
    resizeObserver.observe(audioDock);
    resizeObserver.observe(promptPanel);

    function handleViewerOpened(event) {
        const node = event?.detail?.node || viewer.node || lastNode;
        if (!node) return;

        sessionActive = true;
        setUIHidden(false);

        const transfer = captureExternalPlayback();
        lastNode = node;
        attachedNode = node;
        const item = node.__novaCurrentHistoryItem || null;
        lastFilename = String(item?.filename || "");
        lastIndex = Number(node.__novaCurrentHistoryIndex || 0);

        moveSharedAudioToDock();

        if (item && (
            item.media_only
            || item.has_audio === false
            || (
                item.filename
                && (
                    audio.dataset.filename !== String(item.filename)
                    || audio.dataset.sourceKind !== "history"
                )
            )
        )) {
            loadItemAudio(item, transfer.wasPlaying, transfer.currentTime);
        } else if (transfer.wasPlaying && audio.paused) {
            playAudio(false);
        }

        syncAutoplaySettings();
        updatePrompt();
        applyTheme();
        updateAudioButtons();
        updateLayout(true);
        cancelAnimationFrame(subtitleFrame);
        subtitleFrame = requestAnimationFrame(subtitleTick);
    }

    function handleViewerClosed(event) {
        const node = event?.detail?.node || lastNode || attachedNode;
        cancelAnimationFrame(subtitleFrame);
        subtitleBox.style.display = "none";
        setStylePanelVisible(false);
        setUIHidden(false);
        if (node) {
            lastNode = node;
            attachSharedAudioToNode(node);
        }
    }

    window.addEventListener("nova-image-viewer-opened", handleViewerOpened);
    window.addEventListener("nova-image-viewer-closed", handleViewerClosed);

    // A generation can rebuild DOM widgets. This watchdog only repairs the
    // location of the one shared audio element; it never changes selection,
    // playback, current time, slideshow state or image.
    const attachmentWatchdog = setInterval(() => {
        if (!sessionActive || overlay.style.display !== "none") return;
        const node = activeHistoryNode();
        if (!node) return;
        if (!audio.isConnected || node.__novaAudioElement !== audio) {
            attachSharedAudioToNode(node);
        }
    }, 1000);

    buttonColorSelect.value = state.buttonColor;
    applyTheme();
    applyLabels();
    applySubtitleStyle();
    setPromptVisible(state.promptVisible, false);
    updateAudioButtons();
    syncAutoplaySettings();
    window.__novaMediaStudioAudio = audio;

    // Attach immediately when the studio is created for an already-open viewer.
    if (overlay.style.display !== "none" && viewer.node) {
        queueMicrotask(() => handleViewerOpened({ detail: { node: viewer.node } }));
    }

    const studio = {
        state,
        audio,
        promptPanel,
        subtitleBox,
        subtitleStylePanel,
        updateLayout,
        resetStudio,
        attachmentWatchdog,
    };
    overlay.__novaMediaStudio = studio;
    return studio;
}

function tryAttach() {
    const viewer = window.__novaImageViewer;
    if (viewer?.overlay) createStudio(viewer);
}

window.addEventListener("nova-image-viewer-ready", tryAttach);
window.addEventListener("nova-image-viewer-opened", tryAttach);
setInterval(tryAttach, 650);

app.registerExtension({ name: "NovoLoko.MediaStudio.Pro.v326PanelRepair" });
