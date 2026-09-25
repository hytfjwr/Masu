import type { MessageTable } from '../types';

/** Side panels (conditional format, data validation, chart editor) and validation messages. */
export const panels = {
  // Shared across the conditional-format and data-validation panels (identical Japanese wording).
  'panels.shared.operator.greaterThan': { en: 'Greater than', ja: '次より大きい' },
  'panels.shared.operator.greaterThanOrEqual': {
    en: 'Greater than or equal to',
    ja: '以上',
  },
  'panels.shared.operator.lessThan': { en: 'Less than', ja: '次より小さい' },
  'panels.shared.operator.lessThanOrEqual': { en: 'Less than or equal to', ja: '以下' },
  'panels.shared.operator.equal': { en: 'Is equal to', ja: '次と等しい' },
  'panels.shared.operator.notEqual': { en: 'Is not equal to', ja: '次と等しくない' },
  'panels.shared.operator.between': { en: 'Is between', ja: '次の間にある' },
  'panels.shared.operator.notBetween': { en: 'Is not between', ja: '次の間にない' },
  'panels.shared.value': { en: 'Value', ja: '値' },
  'panels.shared.value1': { en: 'Value 1', ja: '値1' },
  'panels.shared.value2': { en: 'Value 2', ja: '値2' },
  'panels.shared.backgroundColor': { en: 'Background color', ja: '背景色' },

  // ConditionalFormatPanel
  'panels.conditionalFormat.condition.isEmpty': { en: 'Is empty', ja: '空白' },
  'panels.conditionalFormat.condition.isNotEmpty': { en: 'Is not empty', ja: '空白ではない' },
  'panels.conditionalFormat.condition.textContains': {
    en: 'Text contains',
    ja: '次を含むテキスト',
  },
  'panels.conditionalFormat.condition.textNotContains': {
    en: 'Text does not contain',
    ja: '次を含まないテキスト',
  },
  'panels.conditionalFormat.condition.textStartsWith': {
    en: 'Text starts with',
    ja: '次で始まるテキスト',
  },
  'panels.conditionalFormat.condition.textEndsWith': {
    en: 'Text ends with',
    ja: '次で終わるテキスト',
  },
  'panels.conditionalFormat.condition.textEquals': {
    en: 'Text is exactly',
    ja: '次と完全一致するテキスト',
  },
  'panels.conditionalFormat.condition.formula': { en: 'Custom formula is', ja: 'カスタム数式' },
  'panels.conditionalFormat.condition.duplicate': { en: 'Duplicate', ja: '重複' },
  'panels.conditionalFormat.condition.unique': { en: 'Unique', ja: '一意' },
  'panels.conditionalFormat.condition.top': { en: 'Top', ja: '上位' },
  'panels.conditionalFormat.condition.bottom': { en: 'Bottom', ja: '下位' },
  'panels.conditionalFormat.condition.aboveAverage': { en: 'Above average', ja: '平均より上' },
  'panels.conditionalFormat.condition.belowAverage': { en: 'Below average', ja: '平均より下' },
  'panels.conditionalFormat.describe.greaterThan': {
    en: 'Cell value > {value1}',
    ja: 'セルの値 > {value1}',
  },
  'panels.conditionalFormat.describe.greaterThanOrEqual': {
    en: 'Cell value >= {value1}',
    ja: 'セルの値 >= {value1}',
  },
  'panels.conditionalFormat.describe.lessThan': {
    en: 'Cell value < {value1}',
    ja: 'セルの値 < {value1}',
  },
  'panels.conditionalFormat.describe.lessThanOrEqual': {
    en: 'Cell value <= {value1}',
    ja: 'セルの値 <= {value1}',
  },
  'panels.conditionalFormat.describe.equal': {
    en: 'Cell value = {value1}',
    ja: 'セルの値 = {value1}',
  },
  'panels.conditionalFormat.describe.notEqual': {
    en: 'Cell value ≠ {value1}',
    ja: 'セルの値 ≠ {value1}',
  },
  'panels.conditionalFormat.describe.between': {
    en: 'Cell value is between {value1} and {value2}',
    ja: 'セルの値が {value1} 〜 {value2} の間',
  },
  'panels.conditionalFormat.describe.notBetween': {
    en: 'Cell value is not between {value1} and {value2}',
    ja: 'セルの値が {value1} 〜 {value2} の間ではない',
  },
  'panels.conditionalFormat.describe.textContains': {
    en: 'Text contains "{value1}"',
    ja: 'テキストに「{value1}」を含む',
  },
  'panels.conditionalFormat.describe.textNotContains': {
    en: 'Text does not contain "{value1}"',
    ja: 'テキストに「{value1}」を含まない',
  },
  'panels.conditionalFormat.describe.textStartsWith': {
    en: 'Text starts with "{value1}"',
    ja: 'テキストが「{value1}」で始まる',
  },
  'panels.conditionalFormat.describe.textEndsWith': {
    en: 'Text ends with "{value1}"',
    ja: 'テキストが「{value1}」で終わる',
  },
  'panels.conditionalFormat.describe.textEquals': {
    en: 'Text is exactly "{value1}"',
    ja: 'テキストが「{value1}」と完全一致',
  },
  'panels.conditionalFormat.describe.formula': {
    en: 'Custom formula: ={formula}',
    ja: 'カスタム数式: ={formula}',
  },
  'panels.conditionalFormat.describe.duplicate': { en: 'Duplicate values', ja: '重複する値' },
  'panels.conditionalFormat.describe.unique': { en: 'Unique values', ja: '一意の値' },
  'panels.conditionalFormat.describe.top': { en: 'Top {rank}', ja: '上位 {rank}' },
  'panels.conditionalFormat.describe.bottom': { en: 'Bottom {rank}', ja: '下位 {rank}' },
  'panels.conditionalFormat.colorScale': { en: 'Color scale', ja: 'カラースケール' },
  'panels.conditionalFormat.tab.singleColor': { en: 'Single color', ja: '単色' },
  'panels.conditionalFormat.label.range': { en: 'Range', ja: '範囲' },
  'panels.conditionalFormat.error.rangeFormat': {
    en: 'Enter a range like "A1" or "A1:B10"',
    ja: '範囲は "A1" または "A1:B10" の形式で入力してください',
  },
  'panels.conditionalFormat.label.formatCondition': {
    en: 'Format cells if…',
    ja: 'セルの書式設定の条件',
  },
  'panels.conditionalFormat.label.count': { en: 'Count', ja: '件数' },
  'panels.conditionalFormat.label.formattingStyle': { en: 'Formatting style', ja: '書式' },
  'panels.conditionalFormat.label.textColor': { en: 'Text color', ja: '文字色' },
  'panels.conditionalFormat.preview': { en: 'Preview 123', ja: 'プレビュー 123' },
  'panels.conditionalFormat.label.defaultStyles': { en: 'Default styles', ja: '既定のスタイル' },
  'panels.conditionalFormat.stylePreset.lightGreen': { en: 'Light green', ja: '薄い緑' },
  'panels.conditionalFormat.stylePreset.lightRed': { en: 'Light red', ja: '薄い赤' },
  'panels.conditionalFormat.stylePreset.lightYellow': { en: 'Light yellow', ja: '薄い黄' },
  'panels.conditionalFormat.stylePreset.boldText': { en: 'Bold text', ja: '太字' },
  'panels.conditionalFormat.stylePreset.redText': { en: 'Red text', ja: '赤文字' },
  'panels.conditionalFormat.stylePreset.blueBackground': { en: 'Blue background', ja: '青背景' },
  'panels.conditionalFormat.label.presets': { en: 'Presets', ja: 'プリセット' },
  'panels.conditionalFormat.colorScalePreset.greenToWhite': {
    en: 'Green to white',
    ja: '緑 → 白',
  },
  'panels.conditionalFormat.colorScalePreset.whiteToGreen': {
    en: 'White to green',
    ja: '白 → 緑',
  },
  'panels.conditionalFormat.colorScalePreset.redWhiteGreen': {
    en: 'Red to white to green',
    ja: '赤 → 白 → 緑',
  },
  'panels.conditionalFormat.colorScalePreset.greenWhiteRed': {
    en: 'Green to white to red',
    ja: '緑 → 白 → 赤',
  },
  'panels.conditionalFormat.colorScalePreset.whiteToRed': { en: 'White to red', ja: '白 → 赤' },
  'panels.conditionalFormat.colorScalePreset.yellowToGreen': {
    en: 'Yellow to green',
    ja: '黄 → 緑',
  },
  'panels.conditionalFormat.label.minPointType': { en: 'Min point: Type', ja: '最小点: 種類' },
  'panels.conditionalFormat.label.midPointType': { en: 'Mid point: Type', ja: '中間点: 種類' },
  'panels.conditionalFormat.label.maxPointType': { en: 'Max point: Type', ja: '最大点: 種類' },
  'panels.conditionalFormat.pointType.min': { en: 'Minimum', ja: '最小値' },
  'panels.conditionalFormat.pointType.max': { en: 'Maximum', ja: '最大値' },
  'panels.conditionalFormat.pointType.number': { en: 'Number', ja: '数値' },
  'panels.conditionalFormat.pointType.percent': { en: 'Percent', ja: 'パーセント' },
  'panels.conditionalFormat.pointType.percentile': { en: 'Percentile', ja: 'パーセンタイル' },
  'panels.conditionalFormat.label.useMidpoint': {
    en: 'Use a midpoint',
    ja: '中間点を使用する',
  },
  'panels.conditionalFormat.empty': { en: 'No rules', ja: 'ルールがありません' },
  'panels.conditionalFormat.addRule': { en: '+ Add a rule', ja: '+ 条件を追加' },

  // DataValidationPanel
  'panels.dataValidation.condition.listValues': { en: 'Dropdown', ja: 'プルダウン' },
  'panels.dataValidation.condition.listRange': {
    en: 'Dropdown (from a range)',
    ja: 'プルダウン（範囲内）',
  },
  'panels.dataValidation.condition.checkbox': { en: 'Checkbox', ja: 'チェックボックス' },
  'panels.dataValidation.condition.number': { en: 'Number', ja: '数値' },
  'panels.dataValidation.condition.textLength': { en: 'Text length', ja: 'テキストの長さ' },
  'panels.dataValidation.condition.date': { en: 'Date', ja: '日付' },
  'panels.dataValidation.condition.customFormula': {
    en: 'Custom formula is',
    ja: 'カスタム数式',
  },
  'panels.dataValidation.error.rangeFormat': {
    en: 'Enter a range like "A1" or "A1:B10"',
    ja: '範囲は "A1" または "A1:B10" の形式で入力してください',
  },
  'panels.dataValidation.describe.listRange': {
    en: 'Dropdown (range: {source})',
    ja: 'プルダウン(範囲: {source})',
  },
  'panels.dataValidation.describe.listValues': {
    en: 'Dropdown ({values})',
    ja: 'プルダウン({values})',
  },
  'panels.dataValidation.describe.number': {
    en: 'Number: {operator} {min}',
    ja: '数値: {operator} {min}',
  },
  'panels.dataValidation.describe.numberRange': {
    en: 'Number: {operator} {min} to {max}',
    ja: '数値: {operator} {min} 〜 {max}',
  },
  'panels.dataValidation.describe.textLength': {
    en: 'Text length: {operator} {min}',
    ja: '文字数: {operator} {min}',
  },
  'panels.dataValidation.describe.textLengthRange': {
    en: 'Text length: {operator} {min} to {max}',
    ja: '文字数: {operator} {min} 〜 {max}',
  },
  'panels.dataValidation.describe.date': {
    en: 'Date: {operator} {min}',
    ja: '日付: {operator} {min}',
  },
  'panels.dataValidation.describe.dateRange': {
    en: 'Date: {operator} {min} to {max}',
    ja: '日付: {operator} {min} 〜 {max}',
  },
  'panels.dataValidation.describe.customFormula': {
    en: 'Custom formula: ={formula}',
    ja: 'カスタム数式: ={formula}',
  },
  'panels.dataValidation.empty': {
    en: 'No data validation rules',
    ja: '入力規則がありません',
  },
  'panels.dataValidation.addRule': { en: '+ Add rule', ja: '+ ルールを追加' },
  'panels.dataValidation.label.applyToRange': { en: 'Apply to range', ja: '範囲に適用' },
  'panels.dataValidation.label.criteria': { en: 'Criteria', ja: '条件' },
  'panels.dataValidation.label.items': { en: 'Items', ja: '項目' },
  'panels.dataValidation.addItem': { en: 'Add item', ja: '項目を追加' },
  'panels.dataValidation.label.sourceRange': { en: 'Range', ja: '範囲' },
  'panels.dataValidation.label.useCustomCellValues': {
    en: 'Use custom cell values',
    ja: 'カスタムのセル値を使用',
  },
  'panels.dataValidation.label.checkedValue': { en: 'Checked value', ja: 'オンの値' },
  'panels.dataValidation.label.uncheckedValue': { en: 'Unchecked value', ja: 'オフの値' },
  'panels.dataValidation.label.startDate': { en: 'Start date', ja: '開始日' },
  'panels.dataValidation.label.endDate': { en: 'End date', ja: '終了日' },
  'panels.dataValidation.label.showDropdown': { en: 'Show dropdown', ja: 'ドロップダウンを表示' },
  'panels.dataValidation.label.dropdownStyle': {
    en: 'Dropdown display style',
    ja: 'プルダウンの表示スタイル',
  },
  'panels.dataValidation.dropdownStyle.chip': { en: 'Chip', ja: 'チップ' },
  'panels.dataValidation.dropdownStyle.arrow': { en: 'Arrow', ja: '矢印' },
  'panels.dataValidation.label.advancedOptions': { en: 'Advanced options', ja: '詳細オプション' },
  'panels.dataValidation.label.showHelpText': {
    en: 'Show helper text for the input',
    ja: '入力内容のヘルプテキストを表示',
  },
  'panels.dataValidation.label.onInvalidData': { en: 'On invalid data', ja: 'データが無効な場合' },
  'panels.dataValidation.label.showWarning': { en: 'Show a warning', ja: '警告を表示' },
  'panels.dataValidation.label.rejectInput': { en: 'Reject input', ja: '入力を拒否' },
  'panels.dataValidation.label.errorMessage': {
    en: 'Error message (optional)',
    ja: 'エラーメッセージ（任意）',
  },
  'panels.dataValidation.removeRule': { en: 'Remove rule', ja: 'ルールを削除' },

  // src/utils/validation.ts (invalid-input tooltip; React-external, uses `t()` from '../i18n')
  'panels.validation.label.number': { en: 'a number', ja: '数値' },
  'panels.validation.label.textLength': { en: 'a number of characters', ja: '文字数' },
  'panels.validation.label.date': { en: 'a date', ja: '日付' },
  'panels.validation.threshold.between': {
    en: 'Enter {label} between {lo} and {hi}',
    ja: '{lo} から {hi} までの{label}を入力してください',
  },
  'panels.validation.threshold.notBetween': {
    en: 'Enter {label} not between {lo} and {hi}',
    ja: '{lo} から {hi} の範囲外の{label}を入力してください',
  },
  'panels.validation.threshold.equal': {
    en: 'Enter {label} equal to {lo}',
    ja: '{lo} と等しい{label}を入力してください',
  },
  'panels.validation.threshold.notEqual': {
    en: 'Enter {label} not equal to {lo}',
    ja: '{lo} と異なる{label}を入力してください',
  },
  'panels.validation.threshold.greaterThan': {
    en: 'Enter {label} greater than {lo}',
    ja: '{lo} より大きい{label}を入力してください',
  },
  'panels.validation.threshold.greaterThanOrEqual': {
    en: 'Enter {label} greater than or equal to {lo}',
    ja: '{lo} 以上の{label}を入力してください',
  },
  'panels.validation.threshold.lessThan': {
    en: 'Enter {label} less than {lo}',
    ja: '{lo} より小さい{label}を入力してください',
  },
  'panels.validation.threshold.lessThanOrEqual': {
    en: 'Enter {label} less than or equal to {lo}',
    ja: '{lo} 以下の{label}を入力してください',
  },
  'panels.validation.list': {
    en: 'Enter one of the list items: {options}',
    ja: 'リスト内の項目を入力してください: {options}',
  },
  'panels.validation.checkboxValue': {
    en: 'Enter a checkbox value',
    ja: 'チェックボックスの値を入力してください',
  },
  'panels.validation.customFormulaInvalid': {
    en: 'The input value does not satisfy the custom formula condition',
    ja: '入力値がカスタム数式の条件を満たしていません',
  },

  // ChartEditorPanel
  'panels.chartEditor.type.bar': { en: 'Column', ja: '縦棒' },
  'panels.chartEditor.type.horizontalBar': { en: 'Bar', ja: '横棒' },
  'panels.chartEditor.type.stackedBar': { en: 'Stacked bar', ja: '積み上げ棒' },
  'panels.chartEditor.type.line': { en: 'Line', ja: '折れ線' },
  'panels.chartEditor.type.area': { en: 'Area', ja: 'エリア' },
  'panels.chartEditor.type.pie': { en: 'Pie', ja: '円' },
  'panels.chartEditor.type.donut': { en: 'Donut', ja: 'ドーナツ' },
  'panels.chartEditor.type.scatter': { en: 'Scatter', ja: '散布図' },
  'panels.chartEditor.error.rangeFormat': {
    en: 'Enter a range like "A1" or "A1:B10"',
    ja: '範囲は "A1" または "A1:B10" の形式で入力してください',
  },
  'panels.chartEditor.tab.setup': { en: 'Setup', ja: '設定' },
  'panels.chartEditor.tab.customize': { en: 'Customize', ja: 'カスタマイズ' },
  'panels.chartEditor.label.chartType': { en: 'Chart type', ja: 'グラフの種類' },
  'panels.chartEditor.label.dataRange': { en: 'Data range', ja: 'データ範囲' },
  'panels.chartEditor.label.seriesIn': { en: 'Series in', ja: '系列の向き' },
  'panels.chartEditor.seriesIn.columns': { en: 'Columns', ja: '列' },
  'panels.chartEditor.seriesIn.rows': { en: 'Rows', ja: '行' },
  'panels.chartEditor.label.useFirstRowAsHeaders': {
    en: 'Use row 1 as headers',
    ja: '1 行目を見出しとして使用',
  },
  'panels.chartEditor.label.useFirstColumnAsLabels': {
    en: 'Use column 1 as labels',
    ja: '1 列目をラベルとして使用',
  },
  'panels.chartEditor.label.chartTitle': { en: 'Chart title', ja: 'タイトル' },
  'panels.chartEditor.label.xAxisTitle': { en: 'X-axis title', ja: 'X 軸タイトル' },
  'panels.chartEditor.label.yAxisTitle': { en: 'Y-axis title', ja: 'Y 軸タイトル' },
  'panels.chartEditor.label.showLegend': { en: 'Show legend', ja: '凡例を表示' },
  'panels.chartEditor.label.legendPosition': { en: 'Legend position', ja: '凡例の位置' },
  'panels.chartEditor.legendPosition.top': { en: 'Top', ja: '上' },
  'panels.chartEditor.legendPosition.bottom': { en: 'Bottom', ja: '下' },
  'panels.chartEditor.legendPosition.right': { en: 'Right', ja: '右' },
  'panels.chartEditor.label.showGridlines': { en: 'Show gridlines', ja: 'グリッド線を表示' },
  'panels.chartEditor.label.seriesColors': { en: 'Series colors', ja: '系列の色' },
  'panels.chartEditor.icon.background': { en: 'Background', ja: '背景' },
  'panels.chartEditor.icon.color': { en: 'Color', ja: '色' },
} satisfies MessageTable;
