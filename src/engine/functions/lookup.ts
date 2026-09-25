import type {
  ASTNode,
  EvalValue,
  FormulaError,
  FormulaResult,
  FunctionArgValue,
  FunctionContext,
  FunctionMeta,
  FunctionReturnValue,
} from '../types';
import { isFormulaError, isLambdaValue, isSpillResult, makeError } from '../types';
import {
  argDims,
  argToFlat,
  argToGrid,
  makeSpill,
  parseCriteria,
  resolveNumber,
  resolveScalar,
  resolveString,
  buildWildcardMatcher,
  exactMatchIndexForColumn,
  exactMatchIndexForList,
  exactMatchKey,
} from './helpers';
import { toBoolean } from '../coerce';
import { colIndexToLetter, parseCellKey } from '../../utils/coordinates';

// ============================================================
// COUNTA
// ============================================================
const COUNTA: FunctionMeta = {
  name: 'COUNTA',
  signature: 'COUNTA(value1, [value2], ...)',
  description: 'Counts the number of non-empty cells',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length === 0) return makeError('#VALUE!');

    let count = 0;
    for (const arg of args) {
      if (arg.kind === 'range' || arg.kind === 'array') {
        for (const val of argToFlat(arg, ctx)) {
          if (typeof val === 'string' && val === '') continue;
          count++;
        }
      } else {
        const val = resolveScalar(arg, ctx);
        if (isFormulaError(val)) {
          count++; // Errors count as non-empty
          continue;
        }
        if (typeof val === 'string' && val === '') continue;
        count++;
      }
    }
    return count;
  },
};

// ============================================================
// COUNTIF
// ============================================================
const COUNTIF: FunctionMeta = {
  name: 'COUNTIF',
  signature: 'COUNTIF(range, criteria)',
  description: 'Counts the number of cells within a range that meet the given criteria',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length !== 2) return makeError('#VALUE!');

    const rangeArg = args[0];
    const criteriaVal = resolveScalar(args[1], ctx);
    if (isFormulaError(criteriaVal)) return criteriaVal;
    const test = parseCriteria(criteriaVal);

    let count = 0;
    if (rangeArg.kind === 'range' || rangeArg.kind === 'array') {
      for (const val of argToFlat(rangeArg, ctx)) {
        if (test(val)) count++;
      }
    } else {
      const val = resolveScalar(rangeArg, ctx);
      if (isFormulaError(val)) return val;
      if (test(val)) count++;
    }

    return count;
  },
};

// ============================================================
// SUMIF
// ============================================================
const SUMIF: FunctionMeta = {
  name: 'SUMIF',
  signature: 'SUMIF(range, criteria, [sum_range])',
  description: 'Sums the values in a range that meet criteria in a corresponding range',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const rangeArg = args[0];
    const criteriaVal = resolveScalar(args[1], ctx);
    if (isFormulaError(criteriaVal)) return criteriaVal;
    const test = parseCriteria(criteriaVal);

    const sumRangeArg = args.length === 3 ? args[2] : rangeArg;

    if (rangeArg.kind === 'range' || rangeArg.kind === 'array') {
      const critFlat = argToFlat(rangeArg, ctx);
      const sumFlat =
        sumRangeArg.kind === 'range' || sumRangeArg.kind === 'array'
          ? argToFlat(sumRangeArg, ctx)
          : [];
      let sum = 0;

      for (let i = 0; i < critFlat.length; i++) {
        if (test(critFlat[i])) {
          const sumVal = i < sumFlat.length ? sumFlat[i] : critFlat[i];
          if (isFormulaError(sumVal)) return sumVal;
          if (typeof sumVal === 'number') {
            sum += sumVal;
          } else if (typeof sumVal === 'string' && sumVal !== '' && !isNaN(Number(sumVal))) {
            sum += Number(sumVal);
          }
        }
      }
      return sum;
    }

    // Single value criteria check
    const val = resolveScalar(rangeArg, ctx);
    if (isFormulaError(val)) return val;
    if (test(val)) {
      if (sumRangeArg.kind === 'value') {
        if (isFormulaError(sumRangeArg.value)) return sumRangeArg.value;
        if (typeof sumRangeArg.value === 'number') return sumRangeArg.value;
      }
    }
    return 0;
  },
};

