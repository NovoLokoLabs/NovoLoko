NOVOLOKO H3 PROMPT ENHANCER
===========================

After installing ComfyUI-NovoLoko, add:
  NovoLoko > H3 > NovoLoko H3 Prompt Enhancer

NORMAL USE
1. Leave Mode on Auto, or choose the exact H3 format you want.
2. Type a rough idea in raw_prompt.
3. Pick any Pose, Clothing, Hair, Expression, Camera, Environment, Lighting,
   Stability and Audio / Music options you want.
4. Connect final_prompt to the positive prompt input used by your H3 workflow.

No external CSV loader nodes are needed. Choose "None / Keep prompt unchanged"
for any category you do not want to add.

ADVANCED OVERRIDES
The nine *_override STRING sockets are optional. Leave them disconnected for
normal use. A connected non-empty socket replaces only its matching dropdown;
an empty or disconnected socket never errors and uses the dropdown normally.

OUTPUTS
- final_prompt: structured H3 prompt with each chosen CSV sentence preserved
- selected_options: readable JSON containing the resolved source/text
- detected_mode: Standard H3, Director 4 Scenes, or Full Reference / Video Edit
