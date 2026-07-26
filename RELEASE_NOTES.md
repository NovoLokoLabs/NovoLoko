# NovoLoko v3.7.1

This hotfix repairs the installed-library selector in the standalone
**🎨 Styles** browser. The server now exposes its package-relative default
library correctly during a real ComfyUI session.

It retains all v3.7.0 improvements:

- square, edge-to-edge style previews and an uncropped large viewer
- double-click to view larger, consistent right-click exit and mouse 4/5
  navigation
- selectable 4, 9, 24 or 50-card pages
- installed CSV/YAML selection in the movable standalone Styles browser
- the compact NovoLoko TTS/Enhancer Control Panel
- Seed Lab manual random, fixed, after-run and recent-seed conveniences
- silent disabled/Off TTS and OmniLoko auto-start for enabled speech

All 34 node IDs, inputs, outputs, socket order, widget order and existing
workflow links remain unchanged.

Run the NovoLokoLabs updater, restart ComfyUI completely, then press `Ctrl+F5`.
