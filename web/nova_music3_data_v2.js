import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CONTROLS_NODE = "NovaMusicControls";
const LIBRARY_NODE = "NovaMusicAudioLibrary";
const PROMPT_STACK_NODE = "NovaPromptStackAIO";
const SPECIAL_VALUES = new Set(["None / No preference", "Custom...", "Random"]);
let metadataPromise = null;

function controlsMetadata() {
    if (!metadataPromise) {
        metadataPromise = api.fetchApi("/nova_music3/controls")
            .then(async (response) => {
                const payload = await response.json();
                if (!response.ok) throw new Error(payload?.error || `Music controls metadata failed: ${response.status}`);
                return payload;
            })
            .catch((error) => {
                console.warn("[NovoLoko Music Data v2] metadata unavailable:", error);
                metadataPromise = null;
                return null;
            });
    }
    return metadataPromise;
}

function scrollableAncestorForDelta(target, root, deltaX = 0, deltaY = 0) {
    let element = target instanceof Element ? target : null;
    while (element && element !== root?.parentElement) {
        if (element === root || root?.contains?.(element)) {
            const style = globalThis.getComputedStyle?.(element);
            const overflowY = String(style?.overflowY || element.style?.overflowY || "");
            const overflowX = String(style?.overflowX || element.style?.overflowX || "");
            const scrollTop = Number(element.scrollTop || 0);
            const scrollLeft = Number(element.scrollLeft || 0);
            const maxTop = Math.max(0, Number(element.scrollHeight || 0) - Number(element.clientHeight || 0));
            const maxLeft = Math.max(0, Number(element.scrollWidth || 0) - Number(element.clientWidth || 0));
            const vertical = /(auto|scroll)/.test(overflowY)
                && ((deltaY < 0 && scrollTop > 1) || (deltaY > 0 && scrollTop < maxTop - 1));
            const horizontal = /(auto|scroll)/.test(overflowX)
                && ((deltaX < 0 && scrollLeft > 1) || (deltaX > 0 && scrollLeft < maxLeft - 1));
            if (vertical || horizontal) return element;
        }
        element = element.parentElement;
    }
    return null;
}

function forwardWheelToCanvas(event) {
    const canvas = app.canvas?.canvas;
    if (!canvas || typeof WheelEvent !== "function") return false;
    const forwarded = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        view: window,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        clientX: event.clientX,
        clientY: event.clientY,
        screenX: event.screenX,
        screenY: event.screenY,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
    });
    canvas.dispatchEvent(forwarded);
    return true;
}

function installWheelHandoff(root) {
    if (!root || root.dataset.novoMusicV2Wheel === "1") return;
    root.dataset.novoMusicV2Wheel = "1";

    root.addEventListener("wheel", (event) => {
        const scrollable = scrollableAncestorForDelta(event.target, root, event.deltaX, event.deltaY);
        if (scrollable) {
            // A real inner surface owns the wheel only while it can move in the
            // requested direction. Browser-native scrolling remains intact.
            event.stopPropagation();
            return;
        }

        // DOM overlays are not descendants of Comfy's canvas, so propagation
        // alone cannot reach its zoom listener. Explicitly forward every wheel
        // event that an inner surface cannot consume, including scroll bounds.
        // Node selection/focus never changes this rule.
        event.preventDefault();
        event.stopImmediatePropagation();
        forwardWheelToCanvas(event);
    }, { capture: true, passive: false });
}

function findCategoryRow(root, labelText) {
    return [...root.querySelectorAll(".nova-music3-category-row")].find((row) => {
        const label = row.querySelector("label");
        return String(label?.textContent || "").trim() === labelText;
    });
}

async function installGenreHierarchy(root) {
    if (!root || root.dataset.novoMusicV2Hierarchy === "1") return;
    root.dataset.novoMusicV2Hierarchy = "1";
    const payload = await controlsMetadata();
    if (!payload?.style_parent_map) return;

    const waitForRows = async () => {
        for (let attempt = 0; attempt < 80; attempt += 1) {
            const genreRow = findCategoryRow(root, "Genre");
            const styleRow = findCategoryRow(root, "Style / era");
            if (genreRow?.querySelector("select") && styleRow?.querySelector("select")) {
                return { genreRow, styleRow };
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return null;
    };

    const rows = await waitForRows();
    if (!rows || !root.isConnected) return;
    const genre = rows.genreRow.querySelector("select");
    const style = rows.styleRow.querySelector("select");
    const allStyleOptions = [...style.options].map((option) => ({
        value: option.value,
        text: option.textContent,
        description: option.dataset.description || "",
    }));
    const special = allStyleOptions.filter((item) => SPECIAL_VALUES.has(item.value));
    const normal = allStyleOptions.filter((item) => !SPECIAL_VALUES.has(item.value));
    let lastGenre = "";
    let lastStyle = "";

    const filterStyles = () => {
        if (!root.isConnected) return;
        const selectedGenre = genre.value;
        const selectedStyle = style.value;
        if (selectedGenre === lastGenre && selectedStyle === lastStyle && style.options.length) return;
        lastGenre = selectedGenre;
        lastStyle = selectedStyle;

        const showAll = SPECIAL_VALUES.has(selectedGenre) || !selectedGenre;
        const compatible = showAll
            ? normal
            : normal.filter((item) => payload.style_parent_map[item.value] === selectedGenre);
        const desired = [...special, ...compatible];

        // Never erase a legacy/manual style just because its taxonomy changed.
        // Keep it visible as the current choice until the user intentionally
        // selects another compatible style.
        if (selectedStyle && !desired.some((item) => item.value === selectedStyle)) {
            const legacy = normal.find((item) => item.value === selectedStyle);
            if (legacy) desired.push(legacy);
        }

        style.replaceChildren();
        for (const item of desired) {
            const option = document.createElement("option");
            option.value = item.value;
            option.textContent = item.text;
            option.dataset.description = item.description;
            style.append(option);
        }
        if ([...style.options].some((option) => option.value === selectedStyle)) style.value = selectedStyle;
        style.title = showAll
            ? `${normal.length} Style / era choices across all genres.`
            : `${compatible.length} Style / era choices under ${genre.selectedOptions?.[0]?.textContent || selectedGenre}.`;
    };

    genre.addEventListener("change", () => requestAnimationFrame(filterStyles));
    style.addEventListener("change", () => { lastStyle = style.value; });
    filterStyles();

    // Built-in preset application changes native widgets and then syncs the DOM
    // selects without dispatching a browser change event.  A low-frequency value
    // check keeps the dependent Style list correct after presets/recipes without
    // adding another backend widget or modifying the base Music Controls code.
    const interval = setInterval(() => {
        if (!root.isConnected) {
            clearInterval(interval);
            return;
        }
        if (genre.value !== lastGenre || style.value !== lastStyle) filterStyles();
    }, 250);
}

function installRoot(root, type) {
    installWheelHandoff(root);
    if (type === CONTROLS_NODE) installGenreHierarchy(root);
}

function scan() {
    for (const root of document.querySelectorAll(".nova-music3-controls-v461")) installRoot(root, CONTROLS_NODE);
    for (const root of document.querySelectorAll(".nova-music3-player-v440")) installRoot(root, LIBRARY_NODE);
    for (const root of document.querySelectorAll(".novoloko-slot-panel")) installRoot(root, PROMPT_STACK_NODE);
}

app.registerExtension({
    name: "NovoLoko.MusicDataV2.UI",
    setup() {
        scan();
        const observer = new MutationObserver(scan);
        observer.observe(document.body, { childList: true, subtree: true });
    },
});
