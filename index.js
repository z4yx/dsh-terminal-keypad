/**
 * Host half of the terminal keypad.
 *
 * The feature is browser-only: it renders a floating pad over the Web terminal
 * and writes the pressed bytes through the Client terminal service. This half
 * exists so the bundle row has a Host activation; it owns no Host resources.
 */

/** Activate the Host row; no Host resources are registered. */
export function apply() {}
