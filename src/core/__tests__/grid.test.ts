import { extractEntries, openCells, validateLayout } from '../grid';

describe('extractEntries', () => {
  it('numbers entries like a crossword', () => {
    const entries = extractEntries(['...', '.#.', '...']);
    expect(entries.map((e) => e.id)).toEqual(['1A', '1D', '2D', '3A']);
    expect(entries.find((e) => e.id === '2D')!.cells).toEqual(['0,2', '1,2', '2,2']);
    expect(entries.find((e) => e.id === '3A')!.cells).toEqual(['2,0', '2,1', '2,2']);
  });

  it('ignores runs of a single cell', () => {
    const entries = extractEntries(['....', '.##.']);
    expect(entries.map((e) => [e.id, e.cells.length])).toEqual([
      ['1A', 4],
      ['1D', 2],
      ['2D', 2],
    ]);
  });
});

describe('validateLayout', () => {
  it('accepts a connected layout where every cell is in an entry', () => {
    expect(validateLayout(['...', '.##', '.##'])).toEqual([]);
  });

  it('rejects lines shorter than three words', () => {
    expect(validateLayout(['...', '.#.'])).toEqual([
      'entry 1D has 2 words; lines need at least 3',
      'entry 2D has 2 words; lines need at least 3',
    ]);
  });

  it('rejects cells outside any entry', () => {
    expect(validateLayout(['..', '##', '.#'])).toEqual(
      expect.arrayContaining(['cell 2,0 is not part of any entry']),
    );
  });

  it('rejects disconnected regions and ragged rows', () => {
    expect(validateLayout(['..#..'])).toContain('open cells are not all connected');
    expect(validateLayout(['...', '..'])).toContain('row 1 has length 2, expected 3');
  });

  it('lists open cells row by row', () => {
    expect(openCells(['.#', '..'])).toEqual(['0,0', '1,0', '1,1']);
  });
});
