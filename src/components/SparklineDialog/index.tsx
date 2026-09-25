import { memo, useCallback, useState } from 'react';
import type { SparklineType, SparklineColors, SparklineConfig } from '../../types/sparkline';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

interface SparklineDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (config: SparklineConfig) => void;
  defaultLocationCell: string;
}

const SPARKLINE_TYPES: { value: SparklineType; labelKey: MessageKey }[] = [
  { value: 'line', labelKey: 'dialogs.sparkline.typeLine' },
  { value: 'bar', labelKey: 'dialogs.sparkline.typeBar' },
  { value: 'winloss', labelKey: 'dialogs.sparkline.typeWinLoss' },
];

export const SparklineDialog = memo(function SparklineDialog({
  visible,
  onClose,
  onConfirm,
  defaultLocationCell,
}: SparklineDialogProps) {
  const { t } = useI18n();
  const [sparkType, setSparkType] = useState<SparklineType>('line');
  const [dataRange, setDataRange] = useState('');
  const [locationCell, setLocationCell] = useState(defaultLocationCell);
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [highPointColor, setHighPointColor] = useState('');
  const [lowPointColor, setLowPointColor] = useState('');
  const [negativeColor, setNegativeColor] = useState('#EF4444');
  const [groupId, setGroupId] = useState('');

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

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
  }, [
    sparkType,
    dataRange,
    locationCell,
    primaryColor,
    highPointColor,
    lowPointColor,
    negativeColor,
    groupId,
    onConfirm,
    onClose,
  ]);

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
        <h3 className="text-sm font-medium text-text-primary mb-3">
          {t('dialogs.sparkline.title')}
        </h3>

        <div className="space-y-3">
          {/* Type selector */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>{t('dialogs.sparkline.typeLabel')}</span>
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
                  <span>{t(st.labelKey)}</span>
                </label>
              ))}
            </div>
          </label>

          {/* Data range */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>{t('dialogs.sparkline.dataRangeLabel')}</span>
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
            <span>{t('dialogs.sparkline.locationLabel')}</span>
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
            <span>{t('dialogs.sparkline.colorsLabel')}</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">{t('dialogs.sparkline.colorMain')}</span>
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-6 h-6 border border-grid-line rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">{t('dialogs.sparkline.colorNegative')}</span>
                <input
                  type="color"
                  value={negativeColor}
                  onChange={(e) => setNegativeColor(e.target.value)}
                  className="w-6 h-6 border border-grid-line rounded cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">{t('dialogs.sparkline.colorHigh')}</span>
                <input
                  type="text"
                  value={highPointColor}
                  onChange={(e) => setHighPointColor(e.target.value)}
                  placeholder={t('dialogs.sparkline.colorHighPlaceholder')}
                  className="h-6 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none flex-1"
                />
              </label>
              <label className="flex items-center gap-1">
                <span className="w-16 text-[10px]">{t('dialogs.sparkline.colorLow')}</span>
                <input
                  type="text"
                  value={lowPointColor}
                  onChange={(e) => setLowPointColor(e.target.value)}
                  placeholder={t('dialogs.sparkline.colorLowPlaceholder')}
                  className="h-6 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none flex-1"
                />
              </label>
            </div>
          </div>

          {/* Group ID */}
          <label className="flex flex-col gap-1 text-xs text-text-primary">
            <span>{t('dialogs.sparkline.groupIdLabel')}</span>
            <input
              type="text"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder={t('dialogs.sparkline.groupIdPlaceholder')}
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
              {t('common.cancel')}
            </button>
            <button
              type="button"
              data-btn-primary
              className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90"
              onClick={handleConfirm}
              disabled={!dataRange.trim() || !locationCell.trim()}
            >
              {t('dialogs.sparkline.insert')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
