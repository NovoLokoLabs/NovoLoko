import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperSource = await readFile(process.argv[2], "utf8");
const helper = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);

const {
    findNoteSourceWidget,
    isCompatibleNoteType,
    noteInstallDecision,
    noteSerializationPatch,
    readNoteValue,
} = helper;

assert.equal(isCompatibleNoteType("Note"), true);
assert.equal(isCompatibleNoteType("Markdown Note"), true);
assert.equal(isCompatibleNoteType("MarkdownNote"), true);
assert.equal(isCompatibleNoteType("NovaTextDisplay"), false);

const source = { name: "text", type: "STRING", value: "saved note" };
assert.equal(
    findNoteSourceWidget([{ name: "other" }, source]),
    source,
    "the original serialised text widget must remain authoritative",
);
assert.equal(readNoteValue(source, { text: "stale" }), "saved note");
assert.deepEqual(
    noteSerializationPatch("edited note", { colour: "yellow" }),
    { colour: "yellow", text: "edited note" },
);

assert.equal(
    noteInstallDecision({ nodeType: "Note", hasSourceWidget: false }),
    "retry",
    "Nodes 2.0 may create the source widget after nodeCreated",
);
assert.equal(
    noteInstallDecision({
        alternateType: "MarkdownNote",
        hasSourceWidget: true,
        hasNativeEditor: true,
    }),
    "reuse-native",
    "the native textarea must be repaired instead of hidden or duplicated",
);
assert.equal(
    noteInstallDecision({
        nodeType: "Note",
        hasSourceWidget: true,
        canAddDOMWidget: true,
    }),
    "create-fallback",
    "a DOM fallback is required only when the original widget has no textarea",
);
assert.equal(
    noteInstallDecision({
        nodeType: "Note",
        installed: true,
        hasSourceWidget: true,
        canAddDOMWidget: true,
    }),
    "installed",
    "delayed retries must never create duplicate editors",
);

console.log("NovoLoko Notes executable compatibility state tests passed.");
