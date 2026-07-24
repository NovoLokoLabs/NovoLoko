import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { zoomPrecisionAtPointerLocked } from "./nova_precision_zoom.js";

const activeRecordings = new WeakMap();
let globalRecording = null;

const novaHistoryNodes = new Set();
let novaActivePromptId = null;
let novaHistoryEventsBound = false;
let novaImageViewer = null;
const novaCompletedPromptIds = new Set();
let novaLastCompletedPrompt = { id: null, at: 0 };

function widget(node, name) {
    return node.widgets?.find((item) => item.name === name);
}

function widgetValue(node, name, fallback = "") {
    const found = widget(node, name);
    return found == null || found.value == null ? fallback : found.value;
}

function isNovaNode(nodeData) {
    const name = String(nodeData?.name || "");
    const category = String(nodeData?.category || "");
    return name.startsWith("Nova") || category.startsWith("NovoLoko/");
}

function isPromptLikeWidget(item) {
    if (!item || typeof item.value !== "string") return false;
    const name = String(item.name || "").toLowerCase();
    if (name === "prompt_hint") return false;
    const promptLike = ["prompt", "text", "spice", "notes", "warning", "description"]
        .some((part) => name.includes(part));
    if (!promptLike) return false;
    return Boolean(item.inputEl) || item.type === "text" || item.type === "customtext" || item.options?.multiline;
}

function findPromptWidgets(node) {
    return (node.widgets || []).filter(isPromptLikeWidget);
}

function notify(message, severity = "info") {
    const text = String(message || "");
    try {
        if (app.extensionManager?.toast?.add) {
            app.extensionManager.toast.add({
                severity,
                summary: "NovoLoko Voice",
                detail: text,
                life: severity === "error" ? 8000 : 4500,
            });
            return;
        }
    } catch (_) {
        // Fall through to console for older frontend builds.
    }
    if (severity === "error") console.error(`[NovoLoko Voice] ${text}`);
    else console.log(`[NovoLoko Voice] ${text}`);
}

function chooseMimeType() {
    const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
    ];
    return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function extensionForMime(mime) {
    if (mime.includes("ogg")) return ".ogg";
    if (mime.includes("mp4")) return ".mp4";
    return ".webm";
}

function setButtonLabel(button, label) {
    if (!button) return;
    button.name = label;
    button.label = label;
}

function selectedTarget(node, targets) {
    if (node.__novaVoiceLastTarget && targets.includes(node.__novaVoiceLastTarget)) {
        return node.__novaVoiceLastTarget;
    }
    return targets[0];
}

function trackTargetFocus(node, target) {
    if (!target?.inputEl || target.__novaVoiceFocusTracked) return;
    const mark = () => {
        node.__novaVoiceLastTarget = target;
    };
    target.inputEl.addEventListener("focus", mark);
    target.inputEl.addEventListener("pointerdown", mark);
    target.__novaVoiceFocusTracked = true;
}

function configForNode(node) {
    return {
        insertMode: String(widgetValue(node, "insert_mode", "Append")),
        sttModel: String(widgetValue(node, "stt_model", "small.en")),
        localModelPath: String(widgetValue(node, "local_model_path", "")),
        language: String(widgetValue(node, "language", "English")),
        device: String(widgetValue(node, "device", "Auto")),
        computeType: String(widgetValue(node, "compute_type", "Auto")),
        autoStop: Boolean(widgetValue(node, "auto_stop", true)),
        silenceSeconds: Number(widgetValue(node, "silence_seconds", 1.6)) || 1.6,
        trimFillers: Boolean(widgetValue(node, "trim_fillers", true)),
        punctuationMode: String(widgetValue(node, "punctuation_mode", "Comma Prompt")),
        translateToEnglish: Boolean(widgetValue(node, "translate_to_english", false)),
        vadFilter: Boolean(widgetValue(node, "vad_filter", true)),
        promptHint: String(widgetValue(node, "prompt_hint", "")),
        enabled: Boolean(widgetValue(node, "enabled", true)),
    };
}

function applyTranscript(node, target, text, insertMode) {
    const transcript = String(text || "").trim();
    if (!transcript) return;

    const current = String(target.value || "");
    let next = transcript;
    const inputEl = target.inputEl;

    if (insertMode === "Append") {
        const trimmed = current.trimEnd();
        const separator = !trimmed ? "" : /[,;:.!?]$/.test(trimmed) ? " " : ", ";
        next = `${trimmed}${separator}${transcript}`;
    } else if (insertMode === "Insert at Cursor" && inputEl && Number.isInteger(inputEl.selectionStart)) {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd ?? start;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const leftSeparator = before && !/[\s,;:.!?]$/.test(before) ? ", " : "";
        const rightSeparator = after && !/^[\s,;:.!?]/.test(after) ? ", " : "";
        next = `${before}${leftSeparator}${transcript}${rightSeparator}${after}`;
    }

    target.value = next;
    if (inputEl) {
        inputEl.value = next;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    try {
        target.callback?.(next, app.canvas, node);
    } catch (_) {
        // Some widget callbacks use a different legacy signature; setting value is still sufficient.
    }
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

async function checkBackend(showSuccess = true) {
    const response = await api.fetchApi("/nova_voice/status");
    const data = await response.json();
    if (!data.ok || !data.installed) {
        throw new Error(data.error || "faster-whisper is not installed.");
    }
    if (showSuccess) notify(`STT ready — faster-whisper ${data.version}`);
    return data;
}


async function checkKokoroBackend(showSuccess = true) {
    const response = await api.fetchApi("/nova_voice/status");
    const data = await response.json();
    if (!data.ok || !data.kokoro_installed) {
        throw new Error(data.kokoro_error || data.install_hint || "Kokoro is not installed.");
    }
    if (showSuccess) notify(`Kokoro ready — ${data.kokoro_version || "installed"}`);
    return data;
}

async function transcribe(blob, mimeType, config) {
    const form = new FormData();
    form.append("audio", blob, `nova_voice${extensionForMime(mimeType)}`);
    form.append("stt_model", config.sttModel);
    form.append("local_model_path", config.localModelPath);
    form.append("language", config.language);
    form.append("device", config.device);
    form.append("compute_type", config.computeType);
    form.append("trim_fillers", String(config.trimFillers));
    form.append("punctuation_mode", config.punctuationMode);
    form.append("translate_to_english", String(config.translateToEnglish));
    form.append("vad_filter", String(config.vadFilter));
    form.append("prompt_hint", config.promptHint);

    const response = await api.fetchApi("/nova_voice/transcribe", {
        method: "POST",
        body: form,
    });
    let data;
    try {
        data = await response.json();
    } catch (_) {
        throw new Error(`Transcription server returned HTTP ${response.status}.`);
    }
    if (!response.ok || !data.ok) throw new Error(data.error || "Transcription failed.");
    return data;
}

function cleanRecordingState(state) {
    if (!state) return;
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    if (state.maxTimer) clearTimeout(state.maxTimer);
    try { state.source?.disconnect(); } catch (_) {}
    try { state.analyser?.disconnect(); } catch (_) {}
    try { state.audioContext?.close(); } catch (_) {}
    try { state.stream?.getTracks()?.forEach((track) => track.stop()); } catch (_) {}
}

async function finishRecording(node, target, button, state) {
    cleanRecordingState(state);
    activeRecordings.delete(node);
    if (globalRecording === state) globalRecording = null;
    setButtonLabel(button, "⏳ Transcribing…");

    try {
        if (!state.chunks.length) throw new Error("No microphone audio was recorded.");
        const blob = new Blob(state.chunks, { type: state.mimeType || "audio/webm" });
        const result = await transcribe(blob, state.mimeType || blob.type, state.config);
        applyTranscript(node, target, result.text, state.config.insertMode);
        notify(`Added speech using ${result.model} on ${result.device}.`);
    } catch (error) {
        notify(error?.message || String(error), "error");
    } finally {
        setButtonLabel(button, "🎤 Dictate into selected prompt");
        node.setDirtyCanvas?.(true, true);
    }
}

function monitorSilence(state) {
    const values = new Uint8Array(state.analyser.fftSize);
    const tick = () => {
        if (!state.recorder || state.recorder.state !== "recording") return;
        state.analyser.getByteTimeDomainData(values);
        let sum = 0;
        for (let i = 0; i < values.length; i += 1) {
            const sample = (values[i] - 128) / 128;
            sum += sample * sample;
        }
        const rms = Math.sqrt(sum / values.length);
        const now = performance.now();
        if (rms > 0.025) {
            state.heardSpeech = true;
            state.lastSoundAt = now;
        } else if (!state.heardSpeech && now - state.startedAt >= 15000) {
            state.recorder.stop();
            return;
        } else if (
            state.config.autoStop &&
            state.heardSpeech &&
            now - state.lastSoundAt >= state.config.silenceSeconds * 1000
        ) {
            state.recorder.stop();
            return;
        }
        state.animationFrame = requestAnimationFrame(tick);
    };
    state.animationFrame = requestAnimationFrame(tick);
}

async function startRecording(node, target, button) {
    const config = configForNode(node);
    if (!config.enabled) {
        notify("This NovoLoko prompt node is disabled.", "error");
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        notify("This browser does not provide microphone recording to ComfyUI.", "error");
        return;
    }

    try {
        await checkBackend(false);
    } catch (error) {
        notify(error?.message || String(error), "error");
        return;
    }

    if (globalRecording?.recorder?.state === "recording") {
        try { globalRecording.recorder.stop(); } catch (_) {}
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        const mimeType = chooseMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        const state = {
            node,
            target,
            button,
            config,
            stream,
            recorder,
            mimeType: recorder.mimeType || mimeType || "audio/webm",
            audioContext,
            source,
            analyser,
            chunks: [],
            heardSpeech: false,
            startedAt: performance.now(),
            lastSoundAt: performance.now(),
            animationFrame: null,
            maxTimer: null,
        };
        activeRecordings.set(node, state);
        globalRecording = state;

        recorder.ondataavailable = (event) => {
            if (event.data?.size) state.chunks.push(event.data);
        };
        recorder.onerror = (event) => {
            notify(event.error?.message || "Microphone recording failed.", "error");
        };
        recorder.onstop = () => finishRecording(node, target, button, state);
        recorder.start(250);
        state.maxTimer = setTimeout(() => {
            if (recorder.state === "recording") recorder.stop();
        }, 120000);
        monitorSilence(state);
        setButtonLabel(button, "⏹ Stop dictation");
        notify(`Listening for ${target.name}…`);
    } catch (error) {
        notify(
            error?.name === "NotAllowedError"
                ? "Microphone permission was denied. Allow microphone access for the ComfyUI page."
                : error?.message || String(error),
            "error",
        );
        setButtonLabel(button, "🎤 Dictate into selected prompt");
    }
}

async function toggleRecording(node, targets, button) {
    const current = activeRecordings.get(node);
    if (current?.recorder?.state === "recording") {
        current.recorder.stop();
        return;
    }
    const target = selectedTarget(node, targets);
    if (!target) {
        notify("No editable prompt text box was found on this node.", "error");
        return;
    }
    await startRecording(node, target, button);
}

app.registerExtension({
    name: "NovoLoko.VoicePrompt.v326",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!isNovaNode(nodeData)) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            const node = this;
            if (node.__novaVoiceControlsAdded) return result;

            const targets = findPromptWidgets(node);
            for (const target of targets) trackTargetFocus(node, target);
            if (!targets.length) return result;

            const button = node.addWidget(
                "button",
                "🎤 Dictate into selected prompt",
                null,
                () => toggleRecording(node, targets, button),
            );

            if ((nodeData?.name || "") === "NovaVoicePrompt") {
                node.addWidget("button", "🔍 Check STT setup", null, async () => {
                    try {
                        await checkBackend(true);
                    } catch (error) {
                        notify(error?.message || String(error), "error");
                    }
                });
            }

            if ((nodeData?.name || "") === "NovaKokoroTTS") {
                node.addWidget("button", "🔊 Check Kokoro setup", null, async () => {
                    try {
                        await checkKokoroBackend(true);
                    } catch (error) {
                        notify(error?.message || String(error), "error");
                    }
                });
            }

            node.__novaVoiceControlsAdded = true;
            return result;
        };
    },
});


function novaApiUrl(path) {
    return typeof api.apiURL === "function" ? api.apiURL(path) : path;
}

function audioFileUrl(filename) {
    const query = new URLSearchParams({ filename: String(filename || ""), t: String(Date.now()) });
    return novaApiUrl(`/nova_voice/audio/file?${query.toString()}`);
}

function historyImageUrl(filename) {
    const query = new URLSearchParams({ filename: String(filename || ""), t: String(Date.now()) });
    return novaApiUrl(`/nova_voice/image/file?${query.toString()}`);
}

function comfyClassOf(nodeType, nodeData) {
    return String(nodeType?.prototype?.comfyClass || nodeData?.name || "");
}

function audioUIWidget(node) {
    return node.widgets?.find((item) => item.name === "audioUI");
}

function audioElement(node) {
    return node?.__novaAudioElement || audioUIWidget(node)?.element || audioUIWidget(node)?.inputEl || null;
}

function findNativeNovaPreview(node) {
    const nodes = node?.graph?._nodes || app.graph?._nodes || [];
    return nodes.find((candidate) =>
        String(candidate?.type || candidate?.comfyClass || "") === "PreviewAudio" &&
        (candidate?.properties?.nova_audio_player === true ||
         String(candidate?.title || "").includes("NOVOLOKO NATIVE AUDIO PLAYER"))
    ) || null;
}

function targetAudioElement(node) {
    return audioElement(node) || audioElement(findNativeNovaPreview(node));
}

function readBoolean(node, widgetName, propertyName, fallback) {
    const found = widget(node, widgetName);
    if (found?.value != null) return Boolean(found.value);
    if (node?.properties && propertyName in node.properties) return Boolean(node.properties[propertyName]);
    return fallback;
}

function voiceCode(item) {
    const explicit = String(item?.voice_code || "").trim();
    if (explicit) return explicit;
    return String(item?.voice || "").split("|", 1)[0].trim() || "voice unknown";
}

function historyLabel(item) {
    const date = item?.created ? new Date(Number(item.created) * 1000) : null;
    const clock = date && !Number.isNaN(date.getTime())
        ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    const fallbackKind = item?.media_only ? "Gallery image" : "Audio";
    const raw = String(item?.label || item?.filename || fallbackKind).replace(/\s+/g, " ").trim();
    const short = raw.length > 54 ? `${raw.slice(0, 54)}…` : raw;
    const duration = Number(item?.duration || 0) > 0 ? ` · ${Number(item.duration).toFixed(1)}s` : "";
    const imageFlag = (item?.image_filename || item?.image_first_filename || item?.image_second_filename) ? " · 🖼" : "";
    const source = item?.media_only ? "Image Gallery" : voiceCode(item);
    return `${clock ? `${clock} · ` : ""}${source} · ${short}${duration}${imageFlag}`;
}

function promptForMode(item, mode) {
    const selected = String(mode || "Spoken");
    if (selected === "Manual") {
        return String(item?.manual_prompt || "").trim()
            || "No manual prompt was stored with this audio entry.";
    }
    if (selected === "Enhanced") {
        return String(item?.enhanced_prompt || "").trim()
            || "No enhanced prompt was stored with this audio entry.";
    }
    return String(item?.label || "").trim()
        || "No spoken prompt text was stored with this older audio file.";
}

function updatePromptModeButtons(node) {
    const mode = String(node.__novaPromptMode || "Spoken");
    for (const [name, button] of Object.entries(node.__novaPromptModeButtons || {})) {
        const active = name === mode;
        button.style.opacity = active ? "1" : ".62";
        button.style.fontWeight = active ? "700" : "400";
        button.style.outline = active ? "1px solid rgba(255,255,255,.45)" : "none";
    }
    if (node.__novaPromptTitle) {
        node.__novaPromptTitle.textContent = `${mode} prompt`;
    }
}

function setPromptMode(node, mode) {
    node.__novaPromptMode = String(mode || "Spoken");
    updatePromptModeButtons(node);
    updatePromptDisplay(node, node.__novaCurrentHistoryItem || {});
}

function updateVoiceDisplay(node, item) {
    const value = item?.media_only
        ? "Image gallery mode"
        : String(item?.voice || voiceCode(item) || "Voice unknown");
    const display = node.__novaVoiceDisplay;
    if (display) {
        display.value = value;
        display.callback?.(value);
    }
    if (node.__novaVoiceCaption) {
        node.__novaVoiceCaption.textContent = `Voice: ${value}`;
    }
}

