import { meter } from '../../core/loadout.js'
import { ATTENTION_CAPS, RECENT_PROMPTS, type Pressure, type Recommendation } from './pressure.js'
import { KEEP_MARKER, type ItemRetention, type Retention, type TaggedFocus } from '../tags/tags.js'
import { ACCENT, BORDER, ERROR, OK, WARN, keyHints } from '../../core/theme.js'

const LEVEL_COLOR = { ok: OK, watch: WARN, act: ERROR } as const

const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`

/** The Overview's PRESSURE card: the level, what drives it and the next step. */
export function renderPressureCard(ui: UiComponents, options: {
  pressure?: Pressure
  recommendations: readonly Recommendation[]
  tagged?: TaggedFocus
  retention?: Retention
  loading: boolean
  compacting: boolean
  onCompact: () => void
}): unknown {
  const { Box, Button, Text } = ui
  const { pressure } = options

  const lines: unknown[] = pressure
    ? [
        Text({
          key: 'pressure-meter',
          children: [`${meter(pressure.percent, 20)} ${pressure.percent}% · ${pressure.level}`],
          color: LEVEL_COLOR[pressure.level],
        }),
        Text({
          key: 'pressure-signals',
          children: [`window ${Math.round(pressure.window)}% + attention ${Math.round(pressure.attention)} (estimate) · ${count(pressure.openItems, 'open plan item')} · ${count(pressure.promptCount, 'prompt')}`],
          dimColor: true,
          wrap: 'wrap',
        }),
        options.recommendations[0]
          ? Text({
              key: 'pressure-next',
              children: [`Next: ${options.recommendations[0].title} → ${options.recommendations[0].command}`],
              color: LEVEL_COLOR[pressure.level],
              wrap: 'wrap',
            })
          : Text({ key: 'pressure-next', children: ['✓ Nothing to do yet'], color: OK }),
        options.tagged && options.tagged.items.length > 0
          ? Text({
              key: 'pressure-tagged',
              children: [`Tagged: ${count(options.tagged.items.length, 'item')}${options.tagged.crowded.length > 0 ? ` · ⚠ crowded out: ${options.tagged.crowded.map((item) => item.id).join(', ')}` : ''}`],
              color: options.tagged.crowded.length > 0 ? WARN : undefined,
              dimColor: options.tagged.crowded.length === 0,
              wrap: 'wrap',
            })
          : null,
        options.retention && options.retention.items.length > 0
          ? Text({
              key: 'pressure-retention',
              children: [`Last compaction kept ${options.retention.kept} of ${options.retention.items.length} tagged items`],
              color: options.retention.kept === options.retention.items.length ? OK : WARN,
            })
          : null,
      ]
    : [Text({ key: 'pressure-pending', children: [options.loading ? 'Measuring…' : 'Not measured yet. Press r.'], dimColor: true })]

  return Box({
    key: 'overview-pressure',
    flexDirection: 'column',
    padding: 1,
    borderStyle: 'round',
    borderColor: pressure && pressure.level !== 'ok' ? LEVEL_COLOR[pressure.level] : BORDER,
    children: [
      Box({
        flexDirection: 'row',
        justifyContent: 'space-between',
        children: [
          Text({ children: ['PRESSURE'], bold: true, color: ACCENT }),
          pressure
            ? Button({
                key: 'pressure-compact',
                label: options.compacting ? 'Compacting…' : 'compact now → c',
                hotkey: 'c',
                plain: true,
                dimColor: true,
                onPress: options.onCompact,
              })
            : null,
        ],
      }),
      ...lines,
    ],
  })
}

/** What the last compaction was and when, as the compaction hook saw it. */
export type CompactionRecord = { at: string; trigger: string }

const STATUS_MARK: Record<ItemRetention['status'], string> = { kept: '✓', rewritten: '~', lost: '✗' }
const STATUS_COLOR: Record<ItemRetention['status'], string> = { kept: OK, rewritten: WARN, lost: ERROR }

const shortText = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const points = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

/**
 * The Pressure view: how hard the context is working, the attention each
 * tagged item gets, what compacting now asks the summary to keep, and what the
 * last compaction actually kept.
 */
export function renderPressureTab(ui: UiComponents, options: {
  pressure?: Pressure
  recommendations: readonly Recommendation[]
  tagged: TaggedFocus
  retention?: Retention
  lastCompaction?: CompactionRecord
  /** The instructions compacting now would send. */
  focus?: string
  loading: boolean
  compacting: boolean
  onCompact: () => void
  onRefresh: () => void
}): unknown {
  const { Box, Button, Text } = ui
  const { pressure, tagged, retention } = options
  const heading = (text: string) => Text({ children: [text], dimColor: true, bold: true })
  const line = (text: string, props: Record<string, unknown> = {}) => Text({ children: [text], wrap: 'wrap', ...props })

  const header = Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    children: [
      Box({ flexShrink: 1, children: [Text({ children: ['CONTEXT PRESSURE'], bold: true, wrap: 'truncate-end' })] }),
      Box({
        flexDirection: 'row',
        columnGap: 2,
        children: [
          Button({ key: 'pressure-tab-compact', label: options.compacting ? 'Compacting…' : 'Compact now', hotkey: 'c', plain: true, onPress: options.onCompact }),
          Button({ key: 'pressure-tab-refresh', label: options.loading ? '↻ Measuring…' : '↻ Refresh', hotkey: 'r', plain: true, onPress: options.onRefresh }),
        ],
      }),
    ],
  })

  if (!pressure) {
    return Box({
      key: 'pressure-panel',
      flexDirection: 'column',
      flexGrow: 1,
      rowGap: 1,
      children: [header, line(options.loading ? 'Measuring…' : 'Not measured yet. Press r.', { dimColor: true }), keyHints(ui, '1-5 switch views · r refresh · Esc close')],
    })
  }

  const windowDetail = pressure.windowTokens !== undefined && pressure.windowMax
    ? ` (${Math.round(pressure.windowTokens).toLocaleString('en-US')} of ${Math.round(pressure.windowMax).toLocaleString('en-US')})`
    : ''

  const signal = (label: string, value: number, part: number, cap: number) =>
    line(`${label.padEnd(30)}${String(value).padStart(6)}   ${meter((part / cap) * 100, 10)} ${points(part)}/${cap}`)

  const taggedRows: unknown[] = tagged.items.length === 0
    ? [line('Nothing tagged yet. Wrap what must survive a compaction in <important>, <constraint>, <decision> or <open> in a prompt; add id="…" to name it.', { dimColor: true })]
    : tagged.items.map((item) =>
        Box({
          key: `pressure-tag-${item.id}`,
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({
              children: [`${item.id.padEnd(6)}${item.kind.padEnd(11)}${meter(item.focus, 10)} ${`${Math.round(item.focus)}%`.padStart(4)}${item.isCrowded ? ' ⚠ crowded out' : ''}`],
              color: item.isCrowded ? WARN : undefined,
            }),
            Box({ flexShrink: 1, children: [Text({ children: [shortText(item.text)], dimColor: true, wrap: 'truncate-end' })] }),
          ],
        }))

  const keepIds = tagged.items.map((item) => item.id)
  const focusKeep = options.focus?.split(`\n\n${KEEP_MARKER}`)[0] ?? ''
  const compactRows: unknown[] = [
    line(shortText(focusKeep, 400), { dimColor: true }),
    keepIds.length > 0 ? line(`+ the tagged items by id: ${keepIds.join(', ')}`) : null,
  ]

  const lastRows: unknown[] = !options.lastCompaction
    ? [line('No compaction since Cognita loaded. After one, each tagged item shows here as kept, rewritten or lost.', { dimColor: true })]
    : [
        line(`${options.lastCompaction.at} · ${options.lastCompaction.trigger}${retention && retention.items.length > 0 ? ` · kept ${retention.kept} of ${retention.items.length} tagged items` : ' · nothing was tagged'}`,
          { color: !retention || retention.kept === retention.items.length ? OK : WARN }),
        ...(retention?.items ?? []).map((item) =>
          Text({
            key: `pressure-kept-${item.id}`,
            children: [`${STATUS_MARK[item.status]} ${item.id.padEnd(6)}${item.kind.padEnd(11)}${item.status === 'rewritten' ? `rewritten, ${item.overlap}% of its words` : item.status}${item.status === 'kept' ? '' : `  "${shortText(item.text, 40)}"`}`],
            color: STATUS_COLOR[item.status],
            wrap: 'truncate-end',
          })),
      ]

  return Box({
    key: 'pressure-panel',
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    children: [
      header,
      Box({
        flexDirection: 'column',
        children: [
          Text({ children: [`${meter(pressure.percent, 20)} ${pressure.percent}% · ${pressure.level}`], color: LEVEL_COLOR[pressure.level], bold: true }),
          line(`window ${Math.round(pressure.window)}%${windowDetail} + attention ${Math.round(pressure.attention)} / 100 (estimate)`, { dimColor: true }),
        ],
      }),
      Box({
        flexDirection: 'column',
        children: [
          heading('ATTENTION SIGNALS (estimate)'),
          signal('Open plan items', pressure.openItems, pressure.parts.planItems, ATTENTION_CAPS.planItems),
          signal('Words in the open plan', pressure.planWords, pressure.parts.planWords, ATTENTION_CAPS.planWords),
          signal(`Words in your last ${RECENT_PROMPTS} prompts`, pressure.recentWords, pressure.parts.promptWords, ATTENTION_CAPS.promptWords),
          signal('Prompts since the last compaction', pressure.promptCount, pressure.parts.turns, ATTENTION_CAPS.turns),
        ],
      }),
      Box({ flexDirection: 'column', children: [heading('TAGGED ITEMS · share of the attention on what you tagged (estimate)'), ...taggedRows] }),
      Box({ flexDirection: 'column', children: [heading('COMPACTING NOW ASKS THE SUMMARY TO KEEP'), ...compactRows] }),
      Box({ flexDirection: 'column', children: [heading('LAST COMPACTION'), ...lastRows] }),
      Box({
        flexDirection: 'column',
        children: [
          heading('NEXT STEP'),
          ...(options.recommendations.length === 0
            ? [line('✓ Nothing to do yet', { color: OK })]
            : options.recommendations.map((step, index) => line(`${index + 1}. ${step.title} → ${step.command}`, { color: index === 0 ? LEVEL_COLOR[pressure.level] : undefined }))),
        ],
      }),
      keyHints(ui, '1-5 switch views · c compact · r refresh · Esc close · /cognita pressure for the full report'),
    ],
  })
}
