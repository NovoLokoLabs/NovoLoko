# NovoLoko v3.9.5

This patch release corrects Compare Studio's divider semantics and finishes the
Notes repair for ComfyUI Nodes 2.0:

- makes the **Line** opacity slider independently control the visible split
  divider in the node preview and full-screen viewer
- makes **Guide On/Off** show or hide only the circular drag handle
- keeps the invisible split drag area active when Guide is off or Line is 0%
- applies the initiating surface's independent Guide/Line values to clipboard
  copies and saved exports
- detects the connected native Note textarea in both legacy LiteGraph and
  Nodes 2.0 instead of reusing Nodes 2.0's detached legacy `inputEl`
- waits for the Nodes 2.0 Vue host before creating a single fallback editor
- preserves multiline Note text and manual dimensions through serialization
  and reload without changing the original serialized widget
- adds executable frontend regression tests for Compare render decisions and
  Notes mount/serialization decisions

All 34 serialized node IDs, inputs, outputs, socket order and widget order remain
unchanged. No supplied user workflow, preview, favourite, seed history, media or
other personal runtime data is included in the release.

Close and restart ComfyUI Desktop completely after installing the update so its
embedded frontend loads the v3.9.5 JavaScript files.
