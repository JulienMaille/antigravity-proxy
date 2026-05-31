Title: PSA: You can use any OpenAI-compatible model with Antigravity 2.0 (DeepSeek, StepFun, etc.)

Antigravity 2.0 is Google's coding agent IDE with file access, MCP tools, subagents, and browser automation.

Downside: locked to Gemini.

I wrote a small TypeScript proxy that:
1. Intercepts Antigravity's Gemini API calls (TLS, man-in-the-middle)
2. Strips the massive inline context (30+ skill packages, plugins — ~4000 tokens) and injects a compact runtime reference
3. Translates to OpenAI format → sends to NVIDIA or OpenRouter
4. Translates back with proper metadata for Antigravity's desktop UI

**Tested stack:** NVIDIA NIM with deepseek-ai/deepseek-v4-flash and stepfun-ai/step-3.7-flash. OpenRouter works too.

**Real test:** I had the agent build a landing page, then spawn a browser subagent that opened it in Chrome, took a full-page screenshot, checked for console errors, and ran JS evaluation to verify animations. All through DeepSeek. Zero Google.

https://github.com/12errh/antigravity-proxy

MIT, open source, one-command setup.
