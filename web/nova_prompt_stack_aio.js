import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const SLOT_NAMES = ["medium", "subject", "pose", "action", "clothing", "location", "character"];
const LEGACY_SLOT_NAMES = ["medium", "pose", "action", "clothing", "location", "character"];
const PRO_NODE_NAMES = new Set(["NovaPromptStackAIO"]);

function getWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

const NOVA_MENU_SEPARATOR = " › ";

function flatMenuValue(value) {
    return String(value ?? "")
        .replace(/[\\/]+/g, NOVA_MENU_SEPARATOR)
        .replace(/\s*›\s*/g, NOVA_MENU_SEPARATOR)
        .trim();
}

function restoreMenuValue(value) {
    return String(value ?? "")
        .replace(/\s*[›⟩／]\s*/g, "/")
        .trim();
}

function uniqueValues(values) {
    const out = [];
    const seen = new Set();
    for (const value of values || []) {
        const text = String(value ?? "").trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
    }
    return out;
}

function setComboValues(widget, values, fallback, preserveCurrent = true) {
    if (!widget) return;

    const options = uniqueValues(values);
    if (!options.length && fallback) options.push(fallback);

    const current = String(widget.value ?? "").trim();
    if (preserveCurrent && current && !options.includes(current)) {
        options.push(current);
    }

    widget.options = widget.options || {};
    widget.options.values = options;

    // V3 already creates real combo widgets. This fallback keeps V2 workflows
    // usable without making V3 depend on STRING-to-combo conversion.
    if (widget.type !== "combo") widget.type = "combo";

    if (!options.includes(current)) {
        widget.value = options.includes(fallback)
            ? fallback
            : (options[0] || fallback || "");
        widget.callback?.(widget.value);
    }
}

function setFlatComboValues(widget, values, fallback, preserveCurrent = true) {
    if (!widget) return;

    const options = uniqueValues((values || []).map(flatMenuValue));
    const flatFallback = flatMenuValue(fallback);
    if (!options.length && flatFallback) options.push(flatFallback);

    const current = flatMenuValue(widget.value);
    if (preserveCurrent && current && !options.includes(current)) {
        options.push(current);
    }

    widget.options ||= {};
    widget.options.values = options;
    widget.options.novaFlatMenu = true;
    widget.options.novaDisableAutoNest = true;
    widget.__novaDisableAutoNest = true;
    if (widget.type !== "combo") widget.type = "combo";

    const next = options.includes(current)
        ? current
        : (options.includes(flatFallback) ? flatFallback : (options[0] || flatFallback || ""));
    if (widget.value !== next) {
        widget.value = next;
        widget.callback?.(widget.value);
    }
}

function setSelectionValues(widget, values, preserveCurrent = true) {
    const current = flatMenuValue(widget?.value);
    const merged = uniqueValues([
        "none",
        "random",
        ...(values || []).map(flatMenuValue),
    ]);
    if (preserveCurrent && current && !merged.includes(current)) merged.push(current);
    setFlatComboValues(widget, merged, "random", false);
}

function markDirty(node) {
    node.setDirtyCanvas?.(true, true);
    app.graph?.setDirtyCanvas?.(true, true);
}

function applySubjectPresentationOrder(node) {
    if (!node.__novaAIOSerializedWidgets) {
        node.__novaAIOSerializedWidgets = [...(node.widgets || [])];
    }
    if (!node.__novaAIOSerializeWrapped && typeof node.serialize === "function") {
        const originalSerialize = node.serialize;
        node.serialize = function (...args) {
            const visualWidgets = this.widgets || [];
            const releasedOrder = (this.__novaAIOSerializedWidgets || [])
                .filter((widget) => visualWidgets.includes(widget));
            const laterSerialized = visualWidgets.filter(
                (widget) => !releasedOrder.includes(widget) && widget.serialize !== false,
            );
            this.widgets = [...releasedOrder, ...laterSerialized];
            let serialized;
            try {
                serialized = originalSerialize.apply(this, args);
            } finally {
                this.widgets = visualWidgets;
            }
            // Some ComfyUI extensions retain indices captured from the visual
            // widget order. Rebuild this one array from the released order so
            // moving Subject visually can never move a saved value.
            if (serialized && this.serialize_widgets) {
                serialized.widgets_values = [];
                releasedOrder.forEach((widget, index) => {
                    if (widget.serialize === false) return;
                    const value = widget.value;
                    serialized.widgets_values[index] = (
                        value && typeof value === "object"
                            ? JSON.parse(JSON.stringify(value))
                            : (value ?? null)
                    );
                });
            }
            return serialized;
        };
        node.__novaAIOSerializeWrapped = true;
    }

    const desiredNames = [
        "all_slots_enabled",
        ...SLOT_NAMES.flatMap((slot) => [
            `${slot}_file_path`,
            `${slot}_category`,
            `${slot}_search`,
            `${slot}_selection`,
        ]),
        "random_mode",
        "seed",
        "control_after_generate",
        "delimiter",
        "manual_prompt",
        "extra_positive",
        "extra_negative",
    ];
    const desired = desiredNames.map((name) => getWidget(node, name)).filter(Boolean);
    const desiredSet = new Set(desired);
    const remaining = (node.widgets || []).filter((widget) => !desiredSet.has(widget));
    node.widgets = [...desired, ...remaining];
    node.setSize?.([
        Math.max(Number(node.size?.[0]) || 0, 820),
        Math.max(Number(node.size?.[1]) || 0, 1580),
    ]);
}