// ============================================================
// VLOOKUP
// ============================================================
const VLOOKUP: FunctionMeta = {
  name: 'VLOOKUP',
  signature: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
  description:
    'Looks for a value in the leftmost column and returns a value in the same row from a specified column',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 4) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const tableArg = args[1];
    if (tableArg.kind !== 'range' && tableArg.kind !== 'array') return makeError('#VALUE!');

    const colIndexVal = resolveNumber(args[2], ctx);
    if (isFormulaError(colIndexVal)) return colIndexVal;
    const colIndex = Math.trunc(colIndexVal);

    // range_lookup: TRUE (default) = approximate match, FALSE = exact match
    let exactMatch = false; // default: approximate match (Excel compatible)
    if (args.length === 4) {
      const rl = resolveScalar(args[3], ctx);
      if (isFormulaError(rl)) return rl;
      exactMatch = rl === false || rl === 0 || rl === '0' || rl === 'FALSE';
    }

    const grid = argToGrid(tableArg, ctx);
    const numRows = grid.length;
    const numCols = grid[0]?.length ?? 0;
    if (numCols === 0) return makeError('#REF!');
    if (colIndex < 1 || colIndex > numCols) return makeError('#REF!');

    if (exactMatch) {
      // Exact match: indexed lookup when the table is a cached range, otherwise scan the first column
      const index = exactMatchIndexForColumn(grid, 0);
      if (index) {
        const key = exactMatchKey(lookupVal);
        const r = key === null ? undefined : index.get(key);
        return r === undefined ? makeError('#N/A') : grid[r][colIndex - 1];
      }
      for (let r = 0; r < numRows; r++) {
        const cellVal = grid[r][0];
        if (isFormulaError(cellVal)) continue;

        let match = false;
        if (typeof lookupVal === 'number' && typeof cellVal === 'number') {
          match = lookupVal === cellVal;
        } else if (typeof lookupVal === 'string' && typeof cellVal === 'string') {
          match = lookupVal.toLowerCase() === cellVal.toLowerCase();
        } else {
          match = String(lookupVal).toLowerCase() === String(cellVal).toLowerCase();
        }

        if (match) {
          return grid[r][colIndex - 1];
        }
      }
      return makeError('#N/A');
    }

    // Approximate match: assume sorted ascending, find largest <= lookupVal
    let bestRow = -1;
    for (let r = 0; r < numRows; r++) {
      const cellVal = grid[r][0];
      if (isFormulaError(cellVal)) continue;

      if (typeof lookupVal === 'number') {
        const numVal = typeof cellVal === 'number' ? cellVal : Number(cellVal);
        if (!isNaN(numVal) && numVal <= lookupVal) {
          bestRow = r;
        } else if (!isNaN(numVal) && numVal > lookupVal) {
          break;
        }
      } else {
        if (String(cellVal).toLowerCase() <= String(lookupVal).toLowerCase()) {
          bestRow = r;
        }
      }
    }

    if (bestRow === -1) return makeError('#N/A');
    return grid[bestRow][colIndex - 1];
  },
};

// ============================================================
// INDEX
// ============================================================
const INDEX: FunctionMeta = {
  name: 'INDEX',
  signature: 'INDEX(array, row_num, [col_num])',
  description: 'Returns the value of a cell in a given range specified by row and column number',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const arrayArg = args[0];
    if (arrayArg.kind !== 'range' && arrayArg.kind !== 'array') return makeError('#VALUE!');

    const rowNumVal = resolveNumber(args[1], ctx);
    if (isFormulaError(rowNumVal)) return rowNumVal;
    const rowNum = Math.trunc(rowNumVal);

    let colNum = 1;
    if (args.length === 3) {
      const cn = resolveNumber(args[2], ctx);
      if (isFormulaError(cn)) return cn;
      colNum = Math.trunc(cn);
    }

    const grid = argToGrid(arrayArg, ctx);
    const numRows = grid.length;
    const numCols = grid[0]?.length ?? 0;
    if (numCols === 0) return makeError('#REF!');

    if (rowNum < 1 || rowNum > numRows) return makeError('#REF!');
    if (colNum < 1 || colNum > numCols) return makeError('#REF!');

    return grid[rowNum - 1][colNum - 1];
  },
};

// ============================================================
// MATCH
// ============================================================
const MATCH: FunctionMeta = {
  name: 'MATCH',
  signature: 'MATCH(lookup_value, lookup_array, [match_type])',
  description: 'Returns the relative position of an item in a range that matches a specified value',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const arrayArg = args[1];
    if (arrayArg.kind !== 'range' && arrayArg.kind !== 'array') return makeError('#VALUE!');

    let matchType = 0; // default to exact match
    if (args.length === 3) {
      const mt = resolveNumber(args[2], ctx);
      if (isFormulaError(mt)) return mt;
      matchType = Math.trunc(mt);
    }

    const flat = argToFlat(arrayArg, ctx);

    if (matchType === 0) {
      // Exact match (indexed when the range is cached)
      const index = exactMatchIndexForList(flat);
      if (index) {
        const key = exactMatchKey(lookupVal);
        const i = key === null ? undefined : index.get(key);
        return i === undefined ? makeError('#N/A') : i + 1;
      }
      for (let i = 0; i < flat.length; i++) {
        const cellVal = flat[i];
        if (isFormulaError(cellVal)) continue;

        let match = false;
        if (typeof lookupVal === 'number' && typeof cellVal === 'number') {
          match = lookupVal === cellVal;
        } else if (typeof lookupVal === 'string' && typeof cellVal === 'string') {
          match = lookupVal.toLowerCase() === cellVal.toLowerCase();
        } else {
          match = String(lookupVal).toLowerCase() === String(cellVal).toLowerCase();
        }

        if (match) return i + 1; // 1-based
      }
      return makeError('#N/A');
    }

    if (matchType === 1) {
      // Largest value <= lookupVal (assumes sorted ascending)
      let bestIdx = -1;
      for (let i = 0; i < flat.length; i++) {
        const cellVal = flat[i];
        if (isFormulaError(cellVal)) continue;
        if (typeof lookupVal === 'number') {
          const numVal = typeof cellVal === 'number' ? cellVal : Number(String(cellVal));
          if (!isNaN(numVal) && numVal <= lookupVal) bestIdx = i;
          else if (!isNaN(numVal)) break;
        } else {
          const strVal = String(cellVal).toLowerCase();
          const strLookup = String(lookupVal).toLowerCase();
          if (strVal <= strLookup) bestIdx = i;
          else break;
        }
      }
      return bestIdx >= 0 ? bestIdx + 1 : makeError('#N/A');
    }

    if (matchType === -1) {
      // Smallest value >= lookupVal (assumes sorted descending)
      let bestIdx = -1;
      for (let i = 0; i < flat.length; i++) {
        const cellVal = flat[i];
        if (isFormulaError(cellVal)) continue;
        if (typeof lookupVal === 'number') {
          const numVal = typeof cellVal === 'number' ? cellVal : Number(String(cellVal));
          if (!isNaN(numVal) && numVal >= lookupVal) bestIdx = i;
          else if (!isNaN(numVal)) break;
        } else {
          const strVal = String(cellVal).toLowerCase();
          const strLookup = String(lookupVal).toLowerCase();
          if (strVal >= strLookup) bestIdx = i;
          else break;
        }
      }
      return bestIdx >= 0 ? bestIdx + 1 : makeError('#N/A');
    }

    return makeError('#VALUE!');
  },
};

