Title: I replaced Gemini in Antigravity 2.0 with external models via a proxy. Everything works — chat, tools, browser automation, even vision.

Hey everyone,

Antigravity 2.0 is Google's new agentic coding IDE. It's great but locked to Gemini. I wanted to use other models (DeepSeek, StepFun, etc.) so I built a proxy that intercepts its Gemini API calls and translates them to OpenAI format.

**The setup**: Run one PowerShell script, paste an API key, done.

**What works:**
- Chat, code gen, streaming
- All tool calls (view_file, list_dir, run_command, grep, write_to_file)
- Subagent orchestration
- Browser automation (Chrome DevTools MCP — the agent can open a browser, take screenshots, check console, run JS)
- Image generation
- Thinking/reasoning
- Model switching (edit one JSON file)

**What doesn't (minor):** Audio and background project sync still need a Gemini key. That's it.

I'm not selling anything — it's open source (MIT) on GitHub. Just sharing because I haven't seen anyone else do this yet.

https://github.com/12errh/antigravity-proxy
