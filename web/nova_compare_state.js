function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value)));
}

export function migrateCompareGlobalGuideSettings(stored = {}, defaults = {}) {
    const guide = Boolean(stored.guide ?? defaults.guide ?? true);
    const lineOpacity = clamp(
        stored.lineOpacity ?? defaults.lineOpacity ?? 100,
        0,
        100,
    );
    return {
        ...stored,
        guide,
        lineOpacity,
        fullscreenGuide: Boolean(stored.fullscreenGuide ?? guide),
        fullscreenLineOpacity: clamp(
            stored.fullscreenLineOpacity ?? lineOpacity,
            0,
            100,
        ),
    };
}

export function migrateCompareFullscreenProperties(
    properties = {},
    sourceProperties = null,
    defaults = {},
) {
    const next = { ...properties };
    const source = sourceProperties || properties;
    const fullscreenGuideMissing = sourceProperties
        ? sourceProperties.novaCompareFullscreenGuide == null
        : next.novaCompareFullscreenGuide == null;
    const fullscreenLineMissing = sourceProperties
        ? sourceProperties.novaCompareFullscreenLineOpacity == null
        : next.novaCompareFullscreenLineOpacity == null;
    if (fullscreenGuideMissing) {
        next.novaCompareFullscreenGuide = Boolean(
            source.novaCompareGuide
            ?? next.novaCompareGuide
            ?? defaults.guide
            ?? true,
        );
    }
    if (fullscreenLineMissing) {
        next.novaCompareFullscreenLineOpacity = clamp(
            source.novaCompareLineOpacity
            ?? next.novaCompareLineOpacity
            ?? Number(defaults.lineOpacity ?? 100) / 100,
            0,
            1,
        );
    }
    return next;
}

export function readCompareSurfaceGuide(properties = {}, globalSettings = {}, surface = "node") {
    const fullscreen = surface === "fullscreen";
    const guideProperty = fullscreen
        ? properties.novaCompareFullscreenGuide
        : properties.novaCompareGuide;
    const lineProperty = fullscreen
        ? properties.novaCompareFullscreenLineOpacity
        : properties.novaCompareLineOpacity;
    const guideDefault = fullscreen
        ? globalSettings.fullscreenGuide
        : globalSettings.guide;
    const lineDefault = fullscreen
        ? globalSettings.fullscreenLineOpacity
        : globalSettings.lineOpacity;
    return {
        guide: Boolean(guideProperty ?? guideDefault ?? true),
        lineOpacity: clamp(
            lineProperty == null ? (lineDefault ?? 100) : Number(lineProperty) * 100,
            0,
            100,
        ),
    };
}

export function persistCompareSurfaceGuide(
    globalSettings = {},
    surface = "node",
    guide = true,
    lineOpacity = 100,
) {
    const fullscreen = surface === "fullscreen";
    const normalizedLine = clamp(lineOpacity, 0, 100);
    return {
        globalSettings: {
            ...globalSettings,
            ...(fullscreen
                ? {
                    fullscreenGuide: Boolean(guide),
                    fullscreenLineOpacity: normalizedLine,
                }
                : {
                    guide: Boolean(guide),
                    lineOpacity: normalizedLine,
                }),
        },
        propertyPatch: fullscreen
            ? {
                novaCompareFullscreenGuide: Boolean(guide),
                novaCompareFullscreenLineOpacity: normalizedLine / 100,
            }
            : {
                novaCompareGuide: Boolean(guide),
                novaCompareLineOpacity: normalizedLine / 100,
            },
    };
}

export function compareGuideRenderState(state = {}, includeGuide = true) {
    const split = state.mode === "Split";
    const guide = Boolean(state.guide);
    const lineOpacity = clamp(state.lineOpacity ?? 100, 0, 100) / 100;
    return {
        drawDivider: Boolean(split && includeGuide && guide && lineOpacity > 0),
        drawHandle: Boolean(split && includeGuide && guide),
        dragHitActive: split,
        lineOpacity,
    };
}