// ============================================================
// AVERAGEIF
// ============================================================
const AVERAGEIF: FunctionMeta = {
  name: 'AVERAGEIF',
  signature: 'AVERAGEIF(range, criteria, [average_range])',
  description: 'Returns the average of cells in a range that meet a given criteria',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const rangeArg = args[0];
    const criteriaVal = resolveScalar(args[1], ctx);
    if (isFormulaError(criteriaVal)) return criteriaVal;
    const test = parseCriteria(criteriaVal);

    const avgRangeArg = args.length === 3 ? args[2] : rangeArg;

    if (rangeArg.kind === 'range' || rangeArg.kind === 'array') {
      const critFlat = argToFlat(rangeArg, ctx);
      const avgFlat =
        avgRangeArg.kind === 'range' || avgRangeArg.kind === 'array'
          ? argToFlat(avgRangeArg, ctx)
          : [];
      let sum = 0;
      let count = 0;

      for (let i = 0; i < critFlat.length; i++) {
        if (test(critFlat[i])) {
          const avgVal = i < avgFlat.length ? avgFlat[i] : critFlat[i];
          if (isFormulaError(avgVal)) return avgVal;
          if (typeof avgVal === 'number') {
            sum += avgVal;
            count++;
          } else if (typeof avgVal === 'string' && avgVal !== '' && !isNaN(Number(avgVal))) {
            sum += Number(avgVal);
            count++;
          }
        }
      }
      if (count === 0) return makeError('#DIV/0!');
      return sum / count;
    }

    return makeError('#VALUE!');
  },
};

// ============================================================
// SUMIFS
// ============================================================
const SUMIFS: FunctionMeta = {
  name: 'SUMIFS',
  signature: 'SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
  description: '複数の条件を満たすセルの合計を求めます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    // Minimum: sum_range, criteria_range1, criteria1 (3 args)
    // After first 3, pairs of (criteria_range, criteria)
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return makeError('#VALUE!');

    const sumRangeArg = args[0];
    if (sumRangeArg.kind !== 'range' && sumRangeArg.kind !== 'array') return makeError('#VALUE!');
    const sumFlat = argToFlat(sumRangeArg, ctx);

    const numPairs = (args.length - 1) / 2;
    const tests: Array<(idx: number) => boolean> = [];
    const criteriaFlats: FormulaResult[][] = [];

    for (let p = 0; p < numPairs; p++) {
      const rangeArg = args[1 + p * 2];
      const critArg = args[2 + p * 2];
      if (rangeArg.kind !== 'range' && rangeArg.kind !== 'array') return makeError('#VALUE!');
      criteriaFlats.push(argToFlat(rangeArg, ctx));

      const criteriaVal = resolveScalar(critArg, ctx);
      if (isFormulaError(criteriaVal)) return criteriaVal;
      const test = parseCriteria(criteriaVal);
      tests.push((idx: number) => test(criteriaFlats[p][idx]));
    }

    let sum = 0;
    for (let i = 0; i < sumFlat.length; i++) {
      let allMatch = true;
      for (let p = 0; p < numPairs; p++) {
        if (i >= criteriaFlats[p].length || !tests[p](i)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        const sumVal = sumFlat[i];
        if (isFormulaError(sumVal)) return sumVal;
        if (typeof sumVal === 'number') {
          sum += sumVal;
        } else if (typeof sumVal === 'string' && sumVal !== '' && !isNaN(Number(sumVal))) {
          sum += Number(sumVal);
        }
      }
    }
    return sum;
  },
};

// ============================================================
// COUNTIFS
// ============================================================
const COUNTIFS: FunctionMeta = {
  name: 'COUNTIFS',
  signature: 'COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
  description: '複数の条件を満たすセルの個数を求めます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length % 2 !== 0) return makeError('#VALUE!');

    const numPairs = args.length / 2;
    const criteriaFlats: FormulaResult[][] = [];
    const tests: Array<(idx: number) => boolean> = [];

    for (let p = 0; p < numPairs; p++) {
      const rangeArg = args[p * 2];
      const critArg = args[p * 2 + 1];
      if (rangeArg.kind !== 'range' && rangeArg.kind !== 'array') return makeError('#VALUE!');
      criteriaFlats.push(argToFlat(rangeArg, ctx));

      const criteriaVal = resolveScalar(critArg, ctx);
      if (isFormulaError(criteriaVal)) return criteriaVal;
      const test = parseCriteria(criteriaVal);
      tests.push((idx: number) => test(criteriaFlats[p][idx]));
    }

    // Use the length of the first criteria range
    const len = criteriaFlats[0].length;
    let count = 0;
    for (let i = 0; i < len; i++) {
      let allMatch = true;
      for (let p = 0; p < numPairs; p++) {
        if (i >= criteriaFlats[p].length || !tests[p](i)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) count++;
    }
    return count;
  },
};

