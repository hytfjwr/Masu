/** スパークラインのタイプ */
export type SparklineType = 'line' | 'bar' | 'winloss';

/** スパークラインの色設定 */
export interface SparklineColors {
  /** メインの線/棒の色 */
  primary: string;
  /** 高値マーカー色 */
  highPoint?: string;
  /** 安値マーカー色 */
  lowPoint?: string;
  /** 負の値の色（棒・勝敗タイプ） */
  negative?: string;
}

/** スパークラインの設定 */
export interface SparklineConfig {
  id: string;
  type: SparklineType;
  /** データ範囲（例: "B2:L2"） */
  dataRange: string;
  /** 配置先セルキー（例: "M2"） */
  locationCell: string;
  /** 色設定 */
  colors: SparklineColors;
  /** グループID（Y軸スケール統一用、省略時は独立スケール） */
  groupId?: string;
}
