import type { MessageTable } from '../types';

/** Grid, context menus, headers, search panel, filter menu, file I/O messages. */
export const grid = {
  // Grid.tsx: toasts
  'grid.toast.sortMergedCellsError': {
    en: 'A range containing merged cells cannot be sorted.',
    ja: '結合されたセルを含む範囲は並べ替えできません',
  },
  'grid.toast.duplicatesRemoved': {
    en: '{duplicateCount} duplicate rows were found and removed. {uniqueCount} unique rows remain.',
    ja: '重複する行が {duplicateCount} 行見つかり、削除されました。{uniqueCount} 行の一意の値が残っています。',
  },
  'grid.toast.invalidInput': { en: 'The value is invalid.', ja: '入力値が無効です' },

  // Grid.tsx: default chart title
  'grid.chart.defaultTitle': { en: 'Chart', ja: 'グラフ' },

  // Grid.tsx: header search button
  'grid.header.searchTitle': { en: 'Search (Ctrl+F)', ja: '検索 (Ctrl+F)' },
  'grid.header.searchLabel': { en: 'Search', ja: '検索' },

  // Grid.tsx: filter button over the filter header row
  'grid.filterButton.title': { en: 'Filter', ja: 'フィルター' },

  // Grid.tsx: side panel titles
  'grid.sidePanel.conditionalFormat': { en: 'Conditional formatting', ja: '条件付き書式' },
  'grid.sidePanel.dataValidation': { en: 'Data validation', ja: 'データの入力規則' },
  'grid.sidePanel.chartEditor': { en: 'Chart editor', ja: 'グラフエディタ' },

  // Grid.tsx: add-comment prompt
  'grid.prompt.enterComment': { en: 'Enter a comment:', ja: 'コメントを入力してください:' },

  // Grid.tsx: split-to-columns delimiter popover
  'grid.splitDelimiter.label': { en: 'Delimiter:', ja: '区切り文字:' },
  'grid.splitDelimiter.auto': { en: 'Detect automatically', ja: '自動検出' },
  'grid.splitDelimiter.comma': { en: 'Comma', ja: 'カンマ' },
  'grid.splitDelimiter.semicolon': { en: 'Semicolon', ja: 'セミコロン' },
  'grid.splitDelimiter.period': { en: 'Period', ja: 'ピリオド' },
  'grid.splitDelimiter.space': { en: 'Space', ja: 'スペース' },
  'grid.splitDelimiter.custom': { en: 'Custom', ja: 'カスタム' },
  'grid.splitDelimiter.customPlaceholder': { en: 'Delimiter', ja: '区切り' },

  // ContextMenu.tsx (row/column header context menu)
  'grid.contextMenu.rowSingle': { en: 'row {row}', ja: '行 {row}' },
  'grid.contextMenu.rowRange': { en: 'rows {start}–{end}', ja: '行 {start}–{end}' },
  'grid.contextMenu.colSingle': { en: 'column {col}', ja: '列 {col}' },
  'grid.contextMenu.colRange': { en: 'columns {start}–{end}', ja: '列 {start}–{end}' },
  'grid.contextMenu.insertColLeft': { en: 'Insert column left', ja: '左に列を挿入' },
  'grid.contextMenu.insertColsLeftCount': {
    en: 'Insert {count} columns left',
    ja: '左に {count} 列挿入',
  },
  'grid.contextMenu.insertColRight': { en: 'Insert column right', ja: '右に列を挿入' },
  'grid.contextMenu.insertColsRightCount': {
    en: 'Insert {count} columns right',
    ja: '右に {count} 列挿入',
  },
  'grid.contextMenu.insertRowAbove': { en: 'Insert row above', ja: '上に行を挿入' },
  'grid.contextMenu.insertRowsAboveCount': {
    en: 'Insert {count} rows above',
    ja: '上に {count} 行挿入',
  },
  'grid.contextMenu.insertRowBelow': { en: 'Insert row below', ja: '下に行を挿入' },
  'grid.contextMenu.insertRowsBelowCount': {
    en: 'Insert {count} rows below',
    ja: '下に {count} 行挿入',
  },
  'grid.contextMenu.deleteColumn': { en: 'Delete column', ja: '列を削除' },
  'grid.contextMenu.deleteRow': { en: 'Delete row', ja: '行を削除' },
  'grid.contextMenu.deleteRange': { en: 'Delete {range}', ja: '{range}を削除' },
  'grid.contextMenu.hideRange': { en: 'Hide {range}', ja: '{range}を非表示' },
  'grid.contextMenu.unhideColumns': { en: 'Unhide columns', ja: '列を再表示' },
  'grid.contextMenu.unhideRows': { en: 'Unhide rows', ja: '行を再表示' },
  'grid.contextMenu.sortSheetAsc': { en: 'Sort sheet (A→Z)', ja: 'シートを並べ替え (A→Z)' },
  'grid.contextMenu.sortSheetDesc': { en: 'Sort sheet (Z→A)', ja: 'シートを並べ替え (Z→A)' },
  'grid.contextMenu.groupColumns': { en: 'Group columns', ja: '列のグループ化' },
  'grid.contextMenu.groupRows': { en: 'Group rows', ja: '行のグループ化' },
  'grid.contextMenu.ungroupColumns': { en: 'Ungroup columns', ja: '列のグループ解除' },
  'grid.contextMenu.ungroupRows': { en: 'Ungroup rows', ja: '行のグループ解除' },

  // CellContextMenu.tsx
  'grid.cellContextMenu.copy': { en: 'Copy', ja: 'コピー' },
  'grid.cellContextMenu.cut': { en: 'Cut', ja: '切り取り' },
  'grid.cellContextMenu.paste': { en: 'Paste', ja: '貼り付け' },
  'grid.cellContextMenu.insertRowAbove': { en: 'Insert row above', ja: '上に行を挿入' },
  'grid.cellContextMenu.insertRowBelow': { en: 'Insert row below', ja: '下に行を挿入' },
  'grid.cellContextMenu.insertColLeft': { en: 'Insert column left', ja: '左に列を挿入' },
  'grid.cellContextMenu.insertColRight': { en: 'Insert column right', ja: '右に列を挿入' },
  'grid.cellContextMenu.deleteRow': { en: 'Delete row', ja: '行を削除' },
  'grid.cellContextMenu.deleteCol': { en: 'Delete column', ja: '列を削除' },
  'grid.cellContextMenu.insertDropdown': { en: 'Dropdown', ja: 'プルダウン' },
  'grid.cellContextMenu.conditionalFormat': { en: 'Conditional formatting', ja: '条件付き書式' },
  'grid.cellContextMenu.dataValidation': { en: 'Data validation', ja: 'データの入力規則' },
  'grid.cellContextMenu.deleteComment': { en: 'Delete comment', ja: 'コメントを削除' },
  'grid.cellContextMenu.addComment': { en: 'Add comment', ja: 'コメントを追加' },
  'grid.cellContextMenu.openLink': { en: 'Open link', ja: 'リンクを開く' },
  'grid.cellContextMenu.editLink': { en: 'Edit link', ja: 'リンクを編集' },
  'grid.cellContextMenu.removeLink': { en: 'Remove link', ja: 'リンクを削除' },

  // DropOverlay.tsx
  'grid.dropOverlay.prompt': {
    en: 'Drop a file to import',
    ja: 'ファイルをドロップしてインポート',
  },
  'grid.dropOverlay.hint': { en: 'CSV or JSON file', ja: 'CSV または JSON ファイル' },

  // RowGroupBar.tsx / ColGroupBar.tsx
  'grid.groupBar.level': { en: 'Level {level}', ja: 'レベル {level}' },
  'grid.groupBar.expand': { en: 'Expand', ja: '展開' },
  'grid.groupBar.collapse': { en: 'Collapse', ja: '折りたたみ' },

  // RowHeader.tsx / ColumnHeader.tsx
  'grid.rowHeader.unhideRow': { en: 'Show hidden rows', ja: '非表示の行を再表示' },
  'grid.columnHeader.unhideColumn': { en: 'Show hidden columns', ja: '非表示の列を再表示' },

  // Cell.tsx
  'grid.cell.formulaError': { en: 'Formula error: {message}', ja: '数式エラー: {message}' },

  // ValidationDropdown/index.tsx
  'grid.validationDropdown.searchPlaceholder': { en: 'Search', ja: '検索' },
  'grid.validationDropdown.noResults': { en: 'No matching items', ja: '該当する項目がありません' },

  // SearchPanel/SearchPanel.tsx
  'grid.searchPanel.searchPlaceholder': { en: 'Search...', ja: '検索...' },
  'grid.searchPanel.noResults': { en: 'No results', ja: '0 件' },
  'grid.searchPanel.prevTitle': { en: 'Find previous (Shift+Enter)', ja: '前を検索 (Shift+Enter)' },
  'grid.searchPanel.nextTitle': { en: 'Find next (Enter)', ja: '次を検索 (Enter)' },
  'grid.searchPanel.closeTitle': { en: 'Close (Esc)', ja: '閉じる (Esc)' },
  'grid.searchPanel.replacePlaceholder': { en: 'Replace...', ja: '置換...' },
  'grid.searchPanel.replaceButton': { en: 'Replace', ja: '置換' },
  'grid.searchPanel.replaceAllButton': { en: 'Replace all', ja: 'すべて置換' },
  'grid.searchPanel.scopeThisSheet': { en: 'This sheet', ja: 'このシート' },
  'grid.searchPanel.scopeAllSheets': { en: 'All sheets', ja: 'すべてのシート' },
  'grid.searchPanel.hideOptions': { en: 'Hide options ▾', ja: 'オプションを隠す ▾' },
  'grid.searchPanel.showOptions': { en: 'Options ▸', ja: 'オプション ▸' },
  'grid.searchPanel.optionCaseSensitive': { en: 'Match case', ja: '大文字と小文字を区別する' },
  'grid.searchPanel.optionWholeCell': {
    en: 'Match entire cell contents',
    ja: 'セルの内容全体が一致',
  },
  'grid.searchPanel.optionUseRegex': {
    en: 'Search using regular expressions',
    ja: '正規表現を使用した検索',
  },
  'grid.searchPanel.optionSearchFormulas': {
    en: 'Also search within formulas',
    ja: '数式内も検索',
  },

  // FilterMenu/index.tsx
  'grid.filterMenu.opIsEmpty': { en: 'Is empty', ja: '空白' },
  'grid.filterMenu.opIsNotEmpty': { en: 'Is not empty', ja: '空白ではない' },
  'grid.filterMenu.opTextContains': { en: 'Text contains', ja: 'テキストを含む' },
  'grid.filterMenu.opTextNotContains': { en: 'Text does not contain', ja: 'テキストを含まない' },
  'grid.filterMenu.opTextStartsWith': { en: 'Text starts with', ja: 'テキストが次で始まる' },
  'grid.filterMenu.opTextEndsWith': { en: 'Text ends with', ja: 'テキストが次で終わる' },
  'grid.filterMenu.opTextEquals': { en: 'Text is exactly', ja: 'テキストが次と完全一致' },
  'grid.filterMenu.opGreaterThan': { en: 'Greater than', ja: 'より大きい' },
  'grid.filterMenu.opGreaterThanOrEqual': { en: 'Greater than or equal to', ja: '以上' },
  'grid.filterMenu.opLessThan': { en: 'Less than', ja: 'より小さい' },
  'grid.filterMenu.opLessThanOrEqual': { en: 'Less than or equal to', ja: '以下' },
  'grid.filterMenu.opEqual': { en: 'Is equal to', ja: '等しい' },
  'grid.filterMenu.opNotEqual': { en: 'Is not equal to', ja: '等しくない' },
  'grid.filterMenu.opBetween': { en: 'Between', ja: '間にある' },
  'grid.filterMenu.opNotBetween': { en: 'Not between', ja: '間にない' },
  'grid.filterMenu.sortAsc': { en: 'Sort A → Z', ja: 'A→Z で並べ替え' },
  'grid.filterMenu.sortDesc': { en: 'Sort Z → A', ja: 'Z→A で並べ替え' },
  'grid.filterMenu.filterByCondition': { en: 'Filter by condition', ja: '条件でフィルタ' },
  'grid.filterMenu.noneOption': { en: 'None', ja: 'なし' },
  'grid.filterMenu.valuePlaceholder': { en: 'Value', ja: '値' },
  'grid.filterMenu.otherValuePlaceholder': { en: 'Other value', ja: 'もう一方の値' },
  'grid.filterMenu.filterByValues': { en: 'Filter by values', ja: '値でフィルタ' },
  'grid.filterMenu.searchPlaceholder': { en: 'Search...', ja: '検索...' },
  'grid.filterMenu.selectAll': { en: 'Select all', ja: 'すべて選択' },
  'grid.filterMenu.clear': { en: 'Clear', ja: 'クリア' },
  'grid.filterMenu.blankValue': { en: '(Blank)', ja: '(空白)' },

  // ChartOverlay/ChartPanel.tsx
  'grid.chartPanel.menuLabel': { en: 'Chart menu', ja: 'グラフのメニュー' },
  'grid.chartPanel.editChart': { en: 'Edit chart', ja: 'グラフを編集' },
  'grid.chartPanel.deleteLabel': { en: 'Delete chart', ja: 'グラフを削除' },

  // useFileIO.ts
  'grid.fileIo.selectNativeFile': {
    en: 'Please select a Masu file ({extension})',
    ja: 'Masu 形式のファイルを選択してください ({extension})',
  },
  'grid.fileIo.readFailed': {
    en: 'Failed to read the file.',
    ja: 'ファイルの読み込みに失敗しました',
  },
} satisfies MessageTable;
