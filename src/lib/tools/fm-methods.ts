import { z } from 'zod'

export const FM_METHODS = ['find', 'create', 'update', 'delete', 'list', 'get', 'script', 'custom'] as const
export type FmMethod = typeof FM_METHODS[number]
export const fmMethodSchema = z.enum(FM_METHODS)
