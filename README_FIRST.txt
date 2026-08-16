NOVOLOKO H3 UPDATE - START HERE
===============================

COMPONENT 1: COMFYUI NODE
-------------------------
1. Close ComfyUI Desktop completely.
2. In ComfyUI\custom_nodes, rename your current ComfyUI-NovoLoko folder as a
   backup. Make sure no older ComfyUI-NovaNodes package remains active beside it.
3. Copy this complete ComfyUI-NovoLoko folder into ComfyUI\custom_nodes.
4. Restart ComfyUI Desktop completely. Use Ctrl+F5 once if the node menu is stale.
5. Add NovoLoko > H3 > NovoLoko H3 Prompt Enhancer.
6. Leave Mode on Auto, type a rough prompt, choose any built-in options, and
   connect final_prompt to the positive prompt text input used by your H3 workflow.

The Pose, Clothing, Hair, Expression, Camera, Environment, Lighting, Stability
and Audio / Music dropdowns are built in. Normal users do not need CSV loader
nodes. Leave all *_override sockets disconnected unless you are building an
advanced batch workflow.

The selected_options output is readable JSON. detected_mode reports the format
actually used. After execution, the node shows a concise resolved selection
summary directly on the node.

COMPONENT 2: STANDALONE MEDIA STUDIO
------------------------------------
The separate NovoLoko-H3-Media-Studio package is not installed in custom_nodes.
Extract it anywhere and double-click Launch_H3_Media_Studio.bat.

See README_H3_PROMPT_ENHANCER.txt for node details and the separate Media Studio
README_FIRST.txt for all playback controls and shortcuts.
