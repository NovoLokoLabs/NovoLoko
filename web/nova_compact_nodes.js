import { app } from "../../scripts/app.js";

const DEFAULT_MIN_WIDTH = 150;
const DOM_MIN_WIDTH = 210;
const RESET_WIDTH = 240;
const SAVED_SIZE_PROPERTY = "novaSavedManualSize";
const DOM_NODE_TYPES = new Set([
    "MarkdownNote",
    "Note",
    "NovaAudioHistoryPlayer",
    "NovaGenerationTimer",
    "NovaImageComparePro",
    "NovaPromptEnhancer",
    "NovaPromptStackAIO",
    "NovaSeedLab",
    "NovaVoiceEngineTTS",
]);
const PERSISTED_SIZE_NODE_TYPES = new Set([
    "MarkdownNote",
    "Note",
    "NovaGenerationTimer",
    "NovaSeedLab",
    "NovaVoiceEngineTTS",
]);

function nodeTypeName(node) {
    return String(node?.comfyClass || node?.type || "");
}

function compactMinimum(nodeTypeName) {
    return DOM_NODE_TYPES.has(String(nodeTypeName || ""))
        ? DOM_MIN_WIDTH
        : DEFAULT_MIN_WIDTH;
}

function normaliseSavedSize(value, minWidth, minHeight) {
    if (
        (!Array.isArray(value) && !ArrayBuffer.isView(value))
        || value.length < 2
    ) {
        return null;
    }
    const width = Number(value[0]);
    const height = Number(value[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    return [
        Math.max(minWidth, width),
        Math.max(minHeight, height),
    ];
}

function rememberSavedSize(node, minWidth, minHeight) {
    const size = normaliseSavedSize(node?.size, minWidth, minHeight);
    if (!size) return;
    node.properties ||= {};
    node.properties[SAVED_SIZE_PROPERTY] = size;
}

function sameSize(left, right) {
    return Array.isArray(left)
        && Array.isArray(right)
        && Math.abs(Number(left[0]) - Number(right[0])) < 0.01
        && Math.abs(Number(left[1]) - Number(right[1])) < 0.01;
}

function isLegacyManualResize(node) {
    return app.canvas?.resizing_node === node;
}

function isManualResize(node) {
    return Boolean(isLegacyManualResize(node) || node?.__novaVueResizeActive);
}

function restoreSavedSize(node, size) {
    if (!node || !Array.isArray(size)) return;
    if (sameSize(node.size, size)) return;
    node.__novaRestoringSavedSize = true;
    try {
        node.setSize?.([...size]);
    } finally {
        queueMicrotask(() => {
            node.__novaRestoringSavedSize = false;
        });
    }
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function scheduleSavedSizeRestore(node, size) {
    if (!node || !Array.isArray(size)) return;
    node.__novaLoadingSavedSize = true;
    const restore = () => restoreSavedSize(node, size);
    queueMicrotask(restore);
    requestAnimationFrame(restore);
    for (const delay of [0, 50, 250, 750]) {
        setTimeout(() => {
            restore();
            if (delay === 750) node.__novaLoadingSavedSize = false;
        }, delay);
    }
}

function installVueResizeCapture(node, nodeTypeName, minWidth, minHeight) {
    if (!PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName) || node.__novaVueResizeCaptureInstalled) {
        return;
    }
    node.__novaVueResizeCaptureInstalled = true;
    const controller = new AbortController();
    node.__novaVueResizeController = controller;
    const hostBelongsToNode = (host) => {
        if (!(host instanceof HTMLElement)) return false;
        if (String(host.dataset.nodeId) === String(node.id)) return true;
        return (node.widgets || []).some((widget) => {
            const element = widget?.element || widget?.inputEl;
            return element instanceof Element && host.contains(element);
        });
    };
    const resizeHandleContext = (event) => {
        const target = event?.target;
        const handle = target?.closest?.('[role="button"]') || null;
        const host = target?.closest?.("[data-node-id]")
            || handle?.closest?.("[data-node-id]");
        const handleText = `${handle?.getAttribute?.("aria-label") || ""} ${handle?.className || ""}`;
        if (!hostBelongsToNode(host)) {
            return null;
        }
        const rect = host.getBoundingClientRect();
        const edge = 18;
        const nearHorizontalEdge = (
            Math.abs(Number(event?.clientX) - rect.left) <= edge
            || Math.abs(Number(event?.clientX) - rect.right) <= edge
        );
        const nearVerticalEdge = (
            Math.abs(Number(event?.clientY) - rect.top) <= edge
            || Math.abs(Number(event?.clientY) - rect.bottom) <= edge
        );
        if (!/resize/i.test(handleText) && !(nearHorizontalEdge && nearVerticalEdge)) {
            return null;
        }
        return { handle, host };
    };
    const vueStyleSize = () => {
        const host = node.__novaVueResizeHost;
        if (!(host instanceof HTMLElement) || !host.isConnected) return null;
        const style = getComputedStyle(host);
        const width = Number.parseFloat(style.getPropertyValue("--node-width"));
        const fullHeight = Number.parseFloat(style.getPropertyValue("--node-height"));
        if (!Number.isFinite(width) || !Number.isFinite(fullHeight)) return null;
        const titleHeight = Number(node.__novaVueResizeTitleHeight) || 0;
        return normaliseSavedSize(
            [width, Math.max(0, fullHeight - titleHeight)],
            minWidth,
            minHeight,
        );
    };
    node.__novaReadVueStyleSize = vueStyleSize;
    const prepareVueHost = (host) => {
        if (!hostBelongsToNode(host)) return false;
        const style = getComputedStyle(host);
        const fullHeight = Number.parseFloat(style.getPropertyValue("--node-height"));
        const currentHeight = Number(node.size?.[1]);
        node.__novaVueResizeHost = host;
        node.__novaVueResizeTitleHeight = (
            Number.isFinite(fullHeight) && Number.isFinite(currentHeight)
        )
            ? Math.max(0, fullHeight - currentHeight)
            : 0;
        return true;
    };
    const captureSize = () => {
        // Nodes 2 resizes the Vue host CSS variables first. Frontend 1.45 does
        // not update LiteGraph's node.size, so bridge those dimensions back
        // before the workflow is serialized.
        const size = vueStyleSize()
            || normaliseSavedSize(node.size, minWidth, minHeight);
        if (!size) return;
        if (!sameSize(node.size, size)) {
            node.setSize?.([...size]);
        }
        node.properties ||= {};
        node.properties[SAVED_SIZE_PROPERTY] = [...size];
        node.setDirtyCanvas?.(true, true);
        app.graph?.setDirtyCanvas?.(true, true);
        node.graph?.change?.();
    };
    document.addEventListener("pointerdown", (event) => {
        const eventHost = event?.target?.closest?.("[data-node-id]") || null;
        if (prepareVueHost(eventHost)) {
            node.__novaVuePointerDown = true;
            node.__novaVueInteractionSeen = true;
        }
        const context = resizeHandleContext(event);
        if (!context) return;
        prepareVueHost(context.host);
        node.__novaVueResizeActive = true;
    }, { capture: true, signal: controller.signal });
    const finish = () => {
        const cssSize = vueStyleSize();
        if (
            !node.__novaVueResizeActive
            && node.__novaVuePointerDown
            && cssSize
            && !sameSize(cssSize, node.size)
        ) {
            // Fallback for frontend builds whose translated resize handle does
            // not expose a stable aria label/class to extension listeners.
            node.__novaVueResizeActive = true;
        }
        node.__novaVuePointerDown = false;
        if (!node.__novaVueResizeActive) {
            return;
        }
        for (const delay of [0, 50, 150]) setTimeout(captureSize, delay);
        setTimeout(() => {
            node.__novaVueResizeActive = false;
        }, 175);
    };
    document.addEventListener("pointerup", finish, {
        capture: true,
        signal: controller.signal,
    });
    document.addEventListener("pointercancel", finish, {
        capture: true,
        signal: controller.signal,
    });
    const previousRemoved = node.onRemoved;
    node.onRemoved = function (...args) {
        controller.abort();
        return previousRemoved?.apply(this, args);
    };
}

function installCompactSizing(node, nodeTypeName) {
    if (!node) return;
    const minWidth = compactMinimum(nodeTypeName);
    const minHeight = Array.isArray(node.min_size) && Number.isFinite(Number(node.min_size[1]))
        ? Number(node.min_size[1])
        : 40;
    node.min_size = [minWidth, minHeight];

    if (
        PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
        && !node.__novaProtectedSetSizeInstalled
        && typeof node.setSize === "function"
    ) {
        const originalSetSize = node.setSize;
        node.setSize = function (requested) {
            const candidate = normaliseSavedSize(requested, minWidth, minHeight);
            const saved = normaliseSavedSize(
                this.properties?.[SAVED_SIZE_PROPERTY],
                minWidth,
                minHeight,
            );
            if (
                saved
                && candidate
                && !this.__novaRestoringSavedSize
                && !isManualResize(this)
                && !sameSize(candidate, saved)
            ) {
                return originalSetSize.call(this, [...saved]);
            }
            const result = originalSetSize.apply(this, arguments);
            if (candidate && isManualResize(this)) {
                this.properties ||= {};
                this.properties[SAVED_SIZE_PROPERTY] = candidate;
            }
            return result;
        };
        node.__novaProtectedSetSizeInstalled = true;
    }

    if (!node.__novaCompactSizingInstalled && typeof node.computeSize === "function") {
        const originalComputeSize = node.computeSize;
        node.computeSize = function (...args) {
            const measured = originalComputeSize.apply(this, args);
            if (!Array.isArray(measured)) return measured;
            return [
                Math.max(minWidth, Math.min(RESET_WIDTH, Number(measured[0]) || RESET_WIDTH)),
                Number(measured[1]) || minHeight,
            ];
        };
    }
    node.__novaCompactSizingInstalled = true;

    if (!node.__novaResizePersistenceInstalled) {
        const previousResize = node.onResize;
        node.onResize = function (...args) {
            const result = previousResize?.apply(this, args);
            if (
                PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
                && !this.__novaRestoringSavedSize
                && !this.__novaLoadingSavedSize
                && isManualResize(this)
            ) {
                rememberSavedSize(this, minWidth, minHeight);
            }
            this.setDirtyCanvas?.(true, true);
            app.graph?.setDirtyCanvas?.(true, true);
            if (!this.__novaResizeChangeQueued) {
                this.__novaResizeChangeQueued = true;
                queueMicrotask(() => {
                    this.__novaResizeChangeQueued = false;
                    this.graph?.change?.();
                });
            }
            return result;
        };
        node.__novaResizePersistenceInstalled = true;
    }

    if (
        PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
        && !node.__novaSizeSerializationInstalled
    ) {
        const previousSerialize = node.onSerialize;
        node.onSerialize = function (info) {
            const result = previousSerialize?.apply(this, arguments);
            let savedSize = normaliseSavedSize(
                this.properties?.[SAVED_SIZE_PROPERTY],
                minWidth,
                minHeight,
            );
            const liveVueSize = this.__novaVueInteractionSeen
                ? this.__novaReadVueStyleSize?.()
                : null;
            // Legacy LiteGraph mutates node.size directly while dragging its
            // corner, and some frontend builds do not expose a stable resize
            // event/flag. The protected setSize wrapper already rejects
            // automatic size drift, so the current LiteGraph size is the
            // authoritative legacy value at serialization time.
            const liveLegacySize = normaliseSavedSize(
                this.size,
                minWidth,
                minHeight,
            );
            if (liveVueSize && !sameSize(liveVueSize, savedSize)) {
                savedSize = [...liveVueSize];
                this.properties ||= {};
                this.properties[SAVED_SIZE_PROPERTY] = [...liveVueSize];
                if (!sameSize(this.size, liveVueSize)) {
                    this.setSize?.([...liveVueSize]);
                }
            } else if (liveLegacySize && !sameSize(liveLegacySize, savedSize)) {
                savedSize = [...liveLegacySize];
                this.properties ||= {};
                this.properties[SAVED_SIZE_PROPERTY] = [...liveLegacySize];
            }
            if (!savedSize) {
                rememberSavedSize(this, minWidth, minHeight);
                savedSize = this.properties?.[SAVED_SIZE_PROPERTY];
            }
            if (info && Array.isArray(savedSize)) {
                info.properties ||= {};
                info.properties[SAVED_SIZE_PROPERTY] = [...savedSize];
                info.size = [...savedSize];
            }
            return result;
        };
        node.__novaSizeSerializationInstalled = true;
    }

    installVueResizeCapture(node, nodeTypeName, minWidth, minHeight);

    for (const item of node.widgets || []) {
        const element = item?.element || item?.inputEl;
        if (!element?.style) continue;
        element.style.minWidth = "0";
        element.style.maxWidth = "100%";
        element.style.boxSizing = "border-box";
    }
}

function installNoteCompatibility(node) {
    const type = nodeTypeName(node);
    if (!["Note", "MarkdownNote"].includes(type) || node.__novaNoteCompatibilityInstalled) {
        return;
    }
    const sourceWidget = node.widgets?.find(
        (item) => item?.name === "text" && item?.type !== "NOVA_NOTE_EDITOR",
    );
    if (!sourceWidget || typeof node.addDOMWidget !== "function") return;
    node.__novaNoteCompatibilityInstalled = true;
    node.properties ||= {};

    sourceWidget.hidden = true;
    sourceWidget.inputEl?.style?.setProperty("display", "none", "important");
    sourceWidget.element?.style?.setProperty("display", "none", "important");

    const root = document.createElement("div");
    root.className = "nova-note-editor-v394";
    root.style.cssText = [
        "position:relative",
        "z-index:3",
        "width:100%",
        "height:100%",
        "min-height:90px",
        "padding:5px",
        "box-sizing:border-box",
        "pointer-events:auto",
    ].join(";");
    const editor = document.createElement("textarea");
    editor.value = String(sourceWidget.value ?? node.properties.text ?? "");
    editor.setAttribute("aria-label", "Note text");
    editor.spellcheck = true;
    editor.style.cssText = [
        "position:relative",
        "z-index:4",
        "display:block",
        "width:100%",
        "height:100%",
        "min-height:80px",
        "resize:none",
        "box-sizing:border-box",
        "padding:9px 10px",
        "border:1px solid rgba(255,255,255,.22)",
        "border-radius:7px",
        "outline:none",
        "background:#17130a",
        "color:#fff5c7",
        "caret-color:#fff",
        "font:13px/1.4 ui-monospace,SFMono-Regular,Consolas,monospace",
        "white-space:pre-wrap",
        "overflow:auto",
        "pointer-events:auto",
    ].join(";");
    root.append(editor);

    const syncFromEditor = (markChanged = true) => {
        const value = editor.value;
        sourceWidget.value = value;
        node.properties.text = value;
        if (markChanged) {
            sourceWidget.callback?.(value);
            node.graph?.change?.();
        }
    };
    editor.addEventListener("input", syncFromEditor);
    const stop = (event) => event.stopPropagation();
    for (const name of [
        "pointerdown", "pointermove", "pointerup", "dblclick",
        "keydown", "keyup", "copy", "cut", "paste", "contextmenu",
    ]) {
        editor.addEventListener(name, stop);
    }
    editor.addEventListener("wheel", (event) => {
        const canScroll = editor.scrollHeight > editor.clientHeight;
        if (canScroll) event.stopPropagation();
    }, { passive: true });

    const dom = node.addDOMWidget(
        "nova_note_editor_v394",
        "NOVA_NOTE_EDITOR",
        root,
        {
            serialize: false,
            hideOnZoom: false,
            getMinHeight: () => 90,
            getHeight: () => Math.max(90, Number(node.size?.[1] || 180) - 52),
            selectOn: ["focus", "click"],
        },
    );
    dom.serialize = false;
    dom.options.serialize = false;
    node.__novaNoteEditor = editor;

    const syncToEditor = () => {
        const value = String(sourceWidget.value ?? node.properties?.text ?? "");
        if (editor.value !== value) editor.value = value;
    };
    const previousConfigure = node.onConfigure;
    node.onConfigure = function (...args) {
        const result = previousConfigure?.apply(this, args);
        queueMicrotask(syncToEditor);
        return result;
    };
    const previousSerialize = node.onSerialize;
    node.onSerialize = function (info) {
        syncFromEditor(false);
        const result = previousSerialize?.apply(this, arguments);
        if (info) {
            info.properties ||= {};
            info.properties.text = editor.value;
        }
        return result;
    };
}

app.registerExtension({
    name: "NovoLoko.CompactResizableNodes.v393",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const nodeTypeName = String(nodeData?.name || "");
        if (!nodeTypeName.startsWith("Nova")) return;

        const minWidth = compactMinimum(nodeTypeName);
        const previousMinHeight = Array.isArray(nodeType.min_size)
            ? Number(nodeType.min_size[1]) || 40
            : 40;
        nodeType.min_size = [minWidth, previousMinHeight];

        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            queueMicrotask(() => installCompactSizing(this, nodeTypeName));
            return result;
        };

        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (...args) {
            const configured = args[0] || {};
            const savedSize = PERSISTED_SIZE_NODE_TYPES.has(nodeTypeName)
                ? normaliseSavedSize(
                    configured?.properties?.[SAVED_SIZE_PROPERTY]
                        || configured?.size,
                    minWidth,
                    previousMinHeight,
                )
                : null;
            const result = originalConfigure?.apply(this, args);
            if (savedSize) {
                this.properties ||= {};
                this.properties[SAVED_SIZE_PROPERTY] = [...savedSize];
            }
            queueMicrotask(() => {
                installCompactSizing(this, nodeTypeName);
                scheduleSavedSizeRestore(this, savedSize);
            });
            return result;
        };
    },

    nodeCreated(node) {
        const type = nodeTypeName(node);
        if (PERSISTED_SIZE_NODE_TYPES.has(type)) {
            queueMicrotask(() => installCompactSizing(node, type));
        }
        if (type === "Note" || type === "MarkdownNote") {
            queueMicrotask(() => installNoteCompatibility(node));
        }
    },
});
