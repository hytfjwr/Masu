/** ピボットテーブルの集計方法 */
export type AggregationType = 'sum' | 'count' | 'average' | 'max' | 'min';

/** ピボットテーブルの値フィールド */
export interface PivotValueField {
  /** ソースデータの列インデックス (0-indexed) */
  fieldIndex: number;
  /** フィールド名（ヘッダー行から取得） */
  fieldName: string;
  /** 集計方法 */
  aggregation: AggregationType;
  /** 表示形式 */
  numberFormat?: import('./grid').NumberFormat;
}

/** ピボットテーブルの設定 */
export interface PivotTableConfig {
  /** 一意のID */
  id: string;
  /** ソースシートID */
  sourceSheetId: string;
  /** ソースデータ範囲（例: "A1:D100"） */
  sourceRange: string;
  /** 行フィールドのインデックス (0-indexed) */
  rowFields: number[];
  /** 列フィールドのインデックス (0-indexed) */
  colFields: number[];
  /** 値フィールド */
  valueFields: PivotValueField[];
  /** フィルターフィールドのインデックス (0-indexed) */
  filterFields: number[];
  /** フィルター値: fieldIndex -> 許可する値のセット */
  filterValues?: Record<number, string[]>;
  /** 出力先シートID */
  targetSheetId: string;
  /** 折りたたみ状態（行ラベルのキー -> 折りたたみ状態） */
  collapsedRows?: Record<string, boolean>;
}
