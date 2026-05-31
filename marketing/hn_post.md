Show HN: Antigravity Proxy – use any OpenAI-compatible model with Antigravity 2.0

Antigravity 2.0 is Google's agentic coding IDE with file system access, MCP tools, subagents, and browser automation. But it only works with Gemini.

I built a TLS proxy that intercepts Antigravity's Gemini API calls and translates them to OpenAI format for NVIDIA or OpenRouter.

**How it works:**
- Antigravity → HTTPS (port 443) → Proxy → OpenAI API → NVIDIA/OpenRouter
- Strips massive inline context (skills, plugins, rules = ~4K tokens) → injects compact `agent-context.md` reference
- Bidirectional message/tool/stream translation
- Handles Antigravity Desktop's metadata requirements (safetyRatings, groundingMetadata, index:0)
- Automatic 429 retry with backoff

**Tested with:** deepseek-ai/deepseek-v4-flash, stepfun-ai/step-3.7-flash on NVIDIA NIM

**Everything works:** chat, code gen, tool calls, file ops, browser automation (Chrome DevTools MCP), image gen, vision, subagent orchestration. Only audio and background project sync need Gemini.

**Setup:** One PowerShell script, paste API key, done.

https://github.com/12errh/antigravity-proxy

MIT license. Built in TypeScript, ~400 lines of proxy code.
