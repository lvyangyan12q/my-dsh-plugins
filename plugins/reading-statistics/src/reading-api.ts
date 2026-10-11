export const readingAppId = 'reading-statistics'
export const readingResource = 'reading-records'
export interface ReadingRecord { id: string; title: string; author: string; category: string; status: 'reading' | 'finished'; minutes: number; notes: string }
export interface ReadingInstance { instanceId: string; records: ReadingRecord[]; initialized: boolean }

export const readingIdentityMaxLength = 160
export const readingIdentityPattern = /^[a-zA-Z0-9_.-]+$/
export const validReadingIdentity = (value: string) => value.length > 0 && value.length <= readingIdentityMaxLength && readingIdentityPattern.test(value)
