// Shared Precision Align zoom engine for NovoLoko Compare Studio and Media Studio.
// Pan values are stored in source-image pixels. This module solves each zoom
// step from the actual rendered image rectangles, so different resolutions and
// aspect ratios cannot drift apart.

function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

export function precisionHalves(rect, orientation, inset = 0) {
    const horizontal = String(orientation).toLowerCase() === "horizontal";
    const left = rect.left + inset;
    const top = rect.top + inset;
    const width = Math.max(1, rect.width - inset * 2);
    const height = Math.max(1, rect.height - inset * 2);
    if (horizontal) {
        return [
            { left, top, width, height: height / 2 },
            { left, top: top + height / 2, width, height: height / 2 },
        ];
    }
    return [
        { left, top, width: width / 2, height },
        { left: left + width / 2, top, width: width / 2, height },
    ];
}

export function precisionImageGeometry(image, half, panX, panY, zoom) {
    const naturalWidth = Math.max(1, Number(image?.naturalWidth || image?.width || 1));
    const naturalHeight = Math.max(1, Number(image?.naturalHeight || image?.height || 1));
    const fit = Math.min(half.width / naturalWidth, half.height / naturalHeight);
    const scale = Math.max(0.000001, fit * Math.max(0.0001, Number(zoom) || 1));
    const width = naturalWidth * scale;
    const height = naturalHeight * scale;
    const centreX = half.left + half.width / 2;
    const centreY = half.top + half.height / 2;
    const left = centreX - width / 2 + Number(panX || 0) * scale;
    const top = centreY - height / 2 + Number(panY || 0) * scale;
    return { naturalWidth, naturalHeight, fit, scale, width, height, left, top, centreX, centreY };
}

function sourcePointAtAnchor(geometry, anchor) {
    return {
        x: (anchor.x - geometry.left) / geometry.scale,
        y: (anchor.y - geometry.top) / geometry.scale,
    };
}

function panForSourcePoint(image, half, sourcePoint, anchor, zoom) {
    const naturalWidth = Math.max(1, Number(image?.naturalWidth || image?.width || 1));
    const naturalHeight = Math.max(1, Number(image?.naturalHeight || image?.height || 1));
    const fit = Math.min(half.width / naturalWidth, half.height / naturalHeight);
    const scale = Math.max(0.000001, fit * Math.max(0.0001, Number(zoom) || 1));
    const centreX = half.left + half.width / 2;
    const centreY = half.top + half.height / 2;
    return {
        x: (anchor.x - centreX + naturalWidth * scale / 2 - sourcePoint.x * scale) / scale,
        y: (anchor.y - centreY + naturalHeight * scale / 2 - sourcePoint.y * scale) / scale,
    };
}

export function zoomPrecisionAtPointerLocked({
    images,
    halves,
    pans,
    orientation,
    clientX,
    clientY,
    oldZoom,
    newZoom,
    linkBoth,
}) {
    const horizontal = String(orientation).toLowerCase() === "horizontal";
    const activeIndex = horizontal
        ? (clientY < halves[1].top ? 0 : 1)
        : (clientX < halves[1].left ? 0 : 1);
    const active = halves[activeIndex];

    const nx = clamp((clientX - active.left) / Math.max(1, active.width), 0, 1);
    const ny = clamp((clientY - active.top) / Math.max(1, active.height), 0, 1);
    const oppositeNX = horizontal ? nx : 1 - nx;
    const oppositeNY = horizontal ? 1 - ny : ny;
    const normalized = activeIndex === 0
        ? [{ x: nx, y: ny }, { x: oppositeNX, y: oppositeNY }]
        : [{ x: oppositeNX, y: oppositeNY }, { x: nx, y: ny }];
    const anchors = halves.map((half, index) => ({
        x: half.left + normalized[index].x * half.width,
        y: half.top + normalized[index].y * half.height,
    }));

    const output = {
        panAX: Number(pans.panAX || 0),
        panAY: Number(pans.panAY || 0),
        panBX: Number(pans.panBX || 0),
        panBY: Number(pans.panBY || 0),
        activeIndex,
        anchors,
    };

    for (const index of [0, 1]) {
        if (!linkBoth && index !== activeIndex) continue;
        const image = images[index];
        if (!image) continue;
        const panX = index === 0 ? output.panAX : output.panBX;
        const panY = index === 0 ? output.panAY : output.panBY;
        const geometry = precisionImageGeometry(image, halves[index], panX, panY, oldZoom);
        const sourcePoint = sourcePointAtAnchor(geometry, anchors[index]);
        const solved = panForSourcePoint(image, halves[index], sourcePoint, anchors[index], newZoom);
        if (index === 0) {
            output.panAX = solved.x;
            output.panAY = solved.y;
        } else {
            output.panBX = solved.x;
            output.panBY = solved.y;
        }
    }
    return output;
}
