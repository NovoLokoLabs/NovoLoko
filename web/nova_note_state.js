function normaliseNoteType(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
}

export function isCompatibleNoteType(value) {
    return ["note", "markdownnote"].includes(normaliseNoteType(value));
}

export function findNoteSourceWidget(widgets = []) {
    const candidates = Array.isArray(widgets) ? widgets : [];
    return candidates.find(
        (item) => (
            String(item?.name || "").toLowerCase() === "text"
            && item?.type !== "NOVA_NOTE_EDITOR"
        ),
    ) || null;
}

export function readNoteValue(sourceWidget, properties = {}) {
    return String(sourceWidget?.value ?? properties?.text ?? "");
}

export function noteSerializationPatch(value, properties = {}) {
    return {
        ...properties,
        text: String(value ?? ""),
    };
}

export function noteInstallDecision({
    nodeType,
    alternateType,
    installed = false,
    hasSourceWidget = false,
    hasNativeEditor = false,
    canAddDOMWidget = false,
} = {}) {
    if (
        !isCompatibleNoteType(nodeType)
        && !isCompatibleNoteType(alternateType)
    ) {
        return "skip";
    }
    if (installed) return "installed";
    if (!hasSourceWidget) return "retry";
    if (hasNativeEditor) return "reuse-native";
    return canAddDOMWidget ? "create-fallback" : "retry";
}
