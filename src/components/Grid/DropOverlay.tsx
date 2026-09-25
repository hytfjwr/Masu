import { memo } from 'react';
import { useI18n } from '../../i18n/useI18n';

interface DropOverlayProps {
  visible: boolean;
}

export const DropOverlay = memo(function DropOverlay({ visible }: DropOverlayProps) {
  const { t } = useI18n();
  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-accent-selection/10 border-2 border-dashed border-accent-selection rounded pointer-events-none">
      <div className="glass-panel px-6 py-3 rounded-2xl animate-fade-in-scale">
        <p className="text-sm text-text-primary font-medium">{t('grid.dropOverlay.prompt')}</p>
        <p className="text-xs text-text-primary/50 mt-1">{t('grid.dropOverlay.hint')}</p>
      </div>
    </div>
  );
});
