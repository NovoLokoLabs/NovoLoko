export const TEXT_COUNTER_MODES = ["Off", "Words", "Words + Characters"];

export function normaliseTextCounterMode(value) {
    const clean = String(value || "").trim();
    return TEXT_COUNTER_MODES.includes(clean) ? clean : "Words + Characters";
}

export function textDisplayCounts(value) {
    const text = String(value || "");
    const trimmed = text.trim();
    return {
        words: trimmed ? (trimmed.match(/\S+/gu) || []).length : 0,
        characters: Array.from(text).length,
    };
}

function pluralCount(value, singular, plural = `${singular}s`) {
    return `${value} ${value === 1 ? singular : plural}`;
}

export function textDisplayCounterSummary(value, mode, boxWidth = 320) {
    const cleanMode = normaliseTextCounterMode(mode);
    if (cleanMode === "Off") return "";

    const counts = textDisplayCounts(value);
    const words = pluralCount(counts.words, "word");
    if (cleanMode === "Words" || Number(boxWidth) < 225) return words;
    return `${words} • ${pluralCount(counts.characters, "character")}`;
}

export function restoreTextDisplayText(properties, currentValue = "") {
    const saved = properties?.novaDisplayLastText;
    return String(saved ?? currentValue ?? "");
}

export function shouldInstallTextDisplayDOM({
    nodes2 = false,
    canAddDOMWidget = false,
    installed = false,
} = {}) {
    return Boolean(nodes2 && canAddDOMWidget && !installed);
}
