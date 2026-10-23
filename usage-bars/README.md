# usage-bars

OpenCode sidebar panel showing usage for Claude (`cc`), Codex (`cx`) and GitHub Copilot (`gh`).

## Install

1. Copy this folder to `~/.config/opencode/plugins/usage-bars`
   (Windows: `C:\Users\<you>\.config\opencode\plugins\usage-bars`).
2. In that folder, install the dependencies: `npm install`
3. Restart OpenCode.

## Requirements

- OpenCode 2.x.
- Claude: signed in with Claude Code (`claude auth login`). If the token expires, the plugin starts a
  short hidden `claude -p` run to refresh it.
- Codex: OpenAI login in OpenCode via the Codex option (`/connect`).
- Copilot: GitHub Copilot login in OpenCode. Business/Enterprise seats may show only the plan name.
  Reaching the Copilot usage endpoint may need the same proxy setup as Copilot chat.

## Configuration

Edit `usage-bars.config.json` and set a provider to `false` to disable it. Disabled providers are not
fetched and are hidden. Changes apply without restarting; a missing or invalid file enables everything.

```json
{ "providers": { "claude": true, "codex": true, "copilot": true } }
```
