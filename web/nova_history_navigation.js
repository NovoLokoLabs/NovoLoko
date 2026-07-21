import { app } from "../../scripts/app.js";

function makeButton(text, title) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.style.cssText = "cursor:pointer;min-width:34px;padding:4px 7px;font-weight:700;border-radius:5px;white-space:nowrap";
    return button;
}

function beginJump(counter, getTotal, getCurrent, submit) {
    const total = Math.max(0, Number(getTotal() || 0));
    if (!total) return;
    if (counter.__novaJumpInput) {
        counter.__novaJumpInput.focus();
        counter.__novaJumpInput.select();
        return;
    }

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = String(total);
    input.step = "1";
    input.value = String(Math.max(1, Math.min(total, Number(getCurrent() || 0) + 1)));
    input.title = `Type an item number from 1 to ${total}`;
    input.style.cssText = "width:88px;min-width:68px;padding:4px 5px;text-align:center;font-weight:700;border-radius:5px;box-sizing:border-box";

    const parent = counter.parentElement;
    if (!parent) return;
    counter.__novaJumpInput = input;
    counter.style.display = "none";
    parent.insertBefore(input, counter.nextSibling);

    const finish = (apply) => {
        if (!counter.__novaJumpInput) return;
        const value = Math.max(1, Math.min(total, Number(input.value || 1)));
        input.remove();
        counter.__novaJumpInput = null;
        counter.style.display = "";
        if (apply) submit(value - 1);
    };

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
        } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
        }
    });
    input.addEventListener("blur", () => finish(true), { once: true });
    queueMicrotask(() => {
        input.focus();
        input.select();
    });
}

function selectNodeIndex(node, target, playNow = true) {
    const items = node?.__novaHistoryItems || [];
    if (!items.length) return;
    const safe = Math.max(0, Math.min(Number(target) || 0, items.length - 1));
    if (typeof window.__novaSelectHistoryByIndex === "function") {
        window.__novaSelectHistoryByIndex(node, safe, playNow);
        return;
    }
    const label = node.__novaHistoryLabels?.[safe];
    const combo = node.__novaHistoryCombo;
    if (combo && label) {
        combo.value = label;
        combo.callback?.(label);
    }
}

function enhanceNode(node) {
    const counter = node?.__novaHistoryCounter;
    const previous = node?.__novaHistoryPreviousButton;
    const next = node?.__novaHistoryNextButton;
    const navigation = counter?.parentElement;
    if (!navigation || !previous || !next || navigation.__novaSuiteNavigation) return;
    navigation.__novaSuiteNavigation = true;

    const start = makeButton("|<", "Back to the newest / first history item");
    const back10 = makeButton("<<", "Skip 10 items toward the start");
    const forward10 = makeButton(">>", "Skip 10 items toward older history");
    const end = makeButton(">|", "Jump to the oldest / final history item");

    start.addEventListener("click", (event) => {
        event.stopPropagation();
        selectNodeIndex(node, 0, true);
    });
    back10.addEventListener("click", (event) => {
        event.stopPropagation();
        selectNodeIndex(node, Number(node.__novaCurrentHistoryIndex || 0) - 10, true);
    });
    forward10.addEventListener("click", (event) => {
        event.stopPropagation();
        selectNodeIndex(node, Number(node.__novaCurrentHistoryIndex || 0) + 10, true);
    });
    end.addEventListener("click", (event) => {
        event.stopPropagation();
        const total = node.__novaHistoryItems?.length || 0;
        selectNodeIndex(node, Math.max(0, total - 1), true);
    });

    counter.title = "Click to type a history number and jump directly";
    counter.tabIndex = 0;
    counter.setAttribute("role", "button");
    counter.style.cursor = "text";
    counter.style.borderRadius = "4px";
    counter.style.border = "1px solid rgba(255,255,255,.2)";
    counter.addEventListener("click", (event) => {
        event.stopPropagation();
        beginJump(
            counter,
            () => node.__novaHistoryItems?.length || 0,
            () => Number(node.__novaCurrentHistoryIndex || 0),
            (index) => selectNodeIndex(node, index, true),
        );
    });
    counter.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            counter.click();
        }
    });

    navigation.insertBefore(start, previous);
    navigation.insertBefore(back10, previous);
    navigation.insertBefore(forward10, next.nextSibling);
    navigation.insertBefore(end, forward10.nextSibling);
}

function enhanceFullscreen() {
    const viewer = window.__novaImageViewer;
    const navigation = viewer?.overlay?.querySelector('[data-nova-role="history-navigation"]');
    if (!viewer || !navigation || navigation.__novaSuiteNavigation) return;
    navigation.__novaSuiteNavigation = true;

    const children = [...navigation.children];
    const previous = children[0];
    const counter = children[1];
    const next = children[2];
    if (!previous || !counter || !next) return;

    const start = makeButton("|<", "Back to the newest / first history item");
    const back10 = makeButton("<<", "Skip 10 items toward the start");
    const forward10 = makeButton(">>", "Skip 10 items toward older history");
    const end = makeButton(">|", "Jump to the oldest / final history item");

    const go = (target) => {
        const node = viewer.node;
        const items = node?.__novaHistoryItems || [];
        if (!items.length) return;
        const current = Number(node.__novaCurrentHistoryIndex || 0);
        const safe = Math.max(0, Math.min(Number(target) || 0, items.length - 1));
        viewer.navigate?.(safe - current, true);
    };

    start.addEventListener("click", (event) => { event.stopPropagation(); go(0); });
    back10.addEventListener("click", (event) => {
        event.stopPropagation();
        go(Number(viewer.node?.__novaCurrentHistoryIndex || 0) - 10);
    });
    forward10.addEventListener("click", (event) => {
        event.stopPropagation();
        go(Number(viewer.node?.__novaCurrentHistoryIndex || 0) + 10);
    });
    end.addEventListener("click", (event) => {
        event.stopPropagation();
        go(Math.max(0, (viewer.node?.__novaHistoryItems?.length || 1) - 1));
    });

    counter.title = "Click to type a history number and jump directly";
    counter.tabIndex = 0;
    counter.setAttribute("role", "button");
    counter.style.cursor = "text";
    counter.style.border = "1px solid rgba(255,255,255,.22)";
    counter.style.borderRadius = "4px";
    counter.addEventListener("click", (event) => {
        event.stopPropagation();
        beginJump(
            counter,
            () => viewer.node?.__novaHistoryItems?.length || 0,
            () => Number(viewer.node?.__novaCurrentHistoryIndex || 0),
            go,
        );
    });
    counter.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            counter.click();
        }
    });

    navigation.insertBefore(start, previous);
    navigation.insertBefore(back10, previous);
    navigation.insertBefore(forward10, next.nextSibling);
    navigation.insertBefore(end, forward10.nextSibling);
}

function scan() {
    for (const node of app.graph?._nodes || []) {
        if (String(node?.type || node?.comfyClass || "") === "NovaAudioHistoryPlayer") {
            enhanceNode(node);
        }
    }
    enhanceFullscreen();
}

window.addEventListener("nova-image-viewer-ready", enhanceFullscreen);
window.addEventListener("nova-image-viewer-opened", enhanceFullscreen);
setInterval(scan, 500);
app.registerExtension({ name: "NovoLoko.MediaSuite.HistoryNavigation.v326" });