// ============================================================
// AVERAGEIFS
// ============================================================
const AVERAGEIFS: FunctionMeta = {
  name: 'AVERAGEIFS',
  signature:
    'AVERAGEIFS(average_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
  description: '複数の条件を満たすセルの平均を求めます',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) return makeError('#VALUE!');

    const avgRangeArg = args[0];
    if (avgRangeArg.kind !== 'range' && avgRangeArg.kind !== 'array') return makeError('#VALUE!');
    const avgFlat = argToFlat(avgRangeArg, ctx);

    const numPairs = (args.length - 1) / 2;
    const criteriaFlats: FormulaResult[][] = [];
    const tests: Array<(idx: number) => boolean> = [];

    for (let p = 0; p < numPairs; p++) {
      const rangeArg = args[1 + p * 2];
      const critArg = args[2 + p * 2];
      if (rangeArg.kind !== 'range' && rangeArg.kind !== 'array') return makeError('#VALUE!');
      criteriaFlats.push(argToFlat(rangeArg, ctx));

      const criteriaVal = resolveScalar(critArg, ctx);
      if (isFormulaError(criteriaVal)) return criteriaVal;
      const test = parseCriteria(criteriaVal);
      tests.push((idx: number) => test(criteriaFlats[p][idx]));
    }

    let sum = 0;
    let count = 0;
    for (let i = 0; i < avgFlat.length; i++) {
      let allMatch = true;
      for (let p = 0; p < numPairs; p++) {
        if (i >= criteriaFlats[p].length || !tests[p](i)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        const avgVal = avgFlat[i];
        if (isFormulaError(avgVal)) return avgVal;
        if (typeof avgVal === 'number') {
          sum += avgVal;
          count++;
        } else if (typeof avgVal === 'string' && avgVal !== '' && !isNaN(Number(avgVal))) {
          sum += Number(avgVal);
          count++;
        }
      }
    }
    if (count === 0) return makeError('#DIV/0!');
    return sum / count;
  },
};

// ============================================================
// XLOOKUP
// ============================================================
const XLOOKUP: FunctionMeta = {
  name: 'XLOOKUP',
  signature:
    'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])',
  description: '検索値を検索範囲から探し、対応する値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 6) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const lookupArr = args[1];
    if (lookupArr.kind !== 'range' && lookupArr.kind !== 'array') return makeError('#VALUE!');
    const returnArr = args[2];
    if (returnArr.kind !== 'range' && returnArr.kind !== 'array') return makeError('#VALUE!');

    // if_not_found (default: #N/A error)
    let ifNotFound: FormulaResult = makeError('#N/A');
    if (args.length >= 4) {
      ifNotFound = resolveScalar(args[3], ctx);
    }

    // match_mode: 0 = exact (default), -1 = exact or next smaller, 1 = exact or next larger, 2 = wildcard
    let matchMode = 0;
    if (args.length >= 5) {
      const mm = resolveNumber(args[4], ctx);
      if (isFormulaError(mm)) return mm;
      matchMode = Math.trunc(mm);
    }

    // search_mode: 1 = first to last (default), -1 = last to first
    let searchMode = 1;
    if (args.length >= 6) {
      const sm = resolveNumber(args[5], ctx);
      if (isFormulaError(sm)) return sm;
      searchMode = Math.trunc(sm);
    }

    const lookupGrid = argToGrid(lookupArr, ctx);
    const returnGrid = argToGrid(returnArr, ctx);
    const lookupRows = lookupGrid.length;
    const lookupCols = lookupGrid[0]?.length ?? 0;
    const returnRows = returnGrid.length;
    const returnCols = returnGrid[0]?.length ?? 0;

    // Determine if lookup is a column (use first column) or a row (use first row)
    const isLookupColumn = lookupRows > 1 || lookupCols <= 1;
    const lookupLen = isLookupColumn ? lookupRows : lookupCols;

    const getSearchIdx = (i: number): number => {
      if (searchMode === -1) return lookupLen - 1 - i;
      return i;
    };

    const getLookupValue = (idx: number): FormulaResult => {
      if (isLookupColumn) return lookupGrid[idx]?.[0] ?? '';
      return lookupGrid[0]?.[idx] ?? '';
    };

    const getReturnValue = (idx: number): FormulaResult => {
      if (isLookupColumn && returnCols > 0) {
        if (idx < returnRows) return returnGrid[idx][0];
      } else if (idx < returnCols) {
        return returnGrid[0][idx];
      }
      return makeError('#REF!');
    };

    // Exact match
    if (matchMode === 0 || matchMode === 2) {
      for (let i = 0; i < lookupLen; i++) {
        const idx = getSearchIdx(i);
        const cellVal = getLookupValue(idx);
        if (isFormulaError(cellVal)) continue;

        let match = false;
        if (typeof lookupVal === 'number' && typeof cellVal === 'number') {
          match = lookupVal === cellVal;
        } else if (typeof lookupVal === 'string' && typeof cellVal === 'string') {
          if (matchMode === 2) {
            // Wildcard match (simple: * and ?)
            match = buildWildcardMatcher(lookupVal)(cellVal);
          } else {
            match = lookupVal.toLowerCase() === cellVal.toLowerCase();
          }
        } else {
          match = String(lookupVal).toLowerCase() === String(cellVal).toLowerCase();
        }

        if (match) return getReturnValue(idx);
      }
      return ifNotFound;
    }

    // Approximate match: -1 = next smaller, 1 = next larger
    let bestIdx = -1;
    let bestDiff = matchMode === -1 ? -Infinity : Infinity;

    for (let i = 0; i < lookupLen; i++) {
      const idx = getSearchIdx(i);
      const cellVal = getLookupValue(idx);
      if (isFormulaError(cellVal)) continue;

      if (typeof lookupVal === 'number') {
        const numVal = typeof cellVal === 'number' ? cellVal : Number(String(cellVal));
        if (isNaN(numVal)) continue;

        // Exact match is always best
        if (numVal === lookupVal) return getReturnValue(idx);

        if (matchMode === -1 && numVal < lookupVal && numVal > bestDiff) {
          bestDiff = numVal;
          bestIdx = idx;
        } else if (matchMode === 1 && numVal > lookupVal && numVal < bestDiff) {
          bestDiff = numVal;
          bestIdx = idx;
        }
      }
    }

    if (bestIdx >= 0) return getReturnValue(bestIdx);
    return ifNotFound;
  },
};

