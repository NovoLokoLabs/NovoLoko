import { app } from "../../../scripts/app.js";

function widgetByName(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

function comboSetValues(widget, values) {
  if (!widget || !Array.isArray(values) || values.length === 0) return;
  widget.options = widget.options || {};
  widget.options.values = values;
  if (!values.includes(widget.value)) widget.value = values[0];
  if (typeof widget.callback === "function") {
    try { widget.callback(widget.value); } catch (e) {}
  }
}

function moveWidgetAfter(node, widgetName, afterName) {
  if (!node.widgets) return;
  const wi = node.widgets.findIndex((w) => w.name === widgetName);
  const ai = node.widgets.findIndex((w) => w.name === afterName);
  if (wi < 0 || ai < 0 || wi === ai + 1) return;
  const [w] = node.widgets.splice(wi, 1);
  const newAi = node.widgets.findIndex((x) => x.name === afterName);
  node.widgets.splice(newAi + 1, 0, w);
}

function setWidgetValue(node, name, value) {
  const w = widgetByName(node, name);
  if (w) {
    w.value = value;
    if (typeof w.callback === "function") {
      try { w.callback(value); } catch (e) {}
    }
  }
}

async function refreshNovaCsvDropdown(node) {
  const csv = widgetByName(node, "csv_file_path")?.value || "";
  const search = widgetByName(node, "search")?.value || "";
  const category = widgetByName(node, "category")?.value || "All";
  const refreshId = widgetByName(node, "refresh_id");
  const style = widgetByName(node, "style");
  const categoryWidget = widgetByName(node, "category");

  const isCharacter = String(node.comfyClass || node.type || "").includes("Characters") || String(node.title || "").includes("Characters");
  const kind = isCharacter ? "characters" : "styles";
  const favOnly = widgetByName(node, "mode")?.value === "Favorites Only";
  const url = `/nova_styles_csv_pro/list?csv=${encodeURIComponent(csv)}&search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}&kind=${encodeURIComponent(kind)}&favorites_only=${favOnly ? "true" : "false"}`;
  const resp = await fetch(url, { cache: "no-store" });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || "Unknown NovoLoko CSV refresh error");

  comboSetValues(style, data.styles || []);
  comboSetValues(categoryWidget, data.categories || []);

  if (refreshId) {
    refreshId.value = Math.floor(Date.now() % 999999999);
  }

  const countText = `${data.filtered_count ?? data.styles?.length ?? 0}/${data.count ?? "?"}`;
  const selected = style?.value || "";
  const baseTitle = node.comfyClass?.includes("Characters") || node.type?.includes("Characters")
    ? "NovoLoko Load Characters CSV Pro"
    : "NovoLoko Load Styles CSV Pro";
  node.title = `${baseTitle} — ${countText}${selected ? " — " + selected : ""}`;

  node.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

function isNovaCsvLoader(nodeData) {
  const name = String(nodeData?.name || "");
  const display = String(nodeData?.display_name || "");
  return name === "LoadStylesCSVPro"
    || name.startsWith("NovaLoadStylesCSVPro")
    || name.startsWith("NovaLoadCharactersCSVPro")
    || display.includes("NovoLoko Load Styles CSV Pro")
    || display.includes("NovoLoko Load Characters CSV Pro");
}

app.registerExtension({
  name: "NovoLoko.RealRefreshButton.v06",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!isNovaCsvLoader(nodeData)) return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const ret = origOnNodeCreated?.apply(this, arguments);

      const already = this.widgets?.some((w) => w.name === "nova_refresh_button");
      if (!already) {
        const button = this.addWidget("button", "↻ REFRESH CSV LIST", "", async () => {
          const oldTitle = this.title;
          this.title = "NovoLoko CSV — refreshing...";
          app.graph?.setDirtyCanvas?.(true, true);
          try {
            await refreshNovaCsvDropdown(this);
          } catch (err) {
            console.error("NovoLoko CSV refresh failed:", err);
            this.title = oldTitle || this.title;
            alert(`NovoLoko CSV refresh failed:\n${err.message || err}`);
          }
        }, { serialize: false });
        button.name = "nova_refresh_button";
        moveWidgetAfter(this, "nova_refresh_button", "csv_file_path");
      } else {
        moveWidgetAfter(this, "nova_refresh_button", "csv_file_path");
      }

      // Make it obvious the JS loaded even before the user clicks the button.
      if (!String(this.title || "").includes("↻")) {
        this.title = `${this.title || nodeData.display_name || nodeData.name} ↻`;
      }

      this.setDirtyCanvas?.(true, true);
      app.graph?.setDirtyCanvas?.(true, true);
      return ret;
    };
  },
});

console.log("NovoLoko v1.1 refresh button loaded for all style/character loader aliases");
