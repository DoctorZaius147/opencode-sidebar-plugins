# opencode-sidebar-plugins

Two small sidebar plugins for [OpenCode](https://opencode.ai) 2.x.

| Plugin | What it shows |
| --- | --- |
| [`usage-bars`](usage-bars) | Rate-limit usage bars for Claude, Codex and GitHub Copilot, with reset times. Each provider can be switched off in a config file. |
| [`cache-hit`](cache-hit) | A replacement "Context" section: context tokens and % of the model limit, cost, total input/output tokens and prompt-cache hit rate. |

## Install

Copy the plugin folder(s) you want into your OpenCode config's `plugins` directory, install the
dependencies, then restart OpenCode:

```sh
# macOS / Linux: ~/.config/opencode/plugins    Windows: %USERPROFILE%\.config\opencode\plugins
git clone https://github.com/DoctorZaius147/opencode-sidebar-plugins
cp -r opencode-sidebar-plugins/usage-bars opencode-sidebar-plugins/cache-hit ~/.config/opencode/plugins/
cd ~/.config/opencode/plugins/usage-bars && npm install
cd ../cache-hit && npm install
```

See each plugin's README for its own requirements and options.

## Notes

- Built and tested against OpenCode `2.1.x`. The plugin API is new and may change.
- The Copilot usage lookup in `usage-bars` uses an undocumented GitHub endpoint
  (`/copilot_internal/user`), the same one used by
  [opencode-quota](https://github.com/slkiser/opencode-quota), which was the reference for that part.
  It may break without notice.

## License

[MIT](LICENSE)