function updatePromptDisplay(node, item) {
    const prompt = promptForMode(item, node.__novaPromptMode || "Spoken");
    if (node.__novaPromptText) {
        node.__novaPromptText.value = prompt;
        node.__novaPromptText.scrollTop = 0;
        node.__novaPromptText.scrollLeft = 0;
    }
    updatePromptModeButtons(node);
}

function previewImageChoice(node) {
    return String(widgetValue(node, "preview_image", "Auto - Second if available") || "Auto - Second if available");
}

function historyImageForChoice(item, choice) {
    const first = String(item?.image_first_filename || item?.image_filename || "").trim();
    const second = String(item?.image_second_filename || "").trim();
    const selected = String(choice || "").toLowerCase();
    const details = (which, filename, pass) => ({
        filename, pass,
        width: Number(item?.[`image_${which}_width`] || 0),
        height: Number(item?.[`image_${which}_height`] || 0),
        sourceWidth: Number(item?.[`image_${which}_source_width`] || 0),
        sourceHeight: Number(item?.[`image_${which}_source_height`] || 0),
        capped: Boolean(item?.[`image_${which}_capped`]),
    });
    if (selected.startsWith("first")) return first ? details("first", first, "First Pass") : details("second", second, "Second Pass");
    if (selected.startsWith("second")) return second ? details("second", second, "Second Pass") : details("first", first, "First Pass");
    return second ? details("second", second, "Second Pass") : details("first", first, "First Pass");
}


