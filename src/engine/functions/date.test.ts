import { describe, it, expect } from 'vitest';
import { evaluate } from '../evaluator';
import { parse } from '../parser';
import type { FormulaResult, RangeExpander } from '../types';

const expandRange: RangeExpander = (start: string, end: string): string[] => {
  const startCol = start.charCodeAt(0) - 65;
  const endCol = end.charCodeAt(0) - 65;
  const startRow = parseInt(start.slice(1), 10);
  const endRow = parseInt(end.slice(1), 10);
  const keys: string[] = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      keys.push(`${String.fromCharCode(65 + c)}${r}`);
    }
  }
  return keys;
};

function evalFormula(formula: string, cellValues: Record<string, FormulaResult> = {}): FormulaResult {
  const resolve = (key: string): FormulaResult => cellValues[key] ?? '';
  const ast = parse(formula);
  const result = evaluate(ast, resolve, expandRange);
  if (typeof result === 'object' && result !== null && 'type' in result && result.type === 'spill') {
    return { type: 'error', code: '#VALUE!' };
  }
  return result as FormulaResult;
}

describe('DATE / YEAR / MONTH / DAY (existing behavior, reimplemented on dateSerial)', () => {
  it('DATE returns the known 1900-system serial', () => {
    expect(evalFormula('DATE(2026,4,10)')).toBe(46122);
  });

  it('YEAR/MONTH/DAY round-trip a serial', () => {
    expect(evalFormula('YEAR(46122)')).toBe(2026);
    expect(evalFormula('MONTH(46122)')).toBe(4);
    expect(evalFormula('DAY(46122)')).toBe(10);
  });

  it('YEAR accepts a date-shaped text argument (implicit coercion)', () => {
    expect(evalFormula('YEAR("2026/4/10")')).toBe(2026);
  });

  it('DATE returns #NUM! for a serial below 1', () => {
    expect(evalFormula('DATE(1899,12,1)')).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('TIME / HOUR / MINUTE / SECOND', () => {
  it('TIME builds the fractional serial for a time of day', () => {
    const result = evalFormula('TIME(12,0,0)');
    expect(result).toBeCloseTo(0.5, 9);
  });

  it('TIME wraps around a 24-hour day', () => {
    expect(evalFormula('TIME(25,0,0)')).toBeCloseTo(evalFormula('TIME(1,0,0)') as number, 9);
  });

  it('HOUR/MINUTE/SECOND extract the time parts', () => {
    expect(evalFormula('HOUR(46122.5)')).toBe(12);
    expect(evalFormula('MINUTE(TIME(13,45,30))')).toBe(45);
    expect(evalFormula('SECOND(TIME(13,45,30))')).toBe(30);
  });

  it('TIME returns #NUM! for a negative total', () => {
    expect(evalFormula('TIME(-1,0,0)')).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('WEEKDAY', () => {
  it('defaults to type 1 (Sunday=1)', () => {
    expect(evalFormula('WEEKDAY(46122)')).toBe(6); // 2026-04-10 is a Friday
  });

  it('supports type 2 (Monday=1) and type 3 (Monday=0)', () => {
    expect(evalFormula('WEEKDAY(46122,2)')).toBe(5);
    expect(evalFormula('WEEKDAY(46122,3)')).toBe(4);
  });
});

describe('WEEKNUM / ISOWEEKNUM', () => {
  it('WEEKNUM with type 1 and 2', () => {
    expect(evalFormula('WEEKNUM(46122,1)')).toBe(15);
    expect(evalFormula('WEEKNUM(46122,2)')).toBe(15);
  });

  it('WEEKNUM with type 21 matches ISOWEEKNUM', () => {
    expect(evalFormula('WEEKNUM(46122,21)')).toBe(15);
    expect(evalFormula('ISOWEEKNUM(46122)')).toBe(15);
  });
});

describe('EDATE / EOMONTH', () => {
  it('EOMONTH(2026-04-10, 1) is 2026-05-31 (given example)', () => {
    expect(evalFormula('EOMONTH(46122,1)')).toBe(46173);
    expect(evalFormula('DATE(2026,5,31)')).toBe(46173);
  });

  it('EDATE clamps to the last day of the target month', () => {
    expect(evalFormula('EDATE(DATE(2026,1,31),1)')).toBe(evalFormula('DATE(2026,2,28)'));
  });

  it('EDATE/EOMONTH support negative month offsets', () => {
    expect(evalFormula('EDATE(DATE(2026,4,10),-1)')).toBe(evalFormula('DATE(2026,3,10)'));
  });
});

describe('DATEDIF', () => {
  const start = 'DATE(2020,1,15)';
  const end = 'DATE(2026,4,10)';

  it('computes Y/M/D units', () => {
    expect(evalFormula(`DATEDIF(${start},${end},"Y")`)).toBe(6);
    expect(evalFormula(`DATEDIF(${start},${end},"M")`)).toBe(74);
    expect(evalFormula(`DATEDIF(${start},${end},"D")`)).toBe(2277);
  });

  it('computes MD/YM/YD units', () => {
    expect(evalFormula(`DATEDIF(${start},${end},"MD")`)).toBe(26);
    expect(evalFormula(`DATEDIF(${start},${end},"YM")`)).toBe(3);
    expect(evalFormula(`DATEDIF(${start},${end},"YD")`)).toBe(85);
  });

  it('returns #NUM! when start is after end', () => {
    expect(evalFormula(`DATEDIF(${end},${start},"D")`)).toEqual({ type: 'error', code: '#NUM!' });
  });
});

describe('DAYS / DAYS360 / YEARFRAC', () => {
  it('DAYS computes end - start', () => {
    expect(evalFormula('DAYS(DATE(2026,4,10),DATE(2026,4,6))')).toBe(4);
  });

  it('DAYS360 treats the year as 360 days (US/NASD method)', () => {
    expect(evalFormula('DAYS360(DATE(2011,1,1),DATE(2011,12,31))')).toBe(360);
  });

  it('DAYS360 European method', () => {
    expect(evalFormula('DAYS360(DATE(2011,1,1),DATE(2011,12,31),TRUE)')).toBe(359);
  });

  it('YEARFRAC with basis 0 (30/360)', () => {
    expect(evalFormula('YEARFRAC(DATE(2026,1,1),DATE(2026,7,1),0)')).toBeCloseTo(0.5, 9);
  });

  it('YEARFRAC with basis 3 (actual/365)', () => {
    expect(evalFormula('YEARFRAC(DATE(2026,1,1),DATE(2026,7,1),3)')).toBeCloseTo(0.4958904109589041, 9);
  });
});

describe('DATEVALUE / TIMEVALUE', () => {
  it('DATEVALUE parses a date-shaped string', () => {
    expect(evalFormula('DATEVALUE("2026/4/10")')).toBe(46122);
  });

  it('DATEVALUE returns #VALUE! for non-date text', () => {
    expect(evalFormula('DATEVALUE("123")')).toEqual({ type: 'error', code: '#VALUE!' });
  });

  it('TIMEVALUE parses a time-shaped string', () => {
    expect(evalFormula('TIMEVALUE("12:00")')).toBeCloseTo(0.5, 9);
  });

  it('TIMEVALUE returns #VALUE! for non-time text', () => {
    expect(evalFormula('TIMEVALUE("abc")')).toEqual({ type: 'error', code: '#VALUE!' });
  });
});

describe('NETWORKDAYS / NETWORKDAYS.INTL', () => {
  it('counts weekdays between a Monday and a Friday', () => {
    expect(evalFormula('NETWORKDAYS(DATE(2026,4,6),DATE(2026,4,10))')).toBe(5);
  });

  it('excludes a holiday within the range', () => {
    const vals: Record<string, FormulaResult> = { A1: 46120 }; // 2026-04-08 (Wed)
    expect(evalFormula('NETWORKDAYS(DATE(2026,4,6),DATE(2026,4,10),A1:A1)', vals)).toBe(4);
  });

  it('NETWORKDAYS.INTL treats Monday as a weekend day under code 2', () => {
    expect(evalFormula('NETWORKDAYS.INTL(DATE(2026,4,6),DATE(2026,4,10),2)')).toBe(4);
  });

  it('NETWORKDAYS.INTL accepts a 7-character weekend string', () => {
    expect(evalFormula('NETWORKDAYS.INTL(DATE(2026,4,6),DATE(2026,4,10),"0000011")')).toBe(5);
  });
});

describe('WORKDAY / WORKDAY.INTL', () => {
  it('WORKDAY advances by business days, skipping weekends', () => {
    expect(evalFormula('WORKDAY(DATE(2026,4,6),5)')).toBe(evalFormula('DATE(2026,4,13)'));
  });

  it('WORKDAY supports negative days (moves backward)', () => {
    expect(evalFormula('WORKDAY(DATE(2026,4,10),-5)')).toBe(evalFormula('DATE(2026,4,3)'));
  });

  it('WORKDAY.INTL supports a custom weekend code', () => {
    expect(evalFormula('WORKDAY.INTL(DATE(2026,4,6),5,2)')).toBe(evalFormula('DATE(2026,4,11)'));
  });
});
