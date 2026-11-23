// Shared colors and small pieces every tab draws with.

export const ACCENT = '#D97757'
export const BORDER = '#343746'
export const WARN = '#F2B84B'
export const ERROR = '#F87171'
export const OK = '#7BC47F'

/** A dim line of key hints at the foot of a tab. */
export function keyHints(ui: UiComponents, text: string): unknown {
  return ui.Box({ key: 'key-hints', children: [ui.Text({ children: [text], dimColor: true, wrap: 'wrap' })] })
}
