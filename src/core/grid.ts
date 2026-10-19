import type { CellKey, Direction, Entry } from './types';

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export function parseCellKey(key: CellKey): [number, number] {
  const [row, col] = key.split(',').map(Number);
  return [row, col];
}

export function isOpen(layout: string[], row: number, col: number): boolean {
  return layout[row]?.[col] === '.';
}

export function openCells(layout: string[]): CellKey[] {
  const cells: CellKey[] = [];
  layout.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (line[col] === '.') cells.push(cellKey(row, col));
    }
  });
  return cells;
}

/**
 * Finds every across/down run of 2+ open cells, numbered the way a crossword
 * numbers its clues (row-major, one number per starting cell).
 */
export function extractEntries(layout: string[]): Entry[] {
  const entries: Entry[] = [];
  let number = 0;
  layout.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      if (!isOpen(layout, row, col)) continue;
      const startsAcross =
        !isOpen(layout, row, col - 1) && isOpen(layout, row, col + 1);
      const startsDown =
        !isOpen(layout, row - 1, col) && isOpen(layout, row + 1, col);
      if (!startsAcross && !startsDown) continue;
      number++;
      if (startsAcross) entries.push(run(layout, number, 'across', row, col));
      if (startsDown) entries.push(run(layout, number, 'down', row, col));
    }
  });
  return entries;
}

function run(
  layout: string[],
  number: number,
  direction: Direction,
  row: number,
  col: number,
): Entry {
  const [dr, dc] = direction === 'across' ? [0, 1] : [1, 0];
  const cells: CellKey[] = [];
  for (let r = row, c = col; isOpen(layout, r, c); r += dr, c += dc) {
    cells.push(cellKey(r, c));
  }
  return { id: `${number}${direction === 'across' ? 'A' : 'D'}`, number, direction, cells };
}

/** Returns a list of problems with a layout; empty means it is playable. */
export function validateLayout(layout: string[]): string[] {
  const problems: string[] = [];
  if (layout.length === 0) return ['layout is empty'];
  const width = layout[0].length;
  layout.forEach((line, row) => {
    if (line.length !== width) problems.push(`row ${row} has length ${line.length}, expected ${width}`);
    if (/[^.#]/.test(line)) problems.push(`row ${row} has characters other than '.' and '#'`);
  });

  const cells = openCells(layout);
  if (cells.length === 0) return [...problems, 'layout has no open cells'];

  const inEntry = new Set(extractEntries(layout).flatMap((e) => e.cells));
  for (const cell of cells) {
    if (!inEntry.has(cell)) problems.push(`cell ${cell} is not part of any entry`);
  }

  // Every open cell must be reachable from the first one.
  const seen = new Set<CellKey>([cells[0]]);
  const queue = [cells[0]];
  while (queue.length > 0) {
    const [row, col] = parseCellKey(queue.pop()!);
    for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      const key = cellKey(r, c);
      if (isOpen(layout, r, c) && !seen.has(key)) {
        seen.add(key);
        queue.push(key);
      }
    }
  }
  if (seen.size !== cells.length) problems.push('open cells are not all connected');

  return problems;
}
