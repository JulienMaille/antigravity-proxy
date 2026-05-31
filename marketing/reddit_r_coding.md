Title: I got Antigravity 2.0 working with DeepSeek and StepFun models (open source proxy)

Short version: Antigravity 2.0 is Google's agentic coding tool. I built a proxy so you can use any OpenAI-compatible model instead of paying for Gemini.

**The proxy does:**
- Strips ~4000 tokens of inline skill/plugin/rules context → injects a compact runtime file reference
- Translates Google ↔ OpenAI bidirectionally (messages, tools, streaming)
- Handles Antigravity Desktop's specific response format (safetyRatings, groundingMetadata, etc.)
- Retries 429s automatically with backoff
- Strips Antigravity internal metadata fields from tool args

**One command to install:**
```powershell
.\setup.ps1
```

**Result:** The agent reads the codebase, writes files, opens a browser, takes screenshots, evaluates JS — all through a non-Google model.

https://github.com/12errh/antigravity-proxy

MIT license. Would love feedback.
