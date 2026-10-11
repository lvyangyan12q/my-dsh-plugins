import type { DisplayData, DisplayRecord } from './display-api.ts'
/** Shared value for the visible statistic and the evidence sent to a role. */
export function aggregateStatistic(records: readonly DisplayRecord[], stat: DisplayData['stats'][number]): number {
 if (stat.operation === 'count') return records.length
 const numbers = records.map(record => record.fields[stat.field ?? '']).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
 const sum = numbers.reduce((total, value) => total + value, 0)
 if (stat.operation === 'sum') {
  if (Number.isFinite(sum)) return sum
  // Intermediate overflow can cancel out even when the final total is representable.
  const scale = numbers.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
  return numbers.reduce((total, value) => total + value / scale, 0) * scale
 }
 if (!numbers.length) return 0
 let mean = sum / numbers.length
 if (!Number.isFinite(sum)) {
  // Scaling bounds intermediate sums while retaining representable extreme averages.
  const scale = numbers.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0)
  const normalized = numbers.reduce((total, value) => total + value / scale, 0) / numbers.length
  mean = Math.max(-1, Math.min(1, normalized)) * scale
 }
 const tenths = mean * 10
 // At this magnitude, tenths are already smaller than floating-point precision.
 return Number.isFinite(tenths) ? Math.round(tenths) / 10 : mean
}
