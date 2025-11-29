/**
 * When a shortcut should trigger its callback.
 * - 'Pressed': Only on key press
 * - 'Released': Only on key release
 * - 'Both': On both press and release (callback receives the actual state)
 */
export type ShortcutTriggerState = 'Pressed' | 'Released' | 'Both';

/**
 * The actual keyboard event state passed to callbacks.
 * This is what actually happened, not when to trigger.
 */
export type ShortcutEventState = 'Pressed' | 'Released';
