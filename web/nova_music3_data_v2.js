import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const CONTROLS_NODE = "NovaMusicControls";
const LIBRARY_NODE = "NovaMusicAudioLibrary";
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

function graphNodes() {
    return app.graph?._nodes || app.canvas?.graph?._nodes || [];
}

function nodeForRoot(root, expectedType) {
    for (const node of graphNodes()) {
        const type = String(node?.comfyClass || node?.type || "");
        if (type !== expectedType) continue;
        if ((node.widgets || []).some((item) => item?.element === root || item?.inputEl === root)) return node;
        if ((node.widgets || []).some((item) => item?.element?.contains?.(root))) return node;
    }
    return null;
}

function selectedNode(node, root) {
    if (!node) return false;
    if (root?.contains?.(document.activeElement)) return true;
    const selected = app.canvas?.selected_nodes;
    if (selected instanceof Map) return selected.has(node.id) || selected.has(String(node.id));
    if (Array.isArray(selected)) return selected.includes(node) || selected.some((item) => item?.id === node.id);
    if (selected && typeof selected === "object") {
        return Boolean(selected[node.id] || selected[String(node.id)] || Object.values(selected).includes(node));
    }
    return Boolean(node.selected || node.flags?.selected);
}

function selectNode(node) {
    if (!node) return;
    try {
        if (typeof app.canvas?.selectNode === "function") app.canvas.selectNode(node, false);
    } catch (_error) {
        // Selection is convenience only; never break DOM interaction if a
        // frontend build changes its selection API.
    }
}

function scrollableAncestor(target, root) {
    let element = target instanceof Element ? target : null;
    while (element && element !== root?.parentElement) {
        if (element === root || root?.contains?.(element)) {
            const style = globalThis.getComputedStyle?.(element);
            const overflowY = String(style?.overflowY || element.style?.overflowY || "");
            const overflowX = String(style?.overflowX || element.style?.overflowX || "");
            const vertical = /(auto|scroll)/.test(overflowY) && Number(element.scrollHeight || 0) > Number(element.clientHeight || 0) + 1;
            const horizontal = /(auto|scroll)/.test(overflowX) && Number(element.scrollWidth || 0) > Number(element.clientWidth || 0) + 1;
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

function installSelectedWheel(root, expectedType) {
    if (!root || root.dataset.novoMusicV2Wheel === "1") return;
    root.dataset.novoMusicV2Wheel = "1";
    let node = null;
    const resolveNode = () => node || (node = nodeForRoot(root, expectedType));

    root.addEventListener("pointerdown", (event) => {
        if (event.button === 0) selectNode(resolveNode());
    }, true);

    root.addEventListener("wheel", (event) => {
        const currentNode = resolveNode();
        const scrollable = scrollableAncestor(event.target, root);
        if (selectedNode(currentNode, root) && scrollable) {
            // Selected DOM windows own the wheel only over an actual internal
            // scrolling surface.  Keep Comfy's canvas from zooming at the same
            // time, but let the browser perform the native scroll.
            event.stopPropagation();
            return;
        }

        // An unselected Music Controls / Audio Library window behaves like the
        // other NovoLoko DOM windows: the wheel belongs to canvas zoom, not the
        // hidden scroll surface under the pointer.
        if (!selectedNode(currentNode, root)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            forwardWheelToCanvas(event);
        }
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
    installSelectedWheel(root, type);
    if (type === CONTROLS_NODE) installGenreHierarchy(root);
}

function scan() {
    for (const root of document.querySelectorAll(".nova-music3-controls-v461")) installRoot(root, CONTROLS_NODE);
    for (const root of document.querySelectorAll(".nova-music3-player-v440")) installRoot(root, LIBRARY_NODE);
}

app.registerExtension({
    name: "NovoLoko.MusicDataV2.UI",
    setup() {
        scan();
        const observer = new MutationObserver(scan);
        observer.observe(document.body, { childList: true, subtree: true });
    },
});
