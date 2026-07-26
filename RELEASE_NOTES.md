# NovoLoko v3.8.0

This release focuses on readable workflows and consistent UI sizing:

- style cards keep a useful square size and scroll on 24, 50, 100 or All pages
- standalone Styles browsing can target the intended Prompt Stack or Style
  Loader when switching CSV/YAML libraries
- every NovoLoko node can be manually resized to a smaller minimum without
  overwriting saved dimensions
- Compare Studio uses its selected frontend theme instead of stale blue
  workflow colours
- visible node and group-title mojibake is repaired in the current workflow
- 498 organized completion sounds are bundled for Generation Timer under
  `data/NovoLokoTimerSounds`
- AIO and Compare Studio workflows are refreshed for v3.8.0

All 34 serialized node IDs, inputs, outputs, socket order and widget order are
unchanged. The cleaned AIO workflow preserves its existing links.

Close ComfyUI, run the NovoLokoLabs updater, restart ComfyUI completely and
press `Ctrl+F5`.
