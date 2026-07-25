# NovoLoko visual style previews

Preview images are optional, private local files. They are stored under:

```text
ComfyUI-NovoLoko/data/style_previews/
```

That folder is ignored by Git and is not included in NovoLoko releases. The
one-click updater overlays program files, so existing preview images remain in
place across updates.

## Add one image

1. Open **Browse styles visually...** on the CSV Style Loader, or open the
   browser from Prompt Stack.
2. Select the style card.
3. Choose 512 or 1024 in **Preview size**.
4. Click **Add / replace image** and select a PNG, JPEG or WebP image.

NovoLoko centre-crops and resizes the image to an exact square WebP. Use
**Remove image** to return that card to its generated colour swatch.

## Populate a complete folder

Drag an image folder onto `POPULATE_STYLE_PREVIEWS.bat`.

- **Filename mode** matches image filenames to clean style names. For example,
  `Anime Style.png` matches `0001 | Anime Style`.
- **Ordered mode** sorts the images by filename and pairs them with the style
  library in its existing order. Use zero-padded names such as `000001.png`.
- Choose 512x512 for a smaller, faster library or 1024x1024 for sharper cards.
- Existing previews are replaced by the batch tool.

The batch tool imports existing images; it does not choose a checkpoint or
generate model images. To generate a full set, queue your chosen ComfyUI image
workflow with the style names/prompts, save images by style name or numbered
order, and then drag that output folder onto the batch file.

Command-line use:

```powershell
POPULATE_STYLE_PREVIEWS.bat "<image-folder>" "styles/novoloko_all_yaml_styles.yaml" 512 name
```

The browser never exposes source-image paths. Only opaque preview identifiers
are sent to the ComfyUI frontend.

## Generate directly from the current workflow

Open the visual browser from Prompt Stack or a CSV/YAML Style Loader, select a
style, then click **Generate + save preview**. NovoLoko applies that exact style,
queues the current ComfyUI workflow, waits for its final image output and saves
it onto the selected card at the chosen 512 or 1024 preview size.

The standalone browser can do the same when the workflow contains one compatible
Prompt Stack or Style Loader. If there are several compatible nodes, select the
intended node first or open the browser from that node. A failed workflow or a
workflow with no image output never replaces the existing preview.

## View a larger preview

Select a card with a stored image and click **View larger**. The image opens
uncropped in a full-screen viewer. Use **Actual size** to display one stored
image pixel per screen pixel, **Fit to window** to return to the complete-image
view, the mouse wheel or Zoom buttons to inspect details, and left- or
middle-drag to pan while zoomed. Previous/Next, the arrow keys and mouse buttons
4/5 move between saved previews. Right-click, Escape, the Close button or the
dark area outside exits the viewer.

Use **Refresh** to reload the current CSV/YAML and preview set. **Options**
remembers whether a newly generated image opens automatically, whether viewer
navigation wraps at the ends, and whether right-click closes the viewer.
Double-clicking a style card generates that exact style when no preview is
already running.

## Generate a complete CSV/YAML library

Open the visual browser from Prompt Stack, a Style Loader, or the movable
floating **Styles** launcher. Choose 512 or 1024 previews, then click
**Generate all missing**.

NovoLoko counts every style without a saved preview and warns before starting
because a large library can require many workflow runs. Runs are queued one at
a time. Existing previews are not replaced. While running, click **Stop
generating** to interrupt the active preview. That control remains available if
the browser is closed and reopened, and a later run resumes by processing only
the styles still missing previews.
