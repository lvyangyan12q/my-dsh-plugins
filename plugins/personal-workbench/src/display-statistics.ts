import type { DisplayData, DisplayRecord } from './display-api.ts'
/** Shared value for the visible statistic and the evidence sent to a role. */
export function aggregateStatistic(records: readonly DisplayRecord[], stat: DisplayData['stats'][number]): number {
 if (stat.operation === 'count') return records.length
 const numbers = records.map(record => record.fields[stat.field ?? '']).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
 const sum = numbers.reduce((total, value) => total + value, 0)
 return stat.operation === 'sum' ? sum : numbers.length ? Math.round(sum / numbers.length * 10) / 10 : 0
}
