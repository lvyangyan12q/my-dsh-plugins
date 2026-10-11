import {z} from 'zod'

/** Same stable identity boundary for window intent and persisted instance/role records. */
export const workbenchInstanceIdentity=z.string().min(1).max(200)
