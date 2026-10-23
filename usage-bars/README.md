# opencode-sidebar-usage

OpenCode sidebar panel showing rate-limit usage for Claude (`cc`), Codex (`cx`) and GitHub Copilot (`gh`),
with reset times.

## Install

```sh
opencode plugin add opencode-sidebar-usage
```

Then restart OpenCode. Update later with `opencode plugin update opencode-sidebar-usage`.

## Requirements

- OpenCode 2.x.
- **Claude:** signed in with Claude Code (`claude auth login`).
- **Codex:** an OpenAI login in OpenCode via the Codex option (`/connect`).
- **Copilot:** a GitHub Copilot login in OpenCode. Business/Enterprise seats may show only the plan name.
  Usage comes from an undocumented GitHub endpoint and may stop working without notice.

## Configuration

Optional. Create `usage-bars.json` in your OpenCode config folder
(`~/.config/opencode/`, or `%USERPROFILE%\.config\opencode\` on Windows; `$XDG_CONFIG_HOME/opencode/` if set):

```json
{
  "providers": { "claude": true, "codex": true, "copilot": true },
  "claudeAutoRefresh": true
}
```

- Set a provider to `false` to hide it and stop fetching it.
- `claudeAutoRefresh`: when the Claude token expires, the plugin starts a short hidden `claude -p` run
  (one tiny Haiku request) so Claude Code refreshes its own login, then closes it. Set to `false` to disable.
  If the refresh token itself has expired, run `claude auth login`.

Only an explicit `false` turns something off. A missing or invalid file leaves everything on. Changes apply
without restarting.
