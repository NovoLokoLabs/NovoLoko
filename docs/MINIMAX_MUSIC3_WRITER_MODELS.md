# MiniMax Music 3 writer-model A/B setup

NovoLoko keeps `minimax_music3_text_encoder_pruned_int8_convrot.safetensors` on
the native MiniMax conditioning path. The optional models below replace only the
creative writer feeding stages 3A, 3B and 3C.

## Why the optional loader uses Ollama/GGUF

ComfyUI's `CLIPLoader` with type `krea2` is tied to the Qwen3-VL encoder shape.
Generic text-only Qwen3/Qwen3.5 and Gemma safetensors are not drop-in compatible.
Ollama supplies the complete autoregressive runtime NovoLoko needs: tokenizer,
chat template, KV cache, causal token generation, GPU-layer placement and model
lifecycle. The loader therefore avoids the very slow or failed path seen when
a text encoder is treated as a generative language model.
The `NovoLoko Music Writer Loader (Ollama GGUF)` node provides the same generative
`CLIP` connection expected by the three existing writer nodes, while leaving the
old Qwen3-VL safetensors workflow valid and untouched.

All requests are fixed to local loopback `127.0.0.1:11434`. Thinking defaults Off.
The frontend queries `/api/tags` through NovoLoko, refreshes automatically, and
shows friendly **FAST**, **BALANCED** and **GEMMA** labels beside the real model
name. Missing recommended aliases are status messages, not hard failures: any
compatible local Ollama model can be selected. A manual model name is available
only under the advanced fallback.

## Direct ComfyUI-GGUF investigation

The installed `ComfyUI-GGUF`, `ComfyUI-GGUF_Forked` and `ComfyUI-GGUF-main`
packages were inspected for a comparable causal writer path. Their registered
GGUF nodes are UNet/diffusion and CLIP/Dual/Triple/Quad text-encoder loaders.
They return ComfyUI model patchers or CLIP conditioning objects; none exposes a
standalone autoregressive generation node with tokenizer loading, chat-template
application, KV-cache decoding and a `generate`/token-decode interface suitable
for stages 3A, 3B and 3C.

v4.6.4 also found and audited the installed `multimodal-llm-comfyui-node`. Unlike
the encoder-only GGUF packages, it contains a genuine text-only causal path:
`llama_cpp.Llama`, `create_chat_completion`, chat-template forwarding, streaming
token decode, seed forwarding and `run_gguf_plain_text_chat`. That is the right
architecture for a fair direct test.

The installed runtime cannot execute it. Importing `llama_cpp` with the exact
embedded ComfyUI Python fails in 0.104 seconds, before a model or tokenizer is
loaded:

```text
RuntimeError: Failed to load 'ggml' ... ggml.dll: Could not find module ...
(or one of its dependencies)
```

The Qwen3 4B GGUF chosen for the test is 2,497,280,448 bytes and belongs to the
same FAST model family used by Ollama. Because the failure occurs in the native
loader, 3A/3B/3C, formatting, and VRAM residency are correctly recorded as not
run rather than invented. v4.6.4 therefore keeps Ollama as the supported default
and exposes the existing Comfy Qwen safetensors writer as the main-workflow
fallback. The MiniMax Music 3 native int8-convrot text encoder remains untouched.

## Installed benchmark aliases

