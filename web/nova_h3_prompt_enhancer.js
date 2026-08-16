import { app } from "../../scripts/app.js";

const NODE_ID = "NovaH3PromptEnhancer";

app.registerExtension({
    name: "NovoLoko.H3PromptEnhancer",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name !== NODE_ID) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            this.color = this.color || "#15334a";
            this.bgcolor = this.bgcolor || "#0c1f2d";
            if (typeof this.addWidget === "function" && !this.__novolokoH3SummaryWidget) {
                const widget = this.addWidget(
                    "text",
                    "Selection summary",
                    "Run once to show the resolved H3 choices",
                    () => {},
                    { serialize: false },
                );
                widget.disabled = true;
                widget.options = { ...(widget.options || {}), serialize: false };
                this.__novolokoH3SummaryWidget = widget;
            }
            return result;
        };

        const originalExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = originalExecuted?.apply(this, arguments);
            const value = Array.isArray(message?.h3_selection_summary)
                ? message.h3_selection_summary[0]
                : message?.h3_selection_summary;
            if (this.__novolokoH3SummaryWidget && value) {
                this.__novolokoH3SummaryWidget.value = String(value);
                this.setDirtyCanvas?.(true, true);
            }
            return result;
        };
    },
});
