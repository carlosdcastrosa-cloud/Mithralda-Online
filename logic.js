// Mithralda is a single-player client-side game. The Higgsfield platform
// requires a rules module at the zip root; for solo games this is a no-op stub.
export const meta = { game: "mithralda", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
