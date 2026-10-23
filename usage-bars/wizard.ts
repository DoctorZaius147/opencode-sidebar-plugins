import { existsSync } from "node:fs"
import { CONFIG_FILE, writeConfigFile } from "./lib.ts"

export type Choice = { claude: boolean; codex: boolean; copilot: boolean }
export type Step = { title: string; detail: string }
export type Ask = (step: Step) => Promise<boolean | undefined>

const STEPS: readonly { key: keyof Choice; name: string; detail: string }[] = [
  { key: "claude", name: "Claude (cc)", detail: "5-hour and weekly limits. Needs a Claude Code login." },
  { key: "codex", name: "Codex (cx)", detail: "5-hour and weekly limits. Needs an OpenAI Codex login." },
  { key: "copilot", name: "GitHub Copilot (gh)", detail: "Monthly usage. Needs a GitHub Copilot login." },
]

// Everything defaults to on. Dismissing a question (undefined) stops the wizard and keeps the rest on.
export async function runWizard(ask: Ask): Promise<Choice> {
  const choice: Choice = { claude: true, codex: true, copilot: true }
  for (const [index, step] of STEPS.entries()) {
    const answer = await ask({ title: `Usage bars ${index + 1}/${STEPS.length}: show ${step.name}?`, detail: step.detail })
    if (answer === undefined) break
    choice[step.key] = answer
  }
  return choice
}

// First run only: ask which providers to show and save the answers. An existing settings file is never touched.
export async function firstRun(context: any, path = CONFIG_FILE, delayMs = 1500) {
  if (existsSync(path)) return
  // Give the home screen a moment so a startup dialog does not dismiss the first question.
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  if (existsSync(path)) return

  const choice = await runWizard(async (step) => {
    const answer = await context.ui.dialog.select({
      title: step.title,
      current: "yes",
      options: [
        { title: "Yes", value: "yes", description: step.detail },
        { title: "No", value: "no" },
      ],
    })
    return answer === undefined ? undefined : answer === "yes"
  })
  if (writeConfigFile(choice, path)) {
    context.ui.toast.show({ title: "usage-bars", message: `Saved to ${path}`, variant: "success", duration: 5000 })
  }
}
