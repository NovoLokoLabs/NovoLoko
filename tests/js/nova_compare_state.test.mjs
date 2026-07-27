import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperSource = await readFile(process.argv[2], "utf8");
const helper = await import(
    `data:text/javascript;base64,${Buffer.from(helperSource).toString("base64")}`
);

const {
    compareGuideRenderState,
    migrateCompareFullscreenProperties,
    migrateCompareGlobalGuideSettings,
    persistCompareSurfaceGuide,
    readCompareSurfaceGuide,
} = helper;

const initialGlobals = {
    guide: true,
    lineOpacity: 20,
    fullscreenGuide: false,
    fullscreenLineOpacity: 80,
};
const initialProperties = {
    novaCompareGuide: true,
    novaCompareLineOpacity: 0.2,
    novaCompareFullscreenGuide: false,
    novaCompareFullscreenLineOpacity: 0.8,
};

const nodeOff = compareGuideRenderState(
    { mode: "Split", guide: false, lineOpacity: 100 },
    true,
);
assert.equal(nodeOff.drawDivider, true, "node Guide Off must leave the independent split line visible");
assert.equal(nodeOff.drawHandle, false, "node Guide Off must hide the handle");
assert.equal(nodeOff.dragHitActive, true, "Guide Off must retain the invisible drag hit area");

const fullscreenOff = compareGuideRenderState(
    { mode: "Split", guide: false, lineOpacity: 100 },
    true,
);
assert.equal(fullscreenOff.drawDivider, true, "fullscreen Guide Off must leave the independent split line visible");
assert.equal(fullscreenOff.drawHandle, false, "fullscreen Guide Off must prevent handle drawing");
assert.equal(fullscreenOff.dragHitActive, true, "fullscreen split dragging must remain active");

const guideAtZero = compareGuideRenderState(
    { mode: "Split", guide: true, lineOpacity: 0 },
    true,
);
assert.equal(guideAtZero.drawDivider, false, "0% line opacity must suppress the divider");
assert.equal(guideAtZero.drawHandle, true, "line opacity must not hide the guide handle");

for (const operation of ["copy", "save"]) {
    const nodeGuide = readCompareSurfaceGuide(
        { ...initialProperties, novaCompareGuide: false },
        initialGlobals,
        "node",
    );
    assert.equal(
        compareGuideRenderState({ mode: "Split", ...nodeGuide }, true).drawDivider,
        true,
        `node ${operation} must retain the independent line with Guide Off`,
    );

    const fullscreenGuide = readCompareSurfaceGuide(
        { ...initialProperties, novaCompareFullscreenGuide: false },
        initialGlobals,
        "fullscreen",
    );
    assert.equal(
        compareGuideRenderState({ mode: "Split", ...fullscreenGuide }, true).drawDivider,
        true,
        `fullscreen ${operation} must retain the independent line with Guide Off`,
    );
}

const guideOffAtZero = compareGuideRenderState(
    { mode: "Split", guide: false, lineOpacity: 0 },
    true,
);
assert.equal(guideOffAtZero.drawDivider, false, "0% line opacity must hide the independent divider");
assert.equal(guideOffAtZero.drawHandle, false, "Guide Off must keep the handle hidden");
assert.equal(guideOffAtZero.dragHitActive, true, "0% line and Guide Off must still allow split dragging");

const fullscreenChange = persistCompareSurfaceGuide(
    initialGlobals,
    "fullscreen",
    true,
    35,
);
const afterFullscreenProperties = {
    ...initialProperties,
    ...fullscreenChange.propertyPatch,
};
assert.equal(afterFullscreenProperties.novaCompareGuide, true);
assert.equal(afterFullscreenProperties.novaCompareLineOpacity, 0.2);
assert.equal(fullscreenChange.globalSettings.guide, true);
assert.equal(fullscreenChange.globalSettings.lineOpacity, 20);
assert.equal(fullscreenChange.globalSettings.fullscreenGuide, true);
assert.equal(fullscreenChange.globalSettings.fullscreenLineOpacity, 35);
assert.deepEqual(
    readCompareSurfaceGuide({}, fullscreenChange.globalSettings, "node"),
    { guide: true, lineOpacity: 20 },
    "fullscreen changes must not alter defaults for a newly created node surface",
);

const nodeChange = persistCompareSurfaceGuide(
    fullscreenChange.globalSettings,
    "node",
    false,
    61,
);
const independentlySaved = {
    ...afterFullscreenProperties,
    ...nodeChange.propertyPatch,
};
assert.equal(independentlySaved.novaCompareFullscreenGuide, true);
assert.equal(independentlySaved.novaCompareFullscreenLineOpacity, 0.35);
assert.equal(nodeChange.globalSettings.fullscreenGuide, true);
assert.equal(nodeChange.globalSettings.fullscreenLineOpacity, 35);
assert.deepEqual(
    readCompareSurfaceGuide({}, nodeChange.globalSettings, "fullscreen"),
    { guide: true, lineOpacity: 35 },
    "node changes must not alter defaults for a newly created fullscreen surface",
);

const workflowReload = JSON.parse(JSON.stringify(independentlySaved));
assert.deepEqual(
    readCompareSurfaceGuide(workflowReload, nodeChange.globalSettings, "node"),
    { guide: false, lineOpacity: 61 },
);
assert.deepEqual(
    readCompareSurfaceGuide(workflowReload, nodeChange.globalSettings, "fullscreen"),
    { guide: true, lineOpacity: 35 },
);

const migratedWorkflow = migrateCompareFullscreenProperties(
    {
        novaCompareGuide: false,
        novaCompareLineOpacity: 0.42,
        novaCompareFullscreenGuide: true,
        novaCompareFullscreenLineOpacity: 0.96,
    },
    { novaCompareGuide: false, novaCompareLineOpacity: 0.42 },
    { guide: true, lineOpacity: 96 },
);
assert.equal(migratedWorkflow.novaCompareFullscreenGuide, false);
assert.equal(migratedWorkflow.novaCompareFullscreenLineOpacity, 0.42);

const migratedGlobals = migrateCompareGlobalGuideSettings(
    { guide: false, lineOpacity: 27 },
    { guide: true, lineOpacity: 96 },
);
assert.equal(migratedGlobals.fullscreenGuide, false);
assert.equal(migratedGlobals.fullscreenLineOpacity, 27);

console.log("NovoLoko Compare executable frontend state tests passed.");
