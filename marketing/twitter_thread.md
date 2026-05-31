1/ Replace Gemini in Antigravity 2.0 with any model

I built a proxy that lets Antigravity use DeepSeek, StepFun, or any OpenAI-compatible model instead of Gemini.

No subscription needed. Open source (MIT).

2/ What it does:
- Intercepts Antigravity's Gemini API calls
- Translates to OpenAI format
- Routes to NVIDIA or OpenRouter
- Strips 4K tokens of inline context → compact runtime file

3/ What works:
✅ Chat & code gen
✅ Tool calling (file ops, grep, run commands)
✅ Browser automation (Chrome MCP)
✅ Image generation & vision
✅ Subagent orchestration
✅ Streaming, thinking/reasoning
✅ Model switching (edit one JSON)

4/ Real test:
Agent built a landing page → opened it in Chrome → took screenshot → checked console errors → verified JS animations.

All through DeepSeek on NVIDIA. Zero Google calls.

5/ Setup:
```powershell
.\setup.ps1
```
Pick provider, enter API key. 30 seconds.

6/ GitHub: https://github.com/12errh/antigravity-proxy

MIT license. PRs welcome.

#Antigravity #AI #OpenSource #DeepSeek
