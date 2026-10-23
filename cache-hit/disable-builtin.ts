import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

export const BUILTIN_ID = "opencode.sidebar.context"

export const cliConfigPath = () => join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "cli.json")

export type Result = "added" | "present" | "kept" | "failed"

// Adds `-opencode.sidebar.context` to cli.json `plugins` so the built-in Context section is not shown next to this one.
// Plugin entries are processed in order, so only the last mention of the id decides. An explicit later
// `opencode.sidebar.context` is the user re-enabling it, and is left alone ("kept").
// "failed" means cli.json could not be read as plain JSON (e.g. it has comments), and it is never overwritten.
export function ensureBuiltinDisabled(path = cliConfigPath()): Result {
  try {
    let config: any = { $schema: "https://opencode.ai/v2/cli.json" }
    if (existsSync(path)) {
      config = JSON.parse(readFileSync(path, "utf8"))
      if (!config || typeof config !== "object" || Array.isArray(config)) return "failed"
    }
    const plugins = config.plugins === undefined ? [] : config.plugins
    if (!Array.isArray(plugins)) return "failed"

    const last = plugins.findLastIndex((entry: unknown) => entry === BUILTIN_ID || entry === `-${BUILTIN_ID}`)
    if (last >= 0) return plugins[last] === `-${BUILTIN_ID}` ? "present" : "kept"

    config.plugins = [...plugins, `-${BUILTIN_ID}`]
    mkdirSync(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`)
    renameSync(tmp, path)
    return "added"
  } catch {
    return "failed"
  }
}