// ============================================================
// XMATCH
// ============================================================
const XMATCH: FunctionMeta = {
  name: 'XMATCH',
  signature: 'XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])',
  description: '検索値の位置を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 4) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const lookupArr = args[1];
    if (lookupArr.kind !== 'range' && lookupArr.kind !== 'array') return makeError('#VALUE!');

    let matchMode = 0;
    if (args.length >= 3) {
      const mm = resolveNumber(args[2], ctx);
      if (isFormulaError(mm)) return mm;
      matchMode = Math.trunc(mm);
    }

    let searchMode = 1;
    if (args.length >= 4) {
      const sm = resolveNumber(args[3], ctx);
      if (isFormulaError(sm)) return sm;
      searchMode = Math.trunc(sm);
    }

    const flat = argToFlat(lookupArr, ctx);

    const getSearchIdx = (i: number): number => {
      if (searchMode === -1) return flat.length - 1 - i;
      return i;
    };

    // Exact match
    if (matchMode === 0 || matchMode === 2) {
      for (let i = 0; i < flat.length; i++) {
        const idx = getSearchIdx(i);
        const cellVal = flat[idx];
        if (isFormulaError(cellVal)) continue;

        let match = false;
        if (typeof lookupVal === 'number' && typeof cellVal === 'number') {
          match = lookupVal === cellVal;
        } else if (typeof lookupVal === 'string' && typeof cellVal === 'string') {
          if (matchMode === 2) {
            match = buildWildcardMatcher(lookupVal)(cellVal);
          } else {
            match = lookupVal.toLowerCase() === cellVal.toLowerCase();
          }
        } else {
          match = String(lookupVal).toLowerCase() === String(cellVal).toLowerCase();
        }

        if (match) return idx + 1; // 1-based
      }
      return makeError('#N/A');
    }

    // Approximate match
    let bestIdx = -1;
    let bestDiff = matchMode === -1 ? -Infinity : Infinity;

    for (let i = 0; i < flat.length; i++) {
      const idx = getSearchIdx(i);
      const cellVal = flat[idx];
      if (isFormulaError(cellVal)) continue;

      if (typeof lookupVal === 'number') {
        const numVal = typeof cellVal === 'number' ? cellVal : Number(String(cellVal));
        if (isNaN(numVal)) continue;

        if (numVal === lookupVal) return idx + 1;

        if (matchMode === -1 && numVal < lookupVal && numVal > bestDiff) {
          bestDiff = numVal;
          bestIdx = idx;
        } else if (matchMode === 1 && numVal > lookupVal && numVal < bestDiff) {
          bestDiff = numVal;
          bestIdx = idx;
        }
      }
    }

    if (bestIdx >= 0) return bestIdx + 1;
    return makeError('#N/A');
  },
};

// ============================================================
// HLOOKUP
// ============================================================
const HLOOKUP: FunctionMeta = {
  name: 'HLOOKUP',
  signature: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])',
  description: '検索値をテーブルの先頭行から探し、指定した行の値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 3 || args.length > 4) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const tableArg = args[1];
    if (tableArg.kind !== 'range' && tableArg.kind !== 'array') return makeError('#VALUE!');

    const rowIndexVal = resolveNumber(args[2], ctx);
    if (isFormulaError(rowIndexVal)) return rowIndexVal;
    const rowIndex = Math.trunc(rowIndexVal);

    let exactMatch = false; // default: approximate match (Excel compatible)
    if (args.length === 4) {
      const rl = resolveScalar(args[3], ctx);
      if (isFormulaError(rl)) return rl;
      exactMatch = rl === false || rl === 0 || rl === '0' || rl === 'FALSE';
    }

    const grid = argToGrid(tableArg, ctx);
    const numRows = grid.length;
    const numCols = grid[0]?.length ?? 0;
    if (numRows === 0) return makeError('#REF!');
    if (rowIndex < 1 || rowIndex > numRows) return makeError('#REF!');

    if (exactMatch) {
      for (let c = 0; c < numCols; c++) {
        const cellVal = grid[0][c];
        if (isFormulaError(cellVal)) continue;

        let match = false;
        if (typeof lookupVal === 'number' && typeof cellVal === 'number') {
          match = lookupVal === cellVal;
        } else if (typeof lookupVal === 'string' && typeof cellVal === 'string') {
          match = lookupVal.toLowerCase() === cellVal.toLowerCase();
        } else {
          match = String(lookupVal).toLowerCase() === String(cellVal).toLowerCase();
        }

        if (match) return grid[rowIndex - 1][c];
      }
      return makeError('#N/A');
    }

    // Approximate match: assume sorted ascending, find largest <= lookupVal
    let bestCol = -1;
    for (let c = 0; c < numCols; c++) {
      const cellVal = grid[0][c];
      if (isFormulaError(cellVal)) continue;

      if (typeof lookupVal === 'number') {
        const numVal = typeof cellVal === 'number' ? cellVal : Number(cellVal);
        if (!isNaN(numVal) && numVal <= lookupVal) {
          bestCol = c;
        } else if (!isNaN(numVal) && numVal > lookupVal) {
          break;
        }
      } else {
        if (String(cellVal).toLowerCase() <= String(lookupVal).toLowerCase()) {
          bestCol = c;
        }
      }
    }

    if (bestCol === -1) return makeError('#N/A');
    return grid[rowIndex - 1][bestCol];
  },
};

