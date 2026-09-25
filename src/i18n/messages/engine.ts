import type { MessageTable } from '../types';

/** Formula syntax errors and messages produced outside React (utils, io, pivot output, grouping). */
export const engine = {
  // Parser
  'engine.parser.expectedRightParen': { en: "')' is required", ja: "')' が必要です" },
  'engine.parser.expectedRightBrace': { en: "'}' is required", ja: "'}' が必要です" },
  'engine.parser.expectedLeftParen': { en: "'(' is required", ja: "'(' が必要です" },
  'engine.parser.expectedRangeEndCellRef': {
    en: 'A cell reference is required for the range end',
    ja: '範囲の終点にはセル参照が必要です',
  },
  'engine.parser.expectedNumberAfterSign': {
    en: 'A number is required after the sign',
    ja: '符号の後には数値が必要です',
  },
  'engine.parser.expectedCommaOrRightParen': {
    en: "',' or ')' is required",
    ja: "',' か ')' が必要です",
  },
  'engine.parser.trailingText': {
    en: 'Unexpected text: {text}',
    ja: '余分な記述があります: {text}',
  },
  'engine.parser.unexpectedEndWithExpected': {
    en: 'The formula ends too soon ({expected})',
    ja: '式が途中で終わっています（{expected}）',
  },
  'engine.parser.unexpectedEnd': {
    en: 'The formula ends too soon',
    ja: '式が途中で終わっています',
  },
  'engine.parser.expectedButFound': {
    en: '{expected} (found {text})',
    ja: '{expected}（{text} があります）',
  },
  'engine.parser.unexpectedToken': {
    en: '{text} cannot go here',
    ja: 'ここに {text} は置けません',
  },
  'engine.parser.arrayRowLengthMismatch': {
    en: 'Every row of the array must have the same number of elements',
    ja: '配列の各行の要素数が揃っていません',
  },
  'engine.parser.arrayConstantOnly': {
    en: 'An array can only contain constants (numbers, strings, TRUE/FALSE, error values)',
    ja: '配列には定数（数値・文字列・TRUE/FALSE・エラー値）だけを書けます',
  },

  // Tokenizer
  'engine.tokenizer.invalidCellRefAfterSheet': {
    en: 'Invalid cell reference after the sheet name: {ref}',
    ja: 'シート名の後のセル参照が正しくありません: {ref}',
  },
  'engine.tokenizer.missingCellRefAfterSheet': {
    en: 'A cell reference is required after the sheet name',
    ja: 'シート名の後にセル参照が必要です',
  },
  'engine.tokenizer.invalidRangeEnd': {
    en: 'Invalid range end: {ref}',
    ja: '範囲の終点が正しくありません: {ref}',
  },
  'engine.tokenizer.missingRangeEndCellRef': {
    en: 'A cell reference is required for the range end',
    ja: '範囲の終点にセル参照が必要です',
  },
  'engine.tokenizer.unclosedSheetName': {
    en: "The sheet name is not closed (' is required)",
    ja: "シート名が閉じられていません（' が必要です）",
  },
  'engine.tokenizer.missingBangAfterSheetName': {
    en: '! is required after the sheet name',
    ja: 'シート名の後に ! が必要です',
  },
  'engine.tokenizer.unclosedString': {
    en: 'The string is not closed (" is required)',
    ja: '文字列が閉じられていません（" が必要です）',
  },
  'engine.tokenizer.unknownErrorLiteral': {
    en: 'Unknown error value: {text}',
    ja: '不明なエラー値です: {text}',
  },
  'engine.tokenizer.invalidCharacter': {
    en: 'This character cannot be used: {char}',
    ja: '使用できない文字です: {char}',
  },

  // sheetUtils
  'engine.sheetUtils.copyOf': { en: 'Copy of {sheetName}', ja: '{sheetName} のコピー' },

  // chartData
  'engine.chartData.seriesName': { en: 'Series {index}', ja: '系列{index}' },

  // xlsx
  'engine.xlsx.noSheets': { en: 'The file contains no sheets', ja: 'シートが含まれていません' },

  // groupManager
  'engine.groupManager.maxNestingExceeded': {
    en: 'Nesting is limited to 3 levels',
    ja: '最大3階層までのネストに制限されています',
  },
} satisfies MessageTable;
