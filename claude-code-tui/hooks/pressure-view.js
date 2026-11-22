import { meter } from './loadout.js';
import { ACCENT, BORDER, ERROR, OK, WARN } from './theme.js';
const LEVEL_COLOR = { ok: OK, watch: WARN, act: ERROR };
const count = (value, noun) => `${value} ${noun}${value === 1 ? '' : 's'}`;
/** The Overview's PRESSURE card: the level, what drives it and the next step. */
export function renderPressureCard(ui, options) {
    const { Box, Button, Text } = ui;
    const { pressure } = options;
    const lines = pressure
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
        : [Text({ key: 'pressure-pending', children: [options.loading ? 'Measuring…' : 'Not measured yet. Press r.'], dimColor: true })];
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
    });
}