// ============================================================
// LOOKUP
// ============================================================
const LOOKUP: FunctionMeta = {
  name: 'LOOKUP',
  signature: 'LOOKUP(lookup_value, lookup_vector, [result_vector])',
  description: '検索値に近似一致する値をベクトルまたは配列から探し、対応する値を返します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 3) return makeError('#VALUE!');

    const lookupVal = resolveScalar(args[0], ctx);
    if (isFormulaError(lookupVal)) return lookupVal;

    const vectorArg = args[1];
    if (vectorArg.kind !== 'range' && vectorArg.kind !== 'array') return makeError('#VALUE!');
    const grid = argToGrid(vectorArg, ctx);
    const rows = grid.length;
    const cols = rows > 0 ? grid[0].length : 0;
    if (rows === 0 || cols === 0) return makeError('#N/A');

    let searchFlat: FormulaResult[];
    let resultFlat: FormulaResult[];

    if (args.length === 3) {
      const resultArg = args[2];
      if (resultArg.kind !== 'range' && resultArg.kind !== 'array') return makeError('#VALUE!');
      searchFlat = grid.flat();
      resultFlat = argToFlat(resultArg, ctx);
    } else if (rows >= cols) {
      // Array form, square or taller than wide: search the first column, return from the last column.
      searchFlat = grid.map((r) => r[0]);
      resultFlat = grid.map((r) => r[cols - 1]);
    } else {
      // Array form, wider than tall: search the first row, return from the last row.
      searchFlat = grid[0];
      resultFlat = grid[rows - 1];
    }

    // Assumes ascending sort order; finds the last value <= lookupVal (linear scan).
    let bestIdx = -1;
    for (let i = 0; i < searchFlat.length; i++) {
      const cellVal = searchFlat[i];
      if (isFormulaError(cellVal)) continue;

      if (typeof lookupVal === 'number') {
        const numVal = typeof cellVal === 'number' ? cellVal : Number(cellVal);
        if (!isNaN(numVal) && numVal <= lookupVal) {
          bestIdx = i;
        } else if (!isNaN(numVal) && numVal > lookupVal) {
          break;
        }
      } else {
        if (String(cellVal).toLowerCase() <= String(lookupVal).toLowerCase()) {
          bestIdx = i;
        } else {
          break;
        }
      }
    }

    if (bestIdx === -1 || bestIdx >= resultFlat.length) return makeError('#N/A');
    return resultFlat[bestIdx];
  },
};

// ============================================================
// ROWS / COLUMNS
// ============================================================
const ROWS: FunctionMeta = {
  name: 'ROWS',
  signature: 'ROWS(array)',
  description: '範囲または配列の行数を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    if (args[0].kind === 'lambda') return makeError('#VALUE!');
    return argDims(args[0]).rows;
  },
};

const COLUMNS: FunctionMeta = {
  name: 'COLUMNS',
  signature: 'COLUMNS(array)',
  description: '範囲または配列の列数を返します',
  impl(args: FunctionArgValue[]): FormulaResult {
    if (args.length !== 1) return makeError('#VALUE!');
    if (args[0].kind === 'lambda') return makeError('#VALUE!');
    return argDims(args[0]).cols;
  },
};

// ============================================================
// ROW / COLUMN
// ============================================================
// ROW/COLUMN need the *position* of a raw reference argument, not its resolved
// value — a bare `A5` argument would otherwise be evaluated down to the value
// stored in A5, losing its address entirely. They're implemented as `special`
// forms so they can inspect the argument's AST node directly.
interface RefPosition {
  startRow: number;
  startCol: number;
  rows: number;
  cols: number;
}

function refPositionFromNode(
  node: ASTNode,
  ctx: FunctionContext,
): RefPosition | FormulaError | null {
  switch (node.kind) {
    case 'CellRef': {
      const { col, row } = parseCellKey(node.key);
      return { startRow: row, startCol: col, rows: 1, cols: 1 };
    }
    case 'SheetCellRef': {
      if (!ctx.resolveSheetName || !ctx.resolveSheetName(node.sheetName)) return makeError('#REF!');
      const { col, row } = parseCellKey(node.key);
      return { startRow: row, startCol: col, rows: 1, cols: 1 };
    }
    case 'RangeRef': {
      const s = parseCellKey(node.start);
      const e = parseCellKey(node.end);
      return {
        startRow: Math.min(s.row, e.row),
        startCol: Math.min(s.col, e.col),
        rows: Math.abs(e.row - s.row) + 1,
        cols: Math.abs(e.col - s.col) + 1,
      };
    }
    case 'SheetRangeRef': {
      if (!ctx.resolveSheetName || !ctx.resolveSheetName(node.sheetName)) return makeError('#REF!');
      const s = parseCellKey(node.start);
      const e = parseCellKey(node.end);
      return {
        startRow: Math.min(s.row, e.row),
        startCol: Math.min(s.col, e.col),
        rows: Math.abs(e.row - s.row) + 1,
        cols: Math.abs(e.col - s.col) + 1,
      };
    }
    case 'OpenRange': {
      let sheetId: string | undefined;
      if (node.sheetName) {
        if (!ctx.resolveSheetName) return makeError('#REF!');
        const resolved = ctx.resolveSheetName(node.sheetName);
        if (!resolved) return makeError('#REF!');
        sheetId = resolved;
      }
      const bounds = ctx.getSheetBounds ? ctx.getSheetBounds(sheetId) : { rows: 1000, cols: 26 };
      const endCol =
        node.endCol !== null ? node.endCol : bounds.cols > 0 ? bounds.cols - 1 : node.startCol;
      const endRow =
        node.endRow !== null ? node.endRow : bounds.rows > 0 ? bounds.rows - 1 : node.startRow;
      return {
        startRow: node.startRow,
        startCol: node.startCol,
        rows: Math.max(0, endRow - node.startRow + 1),
        cols: Math.max(0, endCol - node.startCol + 1),
      };
    }
    default:
      return null; // Not a static reference (e.g. a computed expression)
  }
}

