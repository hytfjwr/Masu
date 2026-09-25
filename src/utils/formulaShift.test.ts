import { describe, it, expect } from 'vitest';
import { scanRefs, shiftFormula, updateRefsForStructureChange } from './formulaShift';

describe('shiftFormula', () => {
  it('shifts relative refs and respects $ absolute markers', () => {
    expect(shiftFormula('A1+B$2+$C3+$D$4', 1, 1)).toBe('B2+C$2+$C4+$D$4');
  });

  it('shifts a range reference', () => {
    expect(shiftFormula('SUM(A1:B2)', 0, 3)).toBe('SUM(A4:B5)');
  });

  it('does not mistake a function name for a reference', () => {
    expect(shiftFormula('LOG10(A1)', 0, 1)).toBe('LOG10(A2)');
  });

  it('does not touch references inside string literals', () => {
    expect(shiftFormula('"A1"&A1', 0, 1)).toBe('"A1"&A2');
  });

  it('preserves quoted and unquoted sheet-name prefixes', () => {
    expect(shiftFormula("'My Sheet'!A1+Sheet2!B2", 1, 0)).toBe("'My Sheet'!B1+Sheet2!C2");
  });

  it('shifts a column reference, ignoring rowOffset', () => {
    expect(shiftFormula('SUM(A:A)', 1, 5)).toBe('SUM(B:B)');
  });

  it('shifts a row reference, ignoring colOffset', () => {
    expect(shiftFormula('SUM(1:1)', 3, 1)).toBe('SUM(2:2)');
  });

  it('produces #REF! when a reference underflows', () => {
    expect(shiftFormula('A1', 0, -1)).toBe('#REF!');
  });

  it('produces #REF! for a range when either corner underflows', () => {
    expect(shiftFormula('A1:B2', -1, 0)).toBe('#REF!');
  });

  it('returns the formula unchanged when there are no references', () => {
    expect(shiftFormula('1+2', 1, 1)).toBe('1+2');
  });

  it('is a no-op when both offsets are zero', () => {
    expect(shiftFormula('A1+SUM(B2:C3)', 0, 0)).toBe('A1+SUM(B2:C3)');
  });

  it('is case-insensitive when matching references', () => {
    expect(shiftFormula('a1+b2', 1, 0)).toBe('B1+C2');
  });
});

describe('scanRefs', () => {
  it('finds both arguments of a function whose name looks like a cell ref', () => {
    expect(scanRefs('ATAN2(A1,B1)')).toHaveLength(2);
  });

  it('does not treat a function name as a reference', () => {
    const refs = scanRefs('LOG10(A1)');
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe('cell');
    expect(refs[0].c1).toEqual({ col: 0, colAbs: false });
  });

  it('skips references embedded in string literals, including "" escapes', () => {
    expect(scanRefs('"A1""B2"&C3')).toHaveLength(1);
  });

  it('reports the full span including a quoted sheet prefix', () => {
    const refs = scanRefs("'My Sheet'!A1");
    expect(refs).toHaveLength(1);
    expect(refs[0].start).toBe(0);
    expect(refs[0].end).toBe("'My Sheet'!A1".length);
    expect(refs[0].sheetPrefix).toBe("'My Sheet'!");
  });

  it('classifies col and row references', () => {
    const refs = scanRefs('SUM(A:C)+SUM(1:3)');
    expect(refs.map((r) => r.kind)).toEqual(['col', 'row']);
  });
});

describe('updateRefsForStructureChange', () => {
  const col = (index: number, operation: 'insert' | 'delete') => ({ type: 'column' as const, index, operation });
  const row = (index: number, operation: 'insert' | 'delete') => ({ type: 'row' as const, index, operation });

  it('shifts whole-column and open-ended ranges', () => {
    expect(updateRefsForStructureChange('SUM(A:A)', col(0, 'insert')).formula).toBe('SUM(B:B)');
    expect(updateRefsForStructureChange('SUM(B2:B)', col(0, 'delete')).formula).toBe('SUM(A2:A)');
    expect(updateRefsForStructureChange('SUM(A2:A)', row(0, 'insert')).formula).toBe('SUM(A3:A)');
    expect(updateRefsForStructureChange('SUM(1:3)', row(0, 'insert')).formula).toBe('SUM(2:4)');
  });

  it('grows and shrinks ranges instead of breaking them', () => {
    expect(updateRefsForStructureChange('SUM(A1:A5)', row(2, 'insert')).formula).toBe('SUM(A1:A6)');
    expect(updateRefsForStructureChange('SUM(A1:A5)', row(2, 'delete')).formula).toBe('SUM(A1:A4)');
    expect(updateRefsForStructureChange('SUM(A3:A3)', row(2, 'delete'))).toEqual({ formula: 'SUM(#REF!)', hasRefError: true });
  });

  it('moves absolute references like Excel', () => {
    expect(updateRefsForStructureChange('$B$2*2', col(0, 'insert')).formula).toBe('$C$2*2');
  });

  it('only touches references to the changed sheet', () => {
    expect(updateRefsForStructureChange('Sheet2!A1+A1', col(0, 'delete'))).toEqual({ formula: 'Sheet2!A1+#REF!', hasRefError: true });
    const onOtherSheet = updateRefsForStructureChange("'My Sheet'!B1+A1", col(0, 'insert'), { appliesToUnqualified: false, targetSheetName: 'my sheet' });
    expect(onOtherSheet.formula).toBe("'My Sheet'!C1+A1");
  });

  it('handles lowercase references and leaves function names and strings alone', () => {
    expect(updateRefsForStructureChange('sum(a1:a3)+LOG10(b1)&"A1"', col(0, 'insert')).formula).toBe('sum(B1:B3)+LOG10(C1)&"A1"');
  });
});
