import { app } from "../../scripts/app.js";

const MOJIBAKE_CODEPOINTS = new Set([0x00c2, 0x00c3, 0x00e2, 0x00f0]);
const CP1252_SPECIAL_BYTES = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function mojibakeScore(value) {
    let score = 0;
    for (const character of String(value || "")) {
        const code = character.codePointAt(0);
        if (MOJIBAKE_CODEPOINTS.has(code)) score += 1;
        if (code >= 0x80 && code <= 0x9f) score += 2;
    }
    return score;
}

function decodeMojibakeOnce(value) {
    const bytes = [];
    for (const character of value) {
        const code = character.codePointAt(0);
        if (CP1252_SPECIAL_BYTES.has(code)) {
            bytes.push(CP1252_SPECIAL_BYTES.get(code));
            continue;
        }
        if (code > 0xff) return null;
        bytes.push(code);
    }
    try {
        return UTF8_DECODER.decode(new Uint8Array(bytes));
    } catch {
        return null;
    }
}

function repairVisibleTitle(value) {
    let text = String(value || "");
    const mightBeDamaged = [...text].some((character) => {
        const code = character.codePointAt(0);
        return MOJIBAKE_CODEPOINTS.has(code) || (code >= 0x80 && code <= 0x9f);
    });
    if (!mightBeDamaged) return text;
    for (let pass = 0; pass < 4; pass += 1) {
        const repaired = decodeMojibakeOnce(text);
        if (repaired == null || mojibakeScore(repaired) >= mojibakeScore(text)) break;
        text = repaired;
    }
    return text;
}

function repairNodeTitle(node) {
    if (!node || typeof node.title !== "string") return false;
    const repaired = repairVisibleTitle(node.title);
    if (repaired === node.title) return false;
    node.title = repaired;
    node.setDirtyCanvas?.(true, true);
    return true;
}

function repairGraphTitles(graph = app.graph, visited = new Set()) {
    if (!graph || visited.has(graph)) return false;
    visited.add(graph);
    let changed = false;
    for (const node of graph._nodes || []) {
        changed = repairNodeTitle(node) || changed;
        if (node?.subgraph) changed = repairGraphTitles(node.subgraph, visited) || changed;
    }
    for (const group of graph._groups || []) {
        if (typeof group?.title !== "string") continue;
        const repaired = repairVisibleTitle(group.title);
        if (repaired === group.title) continue;
        group.title = repaired;
        changed = true;
    }
    if (changed) {
        graph.setDirtyCanvas?.(true, true);
        graph.change?.();
    }
    return changed;
}

function scheduleTitleRepair() {
    for (const delay of [0, 80, 350, 900]) {
        setTimeout(() => repairGraphTitles(), delay);
    }
}

app.registerExtension({
    name: "NovoLoko.VisibleWorkflowTextRepair.v390",
    setup() {
        scheduleTitleRepair();
    },
    nodeCreated(node) {
        repairNodeTitle(node);
    },
    loadedGraphNode(node) {
        repairNodeTitle(node);
    },
    afterConfigureGraph() {
        scheduleTitleRepair();
    },
});
