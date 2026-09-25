import { describe, it, expect } from 'vite-plus/test';
import { updateReferences, adjustFormulaReferences, toggleAbsoluteRef } from './referenceUpdater';

describe('updateReferences', () => {
  describe('column insert', () => {
    it('shifts references at or after insertion point right', () => {
      const result = updateReferences('A1+C3', 'column', 1, 'insert');
      // A1 (col 0) is before index 1 -> stays A1
      // C3 (col 2) is at or after index 1 -> becomes D3
      expect(result.formula).toBe('A1+D3');
      expect(result.hasRefError).toBe(false);
    });

    it('shifts reference at exact insertion point right', () => {
      const result = updateReferences('B1', 'column', 1, 'insert');
      expect(result.formula).toBe('C1');
    });

    it('shifts Z to AA when inserting before it', () => {
      const result = updateReferences('Z1', 'column', 0, 'insert');
      expect(result.hasRefError).toBe(false);
      expect(result.formula).toBe('AA1');
    });
  });

  describe('column delete', () => {
    it('shifts references after deleted column left', () => {
      const result = updateReferences('C1+A1', 'column', 1, 'delete');
      // A1 (col 0) is before index 1 -> stays A1
      // C1 (col 2) is after index 1 -> becomes B1
      expect(result.formula).toBe('B1+A1');
      expect(result.hasRefError).toBe(false);
    });

    it('returns #REF! for reference to deleted column', () => {
      const result = updateReferences('B1', 'column', 1, 'delete');
      expect(result.hasRefError).toBe(true);
      expect(result.formula).toBe('#REF!');
    });
  });

  describe('row insert', () => {
    it('shifts references at or after insertion point down', () => {
      const result = updateReferences('A1+A3', 'row', 1, 'insert');
      // A1 (row 0) is before index 1 -> stays A1
      // A3 (row 2) is at or after index 1 -> becomes A4
      expect(result.formula).toBe('A1+A4');
      expect(result.hasRefError).toBe(false);
    });
  });

  describe('row delete', () => {
    it('returns #REF! for reference to deleted row', () => {
      const result = updateReferences('A2', 'row', 1, 'delete');
      expect(result.hasRefError).toBe(true);
      expect(result.formula).toBe('#REF!');
    });

    it('shifts references after deleted row up', () => {
      const result = updateReferences('A3', 'row', 1, 'delete');
      expect(result.formula).toBe('A2');
      expect(result.hasRefError).toBe(false);
    });
  });

  describe('no change', () => {
    it('does not modify references before the operation point', () => {
      const result = updateReferences('A1', 'column', 5, 'insert');
      expect(result.formula).toBe('A1');
    });
  });

  describe('with absolute markers', () => {
    it('preserves $ markers during column insert', () => {
      const result = updateReferences('$A$1+C3', 'column', 0, 'insert');
      expect(result.formula).toBe('$B$1+D3');
    });

    it('preserves $ markers during row insert', () => {
      const result = updateReferences('A$1+A3', 'row', 0, 'insert');
      expect(result.formula).toBe('A$2+A4');
    });
  });
});

describe('adjustFormulaReferences', () => {
  it('shifts row references down', () => {
    expect(adjustFormulaReferences('A1+B1', 0, 2)).toBe('A3+B3');
  });

  it('shifts column references right', () => {
    expect(adjustFormulaReferences('A1', 1, 0)).toBe('B1');
  });

  it('shifts both column and row', () => {
    expect(adjustFormulaReferences('A1', 2, 3)).toBe('C4');
  });

  it('returns #REF! for column underflow', () => {
    expect(adjustFormulaReferences('A1', -1, 0)).toBe('#REF!');
  });

  it('returns #REF! for row underflow', () => {
    expect(adjustFormulaReferences('A1', 0, -1)).toBe('#REF!');
  });

  it('handles range references in functions', () => {
    expect(adjustFormulaReferences('SUM(A1:A10)', 0, 5)).toBe('SUM(A6:A15)');
  });

  it('handles sheet-qualified references', () => {
    expect(adjustFormulaReferences('Sheet2!A1+B2', 0, 1)).toBe('Sheet2!A2+B3');
  });

  it('handles multi-letter column references', () => {
    expect(adjustFormulaReferences('AA1+AB2', 1, 0)).toBe('AB1+AC2');
  });

  it('no offset returns same formula', () => {
    expect(adjustFormulaReferences('A1+B2', 0, 0)).toBe('A1+B2');
  });

  describe('with absolute markers', () => {
    it('does not shift fully absolute reference', () => {
      expect(adjustFormulaReferences('$A$1+B1', 0, 1)).toBe('$A$1+B2');
    });

    it('shifts only row for $A1 (column absolute)', () => {
      expect(adjustFormulaReferences('$A1', 0, 1)).toBe('$A2');
    });

    it('does not shift column for $A1', () => {
      expect(adjustFormulaReferences('$A1', 1, 0)).toBe('$A1');
    });

    it('shifts only column for A$1 (row absolute)', () => {
      expect(adjustFormulaReferences('A$1', 1, 0)).toBe('B$1');
    });

    it('does not shift row for A$1', () => {
      expect(adjustFormulaReferences('A$1', 0, 1)).toBe('A$1');
    });

    it('preserves $ markers in output', () => {
      expect(adjustFormulaReferences('$A$1', 0, 0)).toBe('$A$1');
    });

    it('handles mixed absolute and relative in same formula', () => {
      expect(adjustFormulaReferences('$A1+B$1', 1, 1)).toBe('$A2+C$1');
    });
  });
});

describe('toggleAbsoluteRef', () => {
  it('cycles A1 → $A$1', () => {
    const result = toggleAbsoluteRef('=A1+B2', 2);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('=$A$1+B2');
  });

  it('cycles $A$1 → A$1', () => {
    const result = toggleAbsoluteRef('=$A$1+B2', 3);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('=A$1+B2');
  });

  it('cycles A$1 → $A1', () => {
    const result = toggleAbsoluteRef('=A$1+B2', 2);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('=$A1+B2');
  });

  it('cycles $A1 → A1', () => {
    const result = toggleAbsoluteRef('=$A1+B2', 2);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('=A1+B2');
  });

  it('returns null when cursor is not near a reference', () => {
    const result = toggleAbsoluteRef('=SUM()', 5);
    expect(result).toBeNull();
  });

  it('handles cursor at the end of a reference', () => {
    const result = toggleAbsoluteRef('=A1', 3);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('=$A$1');
  });

  it('adjusts cursor position to end of new reference', () => {
    const result = toggleAbsoluteRef('=A1+B2', 2);
    expect(result).not.toBeNull();
    expect(result!.cursorPos).toBe(5); // '=$A$1' length = 5, cursor at 5
  });
});
