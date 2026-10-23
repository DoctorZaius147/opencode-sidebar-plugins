# opencode-sidebar-cache

OpenCode sidebar section that replaces the built-in "Context" block. For the current session it shows:

- context tokens in use and the percentage of the model's context limit
- cost spent so far
- total input (`↑`) and output (`↓`) tokens
- prompt-cache hit rate and cached tokens read

## Install

```sh
opencode plugin add opencode-sidebar-cache
```

Then restart OpenCode. Update later with `opencode plugin update opencode-sidebar-cache`.

## The built-in Context section

So the context info isn't shown twice, the plugin adds `"-opencode.sidebar.context"` to the `plugins` list in your
`cli.json` (`~/.config/opencode/cli.json`) the first time it runs. Other settings in that file are kept.

- If `cli.json` can't be read as plain JSON (for example it contains comments), it is left untouched and a
  warning toast tells you to add the line yourself.
- To keep the built-in section, either list `"opencode.sidebar.context"` after that entry, or pass the plugin
  option `replaceBuiltin: false`:

  ```json
  { "plugins": [{ "package": "opencode-sidebar-cache", "options": { "replaceBuiltin": false } }] }
  ```

Requires OpenCode 2.x.
