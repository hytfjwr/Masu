import { memo, useCallback, useState } from 'react';
import type { SparklineType, SparklineColors, SparklineConfig } from '../../types/sparkline';

interface SparklineDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (config: SparklineConfig) => void;
  defaultLocationCell: string;
}

const SPARKLINE_TYPES: { value: SparklineType; label: string }[] = [
  { value: 'line', label: '折れ線' },
  { value: 'bar', label: '棒' },
  { value: 'winloss', label: '勝敗（Win/Loss）' },
];

export const SparklineDialog = memo(function SparklineDialog({
  visible,
  onClose,
  onConfirm,
  defaultLocationCell,
}: SparklineDialogProps) {
  const [sparkType, setSparkType] = useState<SparklineType>('line');
  const [dataRange, setDataRange] = useState('');
  const [locationCell, setLocationCell] = useState(defaultLocationCell);
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [highPointColor, setHighPointColor] = useState('');
  const [lowPointColor, setLowPointColor] = useState('');
  const [negativeColor, setNegativeColor] = useState('#EF4444');
  const [groupId, setGroupId] = useState('');

  const handleBackdropMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleConfirm = useCallback(() => {
    if (!dataRange.trim() || !locationCell.trim()) return;

    const colors: SparklineColors = {
      primary: primaryColor || '#3B82F6',
    };
    if (highPointColor) colors.highPoint = highPointColor;
    if (lowPointColor) colors.lowPoint = lowPointColor;
    if (negativeColor) colors.negative = negativeColor;

    const config: SparklineConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      type: sparkType,
      dataRange: dataRange.trim().toUpperCase(),
      locationCell: locationCell.trim().toUpperCase(),
      colors,
    };
    if (groupId.trim()) config.groupId = groupId.trim();

    onConfirm(config);
    onClose();
  }, [sparkType, dataRange, locationCell, primaryColor, highPointColor, lowPointColor, negativeColor, groupId, onConfirm, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="glass-panel rounded-2xl p-4 min-w-[360px] animate-dialog-spring"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-text-primary mb-3">スパークラインの挿入</h3>

        <div className="space-y-3">
          {/* Type selector */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>タイプ</span>
            <div className="flex flex-col gap-1">
              {SPARKLINE_TYPES.map((st) => (
                <label key={st.value} className="flex items-center gap-2 text-xs text-text-primary">
                  <input
                    type="radio"
                    name="sparklineType"
                    value={st.value}
                    checked={sparkType === st.value}
                    onChange={() => setSparkType(st.value)}
                  />
                  <span>{st.label}</span>
                </label>
              ))}
            </div>
          </label>

          {/* Data range */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>データ範囲（例: B2:L2）</span>
            <input
              type="text"
              value={dataRange}
              onChange={(e) => setDataRange(e.target.value)}
              placeholder="B2:L2"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
            />
          </label>

          {/* Location cell */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>配置先セル</span>
            <input
              type="text"
              value={locationCell}
              onChange={(e) => setLocationCell(e.target.value)}
              placeholder="M2"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
            />
          </label>

          {/* Colors */}
          <div className="flex flex-col gap-1 text-xs text-text-primary">
            <span>色設定</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">メイン色</span>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-6 h-6 border border-grid-line rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">負の値</span>
                <input
                  type="color"
                  value={negativeColor}
                  onChange={(e) => setNegativeColor(e.target.value)}
                  className="w-6 h-6 border border-grid-line rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">高値</span>
                <input
                  type="text"
                  value={highPointColor}
                  onChange={(e) => setHighPointColor(e.target.value)}
                  placeholder="例: #FF0000"
                  className="h-6 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none flex-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">安値</span>
                <input
                  type="text"
                  value={lowPointColor}
                  onChange={(e) => setLowPointColor(e.target.value)}
                  placeholder="例: #00FF00"
                  className="h-6 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none flex-1"
                />
              </label>
            </div>
          </div>

          {/* Group ID */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>グループID（オプション）</span>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="同じIDのスパークラインでY軸を統一"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
            />
          </label>

          {/* Buttons */}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="h-7 px-3 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="button"
              data-btn-primary
              className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90"
              onClick={handleConfirm}
              disabled={!dataRange.trim() || !locationCell.trim()}
            >
              挿入
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
