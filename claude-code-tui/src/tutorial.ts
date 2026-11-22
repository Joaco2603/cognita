// `/cognita tutorial`: a guided path through the commands, grouped by the
// question a user has, so a first-time user knows where to start.
// Pure: no engine calls, so it is unit-tested directly.

/** One step of the tutorial: a question, the commands that answer it, and what to expect. */
export type TutorialStep = {
  question: string
  commands: readonly { command: string; does: string }[]
}

/** The guided path, in the order a new user should try it. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    question: '1. What does my agent load before my first message?',
    commands: [
      { command: '/cognita report', does: 'estimated tokens per source: CLAUDE.md, MCP servers, skills, prompt sections' },
      { command: '/cognita report full', does: 'the same with an exact count' },
    ],
  },
  {
    question: '2. What can my agent reach and do without asking?',
    commands: [
      { command: '/cognita access', does: 'tools, MCP servers, risky actions, permission rules, hooks and plugins' },
      { command: '/cognita supply', does: 'every hook and MCP server that runs code here, and whether it is pinned to a version' },
    ],
  },
  {
    question: '3. How do I make it load less?',
    commands: [
      { command: '/cognita trim', does: 'a step-by-step plan, with the command for each step, ranked by tokens saved' },
      { command: '/cognita trim --apply', does: 'runs the plugin and MCP steps for this project (instruction files stay manual)' },
      { command: '/cognita hold <server>', does: 'keeps an MCP server off from the next session in this project' },
      { command: '/cognita connect <server>', does: 'brings a held server back in this session, no restart' },
      { command: '/cognita release <server|all>', does: 'stops holding it, so it loads at every start again' },
    ],
  },
  {
    question: '4. How is this changing over time, and what does it cost?',
    commands: [
      { command: '/cognita history', does: 'how the loadout changed across the last sessions in this project' },
      { command: '/cognita cost', does: 'what sessions cost in dollars, per day and per session' },
    ],
  },
  {
    question: '5. Open the full view',
    commands: [
      { command: '/cognita', does: 'the pane with Overview, Context, Access and Agents; Esc closes it' },
    ],
  },
]

/** Setup and reference commands that are not part of the path above. */
const REFERENCE: readonly { command: string; does: string }[] = [
  { command: '/cognita doctor', does: 'which Claude Code engine APIs Cognita needs, and which this version lacks' },
  { command: '/cognita help', does: 'the flat list of every subcommand' },
  { command: '/cognita tutorial', does: 'this guide' },
]

/** The tutorial as Markdown, for the chat. */
export function formatTutorial(): string {
  const lines: string[] = [
    '**Cognita tutorial** · start at step 1 and stop when you have your answer.',
    '',
  ]
  for (const step of TUTORIAL_STEPS) {
    lines.push(`**${step.question}**`)
    for (const { command, does } of step.commands) {
      lines.push(`- \`${command}\`: ${does}`)
    }
    lines.push('')
  }
  lines.push('**Reference**')
  for (const { command, does } of REFERENCE) {
    lines.push(`- \`${command}\`: ${does}`)
  }
  lines.push('')
  lines.push('Every command also works under the `/inspector` alias. `report`, `access`, `supply` and `cost` take `json` for scripts.')
  return lines.join('\n')
}
