"""Build the unified IDEA + CSV Controls NovoLoko Music Lab v4.6.3 workflow."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.5.1.json"
DEFAULT_WORKFLOW = ROOT / "workflows" / "NovoLoko MiniMax Music 3 - Lab v4.6.3.json"
VERSION = "4.6.3"

WRITER_DEFAULTS = {
    "NovaMusicLyricEnhancer": (0.85, 2048),
    "NovaMusicLyricsGenerator": (0.90, 4096),
    "NovaMusicCaptionEnhancer": (0.70, 2048),
}

CATEGORY_NAMES = [
    "genre", "subgenre_era", "mood", "vocal_delivery", "vocal_gender_type",
    "instruments", "production_style", "bpm_tempo", "song_structure", "hook_style",
    "themes", "explicitness", "aggression", "darkness", "rhyme_density", "wordplay",
    "storytelling", "adlibs", "song_length",
]

TIMER_DEFAULTS = {
    "novaTimer_idleColor": "#f3f7ff",
    "novaTimer_runningColor": "#6ee7ff",
    "novaTimer_doneColor": "#9cffbd",
    "novaTimer_errorColor": "#ff7474",
    "novaTimer_statusColor": "#c8d5e5",
    "novaTimer_backgroundColor": "#08101a",
    "novaTimer_borderColor": "#2b5577",
    "novaTimer_displayPreset": "Full Stats",
    "novaTimer_cornerRadius": 5,
    "novaTimer_historyLimit": 20,
    "novaTimer_sound": "Custom: 05 SFX/01 Pack 100/008 - Cash.mp3",
    "novaTimer_volume": 35,
    "novaTimer_showBackground": True,
    "novaTimer_showBorder": True,
    "novaTimer_showStatus": True,
    "novaTimer_showAverage": True,
    "novaTimer_showLast": True,
    "novaTimer_showBest": True,
    "novaTimer_glow": False,
}


def _input(name, value_type, link=None, widget=False, shape=None):
    item = {"label": name, "localized_name": name, "name": name, "type": value_type, "link": link}
    if widget:
        item["widget"] = {"name": name}
    if shape is not None:
        item["shape"] = shape
    return item


def _output(name, value_type):
    return {"label": name, "localized_name": name, "name": name, "type": value_type, "links": []}


def _node(nodes, node_type):
    return next(node for node in nodes.values() if node["type"] == node_type)


def _normalise_control_values(control, idea):
    values = list(control.get("widgets_values") or [])
    old_inputs = list(control.get("inputs") or [])
    expected_old_count = 3 + len(CATEGORY_NAMES)
    # v4.2 accidentally retained a removed `randomize` widget before Genre.
    # Strip only that known legacy shape; do not reinterpret arbitrary data.
    if len(values) == expected_old_count + 1 and str(values[3]).lower() == "randomize":
        values.pop(3)
    widget_names = [item["name"] for item in old_inputs if item.get("widget")]
    mapped = dict(zip(widget_names, values))
    if not mapped and len(values) >= expected_old_count:
        mapped = dict(zip(["preset", "randomize_all", "seed", *CATEGORY_NAMES], values[:expected_old_count]))
    defaults = {
        "preset": "Heavy Rap / Trap / Drill", "randomize_all": False, "seed": 548391,
        "genre": "Hip-Hop / Rap", "subgenre_era": "Modern Trap / Drill",
        "mood": "Menacing and Triumphant", "vocal_delivery": "Deep Aggressive Rap",
        "vocal_gender_type": "Deep Male Lead", "instruments": "808s, Dark Piano and Brass",
        "production_style": "Hard Modern Trap Master", "bpm_tempo": "142 BPM Half-Time",
        "song_structure": "Rap Anthem", "hook_style": "Chanted Crowd Hook",
        "themes": "Cash, Cars, Rivals and Paranoia", "explicitness": "Explicit",
        "aggression": "Maximum Impact", "darkness": "Very Dark",
        "rhyme_density": "Dense Multisyllabic", "wordplay": "Heavy Punchlines",
        "storytelling": "Scene-Based Street Fiction", "adlibs": "Frequent Hype Ad-Libs",
        "song_length": "About 3 Minutes",
    }
    resolved = {key: mapped.get(key, value) for key, value in defaults.items()}
    control["inputs"] = [
        _input("preset", "COMBO", widget=True),
        _input("randomize_all", "BOOLEAN", widget=True),
        _input("seed", "INT", widget=True),
        *[_input(key, "COMBO", widget=True) for key in CATEGORY_NAMES],
        *[_input(f"custom_{key}", "STRING", widget=True) for key in CATEGORY_NAMES],
        _input("allow_random_none", "BOOLEAN", widget=True),
        _input("random_preset_scope", "COMBO", widget=True),
        _input("random_preset_filter", "STRING", widget=True),
        _input("idea", "STRING", widget=True, shape=7),
        _input("control_overrides_json", "STRING", widget=True),
        _input("seed_after_run", "COMBO", widget=True),
    ]
    control["widgets_values"] = [
        resolved["preset"], resolved["randomize_all"], resolved["seed"], "fixed",
        *[resolved[key] for key in CATEGORY_NAMES],
        *[mapped.get(f"custom_{key}", "") for key in CATEGORY_NAMES],
        bool(mapped.get("allow_random_none", False)),
        mapped.get("random_preset_scope", "Off"),
        mapped.get("random_preset_filter", ""),
        idea,
        mapped.get("control_overrides_json", "[]"),
        mapped.get("seed_after_run", "Fixed"),
    ]
    control["title"] = "1 - IDEA + CSV CONTROLS / RANDOMIZE / BATCH REPORT"
    control["pos"] = [-1600, -180]
    control["size"] = [620, 760]
    control.setdefault("properties", {}).update({"ver": VERSION, "novaMusicControlsUI": VERSION})


def _rebuild_link_state(workflow):
    nodes = {node["id"]: node for node in workflow["nodes"]}
    seen_ids = set()
    occupied_inputs = set()
    for node in nodes.values():
        for item in node.get("inputs") or []:
            item["link"] = None
        for item in node.get("outputs") or []:
            item["links"] = []
    for link in workflow["links"]:
        link_id, source_id, source_slot, target_id, target_slot, _link_type = link
        if link_id in seen_ids:
            raise ValueError(f"Duplicate workflow link id {link_id}.")
        seen_ids.add(link_id)
        if source_id not in nodes or target_id not in nodes:
            raise ValueError(f"Link {link_id} references a missing node.")
        source = nodes[source_id]
        target = nodes[target_id]
        if not 0 <= source_slot < len(source.get("outputs") or []):
            raise ValueError(f"Link {link_id} references undefined output {source_id}:{source_slot}.")
        if not 0 <= target_slot < len(target.get("inputs") or []):
            raise ValueError(f"Link {link_id} references undefined input {target_id}:{target_slot}.")
        endpoint = (target_id, target_slot)
        if endpoint in occupied_inputs:
            raise ValueError(f"Multiple links target input {target_id}:{target_slot}.")
        occupied_inputs.add(endpoint)
        source["outputs"][source_slot]["links"].append(link_id)
        target["inputs"][target_slot]["link"] = link_id


def build(source: Path, destination: Path) -> None:
    workflow = json.loads(source.read_text(encoding="utf-8"))
    nodes = {node["id"]: node for node in workflow["nodes"]}

    idea_node = _node(nodes, "NovaMusicIdea")
    idea = str((idea_node.get("widgets_values") or [""])[0] or "")
    control = _node(nodes, "NovaMusicControls")
    _normalise_control_values(control, idea)
    control["outputs"] = [
        _output("music_style_brief", "STRING"),
        _output("lyric_direction", "STRING"),
        _output("section_plan", "STRING"),
        _output("selected_options", "STRING"),
        _output("duration_seconds", "FLOAT"),
        _output("seed_used", "INT"),
        _output("music_idea", "STRING"),
        _output("controls_recipe_json", "STRING"),
    ]
    workflow["nodes"] = [node for node in workflow["nodes"] if node["id"] != idea_node["id"]]
    nodes.pop(idea_node["id"])

    for node_type, (creativity, max_length) in WRITER_DEFAULTS.items():
        node = _node(nodes, node_type)
        # An empty serialized sequence leaves the live schema defaults intact.
        # v4.2's hand-built placeholders shifted enabled/creativity/max_length.
        node["widgets_values"] = []
        node.setdefault("properties", {}).update(
            {
                "novaMusicWriterWidgetMigration": VERSION,
                "novaMusicWriterCreativityDefault": creativity,
                "novaMusicWriterMaxLengthDefault": max_length,
                "novaMusicWriterThinkingDefault": False,
                "ver": VERSION,
            }
        )

    timer = _node(nodes, "NovaGenerationTimer")
    timer.setdefault("properties", {}).update(TIMER_DEFAULTS)
    for runtime_key in ("novaTimerLastMs", "novaTimerOutcome", "novaTimerHistory", "novaTimerStartedAt"):
        timer["properties"].pop(runtime_key, None)

    saver = _node(nodes, "NovaMusicSaveAudioMetadata")
    saver.update(
        {
            "title": "4 - NOVOLOKO SAVE AUDIO + PROMPT METADATA",
            "size": [500, 470],
            # ComfyUI serializes force-input sockets before ordinary widgets.
            # v4.2 wrote widgets first, so resaving moved the sockets but not
            # link targets and produced `undefined.output` in the frontend.
            "inputs": [
                _input("audio", "AUDIO", 22),
                _input("original_idea", "STRING", 64, shape=7),
                _input("selected_options", "STRING", 65, shape=7),
                _input("lyric_direction", "STRING", 66, shape=7),
                _input("lyric_enhancer_brief", "STRING", 67, shape=7),
                _input("final_lyrics", "STRING", 68, shape=7),
                _input("final_music_caption", "STRING", 69, shape=7),
                _input("duration_seconds", "FLOAT", 70),
                _input("stacker_seed", "INT", 71),
                _input("generation_seed", "INT", 72),
                _input("enhancer_model_name", "STRING", shape=7),
                _input("music_model_name", "STRING", shape=7),
                _input("text_encoder_name", "STRING", shape=7),
                _input("vae_name", "STRING", shape=7),
                _input("generation_settings_json", "STRING", shape=7),
                _input("controls_recipe_json", "STRING", 75, shape=7),
                _input("folder_prefix", "STRING", widget=True),
                _input("track_name", "STRING", widget=True),
                _input("save_txt", "BOOLEAN", widget=True),
                _input("save_json", "BOOLEAN", widget=True),
                _input("embed_audio_metadata", "BOOLEAN", widget=True),
                _input("cleanup_after_generation", "BOOLEAN", widget=True),
                _input("audio_format", "COMBO", widget=True),
                _input("model_lifecycle", "COMBO", widget=True),
            ],
            "outputs": [
                _output("audio", "AUDIO"),
                _output("save_report", "STRING"),
                _output("metadata_json", "STRING"),
            ],
            "widgets_values": ["audio/NovoLoko", "Holy808", True, True, True, False, "WAV (24-bit)", "Batch: keep loaded"],
        }
    )
    saver.setdefault("properties", {}).update(
        {"Node name for S&R": "NovaMusicSaveAudioMetadata", "cnr_id": "ComfyUI-NovoLoko", "ver": VERSION}
    )

    memory = _node(nodes, "NovaMemoryManager")
    memory["inputs"][0]["link"] = 73
    memory["widgets_values"] = ["Fast Batch / Reuse", False, False, False, False]
    memory.setdefault("properties", {})["ver"] = VERSION

    player = next((node for node in workflow["nodes"] if node["type"] == "NovaMusicAudioLibrary"), None)
    if player is None:
        player = {
            "id": 47,
            "type": "NovaMusicAudioLibrary",
            "pos": [2110, 300],
            "size": [720, 820],
            "flags": {},
            "order": 14,
            "mode": 0,
            "inputs": [
                _input("refresh_trigger", "STRING", 74),
                _input("folder", "STRING", widget=True),
                _input("auto_play_new", "BOOLEAN", widget=True),
            ],
            "outputs": [_output("library_status", "STRING")],
            "properties": {
                "Node name for S&R": "NovaMusicAudioLibrary", "cnr_id": "ComfyUI-NovoLoko", "ver": VERSION,
                "novaMusicVisualizerEnabled": True, "novaMusicVisualizerStyle": "Neon Waveform",
             "novaMusicVisualizerHeight": 110,
             "novaMusicFavoritesOnly": False,
             "novaMusicLyricsHeight": 220,
            },
            "widgets_values": ["audio/NovoLoko", True],
            "title": "6 - NOVOLOKO AUDIO LIBRARY / PLAYER",
        }
        workflow["nodes"].append(player)
        nodes[player["id"]] = player
    player["size"] = [720, 820]
    player["title"] = "5 - NOVOLOKO AUDIO LIBRARY / PLAYER + VISUALIZER"
    player.setdefault("properties", {}).update(
        {
            "ver": VERSION,
            "novaMusicVisualizerEnabled": True,
            "novaMusicVisualizerStyle": "Neon Waveform",
             "novaMusicVisualizerHeight": 110,
             "novaMusicFavoritesOnly": False,
             "novaMusicLyricsHeight": 220,
        }
    )

    for link in workflow["links"]:
        if link[1] == idea_node["id"] and link[2] == 0:
            link[1], link[2] = control["id"], 6
    workflow["links"] = [link for link in workflow["links"] if link[0] < 64]
    workflow["links"].extend(
        [
            [64, control["id"], 6, saver["id"], 1, "STRING"],
            [65, 2, 3, saver["id"], 2, "STRING"],
            [66, 2, 1, saver["id"], 3, "STRING"],
            [67, 4, 0, saver["id"], 4, "STRING"],
            [68, 5, 0, saver["id"], 5, "STRING"],
            [69, 6, 0, saver["id"], 6, "STRING"],
            [70, 2, 4, saver["id"], 7, "FLOAT"],
            [71, 2, 5, saver["id"], 8, "INT"],
            [72, 2, 5, saver["id"], 9, "INT"],
            [73, saver["id"], 0, memory["id"], 0, "AUDIO"],
            [74, saver["id"], 1, player["id"], 0, "STRING"],
            [75, control["id"], 7, saver["id"], 15, "STRING"],
        ]
    )

    for node_type, title in {
        "NovaMusicLyricEnhancer": "2A - LYRIC IDEA ENHANCER",
        "NovaMusicLyricsGenerator": "2B - STRUCTURED LYRICS GENERATOR",
        "NovaMusicCaptionEnhancer": "2C - MUSIC-ONLY CAPTION ENHANCER",
    }.items():
        _node(nodes, node_type)["title"] = title
    generator = nodes.get(10)
    if generator is not None:
        generator["title"] = "3 - CURRENT COMFYUI MINIMAX MUSIC 3 GENERATOR"

    for group in workflow.get("groups") or []:
        if group.get("id") == 1:
            group["title"] = "1 - UNIFIED IDEA + CSV CONTROLS"
            group["bounding"] = [-1660, -260, 660, 920]

    guide = next((node for node in workflow["nodes"] if node["type"] == "MarkdownNote"), None)
    if guide is not None:
        guide["title"] = "START HERE - COMPLETE MUSIC 3 WORKFLOW GUIDE"
        guide["size"] = [640, 720]
        guide["widgets_values"] = [
        "# NovoLoko MiniMax Music 3 Lab v4.6.3\n\n"
            "## Quick start\n"
            "1. In **1 - IDEA + CSV CONTROLS**, type the song concept, then choose a preset or fine-tune all 19 plain-language controls. Every selected value now shows a one-line explanation. None adds no preference, Custom uses your text, and Random is seed-stable and auditable.\n"
            "2. Queue the workflow. 2A creates a lyric brief, 2B writes tagged MiniMax lyrics, and 2C creates a music-only caption. Thinking defaults Off for speed but remains user-toggleable.\n"
            "3. Read **Last run stage timing** in the unified Controls panel to see enhancer/model load, lyric, lyrics, caption, MiniMax, save and cleanup durations.\n\n"
            "## Seed-only randomization\n"
            "Choose **Next run seed: Randomize after each run** when wanted. Run N uses the seed currently displayed; after successful completion the field shows the new seed that run N+1 will use, with no dummy run. **Randomize all 19** is separate and seed-only mode never changes the 19 control policies.\n\n"
            "## Artist references: Clone vs Like\n"
            "Search an artist name—including Måneskin or Counting Crows—then choose **Artist — Clone** for very strong descriptive DNA or **Artist — Like** for a recognisable but more flexible lane. The artist name is only a search/audit label; generation receives era, vocal, instruments, drum feel, tones, tempo, arrangement, dynamics, hook and mix traits instead. Changing one of the 19 controls overrides only that matching DNA trait.\n\n"
            "## Explicitness\n"
            "**Very Explicit** and **Uncensored** carry a non-negotiable language policy from the resolved control into the final writer prompt even when SONG IDEA is clean. If the first lyric draft is still clean, NovoLoko retries it once with the selected policy. Fictional crime or weapon themes never become real-world instructions.\n\n"
            "## Duration targets\n"
            "Song length choices now cover ~1:30 through ~5:00. The selected duration is wired directly to MiniMax max_duration and also expands the writer section plan. A ~5:00 target requests at least ten substantial sections and instrumental breathing room, but MiniMax may still finish earlier.\n\n"
            "## Reuse an old track\n"
            "Select a track in **Audio Library / Player**, then click **Load Track Recipe**. The original idea, exact 19 choices, None/Custom decisions, random policy and seed load into the nearest unified Controls node without queuing or regenerating.\n\n"
            "## Spoken voice only\n"
            "Open a **Spoken Voice** preset folder for angry, sad, seductive whisper, yelling, ASMR, documentary, podcast, meditation, sermon, emergency broadcast, and other deliveries. These presets explicitly request speech with no singing.\n\n"
            "## Saving and listening\n"
            "The saver writes matched audio + TXT + JSON under **output/audio/NovoLoko**. Choose **One-off: clean after run** when you want writer/models unloaded after one song, or **Batch: keep loaded** for fastest consecutive songs.\n"
            "The Audio Library refreshes after save. Favorite tracks without modifying their audio, filter/sort favorites, and use transport, seek, volume, repeat, shuffle, search, rename, recoverable trash, or Show Selected in Folder.\n"
            "Use **Show Lyrics** and **Estimated Karaoke** for the matched saved lyrics; the Lyrics height control expands the resizable panel while keeping the track list usable. Karaoke timing is an estimate and never moves the canvas.\n"
            "The live visualizer offers six styles. Its Height slider changes the visualizer inside the node, and the node itself can still be resized. The BPM display is a responsive audio-energy estimate, not studio beat-grid analysis.\n\n"
            "## Useful controls\n"
            "Select a NovoLoko node and wheel directly over its seed row to change the seed (Shift = 10, Ctrl = 100). Select a Text Display and wheel over its text to scroll internally. Middle mouse remains normal canvas pan.\n"
            "The final Memory Manager defaults to **Fast Batch / Reuse**, keeping models resident between consecutive songs. Switch it to **Balanced** once at the end of a batch to unload models and clear VRAM."
        ]

    _rebuild_link_state(workflow)
    workflow["last_node_id"] = max(int(workflow.get("last_node_id", 0)), player["id"])
    workflow["last_link_id"] = 75
    workflow["revision"] = int(workflow.get("revision", 0)) + 1
    workflow.setdefault("extra", {})["novolokoMusicLabVersion"] = VERSION
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(workflow, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--destination", type=Path, default=DEFAULT_WORKFLOW)
    args = parser.parse_args()
    build(args.source.resolve(), args.destination.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