function rowColSpecial(kind: 'row' | 'col', argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
  if (argNodes.length > 1) return makeError('#VALUE!');

  if (argNodes.length === 0) {
    if (!ctx.currentCell) return makeError('#VALUE!');
    return kind === 'row' ? ctx.currentCell.row + 1 : ctx.currentCell.col + 1;
  }

  const pos = refPositionFromNode(argNodes[0], ctx);
  if (pos === null) {
    // Not a static reference: evaluate normally. Errors propagate; any other
    // value is treated as occupying row 1 / column 1 (matches Excel's
    // behavior when a non-reference value is passed to ROW/COLUMN).
    const val = ctx.evalNode!(argNodes[0]);
    if (isLambdaValue(val)) return makeError('#VALUE!');
    if (isFormulaError(val)) return val;
    if (isSpillResult(val)) {
      const first = val.values[0]?.[0];
      if (first !== undefined && isFormulaError(first)) return first;
    }
    return 1;
  }
  if (isFormulaError(pos)) return pos;

  if (kind === 'row') {
    if (pos.rows > 1) {
      const values: FormulaResult[][] = [];
      for (let r = 0; r < pos.rows; r++) values.push([pos.startRow + 1 + r]);
      return { type: 'spill', values };
    }
    return pos.startRow + 1;
  }

  if (pos.cols > 1) {
    const row: FormulaResult[] = [];
    for (let c = 0; c < pos.cols; c++) row.push(pos.startCol + 1 + c);
    return { type: 'spill', values: [row] };
  }
  return pos.startCol + 1;
}

const ROW: FunctionMeta = {
  name: 'ROW',
  signature: 'ROW([reference])',
  description: '参照の行番号を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    return rowColSpecial('row', argNodes, ctx);
  },
};

const COLUMN: FunctionMeta = {
  name: 'COLUMN',
  signature: 'COLUMN([reference])',
  description: '参照の列番号を返します',
  impl: () => makeError('#VALUE!'),
  special(argNodes: ASTNode[], ctx: FunctionContext): EvalValue {
    return rowColSpecial('col', argNodes, ctx);
  },
};

// ============================================================
// ADDRESS
// ============================================================
function resolveBooleanArg(arg: FunctionArgValue, ctx: FunctionContext): boolean | FormulaError {
  const val = resolveScalar(arg, ctx);
  if (isFormulaError(val)) return val;
  return toBoolean(val);
}

const ADDRESS: FunctionMeta = {
  name: 'ADDRESS',
  signature: 'ADDRESS(row_num, column_num, [abs_num], [a1], [sheet_text])',
  description: '行番号と列番号からセル参照を表す文字列を作成します',
  impl(args: FunctionArgValue[], ctx: FunctionContext): FormulaResult {
    if (args.length < 2 || args.length > 5) return makeError('#VALUE!');

    const rowVal = resolveNumber(args[0], ctx);
    if (isFormulaError(rowVal)) return rowVal;
    const row = Math.trunc(rowVal);
    const colVal = resolveNumber(args[1], ctx);
    if (isFormulaError(colVal)) return colVal;
    const col = Math.trunc(colVal);
    if (row < 1 || col < 1) return makeError('#VALUE!');

    let absNum = 1;
    if (args.length >= 3 && args[2].kind !== 'omitted') {
      const a = resolveNumber(args[2], ctx);
      if (isFormulaError(a)) return a;
      absNum = Math.trunc(a);
    }
    if (absNum < 1 || absNum > 4) return makeError('#VALUE!');

    let a1Style = true;
    if (args.length >= 4 && args[3].kind !== 'omitted') {
      const b = resolveBooleanArg(args[3], ctx);
      if (isFormulaError(b)) return b;
      a1Style = b;
    }

    let sheetPart = '';
    if (args.length >= 5 && args[4].kind !== 'omitted') {
      const s = resolveString(args[4], ctx);
      if (isFormulaError(s)) return s;
      if (s !== '') sheetPart = s.includes(' ') ? `'${s}'!` : `${s}!`;
    }

    if (!a1Style) {
      // Only the fully-absolute 'R1C1' form is supported (no relative R[1]C[1] notation).
      if (absNum !== 1) return makeError('#VALUE!');
      return `${sheetPart}R${row}C${col}`;
    }

    const colLetter = colIndexToLetter(col - 1);
    let cellPart: string;
    switch (absNum) {
      case 1:
        cellPart = `$${colLetter}$${row}`;
        break;
      case 2:
        cellPart = `${colLetter}$${row}`;
        break;
      case 3:
        cellPart = `$${colLetter}${row}`;
        break;
      default:
        cellPart = `${colLetter}${row}`;
        break;
    }
    return `${sheetPart}${cellPart}`;
  },
};

// ============================================================
// INDIRECT
// ============================================================
interface IndirectRef {
  sheetName?: string;
  start: string;
  end?: string;
}

