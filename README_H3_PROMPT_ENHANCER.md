# NovoLoko Prompt Enhancer Pro - H3 Modes

This package adds dedicated MiniMax H3 video handling to **NovoLoko Prompt Enhancer Pro** while keeping the existing Image mode behaviour.

## Target model / prompt format

- **Auto**: Detects H3 Standard fields (`integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`), H3 Full Reference fields (`subject_definitions`, `retention_analysis`, `detailed_description`), and H3 Director markers (`SCENE 1`, `HANDOFF TO NEXT SCENE`, `CONTINUE FROM PREVIOUS SCENE`, `FINAL SHOT`). Other prompts use Image mode.
- **Krea2 / Image**: Uses the original NovoLoko image-enhancement core and image length presets. This is the safe default for older AIO workflows.
- **MiniMax H3 Standard**: Preserves the standard structured MiniMax H3 prompt and its audio fields.
- **MiniMax H3 Full Reference**: Preserves subject definitions, retention analysis, detailed descriptions, identity anchors, and media references.
- **MiniMax H3 Director**: Preserves scene headings, scene-to-scene handoffs, continuation anchors, timing, and the final shot.

Older saved values (`Image`, `H3 Standard`, `H3 Full Reference`, and `H3 Director`) remain accepted and migrate automatically in the interface.

Every H3 mode preserves field names, headings, `<Picture N>` / `<Subject N>` / `<Video N>` / `<Audio N>` labels, CSV-selected instructions, timing, continuity, and audio direction. The old image-generation core is completely omitted.

## H3 length behaviour

- **Preserve** (recommended): Keeps the source length and detail without summarising or padding.
- **Compact**: Removes repetition while retaining every required field and instruction.
- **Detailed**: Adds useful production detail inside the existing structure.

## Recommended H3 settings

- Enhancer CLIP: **qwen3VLInstruct4bHeretic_v10.safetensors**, loaded as `krea2`
- Task Mode: **Auto** or the exact H3 mode
- H3 Length Behavior: **Preserve**
- Creativity: **0.30** (usually `0.25` to `0.35`)
- Max Length: **12000** for long structured prompts
- Thinking: **On**
- Use Default Template: Match the connected text model; turning it off no longer causes image instructions to be used

The 4B CLIP above is only for Prompt Enhancer Pro. Keep the workflow's normal MiniMax H3 text encoder connected to the H3 generation nodes.

For NovoLoko AIO/Krea2 image workflows, choose **Krea2 / Image**. This retains the original image core, image presets, and image length targets.

Custom Instructions are appended after the selected H3 preservation core. The `instructions_used` output always begins with `MODE: IMAGE`, `MODE: H3 STANDARD`, `MODE: H3 FULL REFERENCE`, or `MODE: H3 DIRECTOR` for quick verification.

Enter reusable text in `custom instructions`, choose **Save Current Custom**, and give it a name. The new name appears in **saved custom preset**; selecting it restores the text and switches the image preset to **Custom**. Saved names use ComfyUI browser storage and do not add or shift serialized workflow widgets.

H3 output also passes a practical preservation safety check before it leaves the node. It allows field values and prose to be genuinely rewritten, but rejects missing fields/order, missing reference labels, changed concrete pose/clothing/expression selections, truncated output, broken Director headings, and non-text model failures. The status output begins with `H3 safety fallback` and explains the problem.

## Install

Copy the `ComfyUI-NovoLoko` folder into `ComfyUI/custom_nodes`, replacing the older NovoLoko plugin folder, then restart ComfyUI and refresh its frontend.
