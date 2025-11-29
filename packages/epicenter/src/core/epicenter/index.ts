// Definition (config side)

export type { EpicenterClient } from './client';
// Runtime (client side)
export { createEpicenterClient, forEachAction } from './client';
export type { EpicenterConfig } from './config';
export { defineEpicenter } from './config';
