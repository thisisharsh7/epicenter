// Definition (config side)
export { defineEpicenter } from './config';
export type { EpicenterConfig } from './config';

// Runtime (client side)
export { createEpicenterClient, forEachAction } from './client';
export type { EpicenterClient } from './client';