function ensureNovaImageViewer() {
    if (novaImageViewer) return novaImageViewer;

    const DEFAULT_COMPARE = Object.freeze({
        mode: "split",
        orientation: "vertical",
        percent: 50,
        showGuide: true,
        lineOpacity: 96,
        blendOpacity: 50,
        blinkMs: 650,
        followMouse: false,
        sbsOverlap: 0,
        sbsStyle: "Native",
        effectStyle: "Normal",
        peekOriginal: false,
        controlHeld: false,
        precisionLinked: false,
        resetFitOnChange: true,
        swapped: false,
    });

    const overlay = document.createElement("div");
    overlay.id = "nova-image-viewer";
    overlay.dataset.novaImageViewer = "true";
    overlay.style.cssText = [
        "position:fixed", "inset:0", "z-index:2147483646", "display:none",
        "background:rgba(0,0,0,.94)", "color:#fff", "user-select:none"
    ].join(";");

    const toolbar = document.createElement("div");
    toolbar.dataset.novaRole = "toolbar";
    toolbar.style.cssText = [
        "position:absolute", "left:0", "right:0", "top:0", "min-height:52px",
        "display:flex", "align-items:center", "gap:8px", "padding:6px 12px",
        "background:rgba(20,20,20,.94)", "box-sizing:border-box", "z-index:12",
        "flex-wrap:wrap", "border-bottom:1px solid rgba(255,255,255,.12)"
    ].join(";");

    const title = document.createElement("div");
    title.style.cssText = [
        "flex:1 1 360px", "overflow:hidden", "text-overflow:ellipsis",
        "white-space:nowrap", "font:600 13px/1.2 sans-serif", "min-width:220px"
    ].join(";");

    function makeButton(text, titleText = "") {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.title = titleText;
        button.style.cssText = [
            "cursor:pointer", "padding:5px 9px", "min-height:30px",
            "border-radius:5px", "white-space:nowrap"
        ].join(";");
        return button;
    }

    function makeButtonGroup() {
        const group = document.createElement("div");
        group.style.cssText = [
            "display:flex", "align-items:center", "gap:2px", "padding:3px",
            "border-radius:7px", "background:rgba(255,255,255,.09)"
        ].join(";");
        return group;
    }

    const passGroup = makeButtonGroup();
    const passButtons = {};
    const passChoices = [
        ["Auto", "Auto - Second if available"],
        ["Pass 1", "First Pass"],
        ["Pass 2", "Second Pass"],
        ["Compare", "Compare"],
    ];
    for (const [label, value] of passChoices) {
        const button = makeButton(
            label,
            value === "Auto - Second if available"
                ? "Automatically show Pass 2 when available"
                : value === "Compare"
                    ? "Open the full Pass 1 / Pass 2 comparison tools • V"
                    : `Show ${value}`,
        );
        button.style.minWidth = "58px";
        passButtons[value] = button;
        passGroup.append(button);
    }

    const compareControls = document.createElement("div");
    compareControls.style.cssText = [
        "display:flex", "align-items:center", "gap:6px", "flex-wrap:wrap",
        "padding:2px 0"
    ].join(";");

    const compareModeGroup = makeButtonGroup();
    const compareModeButtons = {
        split: makeButton("Split", "Draggable reveal line • Q"),
        sideBySide: makeButton("Side by Side", "Native or Precision Align comparison • W"),
        overlay: makeButton("Overlay", "Blend the B Layer over A • E"),
        blink: makeButton("Blink", "Alternate A and B • T"),
    };
    compareModeGroup.append(
        compareModeButtons.split,
        compareModeButtons.sideBySide,
        compareModeButtons.overlay,
        compareModeButtons.blink,
    );

    const orientationGroup = makeButtonGroup();
    const orientationButtons = {
        vertical: makeButton("Vertical", "Left / right comparison • H toggles"),
        horizontal: makeButton("Horizontal", "Top / bottom comparison • H toggles"),
    };
    orientationGroup.append(
        orientationButtons.vertical,
        orientationButtons.horizontal,
    );

    const guideToggle = makeButton("Guide: On", "Show or hide the circular guide icon • G");
    const followMouseButton = makeButton("Follow Mouse: Off", "Move the split line with the pointer • N");
    const sbsStyleButton = makeButton("SBS: Native", "Cycle Native and Precision Align • W");
    const linkPanButton = makeButton("Link Move: Off", "Precision Align seam-lock • L toggles • hold Ctrl for temporary lock");
    const effectButton = makeButton("Layer: Normal", "Cycle B-layer style for Split, SBS, Overlay and Blink • K");
    const alignResetButton = makeButton("Align Reset", "Reset independent Precision image positions • C");
    const resetChangeButton = makeButton("Reset Change: On", "Reset to Fit whenever the image or pass changes");
    const swapButton = makeButton("Swap", "Swap Pass 1 and Pass 2 without flicker • X");
    const centreButton = makeButton("50/50", "Centre split or reset Precision alignment • C");
    const hotkeysButton = makeButton("?", "Show keyboard and mouse shortcuts • ?");

    function makeRangeControl(labelText, titleText, min, max, value) {
        const wrapper = document.createElement("label");
        wrapper.title = titleText;
        wrapper.style.cssText = [
            "display:flex", "align-items:center", "gap:5px", "padding:3px 6px",
            "border-radius:6px", "background:rgba(255,255,255,.07)",
            "font:12px/1.2 sans-serif", "white-space:nowrap"
        ].join(";");

        const label = document.createElement("span");
        label.textContent = labelText;

        const range = document.createElement("input");
        range.type = "range";
        range.min = String(min);
        range.max = String(max);
        range.step = "1";
        range.value = String(value);
        range.style.cssText = "width:92px;cursor:pointer";

        const output = document.createElement("span");
        output.textContent = `${value}%`;
        output.style.cssText = "min-width:34px;text-align:right;font-variant-numeric:tabular-nums";

        wrapper.append(label, range, output);
        return { wrapper, range, output };
    }

    const lineOpacityControl = makeRangeControl(
        "Line",
        "Divider-line transparency",
        0,
        100,
        DEFAULT_COMPARE.lineOpacity,
    );
    const blendOpacityControl = makeRangeControl(
        "Blend",
        "B Layer strength",
        0,
        100,
        DEFAULT_COMPARE.blendOpacity,
    );
    const blinkControl = makeRangeControl(
        "Blink",
        "Blink interval from 0.1 to 10 seconds",
        100,
        10000,
        DEFAULT_COMPARE.blinkMs,
    );
    const overlapControl = makeRangeControl(
        "SBS Overlap",
        "Overlap the two full-size images in Side by Side mode for precise matching",
        0,
        90,
        DEFAULT_COMPARE.sbsOverlap,
    );
    blinkControl.range.step = "50";
    blinkControl.output.textContent = `${DEFAULT_COMPARE.blinkMs}ms`;

    compareControls.append(
        compareModeGroup,
        orientationGroup,
        guideToggle,
        followMouseButton,
        sbsStyleButton,
        linkPanButton,
        effectButton,
        alignResetButton,
        resetChangeButton,
        swapButton,
        centreButton,
        lineOpacityControl.wrapper,
        blendOpacityControl.wrapper,
        blinkControl.wrapper,
        overlapControl.wrapper,
        hotkeysButton,
    );

    const hint = document.createElement("div");
    hint.textContent = "Space play/pause • ←/→ history • Home/End newest/oldest • Ctrl+Wheel Precision lock • ? hotkeys";
    hint.style.cssText = [
        "opacity:.68", "font:12px/1.2 sans-serif", "white-space:nowrap",
        "flex:0 1 auto"
    ].join(";");

    const fitButton = makeButton("Fit", "Fit the complete image • F");
    const fitWidthButton = makeButton("Width", "Fit image width • 2");
    const fitHeightButton = makeButton("Height", "Fit image height • 3");
    const actualPixelsButton = makeButton("1:1", "Show one generated pixel per screen pixel • 1");
    const zoomButton = makeButton("100%", "Click to enter an exact image zoom percentage");
    const interpolationButton = makeButton("Smooth", "Toggle smooth or exact pixel interpolation • M");
    const resetButton = makeButton(
        "Reset",
        "Restore default comparison settings and fit the image",
    );
    const closeButton = makeButton("Close", "Close the full-screen viewer • Esc");

    toolbar.append(
        title,
        passGroup,
        compareControls,
        hint,
        fitButton,
        fitWidthButton,
        fitHeightButton,
        actualPixelsButton,
        zoomButton,
        interpolationButton,
        resetButton,
        closeButton,
    );

    const helpPanel = document.createElement("div");
    helpPanel.style.cssText = [
        "display:none", "position:absolute", "left:50%", "top:50%", "transform:translate(-50%,-50%)", "z-index:40",
        "max-width:min(760px,90vw)", "padding:18px 22px", "border-radius:12px", "background:rgba(5,8,13,.98)",
        "border:1px solid rgba(255,255,255,.2)", "box-shadow:0 20px 70px rgba(0,0,0,.7)", "font:14px/1.55 sans-serif", "white-space:pre-line"
    ].join(";");
    helpPanel.textContent = "MEDIA: Space Play/Pause   ←/→ History   Home Newest   End Oldest   Mouse 4/5 History\nVIEW: F Fit   1 Actual Pixels   2 Width   3 Height   M Smooth/Pixel\nCOMPARE: V Toggle   Q Split   W Side by Side   E Overlay   T Blink\nH Orientation   X Swap   G Guide   N Follow Mouse   K Layer Style\nL Link Move   C Centre/Align Reset\nCtrl+Wheel locks both Precision images to mirrored cursor anchors\nCtrl+Left/Middle drag moves both images together\nHold Alt to temporarily peek Original Pass 2";

    const viewport = document.createElement("div");
    viewport.dataset.novaRole = "viewport";
    viewport.style.cssText = [
        "position:absolute", "left:0", "right:0", "top:58px", "bottom:0",
        "overflow:hidden", "touch-action:none", "cursor:grab"
    ].join(";");

    const image = document.createElement("img");
    image.draggable = false;
    image.style.cssText = [
        "display:none", "position:absolute", "left:50%", "top:50%",
        "max-width:none", "max-height:none", "pointer-events:none",
        "transform-origin:center center", "will-change:transform"
    ].join(";");

    const compareLayer = document.createElement("div");
    compareLayer.style.cssText = [
        "display:none", "position:absolute", "inset:0", "overflow:hidden",
        "pointer-events:none", "will-change:clip-path,opacity"
    ].join(";");

    const compareBaseImage = document.createElement("img");
    compareBaseImage.draggable = false;
    compareBaseImage.style.cssText = [
        "display:none", "position:absolute", "left:50%", "top:50%",
        "max-width:none", "max-height:none", "pointer-events:none",
        "transform-origin:center center", "will-change:transform"
    ].join(";");
    const compareImage = document.createElement("img");
    compareImage.draggable = false;
    compareImage.style.cssText = [
        "display:none", "position:absolute", "left:50%", "top:50%",
        "max-width:none", "max-height:none", "pointer-events:none",
        "transform-origin:center center", "will-change:transform"
    ].join(";");
    compareLayer.append(compareBaseImage, compareImage);

    const precisionWrap = document.createElement("div");
    precisionWrap.style.cssText = "display:none;position:absolute;inset:0;pointer-events:none";
    const precisionAClip = document.createElement("div");
    const precisionBClip = document.createElement("div");
    for (const clip of [precisionAClip, precisionBClip]) clip.style.cssText = "position:absolute;overflow:hidden";
    const precisionImageA = document.createElement("img");
    const precisionBaseB = document.createElement("img");
    const precisionImageB = document.createElement("img");
    for (const pimg of [precisionImageA, precisionBaseB, precisionImageB]) {
        pimg.draggable = false;
        pimg.style.cssText = "position:absolute;left:50%;top:50%;max-width:none;max-height:none;transform-origin:center center;pointer-events:none";
    }
    precisionAClip.append(precisionImageA);
    precisionBClip.append(precisionBaseB, precisionImageB);
    precisionWrap.append(precisionAClip, precisionBClip);

    const compareDivider = document.createElement("div");
    compareDivider.style.cssText = [
        "display:none", "position:absolute", "z-index:7",
        "background:rgba(255,255,255,.98)", "box-shadow:0 0 10px rgba(0,0,0,.95)",
        "pointer-events:none"
    ].join(";");

    const compareHandle = document.createElement("button");
    compareHandle.type = "button";
    compareHandle.textContent = "↔";
    compareHandle.title = "Drag the comparison guide";
    compareHandle.style.cssText = [
        "display:none", "position:absolute", "z-index:9", "width:48px", "height:48px",
        "border-radius:50%", "cursor:ew-resize", "font:700 22px/1 sans-serif",
        "color:#fff", "background:rgba(20,20,20,.82)",
        "border:2px solid rgba(255,255,255,.9)",
        "box-shadow:0 2px 14px rgba(0,0,0,.75)", "touch-action:none"
    ].join(";");

    const compareHitZone = document.createElement("div");
    compareHitZone.title = "Drag the compare line";
    compareHitZone.style.cssText = [
        "display:none", "position:absolute", "z-index:8",
        "touch-action:none", "background:transparent"
    ].join(";");

    const pass1Label = document.createElement("div");
    pass1Label.dataset.novaRole = "pass-label";
    pass1Label.textContent = "PASS 1";
    pass1Label.style.cssText = [
        "display:none", "position:absolute", "z-index:6",
        "padding:6px 10px", "border-radius:7px", "font:700 12px/1 sans-serif",
        "background:rgba(20,20,20,.72)", "border:1px solid rgba(255,255,255,.28)",
        "pointer-events:none"
    ].join(";");

    const pass2Label = document.createElement("div");
    pass2Label.dataset.novaRole = "pass-label";
    pass2Label.textContent = "PASS 2";
    pass2Label.style.cssText = pass1Label.style.cssText;

    const makeArrow = (text, side, titleText) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.title = titleText;
        button.style.cssText = [
            "position:absolute", side + ":18px", "top:50%", "transform:translateY(-50%)",
            "z-index:11", "width:54px", "height:82px", "border-radius:10px",
            "font:700 42px/1 sans-serif", "cursor:pointer", "color:#fff",
            "background:rgba(20,20,20,.62)", "border:1px solid rgba(255,255,255,.3)"
        ].join(";");
        return button;
    };

    const previous = makeArrow("‹", "left", "Newer history image and voice • Left Arrow • Mouse Button 4");
    previous.dataset.novaRole = "history-previous";
    const next = makeArrow("›", "right", "Older history image and voice • Right Arrow • Mouse Button 5");
    next.dataset.novaRole = "history-next";

    const bottomNavigation = document.createElement("div");
    bottomNavigation.dataset.novaRole = "history-navigation";
    bottomNavigation.style.cssText = [
        "position:absolute", "left:50%", "bottom:18px", "transform:translateX(-50%)",
        "z-index:11", "display:flex", "align-items:center", "gap:2px",
        "padding:5px", "border-radius:8px", "background:rgba(20,20,20,.72)"
    ].join(";");

    const bottomPrevious = makeButton("<", "Newer history image and voice • Left Arrow • Mouse Button 4");
    bottomPrevious.dataset.novaRole = "history-previous";
    bottomPrevious.style.minWidth = "42px";
    bottomPrevious.style.fontWeight = "700";

    const counter = document.createElement("span");
    counter.textContent = "0/0";
    counter.style.cssText = [
        "min-width:86px", "text-align:center", "font:700 13px/1.2 sans-serif",
        "padding:5px 8px"
    ].join(";");

    const bottomNext = makeButton(">", "Older history image and voice • Right Arrow • Mouse Button 5");
    bottomNext.dataset.novaRole = "history-next";
    bottomNext.style.minWidth = "42px";
    bottomNext.style.fontWeight = "700";

    bottomNavigation.append(bottomPrevious, counter, bottomNext);
    viewport.append(
        image,
        compareLayer,
        precisionWrap,
        compareDivider,
        compareHitZone,
        compareHandle,
        pass1Label,
        pass2Label,
    );
    overlay.append(toolbar, viewport, previous, next, bottomNavigation, helpPanel);
    document.body.append(overlay);

    const state = {
        zoom: 1,
        panX: 0,
        panY: 0,
        baseWidth: 1,
        baseHeight: 1,
        dragging: false,
        dragButton: null,
        compareDragging: false,
        compareCaptureTarget: null,
        startX: 0,
        startY: 0,
        basePanX: 0,
        basePanY: 0,
        node: null,
        src: "",
        compareSrc: "",
        pass1Src: "",
        pass2Src: "",
        passChoice: "Auto - Second if available",
        currentPass: "Image",
        compareMode: false,
        labelsVisible: (() => {
            try { return localStorage.getItem("nova_media_labels_visible") !== "0"; }
            catch (_) { return true; }
        })(),
        compareRenderMode: DEFAULT_COMPARE.mode,
        compareOrientation: DEFAULT_COMPARE.orientation,
        comparePercent: DEFAULT_COMPARE.percent,
        showGuide: DEFAULT_COMPARE.showGuide,
        lineOpacity: DEFAULT_COMPARE.lineOpacity,
        blendOpacity: DEFAULT_COMPARE.blendOpacity,
        blinkMs: (() => {
            try { return clampNumber(Number(localStorage.getItem("nova_media_compare_blink") || DEFAULT_COMPARE.blinkMs), 100, 10000); }
            catch (_) { return DEFAULT_COMPARE.blinkMs; }
        })(),
        blinkPhase: 0,
        blinkTimer: 0,
        followMouse: (() => {
            try { return localStorage.getItem("nova_media_compare_follow_mouse") === "1"; }
            catch (_) { return false; }
        })(),
        sbsOverlap: (() => {
            try { return clampNumber(Number(localStorage.getItem("nova_media_compare_sbs_overlap") || 0), 0, 90); }
            catch (_) { return 0; }
        })(),
        sbsStyle: (() => {
            try {
                const value = localStorage.getItem("nova_media_compare_sbs_style");
                return value === "Classic Fit" ? "Precision Align" : (["Native", "Precision Align"].includes(value) ? value : "Native");
            } catch (_) { return "Native"; }
        })(),
        effectStyle: (() => {
            try { return localStorage.getItem("nova_media_compare_effect") || "Normal"; }
            catch (_) { return "Normal"; }
        })(),
        precisionPanAX: 0, precisionPanAY: 0, precisionPanBX: 0, precisionPanBY: 0, precisionSide: "A",
        precisionLinked: (() => {
            try { return localStorage.getItem("nova_media_compare_precision_linked") === "1"; }
            catch (_) { return false; }
        })(),
        precisionMoveTogether: false,
        swapToken: 0,
        resetFitOnChange: (() => {
            try { return localStorage.getItem("nova_media_reset_fit_change") !== "0"; }
            catch (_) { return true; }
        })(),
        swapped: DEFAULT_COMPARE.swapped,
        viewPreset: (() => {
            try {
                const value = localStorage.getItem("nova_media_view_preset");
                return ["fit", "width", "height", "actual", "custom"].includes(value) ? value : "fit";
            } catch (_) {
                return "fit";
            }
        })(),
        customScale: (() => {
            try {
                const value = Number(localStorage.getItem("nova_media_custom_scale") || 1);
                return Number.isFinite(value) ? clampNumber(value, 0.005, 200) : 1;
            } catch (_) {
                return 1;
            }
        })(),
        pixelated: (() => {
            try { return localStorage.getItem("nova_media_pixelated") === "1"; }
            catch (_) { return false; }
        })(),
        loadToken: 0,
    };

    try {
        const savedMode = localStorage.getItem("nova_media_compare_mode");
        const savedOrientation = localStorage.getItem("nova_media_compare_orientation");
        const savedPercent = Number(localStorage.getItem("nova_media_compare_percent"));
        if (savedMode === "difference") state.compareRenderMode = "overlay";
        else if (["split", "sideBySide", "overlay", "blink"].includes(savedMode)) state.compareRenderMode = savedMode;
        if (["vertical", "horizontal"].includes(savedOrientation)) state.compareOrientation = savedOrientation;
        if (Number.isFinite(savedPercent)) state.comparePercent = clampNumber(savedPercent, 0, 100);
    } catch (_) {}

    function isOpen() {
        return overlay.style.display !== "none";
    }

    function currentPassFiles() {
        const item = state.node?.__novaCurrentHistoryItem || {};
        return {
            first: String(
                item?.image_first_filename || item?.image_filename || "",
            ).trim(),
            second: String(item?.image_second_filename || "").trim(),
        };
    }

    function setActiveButton(button, active) {
        if (!button) return;
        button.dataset.novaActive = active ? "true" : "false";
        button.style.opacity = active ? "1" : ".66";
        button.style.fontWeight = active ? "700" : "400";
        button.style.outline = active
            ? "1px solid rgba(255,255,255,.55)"
            : "none";
    }

    function activateCompareTool(mode = null) {
        const files = currentPassFiles();
        if (!files.first || !files.second) return false;
        if (mode) state.compareRenderMode = mode;
        if (state.passChoice !== "Compare" || !state.compareMode) {
            setPassChoice("Compare", true, state.src);
        } else {
            update();
        }
        return true;
    }

    function updatePassButtons() {
        const { first, second } = currentPassFiles();
        for (const [value, button] of Object.entries(passButtons)) {
            setActiveButton(button, value === state.passChoice);
            button.disabled =
                (value === "First Pass" && !first)
                || (value === "Second Pass" && !second)
                || (value === "Compare" && !(first && second));
        }
    }

    function updateCompareControls() {
        compareControls.style.display = "flex";
        const files = currentPassFiles();
        const hasBothPasses = Boolean(files.first && files.second);

        for (const [mode, button] of Object.entries(compareModeButtons)) {
            setActiveButton(button, state.compareMode && state.compareRenderMode === mode);
            button.disabled = !hasBothPasses;
            button.style.opacity = hasBothPasses ? (state.compareMode && state.compareRenderMode === mode ? "1" : ".72") : ".35";
        }
        for (const [orientation, button] of Object.entries(orientationButtons)) {
            setActiveButton(button, state.compareOrientation === orientation);
        }

        const oriented = state.compareRenderMode === "split" || state.compareRenderMode === "sideBySide";
        orientationGroup.style.opacity = oriented ? "1" : ".45";
        orientationGroup.style.pointerEvents = oriented ? "auto" : "none";

        centreButton.style.opacity = state.compareRenderMode === "split" ? "1" : ".45";
        centreButton.disabled = state.compareRenderMode !== "split";

        lineOpacityControl.wrapper.style.opacity = state.compareRenderMode === "split" ? "1" : ".45";
        lineOpacityControl.range.disabled = state.compareRenderMode !== "split";

        const blendMode = ["split", "sideBySide", "overlay", "blink"].includes(state.compareRenderMode);
        blendOpacityControl.wrapper.style.opacity = blendMode ? "1" : ".45";
        blendOpacityControl.range.disabled = !blendMode;

        blinkControl.wrapper.style.opacity = state.compareRenderMode === "blink" ? "1" : ".45";
        blinkControl.range.disabled = state.compareRenderMode !== "blink";

        guideToggle.textContent = `Guide: ${state.showGuide ? "On" : "Off"}`;
        followMouseButton.textContent = `Follow Mouse: ${state.followMouse ? "On" : "Off"}`;
        sbsStyleButton.textContent = `SBS: ${state.sbsStyle === "Precision Align" ? "Precision" : "Native"}`;
        linkPanButton.textContent = state.controlHeld ? "SEAM LOCK: CTRL" : `Link Move: ${state.precisionLinked ? "On" : "Off"}`;
        effectButton.textContent = `Layer: ${state.effectStyle}`;
        effectButton.style.opacity = blendMode ? "1" : ".45";
        effectButton.disabled = !blendMode;
        alignResetButton.style.display = state.compareRenderMode === "sideBySide" && state.sbsStyle === "Precision Align" ? "inline-block" : "none";
        linkPanButton.disabled = !(state.compareRenderMode === "sideBySide" && state.sbsStyle === "Precision Align");
        linkPanButton.style.opacity = linkPanButton.disabled ? ".45" : "1";
        resetChangeButton.textContent = `Reset Change: ${state.resetFitOnChange ? "On" : "Off"}`;
        sbsStyleButton.disabled = state.compareRenderMode !== "sideBySide";
        sbsStyleButton.style.opacity = state.compareRenderMode === "sideBySide" ? "1" : ".45";
        setActiveButton(guideToggle, state.showGuide);
        setActiveButton(followMouseButton, state.followMouse);
        setActiveButton(sbsStyleButton, state.sbsStyle !== "Native");
        setActiveButton(linkPanButton, state.precisionLinked);
        setActiveButton(resetChangeButton, state.resetFitOnChange);
        setActiveButton(swapButton, state.swapped);

        lineOpacityControl.range.value = String(state.lineOpacity);
        lineOpacityControl.output.textContent = `${state.lineOpacity}%`;
        blendOpacityControl.range.value = String(state.blendOpacity);
        blendOpacityControl.output.textContent = `${state.blendOpacity}%`;
        blinkControl.range.value = String(state.blinkMs);
        blinkControl.output.textContent = state.blinkMs >= 1000
            ? `${(state.blinkMs / 1000).toFixed(state.blinkMs % 1000 ? 1 : 0)}s`
            : `${state.blinkMs}ms`;
        overlapControl.range.value = String(state.sbsOverlap);
        overlapControl.output.textContent = `${Math.round(state.sbsOverlap)}%`;
        overlapControl.range.disabled = state.compareRenderMode !== "sideBySide";
        overlapControl.wrapper.style.opacity = state.compareRenderMode === "sideBySide" ? "1" : ".45";
    }

    function updateNavigation() {
        const node = state.node;
        const items = node?.__novaHistoryItems || [];
        const index = Math.max(
            0,
            Math.min(
                Number(node?.__novaCurrentHistoryIndex || 0),
                Math.max(0, items.length - 1),
            ),
        );
        counter.textContent = items.length ? `${index + 1}/${items.length}` : "0/0";

        const previousDisabled = !items.length || index <= 0;
        const nextDisabled = !items.length || index >= items.length - 1;
        for (const button of [previous, bottomPrevious]) {
            button.disabled = previousDisabled;
            button.style.opacity = previousDisabled ? ".35" : "1";
        }
        for (const button of [next, bottomNext]) {
            button.disabled = nextDisabled;
            button.style.opacity = nextDisabled ? ".35" : "1";
        }

        updatePassButtons();
        updateCompareControls();
    }

    function setLabelsVisible(enabled) {
        state.labelsVisible = Boolean(enabled);
        try {
            localStorage.setItem("nova_media_labels_visible", state.labelsVisible ? "1" : "0");
        } catch (_) {}
        const display = state.compareMode && state.labelsVisible ? "block" : "none";
        pass1Label.style.display = display;
        pass2Label.style.display = display;
    }

    function setCompareVisible(enabled) {
        state.compareMode = Boolean(enabled);
        const display = state.compareMode ? "block" : "none";
        compareLayer.style.display = display;
        compareImage.style.display = display;
        precisionWrap.style.display = "none";
        setLabelsVisible(state.labelsVisible);
        compareControls.style.display = "flex";
        viewport.style.cursor = state.compareMode ? "crosshair" : "grab";
        updateCompareControls();
    }

    function currentCompareSources() {
        return state.swapped
            ? { base: state.pass2Src, top: state.pass1Src }
            : { base: state.pass1Src, top: state.pass2Src };
    }

    function effectMixBlend(style) {
        if (style === "Multiply") return "multiply";
        if (style === "Screen") return "screen";
        if (["Difference", "Heatmap", "High Contrast", "Edges"].includes(style)) return "difference";
        return "normal";
    }

    function effectFilter(style) {
        if (style === "Heatmap") return "grayscale(1) contrast(260%) sepia(1) saturate(850%) hue-rotate(300deg)";
        if (style === "High Contrast") return "grayscale(1) contrast(430%) brightness(175%)";
        if (style === "Edges") return "grayscale(1) contrast(700%) invert(1)";
        return "none";
    }

    function zoomPrecisionAtPointer(event, newZoom, linkBoth) {
        const halves = [
            precisionAClip.getBoundingClientRect(),
            precisionBClip.getBoundingClientRect(),
        ];
        const solved = zoomPrecisionAtPointerLocked({
            images: [precisionImageA, precisionImageB],
            halves,
            pans: {
                panAX: state.precisionPanAX, panAY: state.precisionPanAY,
                panBX: state.precisionPanBX, panBY: state.precisionPanBY,
            },
            orientation: state.compareOrientation,
            clientX: event.clientX, clientY: event.clientY,
            oldZoom: state.zoom, newZoom, linkBoth,
        });
        state.precisionPanAX = solved.panAX;
        state.precisionPanAY = solved.panAY;
        state.precisionPanBX = solved.panBX;
        state.precisionPanBY = solved.panBY;
        state.zoom = newZoom;
    }

    function updateCompareLabels() {
        pass1Label.textContent = state.swapped ? "PASS 2" : "PASS 1";
        pass2Label.textContent = state.swapped ? "PASS 1" : "PASS 2";

        const horizontal = state.compareOrientation === "horizontal";
        const stacked = state.compareRenderMode === "sideBySide" && horizontal;
        if ((state.compareRenderMode === "split" && horizontal) || stacked) {
            pass1Label.style.left = "18px";
            pass1Label.style.right = "auto";
            pass1Label.style.top = "18px";
            pass1Label.style.bottom = "auto";

            pass2Label.style.left = "auto";
            pass2Label.style.right = "18px";
            pass2Label.style.top = stacked ? "calc(50% + 18px)" : "auto";
            pass2Label.style.bottom = stacked ? "auto" : "72px";
        } else {
            pass1Label.style.left = "18px";
            pass1Label.style.right = "auto";
            pass1Label.style.top = "18px";
            pass1Label.style.bottom = "auto";

            pass2Label.style.left = state.compareRenderMode === "sideBySide" ? "calc(50% + 18px)" : "auto";
            pass2Label.style.right = state.compareRenderMode === "sideBySide" ? "auto" : "18px";
            pass2Label.style.top = "18px";
            pass2Label.style.bottom = "auto";
        }
    }

    function stopBlink() {
        if (state.blinkTimer) clearTimeout(state.blinkTimer);
        state.blinkTimer = 0;
    }

    function startBlink() {
        stopBlink();
        if (!state.compareMode || state.compareRenderMode !== "blink") return;
        const tick = () => {
            if (!state.compareMode || state.compareRenderMode !== "blink" || !isOpen()) {
                stopBlink();
                return;
            }
            state.blinkPhase = state.blinkPhase ? 0 : 1;
            compareLayer.style.opacity = state.blinkPhase ? "1" : "0";
            updateCompareLabels();
            state.blinkTimer = setTimeout(tick, Math.max(100, Number(state.blinkMs || 650)));
        };
        compareLayer.style.opacity = state.blinkPhase ? "1" : "0";
        state.blinkTimer = setTimeout(tick, Math.max(100, Number(state.blinkMs || 650)));
    }

    function updateComparePresentation() {
        if (!state.compareMode) {
            stopBlink();
            compareDivider.style.display = "none";
            compareHitZone.style.display = "none";
            compareHandle.style.display = "none";
            return;
        }

        const split = clampNumber(state.comparePercent, 0, 100);
        const mode = state.compareRenderMode;

        image.style.left = "50%";
        image.style.top = "50%";
        compareLayer.style.left = "0";
        compareLayer.style.right = "0";
        compareLayer.style.top = "0";
        compareLayer.style.bottom = "0";
        compareLayer.style.width = "auto";
        compareLayer.style.height = "auto";
        compareImage.style.left = "50%";
        compareImage.style.top = "50%";
        compareLayer.style.display = "block";
        compareImage.style.display = "block";
        compareLayer.style.mixBlendMode = "normal";
        compareImage.style.mixBlendMode = "normal";
        compareImage.style.filter = "none";
        compareImage.style.opacity = "1";
        compareBaseImage.style.display = "none";
        precisionBaseB.style.display = "none";
        precisionImageB.style.mixBlendMode = "normal";
        precisionImageB.style.filter = "none";
        precisionImageB.style.opacity = "1";
        compareLayer.style.clipPath = "none";
        precisionWrap.style.display = "none";
        image.style.visibility = "visible";

        if (mode !== "blink") stopBlink();

        const visibleEffectStyle = state.peekOriginal ? "Normal" : state.effectStyle;
        const effectActive = visibleEffectStyle !== "Normal";
        const effectBlend = effectMixBlend(visibleEffectStyle);
        const effectFilterValue = effectFilter(visibleEffectStyle);
        const effectUsesInternalBase = effectActive && ["split", "sideBySide", "blink"].includes(mode);
        if (effectUsesInternalBase) {
            compareBaseImage.style.display = "block";
            compareBaseImage.src = image.src;
            compareImage.style.mixBlendMode = effectBlend;
            compareImage.style.filter = effectFilterValue;
            compareImage.style.opacity = String(clampNumber(state.blendOpacity, 0, 100) / 100);
        }

        if (mode === "split") {
            compareLayer.style.opacity = "1";
            if (state.compareOrientation === "horizontal") {
                compareLayer.style.clipPath = `polygon(0 ${split}%, 100% ${split}%, 100% 100%, 0 100%)`;
                compareDivider.style.cssText += "";
                compareDivider.style.display = "block";
                compareDivider.style.left = "0";
                compareDivider.style.right = "0";
                compareDivider.style.top = `${split}%`;
                compareDivider.style.bottom = "auto";
                compareDivider.style.width = "auto";
                compareDivider.style.height = "2px";
                compareDivider.style.transform = "translateY(-1px)";

                compareHitZone.style.display = "block";
                compareHitZone.style.left = "0";
                compareHitZone.style.right = "0";
                compareHitZone.style.top = `${split}%`;
                compareHitZone.style.bottom = "auto";
                compareHitZone.style.width = "auto";
                compareHitZone.style.height = "42px";
                compareHitZone.style.transform = "translateY(-50%)";
                compareHitZone.style.cursor = "ns-resize";

                compareHandle.style.left = "50%";
                compareHandle.style.top = `${split}%`;
                compareHandle.style.transform = "translate(-50%,-50%)";
                compareHandle.style.cursor = "ns-resize";
                compareHandle.textContent = "↕";
            } else {
                compareLayer.style.clipPath = `polygon(${split}% 0, 100% 0, 100% 100%, ${split}% 100%)`;
                compareDivider.style.display = "block";
                compareDivider.style.left = `${split}%`;
                compareDivider.style.right = "auto";
                compareDivider.style.top = "0";
                compareDivider.style.bottom = "0";
                compareDivider.style.width = "2px";
                compareDivider.style.height = "auto";
                compareDivider.style.transform = "translateX(-1px)";

                compareHitZone.style.display = "block";
                compareHitZone.style.left = `${split}%`;
                compareHitZone.style.right = "auto";
                compareHitZone.style.top = "0";
                compareHitZone.style.bottom = "0";
                compareHitZone.style.width = "42px";
                compareHitZone.style.height = "auto";
                compareHitZone.style.transform = "translateX(-50%)";
                compareHitZone.style.cursor = "ew-resize";

                compareHandle.style.left = `${split}%`;
                compareHandle.style.top = "50%";
                compareHandle.style.transform = "translate(-50%,-50%)";
                compareHandle.style.cursor = "ew-resize";
                compareHandle.textContent = "↔";
            }
            compareDivider.style.opacity = String(clampNumber(state.lineOpacity, 0, 100) / 100);
            compareHandle.style.display = state.showGuide ? "block" : "none";
        } else if (mode === "sideBySide") {
            compareLayer.style.opacity = "1";
            compareLayer.style.left = "0";
            compareLayer.style.right = "0";
            compareLayer.style.top = "0";
            compareLayer.style.bottom = "0";
            compareDivider.style.display = "none";
            compareHitZone.style.display = "none";
            compareHandle.style.display = "none";

            if (state.sbsStyle === "Precision Align") {
                image.style.visibility = "hidden";
                compareLayer.style.display = "none";
                precisionWrap.style.display = "block";
                const horizontal = state.compareOrientation === "horizontal";
                Object.assign(precisionAClip.style, horizontal
                    ? { left:"0", right:"0", top:"0", bottom:"50%" }
                    : { left:"0", right:"50%", top:"0", bottom:"0" });
                Object.assign(precisionBClip.style, horizontal
                    ? { left:"0", right:"0", top:"50%", bottom:"0" }
                    : { left:"50%", right:"0", top:"0", bottom:"0" });
                const aw = Math.max(1, precisionAClip.clientWidth || viewport.clientWidth / 2);
                const ah = Math.max(1, precisionAClip.clientHeight || viewport.clientHeight);
                const bw = Math.max(1, precisionBClip.clientWidth || viewport.clientWidth / 2);
                const bh = Math.max(1, precisionBClip.clientHeight || viewport.clientHeight);
                const afit = Math.min(aw / Math.max(1, image.naturalWidth), ah / Math.max(1, image.naturalHeight));
                const bfit = Math.min(bw / Math.max(1, compareImage.naturalWidth), bh / Math.max(1, compareImage.naturalHeight));
                precisionImageA.src = image.src;
                precisionBaseB.src = image.src;
                precisionImageB.src = compareImage.src;
                precisionImageA.style.width = `${image.naturalWidth}px`;
                precisionImageA.style.height = `${image.naturalHeight}px`;
                precisionBaseB.style.width = `${image.naturalWidth}px`;
                precisionBaseB.style.height = `${image.naturalHeight}px`;
                precisionImageB.style.width = `${compareImage.naturalWidth}px`;
                precisionImageB.style.height = `${compareImage.naturalHeight}px`;
                precisionImageA.style.transform = `translate(-50%,-50%) translate(${state.precisionPanAX * afit * state.zoom}px,${state.precisionPanAY * afit * state.zoom}px) scale(${afit * state.zoom})`;
                precisionBaseB.style.transform = `translate(-50%,-50%) translate(${state.precisionPanBX * bfit * state.zoom}px,${state.precisionPanBY * bfit * state.zoom}px) scale(${afit * state.zoom})`;
                precisionImageB.style.transform = `translate(-50%,-50%) translate(${state.precisionPanBX * bfit * state.zoom}px,${state.precisionPanBY * bfit * state.zoom}px) scale(${bfit * state.zoom})`;
                precisionImageA.style.imageRendering = state.pixelated ? "pixelated" : "auto";
                precisionBaseB.style.imageRendering = state.pixelated ? "pixelated" : "auto";
                precisionImageB.style.imageRendering = state.pixelated ? "pixelated" : "auto";
                if (effectActive) {
                    precisionBaseB.style.display = "block";
                    precisionImageB.style.mixBlendMode = effectBlend;
                    precisionImageB.style.filter = effectFilterValue;
                    precisionImageB.style.opacity = String(clampNumber(state.blendOpacity, 0, 100) / 100);
                }
            } else {
                const displayedWidth = state.baseWidth * state.zoom;
                const displayedHeight = state.baseHeight * state.zoom;
                const separationFactor = 1 - clampNumber(state.sbsOverlap, 0, 90) / 100;
                if (state.compareOrientation === "horizontal") {
                    const offset = displayedHeight * separationFactor / 2;
                    image.style.left = "50%";
                    image.style.top = `calc(50% - ${offset}px)`;
                    compareImage.style.left = "50%";
                    compareImage.style.top = `calc(50% + ${offset}px)`;
                } else {
                    const offset = displayedWidth * separationFactor / 2;
                    image.style.left = `calc(50% - ${offset}px)`;
                    image.style.top = "50%";
                    compareImage.style.left = `calc(50% + ${offset}px)`;
                    compareImage.style.top = "50%";
                }
            }
        } else if (mode === "blink") {
            compareDivider.style.display = "none";
            compareHitZone.style.display = "none";
            compareHandle.style.display = "none";
            startBlink();
        } else {
            compareLayer.style.opacity = String(clampNumber(state.blendOpacity, 0, 100) / 100);
            const effect = state.compareRenderMode === "difference" && visibleEffectStyle === "Normal"
                ? "Difference" : visibleEffectStyle;
            compareLayer.style.mixBlendMode = effectMixBlend(effect);
            compareImage.style.filter = effectFilter(effect);
            compareDivider.style.display = "none";
            compareHitZone.style.display = "none";
            compareHandle.style.display = "none";
        }

        compareBaseImage.style.left = compareImage.style.left;
        compareBaseImage.style.top = compareImage.style.top;
        updateCompareLabels();
    }

    function update() {
        const width = `${state.baseWidth}px`;
        const height = `${state.baseHeight}px`;
        const transform =
            `translate(-50%, -50%) translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;

        image.style.width = width;
        image.style.height = height;
        image.style.transform = transform;
        image.style.imageRendering = state.pixelated ? "pixelated" : "auto";

        compareBaseImage.style.width = width;
        compareBaseImage.style.height = height;
        compareBaseImage.style.transform = transform;
        compareBaseImage.style.imageRendering = state.pixelated ? "pixelated" : "auto";
        compareImage.style.width = width;
        compareImage.style.height = height;
        compareImage.style.transform = transform;
        compareImage.style.imageRendering = state.pixelated ? "pixelated" : "auto";

        const actualPercent = Math.max(0.1, state.zoom * 100);
        zoomButton.textContent = actualPercent >= 1000
            ? `${Math.round(actualPercent)}%`
            : `${actualPercent.toFixed(actualPercent < 10 ? 1 : 0)}%`;
        interpolationButton.textContent = state.pixelated ? "Pixel" : "Smooth";
        setActiveButton(interpolationButton, state.pixelated);

        updateComparePresentation();

        const voice = voiceCode(state.node?.__novaCurrentHistoryItem || {});
        if (state.compareMode && image.naturalWidth && compareImage.naturalWidth) {
            const modeName =
                state.compareRenderMode.charAt(0).toUpperCase()
                + state.compareRenderMode.slice(1);
            const orientationName =
                (state.compareRenderMode === "split" || state.compareRenderMode === "sideBySide")
                    ? ` ${state.compareOrientation}`
                    : "";
            const splitInfo = state.compareRenderMode === "split"
                ? ` • ${Math.round(state.comparePercent)}%`
                : state.compareRenderMode === "blink"
                    ? ` • ${state.blinkMs >= 1000 ? (state.blinkMs / 1000).toFixed(1) + "s" : state.blinkMs + "ms"}`
                    : state.compareRenderMode === "overlay"
                        ? ` • blend ${Math.round(state.blendOpacity)}%`
                        : "";
            const swapInfo = state.swapped ? " • swapped" : "";

            title.textContent =
                `Compare ${modeName}${orientationName}${swapInfo}${splitInfo}`
                + ` • ${voice}`
                + ` • P1 ${(state.node?.__novaCurrentHistoryItem?.image_first_width || image.naturalWidth)} × ${(state.node?.__novaCurrentHistoryItem?.image_first_height || image.naturalHeight)}`
                + ` • P2 ${(state.node?.__novaCurrentHistoryItem?.image_second_width || compareImage.naturalWidth)} × ${(state.node?.__novaCurrentHistoryItem?.image_second_height || compareImage.naturalHeight)}`
                + ` • ${zoomButton.textContent}`;
        } else if (image.naturalWidth) {
            title.textContent =
                `${state.currentPass || "Image"} • ${voice}`
                + ` • ${(state.node?.__novaCurrentImageMeta?.width || image.naturalWidth)} × ${(state.node?.__novaCurrentImageMeta?.height || image.naturalHeight)}`
                + ` • ${zoomButton.textContent}`;
        }

        updateNavigation();
    }

    function saveCompareSettings() {
        try {
            localStorage.setItem("nova_media_compare_mode", state.compareRenderMode);
            localStorage.setItem("nova_media_compare_orientation", state.compareOrientation);
            localStorage.setItem("nova_media_compare_percent", String(state.comparePercent));
            localStorage.setItem("nova_media_compare_follow_mouse", state.followMouse ? "1" : "0");
            localStorage.setItem("nova_media_compare_sbs_overlap", String(state.sbsOverlap));
            localStorage.setItem("nova_media_compare_sbs_style", state.sbsStyle);
            localStorage.setItem("nova_media_compare_effect", state.effectStyle);
            localStorage.setItem("nova_media_compare_precision_linked", state.precisionLinked ? "1" : "0");
            localStorage.setItem("nova_media_reset_fit_change", state.resetFitOnChange ? "1" : "0");
            localStorage.setItem("nova_media_compare_blink", String(state.blinkMs));
        } catch (_) {}
    }

    function saveViewSettings() {
        try {
            localStorage.setItem("nova_media_view_preset", state.viewPreset);
            localStorage.setItem("nova_media_custom_scale", String(state.customScale));
            localStorage.setItem("nova_media_pixelated", state.pixelated ? "1" : "0");
        } catch (_) {
            // Browser storage may be unavailable in hardened profiles.
        }
    }

    function availableImageSpace() {
        const rect = viewport.getBoundingClientRect();
        const padding = 24;
        let width = Math.max(1, rect.width - padding);
        let height = Math.max(1, rect.height - padding);
        if (state.compareMode && state.compareRenderMode === "sideBySide") {
            const factor = 2 - clampNumber(state.sbsOverlap, 0, 90) / 100;
            if (state.compareOrientation === "horizontal") height = Math.max(1, (rect.height - padding) / factor);
            else width = Math.max(1, (rect.width - padding) / factor);
        }
        return { width, height };
    }

    function applyNativeScale(scale, resetPan = true) {
        if (!image.naturalWidth) return;
        state.baseWidth = Math.max(1, image.naturalWidth);
        state.baseHeight = Math.max(1, image.naturalHeight);
        state.zoom = clampNumber(Number(scale || 1), 0.005, 200);
        if (resetPan) {
            state.panX = 0;
            state.panY = 0;
        }
        update();
    }

    function presetScale(preset = state.viewPreset) {
        if (!image.naturalWidth) return 1;
        const available = availableImageSpace();
        if (preset === "width") return available.width / image.naturalWidth;
        if (preset === "height") return available.height / image.naturalHeight;
        if (preset === "actual") return 1;
        if (preset === "custom") return state.customScale;
        return Math.min(
            available.width / image.naturalWidth,
            available.height / image.naturalHeight,
        );
    }

    function applyViewPreset(resetPan = true) {
        applyNativeScale(presetScale(), resetPan);
    }

    function setViewPreset(preset, resetPan = true) {
        state.viewPreset = preset;
        if (preset !== "custom") state.customScale = presetScale(preset);
        saveViewSettings();
        applyViewPreset(resetPan);
    }

    function fit() {
        setViewPreset("fit", true);
    }

    function fitWidth() {
        setViewPreset("width", true);
    }

    function fitHeight() {
        setViewPreset("height", true);
    }

    function actualPixels() {
        setViewPreset("actual", true);
    }

    function exactZoom(percent) {
        const scale = clampNumber(Number(percent) / 100, 0.005, 200);
        state.viewPreset = "custom";
        state.customScale = scale;
        saveViewSettings();
        applyNativeScale(scale, true);
    }

    function toggleInterpolation() {
        state.pixelated = !state.pixelated;
        saveViewSettings();
        update();
    }

    function resetCompareDefaults() {
        state.compareRenderMode = DEFAULT_COMPARE.mode;
        state.compareOrientation = DEFAULT_COMPARE.orientation;
        state.comparePercent = DEFAULT_COMPARE.percent;
        state.showGuide = DEFAULT_COMPARE.showGuide;
        state.lineOpacity = DEFAULT_COMPARE.lineOpacity;
        state.blendOpacity = DEFAULT_COMPARE.blendOpacity;
        state.blinkMs = DEFAULT_COMPARE.blinkMs;
        state.blinkPhase = 0;
        state.followMouse = DEFAULT_COMPARE.followMouse;
        state.sbsOverlap = DEFAULT_COMPARE.sbsOverlap;
        state.sbsStyle = DEFAULT_COMPARE.sbsStyle;
        state.effectStyle = "Normal";
        state.precisionLinked = DEFAULT_COMPARE.precisionLinked;
        state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0;
        state.resetFitOnChange = DEFAULT_COMPARE.resetFitOnChange;
        state.swapped = DEFAULT_COMPARE.swapped;
        saveCompareSettings();
        state.viewPreset = "fit";
        state.customScale = 1;
        state.pixelated = false;
        saveViewSettings();
        stopBlink();

        if (state.compareMode) {
            const sources = currentCompareSources();
            if (sources.base && image.src !== sources.base) image.src = sources.base;
            if (sources.top && compareImage.src !== sources.top) compareImage.src = sources.top;
        }

        fit();
    }

    function closeViewer() {
        // Keep the selected history node and loaded sources alive while the
        // overlay is hidden. NovoLoko Media Studio can therefore continue audio,
        // loop and slideshow playback after the viewer is closed.
        const closingNode = state.node;
        stopBlink();
        overlay.style.display = "none";
        state.dragging = false;
        state.compareDragging = false;
        state.compareCaptureTarget = null;
        state.dragButton = null;
        window.dispatchEvent(new CustomEvent("nova-image-viewer-closed", {
            detail: { node: closingNode },
        }));
    }

    function setViewerSource(node, src, resetView = true, passName = "Image") {
        if (!src) return;
        const token = ++state.loadToken;
        state.node = node;
        state.src = src;
        state.compareSrc = "";
        state.pass1Src = "";
        state.pass2Src = "";
        state.currentPass = passName || "Image";
        setCompareVisible(false);

        image.onload = () => {
            if (token !== state.loadToken) return;
            state.baseWidth = Math.max(1, image.naturalWidth);
            state.baseHeight = Math.max(1, image.naturalHeight);
            image.style.display = "block";
            const presetNeedsLayout = ["fit", "width", "height"].includes(state.viewPreset);
            if (resetView && state.resetFitOnChange) {
                requestAnimationFrame(() => { state.viewPreset = "fit"; applyViewPreset(true); });
            } else if (presetNeedsLayout) {
                requestAnimationFrame(() => applyViewPreset(false));
            } else {
                update();
            }
        };
        image.onerror = () => {
            if (token !== state.loadToken) return;
            title.textContent = "Image could not be loaded";
        };

        image.src = src;
        if (image.complete && image.naturalWidth) {
            queueMicrotask(() => image.onload?.());
        }
        updateNavigation();
    }

    function setCompareSources(node, firstSrc, secondSrc, resetView = true) {
        if (!firstSrc || !secondSrc) return;
        const token = ++state.loadToken;
        state.node = node;
        state.pass1Src = firstSrc;
        state.pass2Src = secondSrc;
        state.currentPass = "Compare";
        setCompareVisible(true);

        const sources = currentCompareSources();
        state.src = sources.base;
        state.compareSrc = sources.top;

        let firstReady = false;
        let secondReady = false;
        const finishLoad = () => {
            if (token !== state.loadToken || !firstReady || !secondReady) return;
            state.baseWidth = Math.max(1, image.naturalWidth);
            state.baseHeight = Math.max(1, image.naturalHeight);
            image.style.display = "block";
            compareImage.style.display = "block";
            const presetNeedsLayout = ["fit", "width", "height"].includes(state.viewPreset);
            if (resetView && state.resetFitOnChange) {
                requestAnimationFrame(() => { state.viewPreset = "fit"; applyViewPreset(true); });
            } else if (presetNeedsLayout) {
                requestAnimationFrame(() => applyViewPreset(false));
            } else {
                update();
            }
        };

        image.onload = () => {
            if (token !== state.loadToken) return;
            firstReady = true;
            finishLoad();
        };
        compareImage.onload = () => {
            if (token !== state.loadToken) return;
            secondReady = true;
            finishLoad();
        };
        image.onerror = () => {
            if (token !== state.loadToken) return;
            title.textContent = "Pass 1 image could not be loaded";
        };
        compareImage.onerror = () => {
            if (token !== state.loadToken) return;
            title.textContent = "Pass 2 image could not be loaded";
        };

        image.src = sources.base;
        compareImage.src = sources.top;

        if (image.complete && image.naturalWidth) {
            queueMicrotask(() => image.onload?.());
        }
        if (compareImage.complete && compareImage.naturalWidth) {
            queueMicrotask(() => compareImage.onload?.());
        }
        updateNavigation();
    }

    function setPassChoice(choice, resetView = true, fallbackSrc = "") {
        state.passChoice = String(choice || "Auto - Second if available");
        const item = state.node?.__novaCurrentHistoryItem || {};
        const firstFilename = String(
            item?.image_first_filename || item?.image_filename || "",
        ).trim();
        const secondFilename = String(item?.image_second_filename || "").trim();

        updatePassButtons();

        if (state.passChoice === "Compare") {
            const firstSrc = firstFilename ? historyImageUrl(firstFilename) : "";
            const secondSrc = secondFilename ? historyImageUrl(secondFilename) : "";
            if (firstSrc && secondSrc) {
                setCompareSources(state.node, firstSrc, secondSrc, resetView);
                return;
            }

            const fallbackFilename = secondFilename || firstFilename;
            const singleSrc = fallbackFilename
                ? historyImageUrl(fallbackFilename)
                : fallbackSrc;
            if (singleSrc) {
                const passName = secondFilename
                    ? "Second Pass — Compare unavailable"
                    : "First Pass — Compare unavailable";
                setViewerSource(state.node, singleSrc, resetView, passName);
            }
            return;
        }

        const selected = historyImageForChoice(item, state.passChoice);
        const src = selected.filename
            ? historyImageUrl(selected.filename)
            : fallbackSrc;
        if (src) {
            setViewerSource(
                state.node,
                src,
                resetView,
                selected.pass || "Image",
            );
        }
    }

    function openViewer(node, src) {
        if (!src && !node?.__novaCurrentHistoryItem) return;
        overlay.style.display = "block";
        state.node = node;
        state.comparePercent = DEFAULT_COMPARE.percent;
        state.passChoice = previewImageChoice(node);
        setPassChoice(state.passChoice, true, src);
        window.dispatchEvent(new CustomEvent("nova-image-viewer-opened", { detail: { node } }));
    }

    function refreshFromNode(node, src) {
        if (!isOpen() || state.node !== node) return;
        setPassChoice(state.passChoice, true, src);
    }

    function navigate(delta, playNow = true) {
        const node = state.node;
        if (!node) return;
        const index =
            Number(node.__novaCurrentHistoryIndex || 0)
            + Number(delta || 0);
        selectHistoryByIndex(node, index, Boolean(playNow));
        setPassChoice(
            state.passChoice,
            true,
            node.__novaHistoryImage?.src || "",
        );
        updateNavigation();
    }

    function setCompareMode(mode) {
        if (mode === "difference") mode = "overlay";
        if (!["split", "sideBySide", "overlay", "blink"].includes(mode)) return;
        const previous = state.compareRenderMode;
        const needsFit = (previous === "sideBySide") !== (mode === "sideBySide");
        state.compareRenderMode = mode;
        saveCompareSettings();
        if (needsFit) applyViewPreset(true);
        else update();
    }

    function setOrientation(orientation) {
        if (!["vertical", "horizontal"].includes(orientation)) return;
        state.compareOrientation = orientation;
        saveCompareSettings();
        if (state.compareRenderMode === "sideBySide") applyViewPreset(true);
        else update();
    }

    async function swapComparePasses() {
        if (!state.pass1Src || !state.pass2Src) return;
        const token = ++state.swapToken;
        stopBlink();
        state.blinkPhase = 0;
        const nextSwapped = !state.swapped;
        const sources = nextSwapped
            ? { base: state.pass2Src, top: state.pass1Src }
            : { base: state.pass1Src, top: state.pass2Src };

        const preload = (src) => new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
        try {
            await Promise.all([preload(sources.base), preload(sources.top)]);
            if (token !== state.swapToken) return;
            for (const element of [image, compareImage, compareBaseImage, precisionImageA, precisionBaseB, precisionImageB]) {
                element.style.visibility = "hidden";
            }
            state.swapped = nextSwapped;
            state.src = sources.base;
            state.compareSrc = sources.top;
            image.onload = null; image.onerror = null;
            compareImage.onload = null; compareImage.onerror = null;
            image.src = sources.base;
            compareBaseImage.src = sources.base;
            precisionImageA.src = sources.base;
            precisionBaseB.src = sources.base;
            compareImage.src = sources.top;
            precisionImageB.src = sources.top;
            await Promise.allSettled([image, compareImage, compareBaseImage, precisionImageA, precisionBaseB, precisionImageB].map((img) => img.decode?.()));
            if (token !== state.swapToken) return;
            saveCompareSettings();
            update();
            requestAnimationFrame(() => {
                for (const element of [image, compareImage, compareBaseImage, precisionImageA, precisionBaseB, precisionImageB]) {
                    element.style.visibility = "visible";
                }
                if (state.compareRenderMode === "blink") startBlink();
            });
        } catch (_) {
            state.swapped = nextSwapped;
            image.src = sources.base;
            compareImage.src = sources.top;
            state.src = sources.base;
            state.compareSrc = sources.top;
            saveCompareSettings();
            update();
        }
    }

    for (const [value, button] of Object.entries(passButtons)) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!button.disabled) setPassChoice(value, true, state.src);
        });
    }

    for (const [mode, button] of Object.entries(compareModeButtons)) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!activateCompareTool(mode)) return;
            setCompareMode(mode);
        });
    }

    for (const [orientation, button] of Object.entries(orientationButtons)) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            state.compareOrientation = orientation;
            if (!activateCompareTool()) return;
            setOrientation(orientation);
        });
    }

    followMouseButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!activateCompareTool("split")) return;
        state.followMouse = !state.followMouse;
        saveCompareSettings();
        update();
    });

    sbsStyleButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        if (!activateCompareTool("sideBySide")) return;
        state.sbsStyle = state.sbsStyle === "Native" ? "Precision Align" : "Native";
        saveCompareSettings(); applyViewPreset(true); update();
    });

    linkPanButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        state.precisionLinked = !state.precisionLinked;
        saveCompareSettings(); update();
    });

    effectButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        if (!activateCompareTool()) return;
        const styles = ["Normal", "Difference", "Heatmap", "High Contrast", "Edges", "Multiply", "Screen"];
        state.effectStyle = styles[(styles.indexOf(state.effectStyle) + 1) % styles.length];
        saveCompareSettings(); update();
    });

    hotkeysButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        helpPanel.style.display = helpPanel.style.display === "none" ? "block" : "none";
    });
    helpPanel.addEventListener("click", () => { helpPanel.style.display = "none"; });

    alignResetButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0;
        update();
    });

    resetChangeButton.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        state.resetFitOnChange = !state.resetFitOnChange;
        saveCompareSettings(); update();
    });

    guideToggle.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!activateCompareTool()) return;
        state.showGuide = !state.showGuide;
        update();
    });

    swapButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!activateCompareTool()) return;
        swapComparePasses();
    });

    centreButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!activateCompareTool("split")) return;
        state.comparePercent = 50;
        saveCompareSettings();
        update();
    });

    lineOpacityControl.range.addEventListener("input", (event) => {
        event.stopPropagation();
        state.lineOpacity = clampNumber(
            Number(lineOpacityControl.range.value),
            0,
            100,
        );
        update();
    });

    blendOpacityControl.range.addEventListener("input", (event) => {
        event.stopPropagation();
        state.blendOpacity = clampNumber(
            Number(blendOpacityControl.range.value),
            0,
            100,
        );
        update();
    });

    blinkControl.range.addEventListener("input", (event) => {
        event.stopPropagation();
        state.blinkMs = clampNumber(Number(blinkControl.range.value), 100, 10000);
        if (state.compareRenderMode === "blink") startBlink();
        saveCompareSettings();
        updateCompareControls();
    });

    overlapControl.range.addEventListener("input", (event) => {
        event.stopPropagation();
        state.sbsOverlap = clampNumber(Number(overlapControl.range.value), 0, 90);
        saveCompareSettings();
        if (state.compareRenderMode === "sideBySide") applyViewPreset(false);
        else updateCompareControls();
    });

    for (const button of [previous, bottomPrevious]) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            navigate(-1);
        });
    }
    for (const button of [next, bottomNext]) {
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            navigate(1);
        });
    }

    fitButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fit();
    });

    fitWidthButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fitWidth();
    });

    fitHeightButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        fitHeight();
    });

    actualPixelsButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        actualPixels();
    });

    zoomButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const current = Math.max(0.5, state.zoom * 100);
        const entered = window.prompt("Enter exact image zoom percentage (0.5 to 20,000)", String(Number(current.toFixed(1))));
        if (entered == null) return;
        const value = Number(String(entered).replace(/%/g, "").trim());
        if (Number.isFinite(value) && value > 0) exactZoom(value);
    });

    interpolationButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleInterpolation();
    });

    resetButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        resetCompareDefaults();
    });

    closeButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeViewer();
    });

    viewport.addEventListener("wheel", (event) => {
        if (!image.naturalWidth) return;
        event.preventDefault();
        event.stopPropagation();

        const rect = viewport.getBoundingClientRect();
        const localX = event.clientX - (rect.left + rect.width / 2);
        const localY = event.clientY - (rect.top + rect.height / 2);
        const oldZoom = state.zoom;
        const factor = Math.exp(-event.deltaY * 0.0019);
        const newZoom = clampNumber(oldZoom * factor, 0.005, 200);

        const precision = state.compareMode && state.compareRenderMode === "sideBySide" && state.sbsStyle === "Precision Align";
        if (precision) {
            const temporaryLock = Boolean(
                event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            zoomPrecisionAtPointer(
                event,
                newZoom,
                Boolean(state.precisionLinked || temporaryLock),
            );
            saveCompareSettings();
        } else {
            const pointX = (localX - state.panX) / oldZoom;
            const pointY = (localY - state.panY) / oldZoom;
            state.zoom = newZoom;
            state.panX = localX - pointX * newZoom;
            state.panY = localY - pointY * newZoom;
        }
        state.viewPreset = "custom";
        state.customScale = newZoom;
        saveViewSettings();
        update();
    }, { passive: false, capture: true });

    viewport.addEventListener("mousedown", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
    }, { capture: true });

    viewport.addEventListener("auxclick", (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        event.stopPropagation();
    });

    viewport.addEventListener("pointerdown", (event) => {
        if (
            (event.button !== 0 && event.button !== 1)
            || !image.naturalWidth
            || state.compareDragging
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        state.dragging = true;
        state.dragButton = event.button;
        state.startX = event.clientX;
        state.startY = event.clientY;
        if (state.compareMode && state.compareRenderMode === "sideBySide" && state.sbsStyle === "Precision Align") {
            const vr = viewport.getBoundingClientRect();
            state.precisionSide = state.compareOrientation === "horizontal"
                ? (event.clientY < vr.top + vr.height / 2 ? "A" : "B")
                : (event.clientX < vr.left + vr.width / 2 ? "A" : "B");
            state.precisionMoveTogether = Boolean(
                state.precisionLinked
                || event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            state.basePanAX = state.precisionPanAX; state.basePanAY = state.precisionPanAY;
            state.basePanBX = state.precisionPanBX; state.basePanBY = state.precisionPanBY;
            state.basePanX = state.precisionSide === "A" ? state.precisionPanAX : state.precisionPanBX;
            state.basePanY = state.precisionSide === "A" ? state.precisionPanAY : state.precisionPanBY;
        } else {
            state.basePanX = state.panX;
            state.basePanY = state.panY;
        }
        viewport.style.cursor = "grabbing";
        viewport.setPointerCapture?.(event.pointerId);
    });

    viewport.addEventListener("pointermove", (event) => {
        if (state.followMouse && state.compareMode && state.compareRenderMode === "split" && !state.dragging && !state.compareDragging) {
            const rect = viewport.getBoundingClientRect();
            state.comparePercent = clampNumber(
                state.compareOrientation === "horizontal"
                    ? (event.clientY - rect.top) / Math.max(1, rect.height) * 100
                    : (event.clientX - rect.left) / Math.max(1, rect.width) * 100,
                0,
                100,
            );
            update();
            return;
        }
        if (!state.dragging) return;
        event.preventDefault();
        event.stopPropagation();
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (state.compareMode && state.compareRenderMode === "sideBySide" && state.sbsStyle === "Precision Align") {
            const fitA = Math.min(
                Math.max(1, precisionAClip.clientWidth) / Math.max(1, image.naturalWidth),
                Math.max(1, precisionAClip.clientHeight) / Math.max(1, image.naturalHeight),
            );
            const fitB = Math.min(
                Math.max(1, precisionBClip.clientWidth) / Math.max(1, compareImage.naturalWidth),
                Math.max(1, precisionBClip.clientHeight) / Math.max(1, compareImage.naturalHeight),
            );
            const sourcePerPixelA = 1 / Math.max(.0001, fitA * state.zoom);
            const sourcePerPixelB = 1 / Math.max(.0001, fitB * state.zoom);
            const moveTogetherNow = Boolean(
                state.precisionMoveTogether
                || event.ctrlKey
                || event.getModifierState?.("Control")
                || state.controlHeld
            );
            if (moveTogetherNow) {
                state.precisionPanAX = state.basePanAX + dx * sourcePerPixelA;
                state.precisionPanAY = state.basePanAY + dy * sourcePerPixelA;
                state.precisionPanBX = state.basePanBX + dx * sourcePerPixelB;
                state.precisionPanBY = state.basePanBY + dy * sourcePerPixelB;
            } else if (state.precisionSide === "A") {
                state.precisionPanAX = state.basePanX + dx * sourcePerPixelA;
                state.precisionPanAY = state.basePanY + dy * sourcePerPixelA;
            } else {
                state.precisionPanBX = state.basePanX + dx * sourcePerPixelB;
                state.precisionPanBY = state.basePanY + dy * sourcePerPixelB;
            }
        } else {
            state.panX = state.basePanX + dx;
            state.panY = state.basePanY + dy;
        }
        update();
    });

    const endPan = (event) => {
        if (!state.dragging) return;
        state.dragging = false;
        state.dragButton = null;
        if (state.compareMode && state.sbsStyle === "Precision Align") saveCompareSettings();
        viewport.style.cursor = state.compareMode ? "crosshair" : "grab";
        try {
            viewport.releasePointerCapture?.(event.pointerId);
        } catch (_) {
            // Pointer may already be released.
        }
    };
    viewport.addEventListener("pointerup", endPan);
    viewport.addEventListener("pointercancel", endPan);
    viewport.addEventListener("lostpointercapture", endPan);
    viewport.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Math.abs(state.zoom - 1) < 0.01) fit();
        else actualPixels();
    });

    function beginCompareDrag(event) {
        if (
            !state.compareMode
            || state.compareRenderMode !== "split"
            || event.button !== 0
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        state.compareDragging = true;
        state.dragging = false;
        state.compareCaptureTarget = event.currentTarget;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    function moveCompareDivider(event) {
        if (!state.compareDragging) return;

        event.preventDefault();
        event.stopPropagation();
        const rect = viewport.getBoundingClientRect();

        if (state.compareOrientation === "horizontal") {
            state.comparePercent = clampNumber(
                ((event.clientY - rect.top) / Math.max(1, rect.height)) * 100,
                0,
                100,
            );
        } else {
            state.comparePercent = clampNumber(
                ((event.clientX - rect.left) / Math.max(1, rect.width)) * 100,
                0,
                100,
            );
        }
        update();
    }

    function endCompareDrag(event) {
        if (!state.compareDragging) return;
        state.compareDragging = false;
        try {
            state.compareCaptureTarget?.releasePointerCapture?.(event.pointerId);
        } catch (_) {
            // Pointer may already be released.
        }
        state.compareCaptureTarget = null;
    }

    for (const target of [compareHitZone, compareHandle]) {
        target.addEventListener("pointerdown", beginCompareDrag);
        target.addEventListener("pointermove", moveCompareDivider);
        target.addEventListener("pointerup", endCompareDrag);
        target.addEventListener("pointercancel", endCompareDrag);
        target.addEventListener("lostpointercapture", endCompareDrag);
    }

    overlay.addEventListener("contextmenu", (event) => {
        if (!isOpen()) return;
        event.preventDefault();
        event.stopPropagation();
        closeViewer();
    });

    overlay.addEventListener("pointerdown", (event) => {
        if (event.target === overlay) closeViewer();
    });

    const suppressAuxiliary = (event) => {
        if (!isOpen() || (event.button !== 3 && event.button !== 4)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
    };

    const handleAuxiliaryNavigation = (event) => {
        if (!isOpen() || (event.button !== 3 && event.button !== 4)) return;
        suppressAuxiliary(event);
        const direction = event.button === 3 ? -1 : 1;
        const handled = window.__novaMediaStudioNavigateHistory?.(direction, true);
        if (!handled) navigate(direction, true);
    };

    window.addEventListener("mousedown", handleAuxiliaryNavigation, true);
    window.addEventListener("mouseup", suppressAuxiliary, true);
    window.addEventListener("auxclick", suppressAuxiliary, true);

    window.addEventListener("keydown", (event) => {
        if (!isOpen()) return;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
        const key = event.key.toLowerCase();
        if (event.key === "Control" && state.compareMode) {
            state.controlHeld = true;
            update();
            return;
        }
        if (event.key === "Alt" && state.compareMode) {
            event.preventDefault();
            state.peekOriginal = true;
            update();
            return;
        }
        if (event.key === "Escape") closeViewer();
        else if (event.code === "Space") {
            event.preventDefault();
            const audio = audioElement(state.node);
            if (audio) {
                if (audio.paused) audio.play()?.catch?.(() => {});
                else audio.pause();
            }
        }
        else if (event.key === "ArrowLeft") { event.preventDefault(); navigate(-1); }
        else if (event.key === "ArrowRight") { event.preventDefault(); navigate(1); }
        else if (event.key === "Home") {
            event.preventDefault();
            const node = state.node;
            if (node) {
                selectHistoryByIndex(node, 0, true);
                setPassChoice(state.passChoice, true, node.__novaHistoryImage?.src || "");
                updateNavigation();
            }
        }
        else if (event.key === "End") {
            event.preventDefault();
            const node = state.node;
            const items = node?.__novaHistoryItems || [];
            if (node && items.length) {
                selectHistoryByIndex(node, items.length - 1, true);
                setPassChoice(state.passChoice, true, node.__novaHistoryImage?.src || "");
                updateNavigation();
            }
        }
        else if (key === "v") {
            event.preventDefault();
            if (state.passChoice === "Compare") setPassChoice(previewImageChoice(state.node), true, state.src);
            else if (!passButtons.Compare?.disabled) setPassChoice("Compare", true, state.src);
        } else if (key === "q" && state.compareMode) setCompareMode("split");
        else if (key === "w" && state.compareMode) setCompareMode("sideBySide");
        else if (key === "e" && state.compareMode) setCompareMode("overlay");
        else if (key === "t" && state.compareMode) setCompareMode("blink");
        else if (key === "h" && state.compareMode) setOrientation(state.compareOrientation === "vertical" ? "horizontal" : "vertical");
        else if (key === "x" && state.compareMode) swapComparePasses();
        else if (key === "g" && state.compareMode) { state.showGuide = !state.showGuide; update(); }
        else if (key === "n" && state.compareMode) { state.followMouse = !state.followMouse; if (state.followMouse) setCompareMode("split"); saveCompareSettings(); update(); }
        else if (key === "l" && state.compareMode) { state.precisionLinked = !state.precisionLinked; saveCompareSettings(); update(); }
        else if (key === "k" && state.compareMode) { const styles = ["Normal", "Difference", "Heatmap", "High Contrast", "Edges", "Multiply", "Screen"]; state.effectStyle = styles[(styles.indexOf(state.effectStyle)+1)%styles.length]; saveCompareSettings(); update(); }
        else if (key === "c" && state.compareMode) { state.comparePercent = 50; state.precisionPanAX = state.precisionPanAY = state.precisionPanBX = state.precisionPanBY = 0; saveCompareSettings(); update(); }
        else if (key === "f") fit();
        else if (key === "1") actualPixels();
        else if (key === "2") fitWidth();
        else if (key === "3") fitHeight();
        else if (key === "m") toggleInterpolation();
        else if (key === "?") helpPanel.style.display = helpPanel.style.display === "none" ? "block" : "none";
    });

    window.addEventListener("keyup", (event) => {
        if (!isOpen()) return;
        if (event.key === "Control") {
            state.controlHeld = false;
            update();
            return;
        }
        if (event.key === "Alt" && state.peekOriginal) {
            state.peekOriginal = false;
            update();
        }
    });

    const resizeToolbar = () => {
        if (!isOpen()) return;
        viewport.style.top = `${Math.max(52, toolbar.offsetHeight)}px`;
        requestAnimationFrame(() => {
            if (!image.naturalWidth) return;
            if (["fit", "width", "height"].includes(state.viewPreset)) applyViewPreset(false);
            else update();
        });
    };

    const toolbarObserver = new ResizeObserver(resizeToolbar);
    toolbarObserver.observe(toolbar);

    window.addEventListener("resize", () => {
        if (!isOpen()) return;
        resizeToolbar();
    });

    novaImageViewer = {
        overlay,
        image,
        compareImage,
        openViewer,
        closeViewer,
        fit,
        fitWidth,
        fitHeight,
        actualPixels,
        refreshView: () => {
            if (["fit", "width", "height"].includes(state.viewPreset)) applyViewPreset(false);
            else update();
        },
        refreshFromNode,
        updateNavigation,
        setPassChoice,
        setLabelsVisible,
        navigate,
        isOpen,
        get node() {
            return state.node;
        },
        get state() {
            return state;
        },
    };
    window.__novaImageViewer = novaImageViewer;
    window.dispatchEvent(new CustomEvent("nova-image-viewer-ready", { detail: novaImageViewer }));
    return novaImageViewer;
}
function openHistoryImageViewer(node) {
    const src = node.__novaHistoryImage?.src;
    if (!src) {
        notify("No history image is available for this entry.", "error");
        return;
    }
    ensureNovaImageViewer().openViewer(node, src);
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function mediaNodeViewMode(node) {
    return node?.properties?.novaMediaNodeView === "actual" ? "actual" : "fit";
}

function updateImageView(node) {
    const image = node.__novaHistoryImage;
    const status = node.__novaImageStatus;
    const area = node.__novaImageArea;
    if (!image || !status || !image.naturalWidth) return;
    const pass = node.__novaCurrentImagePass ? `${node.__novaCurrentImagePass} · ` : "";
    const mode = mediaNodeViewMode(node);
    let shown = 100;
    if (mode === "fit" && area) {
        shown = Math.min(area.clientWidth / image.naturalWidth, area.clientHeight / image.naturalHeight) * 100;
    }
    const meta = node.__novaCurrentImageMeta || {};
    const savedW = Number(meta.width || image.naturalWidth);
    const savedH = Number(meta.height || image.naturalHeight);
    const sourceW = Number(meta.sourceWidth || savedW);
    const sourceH = Number(meta.sourceHeight || savedH);
    const audit = sourceW && sourceH && (sourceW !== savedW || sourceH !== savedH)
        ? `SOURCE ${sourceW} × ${sourceH} → STORED ${savedW} × ${savedH}`
        : `${savedW} × ${savedH}`;
    status.textContent = `${pass}${audit}${meta.capped ? " · capped by saved setting" : " · exact PNG"} · ${mode === "actual" ? "1:1 native" : `Fit ${Math.max(.1, shown).toFixed(shown < 10 ? 1 : 0)}%`}`;
}

function applyHistoryNodeView(node, resetPan = false) {
    const image = node.__novaHistoryImage;
    if (!image || !image.naturalWidth) return;
    if (resetPan) { node.__novaNodePanX = 0; node.__novaNodePanY = 0; }
    const actual = mediaNodeViewMode(node) === "actual";
    image.style.position = "absolute";
    image.style.left = "50%";
    image.style.top = "50%";
    image.style.maxWidth = "none";
    image.style.maxHeight = "none";
    image.style.width = actual ? `${image.naturalWidth}px` : "auto";
    image.style.height = actual ? `${image.naturalHeight}px` : "auto";
    if (!actual) {
        const area = node.__novaImageArea;
        const scale = Math.min(
            Math.max(1, area?.clientWidth || 1) / image.naturalWidth,
            Math.max(1, area?.clientHeight || 1) / image.naturalHeight,
        );
        image.style.width = `${Math.max(1, image.naturalWidth * scale)}px`;
        image.style.height = `${Math.max(1, image.naturalHeight * scale)}px`;
    }
    image.style.transform = `translate(-50%,-50%) translate(${Number(node.__novaNodePanX || 0)}px,${Number(node.__novaNodePanY || 0)}px)`;
    image.style.imageRendering = node?.properties?.novaMediaNodePixelated ? "pixelated" : "auto";
    image.style.cursor = actual ? "grab" : "zoom-in";
    updateImageView(node);
}

function fitHistoryImage(node) {
    node.properties = node.properties || {};
    node.properties.novaMediaNodeView = "fit";
    applyHistoryNodeView(node, true);
}

function actualHistoryImage(node) {
    node.properties = node.properties || {};
    node.properties.novaMediaNodeView = "actual";
    applyHistoryNodeView(node, true);
}

function resetHistoryImageView(node) { fitHistoryImage(node); }

function setHistoryImage(node, item) {
    const image = node.__novaHistoryImage;
    const placeholder = node.__novaImagePlaceholder;
    const status = node.__novaImageStatus;
    const selected = historyImageForChoice(item, previewImageChoice(node));
    const filename = selected.filename;
    node.__novaCurrentImagePass = selected.pass;
    node.__novaCurrentImageMeta = selected;
    node.imgs = null;

    if (!filename) {
        if (image) {
            image.removeAttribute("src");
            image.style.display = "none";
        }
        if (placeholder) {
            placeholder.style.display = "flex";
            placeholder.textContent = "No image was stored with this older audio file.";
        }
        if (status) status.textContent = "No image";
        return;
    }

    const url = historyImageUrl(filename);
    if (image) {
        image.onload = () => {
            image.style.display = "block";
            if (placeholder) placeholder.style.display = "none";
            const resetOnChange = node?.properties?.novaMediaResetFitOnChange !== false;
            if (resetOnChange) node.properties.novaMediaNodeView = "fit";
            requestAnimationFrame(() => applyHistoryNodeView(node, resetOnChange));
            if (novaImageViewer?.isOpen?.() && novaImageViewer.node === node) {
                novaImageViewer.refreshFromNode(node, image.src);
            }
            node.setDirtyCanvas?.(true, true);
        };
        image.onerror = () => {
            image.style.display = "none";
            if (placeholder) {
                placeholder.style.display = "flex";
                placeholder.textContent = "The saved history image could not be loaded.";
            }
            if (status) status.textContent = "Image load failed";
        };
        image.src = url;
    }
}

function updateHistoryNavigation(node) {
    const items = node.__novaHistoryItems || [];
    const index = Math.max(0, Math.min(Number(node.__novaCurrentHistoryIndex || 0), Math.max(0, items.length - 1)));
    node.__novaCurrentHistoryIndex = index;

    if (node.__novaHistoryCounter) {
        node.__novaHistoryCounter.textContent = items.length ? `${index + 1}/${items.length}` : "0/0";
    }
    if (node.__novaHistoryPreviousButton) {
        node.__novaHistoryPreviousButton.disabled = !items.length || index <= 0;
        node.__novaHistoryPreviousButton.style.opacity = node.__novaHistoryPreviousButton.disabled ? ".4" : "1";
    }
    if (node.__novaHistoryNextButton) {
        node.__novaHistoryNextButton.disabled = !items.length || index >= items.length - 1;
        node.__novaHistoryNextButton.style.opacity = node.__novaHistoryNextButton.disabled ? ".4" : "1";
    }
    if (novaImageViewer?.isOpen?.() && novaImageViewer.node === node) {
        novaImageViewer.updateNavigation();
    }
}


function notifyAutoplayBlockedOnce(message) {
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

function playAudioWhenReady(node, audio, blockedMessage = "Click Play once in the built-in audio bar to allow future autoplay.") {
    if (!audio?.src) return;
    const token = Number(node.__novaAudioPlayToken || 0) + 1;
    node.__novaAudioPlayToken = token;
    let notified = false;

    const attempt = async () => {
        if (node.__novaAudioPlayToken !== token || !audio.src || !audio.paused) return;
        try {
            await audio.play();
            node.__novaAutoplayUnlocked = true;
        } catch (error) {
            const name = String(error?.name || "");
            if (!notified && (name === "NotAllowedError" || name === "AbortError")) {
                notified = true;
                notifyAutoplayBlockedOnce(blockedMessage);
            }
        }
    };

    if (audio.readyState >= 2) queueMicrotask(attempt);
    else audio.addEventListener("canplay", attempt, { once: true });

    // ComfyUI/browser timing differs between systems. These retries also fix
    // history arrows calling play while audio.load() is still in progress.
    for (const delay of [100, 320, 800, 1500]) {
        setTimeout(attempt, delay);
    }
}

function applyHistoryPresentation(node, item) {
    node.__novaCurrentHistoryItem = item;
    updateVoiceDisplay(node, item);
    updatePromptDisplay(node, item);
    setHistoryImage(node, item);
    updateHistoryNavigation(node);
}

function setAudioSource(node, item, playNow = true) {
    const audio = targetAudioElement(node);
    if (item?.media_only || item?.has_audio === false) {
        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load?.();
        }
        return;
    }
    if (!audio || !item?.filename) {
        notify("The integrated native audio player has not been created yet.", "error");
        return;
    }
    const nextUrl = audioFileUrl(item.filename);
    node.__novaAudioPlayToken = Number(node.__novaAudioPlayToken || 0) + 1;
    audio.pause();
    audio.src = nextUrl;
    audio.loop = readBoolean(node, "loop", "nova_loop", false);
    audio.load();

    if (playNow) {
        playAudioWhenReady(
            node,
            audio,
            "Audio is ready. Click Play once in the built-in bar to allow automatic history playback.",
        );
    }
}

function selectHistoryByIndex(node, index, playNow = false) {
    const items = node.__novaHistoryItems || [];
    if (!items.length) {
        updateHistoryNavigation(node);
        return;
    }
    const safeIndex = Math.max(0, Math.min(Number(index) || 0, items.length - 1));
    node.__novaCurrentHistoryIndex = safeIndex;
    const combo = node.__novaHistoryCombo;
    const label = node.__novaHistoryLabels?.[safeIndex];
    if (combo && label) combo.value = label;
    const selectedItem = items[safeIndex];

    // Visual selection is always applied by the core history viewer.
    // The cancelable event only delegates audio ownership to Media Studio.
    applyHistoryPresentation(node, selectedItem);

    const selectionEvent = new CustomEvent("nova-history-selection", {
        detail: { node, item: selectedItem, index: safeIndex, playNow: Boolean(playNow) },
        cancelable: true,
    });
    window.dispatchEvent(selectionEvent);
    if (!selectionEvent.defaultPrevented) setAudioSource(node, selectedItem, playNow);
}

function selectHistoryItem(node, item, playNow = false) {
    if (!item) return;
    const items = node.__novaHistoryItems || [];
    const index = Math.max(0, items.findIndex((candidate) => candidate?.filename === item?.filename));
    node.__novaCurrentHistoryIndex = index;
    const combo = node.__novaHistoryCombo;
    const label = node.__novaHistoryLabels?.[index];
    if (combo && label) combo.value = label;

    applyHistoryPresentation(node, item);

    const selectionEvent = new CustomEvent("nova-history-selection", {
        detail: { node, item, index, playNow: Boolean(playNow) },
        cancelable: true,
    });
    window.dispatchEvent(selectionEvent);
    if (!selectionEvent.defaultPrevented) setAudioSource(node, item, playNow);
}


// Shared hook used by the NovoLoko Media Studio navigation controls.
window.__novaSelectHistoryByIndex = (node, index, playNow = true) => {
    selectHistoryByIndex(node, index, Boolean(playNow));
};

window.__novaReloadMediaHistory = (node, playLatest = false, preferredIndex = null) =>
    loadHistoryWidgets(node, Boolean(playLatest), preferredIndex);

async function loadHistoryWidgets(node, playLatest = false, preferredIndex = null) {
    const combo = node.__novaHistoryCombo;
    if (!combo) return;
    const limit = Math.max(1, Math.min(Number(widgetValue(node, "history_limit", 1000)) || 1000, 5000));
    const currentFilename = node.__novaCurrentHistoryItem?.filename || "";

    try {
        const response = await api.fetchApi(`/nova_voice/audio/history?limit=${limit}`);
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || "Unable to load NovoLoko audio history.");

        const items = Array.isArray(data.items) ? data.items : [];
        node.__novaHistoryItems = items;
        node.__novaHistoryMap = new Map();

        const values = items.length ? items.map((item, index) => {
            const label = `${String(index + 1).padStart(2, "0")} — ${historyLabel(item)}`;
            node.__novaHistoryMap.set(label, { item, index });
            return label;
        }) : ["No saved media files"];

        node.__novaHistoryLabels = values;
        combo.options = combo.options || {};
        combo.options.values = values;

        let targetIndex = preferredIndex == null
            ? 0
            : Math.max(0, Math.min(Number(preferredIndex) || 0, Math.max(0, items.length - 1)));
        if (preferredIndex == null && !playLatest && currentFilename) {
            const found = items.findIndex((item) => item?.filename === currentFilename);
            if (found >= 0) targetIndex = found;
        }
        combo.value = values[targetIndex] || values[0];
        node.setDirtyCanvas?.(true, true);

        if (items[targetIndex]) {
            const target = items[targetIndex];
            const sameCurrent =
                !playLatest &&
                currentFilename &&
                String(target?.filename || "") === String(currentFilename);
            if (sameCurrent) {
                node.__novaCurrentHistoryIndex = targetIndex;
                node.__novaCurrentHistoryItem = target;
                updateVoiceDisplay(node, target);
                updatePromptDisplay(node, target);
                setHistoryImage(node, target);
                updateHistoryNavigation(node);
            } else {
                selectHistoryByIndex(node, targetIndex, playLatest);
            }
        } else updateHistoryNavigation(node);
    } catch (error) {
        notify(error?.message || String(error), "error");
    }
}

function addMediaHistoryWidget(node) {
    if (node.__novaMediaWidgetAdded) return;
    node.__novaMediaWidgetAdded = true;
    if (typeof node.addDOMWidget !== "function") return;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = [
        "width:100%", "height:100%", "display:flex", "flex-direction:column",
        "gap:8px", "overflow:hidden", "border-radius:8px",
        "background:rgba(0,0,0,.22)", "padding:8px", "box-sizing:border-box",
        "pointer-events:none",
        "--comfy-widget-height:760px", "--comfy-widget-min-height:620px"
    ].join(";");

    const studioBanner = document.createElement("div");
    studioBanner.textContent = "NOVOLOKO MEDIA STUDIO — click the image to open the full-screen gallery, audio player and karaoke viewer";
    studioBanner.title = "Open NovoLoko Media Studio";
    studioBanner.style.cssText = [
        "font-size:12px", "font-weight:800", "letter-spacing:.04em",
        "padding:6px 8px", "border-radius:6px", "text-align:center",
        "background:rgba(77,163,255,.16)", "border:1px solid rgba(77,163,255,.38)",
        "pointer-events:auto", "cursor:zoom-in"
    ].join(";");
    studioBanner.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openHistoryImageViewer(node);
    });

    const audioHeader = document.createElement("div");
    audioHeader.textContent = "Shared player — node and full screen stay on the same audio timeline";
    audioHeader.style.cssText = "font-size:12px;font-weight:600;opacity:.9";

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.preload = "metadata";
    audio.setAttribute("name", "media");
    audio.title = "Media keys: Space Play/Pause • Left/Right History • Home Newest • End Oldest • Mouse 4/5 History";
    audio.style.cssText = "display:block;width:100%;height:38px;min-height:38px;pointer-events:auto";
    audio.addEventListener("ended", () => {
        if (readBoolean(node, "loop", "nova_loop", false)) {
            audio.currentTime = 0;
            audio.play()?.catch?.(() => {});
        }
    });

    const imageToolbar = document.createElement("div");
    imageToolbar.style.cssText = "display:flex;gap:6px;align-items:center;justify-content:flex-end;pointer-events:auto";

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "Fit image";
    resetButton.style.cssText = "cursor:pointer;padding:3px 8px";
    resetButton.addEventListener("click", (event) => {
        event.stopPropagation();
        resetHistoryImageView(node);
    });

    const actualButton = document.createElement("button");
    actualButton.type = "button";
    actualButton.textContent = "1:1";
    actualButton.title = "Inspect the original generated pixels inside the node";
    actualButton.style.cssText = "cursor:pointer;padding:3px 8px";
    actualButton.addEventListener("click", (event) => { event.stopPropagation(); actualHistoryImage(node); });

    const pixelButton = document.createElement("button");
    pixelButton.type = "button";
    pixelButton.textContent = "Smooth";
    pixelButton.style.cssText = "cursor:pointer;padding:3px 8px";
    pixelButton.addEventListener("click", (event) => {
        event.stopPropagation(); node.properties = node.properties || {};
        node.properties.novaMediaNodePixelated = !node.properties.novaMediaNodePixelated;
        pixelButton.textContent = node.properties.novaMediaNodePixelated ? "Pixel" : "Smooth";
        applyHistoryNodeView(node, false);
    });

    const resetChangeNodeButton = document.createElement("button");
    resetChangeNodeButton.type = "button";
    resetChangeNodeButton.style.cssText = "cursor:pointer;padding:3px 8px";
    const updateResetNodeText = () => resetChangeNodeButton.textContent = `Reset Change: ${node?.properties?.novaMediaResetFitOnChange === false ? "Off" : "On"}`;
    updateResetNodeText();
    resetChangeNodeButton.addEventListener("click", (event) => {
        event.stopPropagation(); node.properties = node.properties || {};
        node.properties.novaMediaResetFitOnChange = node.properties.novaMediaResetFitOnChange === false;
        updateResetNodeText();
    });

    const fullButton = document.createElement("button");
    fullButton.type = "button";
    fullButton.textContent = "Open image viewer";
    fullButton.style.cssText = "cursor:pointer;padding:3px 8px";
    fullButton.addEventListener("click", (event) => {
        event.stopPropagation();
        openHistoryImageViewer(node);
    });

    imageToolbar.append(resetButton, actualButton, pixelButton, resetChangeNodeButton, fullButton);

    const imageArea = document.createElement("div");
    imageArea.title = "Click the image to open the full pan-and-zoom viewer.";
    imageArea.style.cssText = [
        "position:relative", "min-height:260px", "flex:1 1 auto",
        "overflow:hidden", "border-radius:6px", "background:rgba(0,0,0,.32)",
        "display:flex", "align-items:center", "justify-content:center",
        "pointer-events:auto", "cursor:zoom-in"
    ].join(";");

    const img = document.createElement("img");
    img.alt = "Kokoro history image";
    img.draggable = false;
    img.style.cssText = [
        "display:none", "position:static", "max-width:100%", "max-height:100%",
        "width:auto", "height:auto", "object-fit:contain", "user-select:none",
        "pointer-events:auto", "cursor:zoom-in"
    ].join(";");

    const placeholder = document.createElement("div");
    placeholder.textContent = "Generate a new audio entry with an image connected.";
    placeholder.style.cssText = [
        "position:absolute", "inset:0", "display:flex", "padding:18px", "text-align:center",
        "opacity:.7", "align-items:center", "justify-content:center"
    ].join(";");

    const imageStatus = document.createElement("div");
    imageStatus.textContent = "No image loaded";
    imageStatus.style.cssText = "font-size:11px;opacity:.72;text-align:right";

    const navigation = document.createElement("div");
    navigation.style.cssText = "display:flex;align-items:center;justify-content:center;gap:2px;pointer-events:auto;margin-top:-2px";

    const previousButton = document.createElement("button");
    previousButton.type = "button";
    previousButton.textContent = "<";
    previousButton.title = "Newer history item • Left Arrow • Mouse Back (Button 4)";
    previousButton.style.cssText = "cursor:pointer;min-width:34px;padding:3px 7px;font-weight:700;border-radius:5px 0 0 5px";
    previousButton.addEventListener("click", (event) => {
        event.stopPropagation();
        selectHistoryByIndex(node, Number(node.__novaCurrentHistoryIndex || 0) - 1, true);
    });

    const counter = document.createElement("span");
    counter.textContent = "0/0";
    counter.style.cssText = "min-width:68px;text-align:center;font-size:12px;font-weight:700;padding:3px 4px;background:rgba(0,0,0,.18)";

    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = ">";
    nextButton.title = "Older history item • Right Arrow • Mouse Forward (Button 5)";
    nextButton.style.cssText = "cursor:pointer;min-width:34px;padding:3px 7px;font-weight:700;border-radius:0 5px 5px 0";
    nextButton.addEventListener("click", (event) => {
        event.stopPropagation();
        selectHistoryByIndex(node, Number(node.__novaCurrentHistoryIndex || 0) + 1, true);
    });

    navigation.append(previousButton, counter, nextButton);

    const voiceCaption = document.createElement("div");
    voiceCaption.textContent = "Voice: waiting for audio…";
    voiceCaption.style.cssText = "font-size:12px;font-weight:600;line-height:1.35;white-space:normal";

    const promptHeader = document.createElement("div");
    promptHeader.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;pointer-events:auto";

    const promptTitle = document.createElement("span");
    promptTitle.textContent = "Spoken prompt";
    promptTitle.style.cssText = "font-size:12px;font-weight:600;margin-right:4px";

    const promptModeButtons = {};
    for (const mode of ["Spoken", "Manual", "Enhanced"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode;
        button.style.cssText = "cursor:pointer;padding:3px 7px";
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            setPromptMode(node, mode);
        });
        promptModeButtons[mode] = button;
        promptHeader.append(button);
    }

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy prompt";
    copyButton.style.cssText = "margin-left:auto;cursor:pointer;padding:3px 8px";
    copyButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        const text = node.__novaPromptText?.value || "";
        try {
            await navigator.clipboard.writeText(text);
            notify("Prompt copied.");
        } catch (_) {
            notify("The browser blocked clipboard access.", "error");
        }
    });

    promptHeader.prepend(promptTitle);
    promptHeader.append(copyButton);

    const promptText = document.createElement("textarea");
    promptText.value = "No prompt loaded yet.";
    promptText.readOnly = true;
    promptText.spellcheck = false;
    promptText.style.cssText = [
        "height:180px", "min-height:120px", "overflow:auto", "padding:8px",
        "border-radius:6px", "background:#03060a", "color:#d7e2ee",
        "border:1px solid rgba(104,178,228,.78)", "box-shadow:inset 0 0 0 1px rgba(218,237,250,.13)",
        "font:12px/1.45 sans-serif", "white-space:pre-wrap", "overflow-wrap:anywhere",
        "resize:vertical", "user-select:text", "cursor:text", "box-sizing:border-box",
        "width:100%", "pointer-events:auto"
    ].join(";");
    promptText.classList.add("nova-dom-text-panel");
    function forceMediaPromptPanel() {
        const properties = {
            background: "#03060a",
            "background-color": "#03060a",
            color: "#d7e2ee",
            border: "1px solid rgba(104,178,228,.82)",
            "border-radius": "6px",
            "box-shadow": "inset 0 0 0 1px rgba(218,237,250,.14), 0 0 0 1px rgba(1,8,14,.88)",
            visibility: "visible",
            opacity: "1",
        };
        for (const [name, value] of Object.entries(properties)) {
            promptText.style.setProperty(name, value, "important");
        }
        promptText.parentElement?.style?.setProperty(
            "visibility",
            "visible",
            "important",
        );
        promptText.parentElement?.style?.setProperty(
            "opacity",
            "1",
            "important",
        );
    }

    forceMediaPromptPanel();
    for (const delay of [0, 80, 300, 900]) {
        setTimeout(forceMediaPromptPanel, delay);
    }
    promptText.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    promptText.addEventListener("pointerdown", (event) => event.stopPropagation());
    promptText.addEventListener("mousedown", (event) => event.stopPropagation());

    imageArea.append(img, placeholder);
    wrapper.append(
        studioBanner, audioHeader, audio, imageToolbar, imageArea, navigation, imageStatus,
        voiceCaption, promptHeader, promptText
    );

    const dom = node.addDOMWidget("novaMediaHistory", "novaMediaHistory", wrapper, {
        hideOnZoom: false,
        getMinHeight: () => 620,
        getHeight: () => Math.max(620, Number(node.size?.[1] || 1160) - 360),
        afterResize: () => requestAnimationFrame(() => {
            forceMediaPromptPanel();
            applyHistoryNodeView(node, false);
        }),
    });
    dom.serialize = false;
    dom.options.serialize = false;

    node.__novaAudioElement = audio;
    node.__novaHistoryImage = img;
    node.__novaImageArea = imageArea;
    node.__novaImagePlaceholder = placeholder;
    node.__novaImageStatus = imageStatus;
    node.__novaVoiceCaption = voiceCaption;
    node.__novaPromptTitle = promptTitle;
    node.__novaPromptText = promptText;
    node.__novaPromptMode = "Spoken";
    node.__novaPromptModeButtons = promptModeButtons;
    node.__novaHistoryPreviousButton = previousButton;
    node.__novaHistoryNextButton = nextButton;
    node.__novaHistoryCounter = counter;

    imageArea.addEventListener("wheel", (event) => {
        event.preventDefault();
        event.stopPropagation();
        app.canvas.processMouseWheel(event);
    }, { passive: false });

    imageArea.addEventListener("pointerdown", (event) => {
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseDown(event);
        }
    });
    imageArea.addEventListener("pointermove", (event) => {
        if ((event.buttons & 4) !== 0) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseMove(event);
        }
    });
    imageArea.addEventListener("pointerup", (event) => {
        if (event.button === 1) {
            event.preventDefault();
            event.stopPropagation();
            app.canvas.processMouseUp(event);
        }
    });

    let nodeImageDragging = false;
    let nodeImageMoved = false;
    let nodeImageStartX = 0;
    let nodeImageStartY = 0;
    let nodeImageStartPanX = 0;
    let nodeImageStartPanY = 0;
    imageArea.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        nodeImageDragging = true; nodeImageMoved = false;
        nodeImageStartX = event.clientX; nodeImageStartY = event.clientY;
        nodeImageStartPanX = Number(node.__novaNodePanX || 0);
        nodeImageStartPanY = Number(node.__novaNodePanY || 0);
        imageArea.setPointerCapture?.(event.pointerId);
        event.preventDefault(); event.stopPropagation();
    });
    imageArea.addEventListener("pointermove", (event) => {
        if (!nodeImageDragging || mediaNodeViewMode(node) !== "actual") return;
        const dx = event.clientX - nodeImageStartX, dy = event.clientY - nodeImageStartY;
        if (Math.hypot(dx,dy) > 4) nodeImageMoved = true;
        node.__novaNodePanX = nodeImageStartPanX + dx;
        node.__novaNodePanY = nodeImageStartPanY + dy;
        applyHistoryNodeView(node, false);
        event.preventDefault(); event.stopPropagation();
    });
    const endNodeImage = (event) => {
        if (!nodeImageDragging) return;
        nodeImageDragging = false;
        try { imageArea.releasePointerCapture?.(event.pointerId); } catch (_) {}
        if (!nodeImageMoved) openHistoryImageViewer(node);
        event.preventDefault(); event.stopPropagation();
    };
    imageArea.addEventListener("pointerup", endNodeImage);
    imageArea.addEventListener("pointercancel", () => { nodeImageDragging = false; });

    if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => applyHistoryNodeView(node, false));
        observer.observe(imageArea);
        node.__novaImageResizeObserver = observer;
    }

    updatePromptModeButtons(node);
    updateHistoryNavigation(node);
}

function addHistoryControls(node) {
    if (node.__novaHistoryControlsAdded) return;

    const audioInput = node.inputs?.find?.((input) => input?.name === "audio");
    if (audioInput) {
        audioInput.label = "audio (optional)";
        audioInput.localized_name = "audio (optional)";
    }
    const imageInput = node.inputs?.find?.((input) => input?.name === "image");
    if (imageInput) {
        imageInput.label = "single image (fallback)";
        imageInput.localized_name = "single image (fallback)";
    }
    const firstInput = node.inputs?.find?.((input) => input?.name === "image_first_pass");
    if (firstInput) {
        firstInput.label = "image first pass";
        firstInput.localized_name = "image first pass";
    }
    const secondInput = node.inputs?.find?.((input) => input?.name === "image_second_pass");
    if (secondInput) {
        secondInput.label = "image second pass";
        secondInput.localized_name = "image second pass";
    }
    node.__novaHistoryControlsAdded = true;
    node.__novaHistoryItems = [];
    node.__novaHistoryMap = new Map();
    node.__novaHistoryLabels = [];
    node.__novaCurrentHistoryIndex = 0;
    novaHistoryNodes.add(node);

    const previewWidget = widget(node, "preview_image");
    if (previewWidget && !previewWidget.__novaPreviewBound) {
        previewWidget.label = "Preview image";
        previewWidget.__novaPreviewBound = true;
        const previousPreviewCallback = previewWidget.callback;
        previewWidget.callback = function (value) {
            previousPreviewCallback?.apply(this, arguments);
            if (node.__novaCurrentHistoryItem) setHistoryImage(node, node.__novaCurrentHistoryItem);
        };
    }

    const voiceDisplay = node.addWidget("text", "Voice used", "Waiting for media…", null, { multiline: false });
    voiceDisplay.serialize = false;
    voiceDisplay.options = voiceDisplay.options || {};
    voiceDisplay.options.serialize = false;
    voiceDisplay.disabled = true;
    node.__novaVoiceDisplay = voiceDisplay;

    const combo = node.addWidget(
        "combo",
        "Previous media — select to open",
        "No saved media files",
        (value) => {
            const record = node.__novaHistoryMap?.get(value);
            if (record?.item) {
                selectHistoryByIndex(node, record.index, true);
            }
        },
        { values: ["No saved media files"] },
    );
    combo.serialize = false;
    combo.options = combo.options || {};
    combo.options.serialize = false;
    node.__novaHistoryCombo = combo;

    const playLatest = node.addWidget("button", "▶ Open latest saved media", null, () => {
        const latest = node.__novaHistoryItems?.[0];
        if (latest) selectHistoryByIndex(node, 0, true);
        else loadHistoryWidgets(node, true);
    });
    playLatest.serialize = false;

    const refresh = node.addWidget("button", "↻ Refresh media history", null, () => loadHistoryWidgets(node, false));
    refresh.serialize = false;

    const unlock = node.addWidget("button", "🔓 Enable autoplay / play latest", null, async () => {
        const latest = node.__novaHistoryItems?.[0];
        if (latest) selectHistoryByIndex(node, 0, false);
        const audio = targetAudioElement(node);
        if (!audio) {
            notify("The integrated audio player is unavailable.", "error");
            return;
        }
        audio.loop = readBoolean(node, "loop", "nova_loop", false);
        playAudioWhenReady(node, audio, "Click Play in the audio bar once to enable autoplay.");
        node.__novaAutoplayUnlocked = true;
        notify("Built-in audio playback enabled. Future autoplay waits until the workflow is finished.");
    });
    unlock.serialize = false;

    addMediaHistoryWidget(node);
    const oldSize = node.size || [700, 700];
    node.setSize?.([Math.max(Number(oldSize[0]) || 0, 780), Math.max(Number(oldSize[1]) || 0, 1160)]);
}


function clearPendingAutoplay(promptId = null) {
    const expected = promptId == null ? null : String(promptId);
    for (const node of [...novaHistoryNodes]) {
        if (!node?.graph && node !== app.graph?._nodes?.find?.((candidate) => candidate === node)) {
            novaHistoryNodes.delete(node);
            continue;
        }
        const pending = node.__novaPendingAutoplay;
        if (!pending) continue;
        if (expected != null && pending.promptId != null && String(pending.promptId) !== expected) continue;
        node.__novaPendingAutoplay = null;
    }
}

function playPendingAutoplay(promptId = null) {
    const expected = promptId == null ? null : String(promptId);
    for (const node of [...novaHistoryNodes]) {
        const pending = node.__novaPendingAutoplay;
        if (!pending?.item) continue;
        if (expected != null && pending.promptId != null && String(pending.promptId) !== expected) continue;

        node.__novaPendingAutoplay = null;
        selectHistoryItem(node, pending.item, false);

        if (!readBoolean(node, "autoplay", "nova_autoplay", true)) continue;
        const audio = targetAudioElement(node);
        if (!audio) continue;
        audio.loop = readBoolean(node, "loop", "nova_loop", false);
        playAudioWhenReady(
            node,
            audio,
            "Workflow finished and audio is ready. Click Play once to allow future autoplay.",
        );
    }
}

function bindNovaHistoryExecutionEvents() {
    if (novaHistoryEventsBound) return;
    novaHistoryEventsBound = true;

    api.addEventListener("execution_start", (event) => {
        novaActivePromptId = event?.detail?.prompt_id == null ? null : String(event.detail.prompt_id);
        if (novaActivePromptId != null) novaCompletedPromptIds.delete(novaActivePromptId);
    });

    api.addEventListener("execution_success", (event) => {
        const promptId = event?.detail?.prompt_id == null ? novaActivePromptId : String(event.detail.prompt_id);
        if (promptId != null) {
            novaCompletedPromptIds.add(String(promptId));
            novaLastCompletedPrompt = { id: String(promptId), at: Date.now() };
            while (novaCompletedPromptIds.size > 32) {
                novaCompletedPromptIds.delete(novaCompletedPromptIds.values().next().value);
            }
        }
        // Run twice to cover either websocket order: history-node output before
        // success, or success arriving just before the final node output callback.
        setTimeout(() => playPendingAutoplay(promptId), 90);
        setTimeout(() => playPendingAutoplay(promptId), 650);
        if (promptId != null && String(novaActivePromptId) === String(promptId)) novaActivePromptId = null;
    });

    api.addEventListener("execution_error", (event) => {
        const promptId = event?.detail?.prompt_id == null ? novaActivePromptId : String(event.detail.prompt_id);
        clearPendingAutoplay(promptId);
        if (promptId != null) novaCompletedPromptIds.delete(String(promptId));
        if (promptId != null && String(novaActivePromptId) === String(promptId)) novaActivePromptId = null;
    });

    api.addEventListener("execution_interrupted", (event) => {
        const promptId = event?.detail?.prompt_id == null ? novaActivePromptId : String(event.detail.prompt_id);
        clearPendingAutoplay(promptId);
        if (promptId != null) novaCompletedPromptIds.delete(String(promptId));
        if (promptId != null && String(novaActivePromptId) === String(promptId)) novaActivePromptId = null;
    });
}

function configureNativePreviewNode(node) {
    if (node.__novaNativePlayerConfigured) return;
    if (node?.properties?.nova_audio_player !== true && !String(node?.title || "").includes("NOVOLOKO NATIVE AUDIO PLAYER")) return;

    node.__novaNativePlayerConfigured = true;
    node.properties = node.properties || {};
    if (!("nova_autoplay" in node.properties)) node.properties.nova_autoplay = true;
    if (!("nova_loop" in node.properties)) node.properties.nova_loop = true;

    const autoplayToggle = node.addWidget("toggle", "Autoplay", Boolean(node.properties.nova_autoplay), (value) => {
        node.properties.nova_autoplay = Boolean(value);
    });
    autoplayToggle.serialize = false;

    const loopToggle = node.addWidget("toggle", "Loop", Boolean(node.properties.nova_loop), (value) => {
        node.properties.nova_loop = Boolean(value);
        const audio = audioElement(node);
        if (audio) audio.loop = Boolean(value);
    });
    loopToggle.serialize = false;

    const unlock = node.addWidget("button", "▶ Enable autoplay / Play", null, async () => {
        const audio = audioElement(node);
        if (!audio?.src) {
            notify("Queue the workflow once so this player receives audio.", "error");
            return;
        }
        audio.loop = Boolean(node.properties.nova_loop);
        try {
            await audio.play();
            notify("Native ComfyUI audio player enabled.");
        } catch (error) {
            notify(error?.message || String(error), "error");
        }
    });
    unlock.serialize = false;

    const oldSize = node.size || [500, 180];
    node.setSize?.([Math.max(Number(oldSize[0]) || 0, 640), Math.max(Number(oldSize[1]) || 0, 260)]);
}

app.registerExtension({
    name: "NovoLoko.NativeAudioImageHistory.v326",
    setup() {
        bindNovaHistoryExecutionEvents();
    },
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = comfyClassOf(nodeType, nodeData);

        if (comfyClass === "NovaAudioHistoryPlayer") {
            // v2 uses a real core PreviewAudio node. The old fake required AUDIO_UI
            // socket caused prompt validation failures on newer ComfyUI builds.
            const removeStaleAudioUISocket = (node) => {
                const index = node?.inputs?.findIndex?.((input) => input?.name === "audioUI") ?? -1;
                if (index >= 0) {
                    try { node.removeInput(index); } catch (_) {}
                }
            };

            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalOnNodeCreated?.apply(this, arguments);
                removeStaleAudioUISocket(this);
                addHistoryControls(this);
                setTimeout(() => loadHistoryWidgets(this, false), 250);
                return result;
            };

            const originalOnGraphConfigured = nodeType.prototype.onGraphConfigured;
            nodeType.prototype.onGraphConfigured = function () {
                const result = originalOnGraphConfigured?.apply(this, arguments);
                removeStaleAudioUISocket(this);
                addHistoryControls(this);
                setTimeout(() => loadHistoryWidgets(this, false), 350);
                return result;
            };

            const originalOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const result = originalOnExecuted?.apply(this, arguments);
                addHistoryControls(this);

                const latest = message?.nova_audio_latest?.[0];
                if (latest) {
                    const followNew = typeof window.__novaMediaStudioShouldFollowNew === "function"
                        ? Boolean(window.__novaMediaStudioShouldFollowNew(this, latest))
                        : true;
                    if (followNew) {
                        selectHistoryItem(this, latest, false);
                        const recentCompleted =
                            novaLastCompletedPrompt.id != null &&
                            Date.now() - Number(novaLastCompletedPrompt.at || 0) < 2500
                                ? novaLastCompletedPrompt.id
                                : null;
                        const promptId = novaActivePromptId ?? recentCompleted;
                        this.__novaPendingAutoplay = {
                            item: latest,
                            promptId,
                        };
                        if (promptId != null && novaCompletedPromptIds.has(String(promptId))) {
                            setTimeout(() => playPendingAutoplay(promptId), 80);
                        }
                    } else {
                        this.__novaPendingAutoplay = null;
                        window.dispatchEvent(new CustomEvent("nova-new-history-ready", {
                            detail: { node: this, item: latest },
                        }));
                    }
                }

                setTimeout(() => loadHistoryWidgets(this, false), 180);
                return result;
            };
        }

        if (comfyClass === "PreviewAudio") {
            const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalOnNodeCreated?.apply(this, arguments);
                configureNativePreviewNode(this);
                return result;
            };

            const originalOnGraphConfigured = nodeType.prototype.onGraphConfigured;
            nodeType.prototype.onGraphConfigured = function () {
                const result = originalOnGraphConfigured?.apply(this, arguments);
                configureNativePreviewNode(this);
                return result;
            };

            const originalOnExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const result = originalOnExecuted?.apply(this, arguments);
                configureNativePreviewNode(this);
                if (this?.properties?.nova_audio_player === true || String(this?.title || "").includes("NOVOLOKO NATIVE AUDIO PLAYER")) {
                    setTimeout(() => {
                        const audio = audioElement(this);
                        if (!audio) return;
                        audio.loop = Boolean(this.properties?.nova_loop ?? true);
                        if (Boolean(this.properties?.nova_autoplay ?? true)) audio.play()?.catch?.(() => {});
                    }, 80);
                }
                return result;
            };
        }
    },
});


let novaAutoplayTriggerAudio = null;

function ensureNovaAutoplayTriggerAudio() {
    if (novaAutoplayTriggerAudio) return novaAutoplayTriggerAudio;
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    audio.dataset.novaAutoplayTrigger = "true";
    document.body.append(audio);
    novaAutoplayTriggerAudio = audio;
    return audio;
}

function autoplayTriggerUrl(filename) {
    const query = new URLSearchParams({
        filename: String(filename || ""),
        t: String(Date.now()),
    });
    return novaApiUrl(`/nova_voice/autoplay/file?${query.toString()}`);
}

async function playNovaAutoplayTrigger(info) {
    const filename = String(info?.filename || "").trim();
    if (!filename) return;
    const src = autoplayTriggerUrl(filename);
    const event = new CustomEvent("nova-autoplay-trigger", {
        detail: { ...info, src },
        cancelable: true,
    });
    window.dispatchEvent(event);
    if (event.defaultPrevented) return;

    const audio = ensureNovaAutoplayTriggerAudio();
    const active = window.__novaActiveAudioElement;
    if (active && active !== audio && !active.paused) active.pause();
    window.__novaActiveAudioElement = audio;
    audio.pause();
    audio.src = src;
    audio.load();
    const attempt = async () => {
        try {
            await audio.play();
        } catch (error) {
            const name = String(error?.name || "");
            if (name === "NotAllowedError" || name === "AbortError") {
                notifyAutoplayBlockedOnce(
                    "Autoplay is ready. Click Play or Enable autoplay once; this message will not repeat during this session.",
                );
            }
        }
    };
    if (audio.readyState >= 2) queueMicrotask(attempt);
    else audio.addEventListener("canplay", attempt, { once: true });
    setTimeout(attempt, 250);
}

app.registerExtension({
    name: "NovoLoko.Media.AutoplayAfterPass.v326",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (String(nodeData?.name || "") !== "NovaAudioAutoplayTrigger") return;
        const originalExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            originalExecuted?.apply(this, arguments);
            const info = output?.nova_autoplay_trigger?.[0];
            if (info?.enabled !== false) playNovaAutoplayTrigger(info);
        };
    },
});
