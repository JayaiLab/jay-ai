---
"@jay-ai/tui": patch
"@jay-ai/coding-agent": patch
---

Wrap rendered rows in input, select, footer, and prompt components so wide content doesn't desync the diff renderer; fix bracketed paste when the whole paste arrives in one stdin chunk; drop the "> " prefix from prompt input; add Option/Alt+Enter newline hint to the footer.