| Alias | Role | Exact installed GGUF | Source | Quantization | File storage | RTX 3090 use |
|---|---|---|---|---|---:|---|
| `novoloko-music-fast` | FAST | `Qwen3-4B-Hivemind-Inst-Hrtic-Ablit-Uncensored-Q4_K_M-imat.gguf` | [DavidAU Qwen3 4B Hivemind Heretic](https://huggingface.co/DavidAU/Qwen3-4B-Hivemind-Instruct-Heretic-Abliterated-Uncensored-NEO-Imatrix-GGUF) | Q4_K_M imatrix | 2.50 GB | 3.3 GB measured residency at 8K context; ample 3090 headroom. |
| `novoloko-music-balanced` | BALANCED | `Qwen3.5-9B-The-Defiant-Fable-Uncnr-Heretic-NEO-MAX-MTP-Q4_K_M.gguf` | [DavidAU Qwen3.5 9B Defiant Fable Heretic](https://huggingface.co/DavidAU/Qwen3.5-9B-The-Defiant-Fable-Uncensored-Heretic-NEO-IMATRIX-MAX-MTP-GGUF) | Q4_K_M imatrix, MAX-MTP | 6.98 GB | 6.6 GB measured residency at 8K; fits the 3090, but keep the existing MiniMax memory policy. |
| `novoloko-music-gemma` | WILDCARD | `gemma-3-4b-it-heretic-uncensored-abliterated-balanced.i1-Q4_K_M.gguf` | [GGUF quant](https://huggingface.co/mradermacher/gemma-3-4b-it-heretic-uncensored-abliterated-balanced-i1-GGUF) of [DavidAU Gemma 3 4B Heretic](https://huggingface.co/DavidAU/gemma-3-4b-it-heretic-uncensored-abliterated-balanced) | Q4_K_M imatrix | 2.49 GB | 2.8 GB measured residency at 8K; fastest, but weaker format discipline in the first test. |

The original GGUF files are kept in `M:\NovoLoko-Writer-Models`; Ollama's
content-addressed copies and manifests are under `M:\Ollama\models`. Exact byte
counts and SHA-256 values are recorded in the Project handoff generated with the
release.

## First identical-input result on the RTX 3090

Quick mode used seed `424242`, thinking Off and caps 768 / 1536 / 768 for
stages 3A / 3B / 3C. Cold-load time is included.

| Alias | Load | 3A | 3B | 3C | Total | Result |
|---|---:|---:|---:|---:|---:|---|
| `novoloko-music-fast` | 17.583 s | 12.950 s | 4.013 s | 3.567 s | 38.113 s | Valid tags/headings and clean separation; good FAST Qwen choice. |
| `novoloko-music-balanced` | 15.154 s | 12.258 s | 9.525 s | 4.199 s | 41.137 s | Best narrative, hook and requested-section discipline; recommended BALANCED/default quality writer. |
| `novoloko-music-gemma` | 7.426 s | 11.635 s | 5.575 s | 3.335 s | 27.971 s | Fastest, but added extra lyric sections and named artist references; keep as an optional wildcard. |

These timings are a writer-only quick comparison, not MiniMax song-generation
timings. Run the production-length command below before making a permanent
quality decision for a large batch.

The v4.6.2 release check reran FAST through the real NovoLoko 3A/3B/3C builders
with seed `424242`, thinking Off and the same quick caps. Warm/cached model load
was 0.232 s; 3A was 6.048 s, 3B was 5.311 s, 3C was 5.199 s, and writer total
was 16.790 s. The lyric result contained the required Verse 1, Chorus and Outro
tags and eight MiniMax section tags. The generated caption lost a required
heading, so the existing caption safety fallback correctly returned the valid
CSV brief. This is proof of the supported path and fallback, not a direct-GGUF
speed comparison because no compatible direct backend was present.

The benchmark report records the aliases used; `ollama show --modelfile <alias>`
and the Ollama manifests identify the exact installed blob after download.

## v4.6.4 production-length acceptance result

The release candidate reran FAST with the same seed `424242`, thinking Off and
the full 2,048 / 4,096 / 2,048 caps used by stages 3A / 3B / 3C.

| Backend | Load | 3A | 3B | 3C | Writer total | Residency | Formatting |
|---|---:|---:|---:|---:|---:|---|---|
| Ollama `novoloko-music-fast` | 5.346 s | 6.782 s | 6.750 s | 3.748 s | 22.626 s | 3.3 GB, 100% GPU, 8K context | Required lyric tags passed; 3C safely returned the valid CSV brief when its generated headings were incomplete. |
| Direct Comfy llama.cpp GGUF | failed at import (0.104 s) | not run | not run | not run | not available | no model residency | no output; dependency loader failed before generation |

At the Ollama residency snapshot the RTX 3090 reported 5,310 MiB used and
19,017 MiB free overall. This result supports FAST as the default: it is fast,
format-safe through the existing fallback checks, and leaves substantial VRAM
headroom. BALANCED and Gemma remain first-class friendly choices; every other
installed local Ollama model remains discoverable.

## Run the comparison

Start local Ollama, then run from the package root:

```powershell
python tools\benchmark_music_writer_models.py --quick --output writer-benchmark-quick.json
python tools\benchmark_music_writer_models.py --output writer-benchmark-production.json
```

Both passes use the same song idea, seed `424242`, thinking Off, real NovoLoko
3A/3B/3C prompt builders and sampling settings. The JSON records model-load,
3A lyric-enhancer, 3B lyrics-generator and 3C caption-enhancer times, full outputs,
section/header checks and status text. Models are unloaded between candidates so
only one optional writer occupies VRAM; this does not unload ComfyUI models. Use
the quick pass to reject weak candidates;
use the production-length pass before making the final FAST/BALANCED choice.

In the v4.6.4 main workflow, choose the backend explicitly. Keep **Ollama GGUF**
for FAST/BALANCED/Gemma/other installed local models, or choose **Comfy
safetensors fallback** to use the existing Qwen3-VL writer. Both feed the same
three writer stages. Do not change the MiniMax Music 3 native text encoder
inside the generation subgraph.

The package retains the older separate A/B workflow for historical comparisons;
`workflows/NovoLoko MiniMax Music 3 - Lab v4.6.4.json` is now the supported main
workflow with both writer choices visible.