/** Parse an INDIRECT ref_text into a sheet name (if any) and cell/range keys. */
function parseIndirectRef(text: string): IndirectRef | null {
  let s = text.trim();
  let sheetName: string | undefined;

  const quotedMatch = /^'([^']*(?:''[^']*)*)'!(.+)$/.exec(s);
  if (quotedMatch) {
    sheetName = quotedMatch[1].replace(/''/g, "'");
    s = quotedMatch[2];
  } else {
    const bareMatch = /^([^'!:]+)!(.+)$/.exec(s);
    if (bareMatch) {
      sheetName = bareMatch[1];
      s = bareMatch[2];
    }
  }

  const rangeMatch = /^\$?([A-Za-z]+)\$?(\d+):\$?([A-Za-z]+)\$?(\d+)$/.exec(s);
  if (rangeMatch) {
    return {
      sheetName,
      start: `${rangeMatch[1].toUpperCase()}${rangeMatch[2]}`,
      end: `${rangeMatch[3].toUpperCase()}${rangeMatch[4]}`,
    };
  }
  const cellMatch = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(s);
  if (cellMatch) {
    return { sheetName, start: `${cellMatch[1].toUpperCase()}${cellMatch[2]}` };
  }
  return null;
}

const INDIRECT: FunctionMeta = {
  name: 'INDIRECT',
  signature: 'INDIRECT(ref_text, [a1])',
  description: '文字列で指定した参照からセルの値を返します',
  volatile: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 1 || args.length > 2) return makeError('#VALUE!');

    const textVal = resolveString(args[0], ctx);
    if (isFormulaError(textVal)) return textVal;

    // a1 accepted for signature compatibility; only A1-style ref_text is supported.
    if (args.length === 2 && args[1].kind !== 'omitted') {
      const a1 = resolveScalar(args[1], ctx);
      if (isFormulaError(a1)) return a1;
    }

    const parsed = parseIndirectRef(textVal);
    if (!parsed) return makeError('#REF!');

    let prefix = '';
    if (parsed.sheetName !== undefined) {
      if (!ctx.resolveSheetName) return makeError('#REF!');
      const sheetId = ctx.resolveSheetName(parsed.sheetName);
      if (!sheetId) return makeError('#REF!');
      prefix = `${sheetId}:`;
    }

    if (parsed.end === undefined) {
      return ctx.resolve(`${prefix}${parsed.start}`);
    }

    const s = parseCellKey(parsed.start);
    const e = parseCellKey(parsed.end);
    const startRow = Math.min(s.row, e.row);
    const endRow = Math.max(s.row, e.row);
    const startCol = Math.min(s.col, e.col);
    const endCol = Math.max(s.col, e.col);

    const values: FormulaResult[][] = [];
    for (let r = startRow; r <= endRow; r++) {
      const row: FormulaResult[] = [];
      for (let c = startCol; c <= endCol; c++) {
        row.push(ctx.resolve(`${prefix}${colIndexToLetter(c)}${r + 1}`));
      }
      values.push(row);
    }
    return makeSpill(values);
  },
};

// ============================================================
// OFFSET
// ============================================================
const OFFSET: FunctionMeta = {
  name: 'OFFSET',
  signature: 'OFFSET(reference, rows, cols, [height], [width])',
  description: '基準の参照から指定した行数・列数だけ移動した範囲を返します',
  volatile: true,
  impl(args: FunctionArgValue[], ctx: FunctionContext): FunctionReturnValue {
    if (args.length < 3 || args.length > 5) return makeError('#VALUE!');

    const refArg = args[0];
    if (refArg.kind !== 'range') return makeError('#VALUE!');

    const rowsOffsetVal = resolveNumber(args[1], ctx);
    if (isFormulaError(rowsOffsetVal)) return rowsOffsetVal;
    const rowsOffset = Math.trunc(rowsOffsetVal);
    const colsOffsetVal = resolveNumber(args[2], ctx);
    if (isFormulaError(colsOffsetVal)) return colsOffsetVal;
    const colsOffset = Math.trunc(colsOffsetVal);

    let height = refArg.rows;
    if (args.length >= 4 && args[3].kind !== 'omitted') {
      const h = resolveNumber(args[3], ctx);
      if (isFormulaError(h)) return h;
      height = Math.trunc(h);
    }
    let width = refArg.cols;
    if (args.length >= 5 && args[4].kind !== 'omitted') {
      const w = resolveNumber(args[4], ctx);
      if (isFormulaError(w)) return w;
      width = Math.trunc(w);
    }
    if (height < 1 || width < 1) return makeError('#REF!');

    const newStartRow = refArg.startRow + rowsOffset;
    const newStartCol = refArg.startCol + colsOffset;
    if (newStartRow < 0 || newStartCol < 0) return makeError('#REF!');

    const prefix = refArg.sheetId ? `${refArg.sheetId}:` : '';
    const values: FormulaResult[][] = [];
    for (let r = 0; r < height; r++) {
      const row: FormulaResult[] = [];
      for (let c = 0; c < width; c++) {
        row.push(
          ctx.resolve(`${prefix}${colIndexToLetter(newStartCol + c)}${newStartRow + r + 1}`),
        );
      }
      values.push(row);
    }
    return makeSpill(values);
  },
};

export const lookupFunctions: FunctionMeta[] = [
  COUNTA,
  COUNTIF,
  SUMIF,
  VLOOKUP,
  INDEX,
  MATCH,
  AVERAGEIF,
  SUMIFS,
  COUNTIFS,
  AVERAGEIFS,
  XLOOKUP,
  XMATCH,
  HLOOKUP,
  LOOKUP,
  ROWS,
  COLUMNS,
  ROW,
  COLUMN,
  ADDRESS,
  INDIRECT,
  OFFSET,
];
