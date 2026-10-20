// Saves generated boards' proofs (src/core/proof.ts) by board id into
// src/data/proofs.generated.json. Each save re-reads the file and merges, so
// the level and daily generators can run at the same time. The app never
// loads this file (it would give the answers away); the tests do.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('../src/data/proofs.generated.json', import.meta.url);

export function readProofs(): Record<string, string> {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')).proofs as Record<string, string>) : {};
}

/** Adds or replaces these proofs, sorted by id so the file only changes where boards did. */
export function saveProofs(changes: Record<string, string>) {
  const merged = { ...readProofs(), ...changes };
  const proofs = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  writeFileSync(FILE, JSON.stringify({ generatedBy: 'scripts/generate-levels.ts and scripts/generate-dailies.ts', proofs }, null, 1) + '\n');
}
