import { app } from "../../scripts/app.js";

const SETTINGS = Object.freeze({
    styleButtonVisible: "NovoLoko.Styles.ButtonVisible",
    styleButtonDraggable: "NovoLoko.Styles.ButtonDraggable",
    styleButtonSize: "NovoLoko.Styles.ButtonSize",
    autoOpenGenerated: "NovoLoko.Styles.AutoOpenGenerated",
    wrapNavigation: "NovoLoko.Styles.WrapNavigation",
    previewSize: "NovoLoko.Styles.PreviewSize",
    itemsPerPage: "NovoLoko.Styles.ItemsPerPage",
});

function legacyStyleSettings() {
    try {
        const value = JSON.parse(localStorage.getItem("novoloko.styleBrowserSettings.v1") || "{}");
        return value && typeof value === "object" ? value : {};
    } catch {
        return {};
    }
}

function publish(id, value) {
    window.dispatchEvent(new CustomEvent("novoloko:setting-changed", {
        detail: { id, value },
    }));
}

function addSetting(definition) {
    try {
        if (app.ui?.settings?.settingsLookup?.[definition.id]) return;
        app.ui?.settings?.addSetting?.({
            ...definition,
            onChange(value) {
                definition.onChange?.(value);
                publish(definition.id, value);
            },
        });
    } catch (error) {
        console.warn(`[NovoLoko] Could not register setting ${definition.id}`, error);
    }
}

function comboOptions(items) {
    return (value) => items.map((item) => ({
        value: item.value,
        text: item.text,
        selected: item.value === value,
    }));
}

window.NovoLokoSettings = {
    ids: SETTINGS,
    get(id, fallback = null) {
        try {
            const value = app.ui?.settings?.getSettingValue?.(id);
            return value === undefined || value === null ? fallback : value;
        } catch {
            return fallback;
        }
    },
    set(id, value) {
        try {
            app.ui?.settings?.setSettingValue?.(id, value);
        } catch {
            // The active page setting remains usable even if persistence is unavailable.
        }
        publish(id, value);
    },
};

app.registerExtension({
    name: "NovoLoko.Settings.v1",
    init() {
        const legacy = legacyStyleSettings();
        addSetting({
            id: SETTINGS.styleButtonVisible,
            name: "Show floating Styles button",
            category: ["NovoLoko", "Styles", "Show floating Styles button"],
            tooltip: "Show or hide the movable NovoLoko Styles button over the graph.",
            type: "boolean",
            defaultValue: true,
        });
        addSetting({
            id: SETTINGS.styleButtonDraggable,
            name: "Allow Styles button to be moved",
            category: ["NovoLoko", "Styles", "Allow Styles button to be moved"],
            tooltip: "When disabled, clicking still opens Styles but dragging cannot reposition it.",
            type: "boolean",
            defaultValue: true,
        });
        addSetting({
            id: SETTINGS.styleButtonSize,
            name: "Styles button size",
            category: ["NovoLoko", "Styles", "Styles button size"],
            type: "combo",
            defaultValue: "Normal",
            options: comboOptions([
                { value: "Compact", text: "Compact" },
                { value: "Normal", text: "Normal" },
                { value: "Large", text: "Large" },
            ]),
        });
        addSetting({
            id: SETTINGS.autoOpenGenerated,
            name: "Open preview after generating one style",
            category: ["NovoLoko", "Styles", "Open preview after generating one style"],
            type: "boolean",
            defaultValue: legacy.autoOpenGenerated !== false,
        });
        addSetting({
            id: SETTINGS.wrapNavigation,
            name: "Wrap Previous and Next at the ends",
            category: ["NovoLoko", "Styles", "Wrap Previous and Next at the ends"],
            type: "boolean",
            defaultValue: legacy.wrapViewerNavigation !== false,
        });
        addSetting({
            id: SETTINGS.previewSize,
            name: "Default generated preview size",
            category: ["NovoLoko", "Styles", "Default generated preview size"],
            type: "combo",
            defaultValue: Number(legacy.previewSize) === 1024 ? "1024" : "512",
            options: comboOptions([
                { value: "512", text: "512 × 512" },
                { value: "1024", text: "1024 × 1024" },
            ]),
        });
        addSetting({
            id: SETTINGS.itemsPerPage,
            name: "Styles shown per page",
            category: ["NovoLoko", "Styles", "Styles shown per page"],
            type: "combo",
            defaultValue: [24, 50, 100, "all"].includes(legacy.itemsPerPage)
                ? String(legacy.itemsPerPage)
                : "24",
            options: comboOptions([
                { value: "24", text: "24" },
                { value: "50", text: "50" },
                { value: "100", text: "100" },
                { value: "all", text: "All" },
            ]),
        });
    },
});
