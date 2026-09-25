import type { MessageTable } from '../types';

/** Strings shared across areas (buttons, generic labels). */
export const common = {
  'common.ok': { en: 'OK', ja: 'OK' },
  'common.cancel': { en: 'Cancel', ja: 'キャンセル' },
  'common.close': { en: 'Close', ja: '閉じる' },
  'common.apply': { en: 'Apply', ja: '適用' },
  'common.delete': { en: 'Delete', ja: '削除' },
  'common.done': { en: 'Done', ja: '完了' },
  'common.language': { en: 'Language', ja: '言語' },
  'common.languageOption': { en: 'Language: {name}', ja: '言語: {name}' },
  'common.untitledSpreadsheet': { en: 'Untitled spreadsheet', ja: '無題のスプレッドシート' },
  'common.fnCategory.math': { en: 'Math', ja: '数学' },
  'common.fnCategory.stat': { en: 'Statistical', ja: '統計' },
  'common.fnCategory.financial': { en: 'Financial', ja: '財務' },
  'common.fnCategory.logic': { en: 'Logical', ja: '論理' },
  'common.fnCategory.text': { en: 'Text', ja: 'テキスト' },
  'common.fnCategory.lookup': { en: 'Lookup', ja: '検索' },
  'common.fnCategory.date': { en: 'Date', ja: '日付' },
  'common.fnCategory.array': { en: 'Array', ja: '配列' },
  'common.fnCategory.info': { en: 'Info', ja: '情報' },
  'common.fnCategory.link': { en: 'Web', ja: 'リンク' },
} satisfies MessageTable;
