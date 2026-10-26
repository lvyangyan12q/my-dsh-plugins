/** Immutable historical proof vocabulary only. No source discovery, automatic
 * adoption, or platform runtime is provided by these retained envelope types. */
export type HistoricalCapability = { kind: 'agent' | 'skill'; id: string } & ({ source: 'managed' } | { source: 'application'; ownerAppId: string })
export type HistoricalNativeIdentity = { sessionId: string; presetId: string; creation: { cwd: string } }
export type HistoricalRoleSnapshot = HistoricalNativeIdentity & { sourceKey: string; revision: string; roleId: string; phase: 'intent' | 'ready'; previousSessions?: HistoricalNativeIdentity[]; previousSessionIds?: string[]; selectedPreset?: boolean; agent?: HistoricalCapability & { kind: 'agent' } }
export type HistoricalRolePreview = { sourceFingerprint?: string; status: 'ready' | 'applied' | 'blocked'; fingerprint: string | null; blockers: { code: string; reason: string }[]; source?: HistoricalRoleSnapshot; target?: { appId: string; instanceId: string; roleId: string }; native?: { sessionId: string; presetId: string; cwd: string; status: 'current' | 'missing' }[] }
