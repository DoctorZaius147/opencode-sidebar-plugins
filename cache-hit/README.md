# cache-hit

OpenCode sidebar section that replaces the built-in "Context" block. It shows, for the current session:

- context tokens in use and the percentage of the model's context limit
- cost spent so far
- total input (`↑`) and output (`↓`) tokens
- prompt-cache hit rate and cached tokens read

## Install

1. Copy this folder to `~/.config/opencode/plugins/cache-hit`
   (Windows: `C:\Users\<you>\.config\opencode\plugins\cache-hit`).
2. In that folder run `npm install`.
3. Disable the built-in Context section so it isn't shown twice. In `~/.config/opencode/cli.json`:

   ```json
   { "plugins": ["-opencode.sidebar.context"] }
   ```

4. Restart OpenCode.

Requires OpenCode 2.x.
