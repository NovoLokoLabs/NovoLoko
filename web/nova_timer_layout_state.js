export function timerControlsLayoutSize() {
    return { minHeight: 118, minWidth: 1 };
}

export function timerChromeCSS() {
    return `
        .nova-timer-host-v397 {
            background:transparent !important;
            background-color:transparent !important;
            border-color:transparent !important;
            box-shadow:none !important;
            filter:none !important;
            overflow:hidden !important;
        }

        .nova-timer-marker-v318,
        .nova-timer-marker-wrapper-v318 {
            position:absolute !important;
            left:0 !important;
            top:0 !important;
            width:0 !important;
            height:0 !important;
            min-width:0 !important;
            min-height:0 !important;
            padding:0 !important;
            margin:0 !important;
            border:0 !important;
            opacity:0 !important;
            overflow:hidden !important;
            pointer-events:none !important;
        }
    `;
}