function repairMissingSubjectDefaults(node) {
    const file = getWidget(node, "subject_file_path");
    const category = getWidget(node, "subject_category");
    const search = getWidget(node, "subject_search");
    const selection = getWidget(node, "subject_selection");
    if (file && !String(file.value || "").trim()) {
        file.value = "csv/subjects/novoloko_subjects_master_2200.csv";
    }
    if (category && !String(category.value || "").trim()) category.value = "All";
    if (search && search.value == null) search.value = "";
    if (selection && !String(selection.value || "").trim()) selection.value = "none";
}

async function fetchJson(path) {
    const response = await api.fetchApi(path);
    let data = null;
    try {
        data = await response.json();
    } catch {
        throw new Error(`NovoLoko dropdown endpoint returned ${response.status}`);
    }
    if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Request failed: ${response.status}`);
    }
    return data;
}

async function waitForWidgets(node, attempts = 40) {
    const required = SLOT_NAMES.flatMap((slot) => [
        `${slot}_file_path`,
        `${slot}_category`,
        `${slot}_search`,
        `${slot}_selection`,
    ]);

    for (let attempt = 0; attempt < attempts; attempt++) {
        if (
            node?.widgets?.length &&
            required.every((name) => Boolean(getWidget(node, name)))
        ) {
            return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false;
}

async function refreshFileList(node, slot, preserveCurrent = true) {
    const fileWidget = getWidget(node, `${slot}_file_path`);
    if (!fileWidget) return;

    const params = new URLSearchParams({ slot });
    const data = await fetchJson(`/nova_prompt_stack/files?${params.toString()}`);
    setComboValues(
        fileWidget,
        data.files || [],
        data.default || fileWidget.value || "",
        preserveCurrent,
    );
}

async function refreshEntries(node, slot, options = {}) {
    const {
        quiet = false,
        refreshFiles = false,
        preserveFile = true,
        preserveSelection = true,
    } = options;

    const fileWidget = getWidget(node, `${slot}_file_path`);
    const categoryWidget = getWidget(node, `${slot}_category`);
    const searchWidget = getWidget(node, `${slot}_search`);
    const selectionWidget = getWidget(node, `${slot}_selection`);
    if (!fileWidget || !categoryWidget || !searchWidget || !selectionWidget) return;

    try {
        if (refreshFiles) {
            await refreshFileList(node, slot, preserveFile);
        }

        const params = new URLSearchParams({
            file: String(fileWidget.value || ""),
            slot,
            category: restoreMenuValue(categoryWidget.value || "All"),
            search: String(searchWidget.value || ""),
        });

        const data = await fetchJson(`/nova_prompt_stack/list?${params.toString()}`);

        setFlatComboValues(categoryWidget, data.categories || ["All"], "All", true);
        setSelectionValues(selectionWidget, data.styles || [], preserveSelection);
        markDirty(node);

        node.__novaAIOLastError = "";
        if (!quiet) {
            console.log(
                `[NovoLoko AIO Native] ${slot}: ${data.filtered_count}/${data.count} entries from ${data.resolved_path}`,
            );
        }
    } catch (error) {
        node.__novaAIOLastError = String(error?.message || error);
        console.warn(`[NovoLoko AIO Native] Failed to refresh ${slot}:`, error);
    }
}

async function refreshAll(node, quiet = false, refreshFiles = true) {
    if (!await waitForWidgets(node)) {
        console.warn("[NovoLoko AIO Native] Timed out waiting for node widgets.");
        return;
    }

    node.__novaAIORefreshing = true;
    try {
        for (const slot of SLOT_NAMES) {
            await refreshEntries(node, slot, {
                quiet,
                refreshFiles,
                preserveFile: true,
                preserveSelection: true,
            });
        }
    } finally {
        node.__novaAIORefreshing = false;
        node.__novaAIOInitialising = false;
        markDirty(node);
    }
}

function debounceSlot(node, slot, delay = 260, preserveSelection = true) {
    clearTimeout(node[`__novaAIO_${slot}_timer`]);
    node[`__novaAIO_${slot}_timer`] = setTimeout(
        () => refreshEntries(node, slot, {
            quiet: true,
            refreshFiles: false,
            preserveSelection,
        }),
        delay,
    );
}

function wrapWidgetCallback(node, slot, widgetName, mode) {
    const target = getWidget(node, widgetName);
    if (!target || target.__novaAIOWrapped) return;

    const previous = target.callback;
    target.callback = function (...args) {
        const result = previous?.apply(this, args);
        if (node.__novaAIORefreshing || node.__novaAIOInitialising) return result;

        if (mode === "file") {
            const category = getWidget(node, `${slot}_category`);
            const search = getWidget(node, `${slot}_search`);
            const selection = getWidget(node, `${slot}_selection`);

            if (category) category.value = "All";
            if (search) search.value = "";
            if (selection) selection.value = "random";

            refreshEntries(node, slot, {
                quiet: false,
                refreshFiles: false,
                preserveSelection: false,
            });
        } else if (mode === "category") {
            debounceSlot(node, slot, 80, false);
        } else {
            debounceSlot(node, slot, 300, false);
        }
        return result;
    };
    target.__novaAIOWrapped = true;
}

function migrateLegacyMasterOrder(node) {
    const master = getWidget(node, "all_slots_enabled");
    const characterSelection = getWidget(node, "character_selection");
    if (!master || typeof master.value === "boolean") return;
    if (!characterSelection || typeof characterSelection.value !== "boolean") return;

    const slotWidgetNames = [];
    for (const slot of LEGACY_SLOT_NAMES) {
        slotWidgetNames.push(
            `${slot}_file_path`,
            `${slot}_category`,
            `${slot}_search`,
            `${slot}_selection`,
        );
    }

    const legacySlotValues = [master.value];
    for (const name of slotWidgetNames.slice(0, -1)) {
        legacySlotValues.push(getWidget(node, name)?.value);
    }

    const legacyMasterValue = Boolean(characterSelection.value);
    master.value = legacyMasterValue;
    for (let index = 0; index < slotWidgetNames.length; index += 1) {
        const widget = getWidget(node, slotWidgetNames[index]);
        if (widget) widget.value = legacySlotValues[index];
    }

    node.__novaAIOMigratedMasterOrder = true;
    markDirty(node);
}

async function installCallbacks(node) {
    if (!await waitForWidgets(node)) return;

    migrateLegacyMasterOrder(node);
    repairMissingSubjectDefaults(node);

    for (const slot of SLOT_NAMES) {
        wrapWidgetCallback(node, slot, `${slot}_file_path`, "file");
        wrapWidgetCallback(node, slot, `${slot}_category`, "category");
        wrapWidgetCallback(node, slot, `${slot}_search`, "search");
    }
    applySubjectPresentationOrder(node);

    const master = getWidget(node, "all_slots_enabled");
    if (master && !master.__novaAIOMasterWrapped) {
        const previous = master.callback;
        master.callback = function (...args) {
            const result = previous?.apply(this, args);
            node.__novaAIOAllSlotsEnabled = Boolean(this.value);
            markDirty(node);
            return result;
        };
        master.__novaAIOMasterWrapped = true;
        node.__novaAIOAllSlotsEnabled = Boolean(master.value);
    }
}

function scheduleFullRefresh(node, delay = 260) {
    clearTimeout(node.__novaAIORefreshTimer);
    node.__novaAIORefreshTimer = setTimeout(
        () => refreshAll(node, true, true),
        delay,
    );
}

function configureProNode(node) {
    if (!node.__novaAIOProConfigured) {
        node.__novaAIOProConfigured = true;
        node.__novaAIOInitialising = true;

        installCallbacks(node);

        const reload = node.addWidget(
            "button",
            "↻ Refresh Files + Categories + Entries",
            null,
            () => refreshAll(node, false, true),
        );
        reload.serialize = false;

        const clearSearch = node.addWidget(
            "button",
            "Clear all searches",
            null,
            async () => {
                node.__novaAIORefreshing = true;
                try {
                    for (const slot of SLOT_NAMES) {
                        const search = getWidget(node, `${slot}_search`);
                        const category = getWidget(node, `${slot}_category`);
                        const selection = getWidget(node, `${slot}_selection`);
                        if (search) search.value = "";
                        if (category) category.value = "All";
                        if (selection) selection.value = "random";
                    }
                } finally {
                    node.__novaAIORefreshing = false;
                }
                await refreshAll(node, true, false);
            },
        );
        clearSearch.serialize = false;

        const oldSize = node.size || [820, 1480];
        node.setSize?.([
            Math.max(Number(oldSize[0]) || 0, 820),
            Math.max(Number(oldSize[1]) || 0, 1580),
        ]);
    }

    // onNodeCreated can fire before saved values are restored. onGraphConfigured
    // calls this again and deliberately schedules another refresh.
    installCallbacks(node);
    applySubjectPresentationOrder(node);
    scheduleFullRefresh(node, 300);
}

function configureLegacyNode(node) {
    if (node.__novaAIOLegacyConfigured) return;
    node.__novaAIOLegacyConfigured = true;

    const refreshLegacySlot = async (slot, quiet = true) => {
        const fileWidget = getWidget(node, `${slot}_file_path`);
        const selectionWidget = getWidget(node, `${slot}_selection`);
        if (!fileWidget || !selectionWidget) return;

        try {
            const params = new URLSearchParams({
                file: String(fileWidget.value || ""),
                slot,
                category: "All",
                search: "",
            });
            const data = await fetchJson(`/nova_prompt_stack/list?${params.toString()}`);
            setSelectionValues(selectionWidget, data.styles || [], true);
            if (!quiet) console.log(`[NovoLoko AIO Legacy] ${slot}: ${data.count} entries`);
            markDirty(node);
        } catch (error) {
            console.warn(`[NovoLoko AIO Legacy] Failed to refresh ${slot}:`, error);
        }
    };

    for (const slot of SLOT_NAMES) {
        const fileWidget = getWidget(node, `${slot}_file_path`);
        if (fileWidget && !fileWidget.__novaAIOWrapped) {
            const previous = fileWidget.callback;
            fileWidget.callback = function (...args) {
                const result = previous?.apply(this, args);
                setTimeout(() => refreshLegacySlot(slot, true), 180);
                return result;
            };
            fileWidget.__novaAIOWrapped = true;
        }
    }

    const reload = node.addWidget(
        "button",
        "↻ Reload CSV / YAML selections",
        null,
        async () => {
            for (const slot of SLOT_NAMES) await refreshLegacySlot(slot, false);
        },
    );
    reload.serialize = false;

    setTimeout(async () => {
        for (const slot of SLOT_NAMES) await refreshLegacySlot(slot, true);
    }, 260);
}

app.registerExtension({
    name: "NovoLoko.PromptStackAIONativeDropdowns.v326RgthreeFlatMenus",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const name = String(nodeData?.name || "");
        if (!PRO_NODE_NAMES.has(name)) return;

        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalOnNodeCreated?.apply(this, arguments);
            // Workflow loading may yield between node creation and value
            // restoration. Never reorder widgets during that gap.
            clearTimeout(this.__novaAIOCreatedTimer);
            this.__novaAIOCreatedTimer = setTimeout(() => {
                if (PRO_NODE_NAMES.has(name)) configureProNode(this);
                else configureLegacyNode(this);
            }, 1000);
            return result;
        };

        const originalOnConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = originalOnConfigure?.apply(this, arguments);
            clearTimeout(this.__novaAIOCreatedTimer);
            if (PRO_NODE_NAMES.has(name)) configureProNode(this);
            else configureLegacyNode(this);
            return result;
        };

        const originalOnGraphConfigured = nodeType.prototype.onGraphConfigured;
        nodeType.prototype.onGraphConfigured = function () {
            const result = originalOnGraphConfigured?.apply(this, arguments);
            clearTimeout(this.__novaAIOCreatedTimer);
            if (PRO_NODE_NAMES.has(name)) configureProNode(this);
            else configureLegacyNode(this);
            return result;
        };
    },
});
