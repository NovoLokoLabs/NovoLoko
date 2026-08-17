"""Unified NovoLoko custom node package: CSV, prompts, overlays, compare, Whisper and Kokoro."""

from pathlib import Path

from .nodes import (
    NODE_CLASS_MAPPINGS as CORE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as CORE_NODE_DISPLAY_NAME_MAPPINGS,
    NOVA_VERSION,
)
from .voice_nodes import (
    NODE_CLASS_MAPPINGS as VOICE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as VOICE_NODE_DISPLAY_NAME_MAPPINGS,
)
# Media Studio saves the new entry during execution, then the existing frontend
# refreshes older history through the HTTP history route after the node returns.
from . import media_history_runtime as _media_history_runtime  # noqa: F401
from . import lokobridge_nodes as _lokobridge_nodes
from .lokobridge_nodes import (
    NODE_CLASS_MAPPINGS as LOKOBRIDGE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as LOKOBRIDGE_NODE_DISPLAY_NAME_MAPPINGS,
)
from .omniloko_autostart import install as _install_omniloko_autostart
from .unified_voice_node import (
    NODE_CLASS_MAPPINGS as UNIFIED_VOICE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as UNIFIED_VOICE_NODE_DISPLAY_NAME_MAPPINGS,
)
from .aio_prompt_stack import (
    NODE_CLASS_MAPPINGS as AIO_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as AIO_NODE_DISPLAY_NAME_MAPPINGS,
)
from .nova_compare import (
    NODE_CLASS_MAPPINGS as COMPARE_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as COMPARE_NODE_DISPLAY_NAME_MAPPINGS,
)
from .nova_workflow import (
    NODE_CLASS_MAPPINGS as WORKFLOW_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as WORKFLOW_NODE_DISPLAY_NAME_MAPPINGS,
)
from .nova_core_nodes import (
    NODE_CLASS_MAPPINGS as NOVA_CORE_REPLACEMENT_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as NOVA_CORE_REPLACEMENT_DISPLAY_MAPPINGS,
)
from .nova_lora_stack import (
    NODE_CLASS_MAPPINGS as LORA_STACK_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as LORA_STACK_NODE_DISPLAY_NAME_MAPPINGS,
)
from .nova_workflow_presentation import (
    NODE_CLASS_MAPPINGS as PRESENTATION_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as PRESENTATION_NODE_DISPLAY_NAME_MAPPINGS,
)
from .h3_prompt_enhancer import (
    NODE_CLASS_MAPPINGS as H3_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as H3_NODE_DISPLAY_NAME_MAPPINGS,
)
from .music3_nodes import (
    NODE_CLASS_MAPPINGS as MUSIC3_NODE_CLASS_MAPPINGS,
    NODE_DISPLAY_NAME_MAPPINGS as MUSIC3_NODE_DISPLAY_NAME_MAPPINGS,
)
# Music Data v2 patches the existing Music 3 class/functions in place. It adds
# no sockets or serialized widgets, so old workflows keep the same contract.
from . import music3_data_v2 as _music3_data_v2  # noqa: F401
from . import music3_data_v2_rules as _music3_data_v2_rules  # noqa: F401
from . import music3_data_v2_depth as _music3_data_v2_depth  # noqa: F401

# Keep schema/voice dropdown probes passive, but auto-start OmniLoko when an
# actual TTS execution needs it.
_install_omniloko_autostart(_lokobridge_nodes)

# The previous long title forced LiteGraph to keep the VRAM cleanup node much
# wider than its controls require.
NOVA_CORE_REPLACEMENT_DISPLAY_MAPPINGS["NovaMemoryManager"] = "NovoLoko Memory Manager"

NODE_CLASS_MAPPINGS = {}
NODE_CLASS_MAPPINGS.update(CORE_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(VOICE_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(LOKOBRIDGE_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(UNIFIED_VOICE_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(AIO_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(COMPARE_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(WORKFLOW_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(NOVA_CORE_REPLACEMENT_MAPPINGS)
NODE_CLASS_MAPPINGS.update(LORA_STACK_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(PRESENTATION_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(H3_NODE_CLASS_MAPPINGS)
NODE_CLASS_MAPPINGS.update(MUSIC3_NODE_CLASS_MAPPINGS)

NODE_DISPLAY_NAME_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS.update(CORE_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(VOICE_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(LOKOBRIDGE_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(UNIFIED_VOICE_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(AIO_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(COMPARE_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(WORKFLOW_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(NOVA_CORE_REPLACEMENT_DISPLAY_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(LORA_STACK_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(PRESENTATION_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(H3_NODE_DISPLAY_NAME_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS.update(MUSIC3_NODE_DISPLAY_NAME_MAPPINGS)

WEB_DIRECTORY = "./web"
try:
    __version__ = Path(__file__).with_name("RELEASE_VERSION").read_text(encoding="utf-8").strip() or NOVA_VERSION
except OSError:
    __version__ = NOVA_VERSION

print(f"[ComfyUI-NovoLoko] Unified NovoLoko v{__version__}: {len(NODE_CLASS_MAPPINGS)} node mappings loaded")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY", "__version__"]
