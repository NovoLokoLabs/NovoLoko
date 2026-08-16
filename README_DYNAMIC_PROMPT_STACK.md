# NovoLoko Prompt Stack AIO Pro - Dynamic Slots

## Quick workflow

1. Click **+ Add Slot** for every prompt library choice you want.
2. Optionally type in **Folder search**, choose a `folder`, then choose the
   filtered `file`. **All folders** keeps the complete library visible.
3. Choose `category`, optional entry `search`, and `selection`.
4. Use **Up** and **Down** to set the final prompt order.
5. Turn a slot off to bypass it without losing its settings.
6. Use **Copy** for a quick variation, **Remove** when it is no longer needed,
   and **v / >** to collapse or expand the card.
7. Use **Collapse All** or **Expand All** without changing the outer node size.
   The internal panel can be set to Compact 450 px, Comfortable 520 px or Roomy
   600 px and remains scrollable at every size.

Current Nodes 2.0 and legacy/classic LiteGraph both use the full slot-card panel.
For compatibility, an older classic frontend without the DOM-widget API falls
back to native controls; use each slot's **Slot actions** dropdown there for
collapse, Up, Down, Copy, Remove and per-slot refresh.

Folder paths are discovered recursively below `csv/` and `styles/`. File menus
show concise names where possible; hover a Nodes 2.0 file choice to see its full
relative path. **Refresh Folders + Files + Categories + Entries** rescans every
level without discarding a file choice that is still valid.

The card label is editable and is only for organization. It is never added to
the prompt or `all_names`.

## Outputs

- `combined_prompt`: enabled slot prompts in visible card order, followed by
  `manual_prompt` and `extra_positive` using the existing template behavior.
- `combined_negative`: enabled slot negatives plus `extra_negative` with the
  existing de-duplication behavior.
- `selected_summary`: detailed slot, file and filter information for checking
  what ran.
- `all_names`: only the resolved selected entry names, one per line, in visible
  card order. No paths, categories, searches, labels or manual text are added.

## Existing workflows

Old Medium, Subject, Pose, Action, Clothing, Location and Character values are
read once and converted into dynamic cards when the node loads. The legacy
widgets remain serialized behind the new interface, so old workflow arrays load
without shifting inputs. Save the workflow once after opening it to retain the
new dynamic slot list. Workflows saved before folder navigation existed default
to **All folders** and retain their selected file paths.

Random Every Queue and Random From Seed both work per enabled slot. Each slot
keeps a stable seed identity, so moving it changes prompt order without silently
changing its fixed-seed random choice.
