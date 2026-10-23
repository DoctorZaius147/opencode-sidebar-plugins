import { existsSync } from "node:fs"
import { CONFIG_FILE, writeConfigFile } from "./lib.ts"

export type Choice = { claude: boolean; codex: boolean; copilot: boolean }
export type Pick = (state: { choice: Choice; current?: keyof Choice }) => Promise<keyof Choice | "save" | undefined>

export const ITEMS: readonly { key: keyof Choice; name: string; detail: string }[] = [
  { key: "claude", name: "Claude (cc)", detail: "5-hour and weekly limits. Needs a Claude Code login." },
  { key: "codex", name: "Codex (cx)", detail: "5-hour and weekly limits. Needs an OpenAI Codex login." },
  { key: "copilot", name: "GitHub Copilot (gh)", detail: "Monthly usage. Needs a GitHub Copilot login." },
]

// A checklist: picking an item toggles it and asks again; "save" or dismissing (undefined) finishes.
// Everything starts on.
export async function runWizard(pick: Pick): Promise<Choice> {
  const choice: Choice = { claude: true, codex: true, copilot: true }
  let current: keyof Choice | undefined
  for (let turn = 0; turn < 100; turn++) {
    const picked = await pick({ choice: { ...choice }, current })
    if (picked === undefined || picked === "save") break
    choice[picked] = !choice[picked]
    current = picked
  }
  return choice
}

// First run only: show the checklist and save the result. An existing settings file is never touched.
export async function firstRun(context: any, path = CONFIG_FILE, delayMs = 1500) {
  if (existsSync(path)) return
  // Give the home screen a moment so a startup dialog does not dismiss the checklist.
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  if (existsSync(path)) return

  const choice = await runWizard(({ choice, current }) =>
    context.ui.dialog.select({
      title: "Usage bars: choose what to show (Enter toggles)",
      current: current ?? "claude",
      options: [
        ...ITEMS.map((item) => ({
          title: `${choice[item.key] ? "[x]" : "[ ]"} ${item.name}`,
          value: item.key,
          description: item.detail,
        })),
        { title: "Save", value: "save", description: "Esc also saves" },
      ],
    }),
  )
  if (writeConfigFile(choice, path)) {
    context.ui.toast.show({ title: "usage-bars", message: `Saved to ${path}`, variant: "success", duration: 5000 })
  }
}
