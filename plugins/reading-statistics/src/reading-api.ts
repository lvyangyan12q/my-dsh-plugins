export const readingAppId = 'reading-statistics'
export const readingResource = 'reading-records'
export interface ReadingRecord { id: string; title: string; author: string; category: string; status: 'reading' | 'finished'; minutes: number; notes: string }
export interface ReadingInstance { instanceId: string; records: ReadingRecord[]; initialized: boolean }
