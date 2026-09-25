import { memo, useCallback, useEffect } from 'react';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl';

interface ShortcutItem {
  labelKey: MessageKey;
  /** `{arrow}` is replaced with the localized arrow-key name */
  keys: string;
}

interface ShortcutCategory {
  titleKey: MessageKey;
  items: ShortcutItem[];
}

const CATEGORIES: ShortcutCategory[] = [
  {
    titleKey: 'dialogs.shortcuts.categoryNavigation',
    items: [
      { labelKey: 'dialogs.shortcuts.moveCell', keys: '{arrow}' },
      { labelKey: 'dialogs.shortcuts.moveToDataEdge', keys: `${mod}+{arrow}` },
      { labelKey: 'dialogs.shortcuts.moveToRowStart', keys: 'Home' },
      { labelKey: 'dialogs.shortcuts.moveToA1', keys: `${mod}+Home` },
      { labelKey: 'dialogs.shortcuts.moveToDataEnd', keys: `${mod}+End` },
      { labelKey: 'dialogs.shortcuts.moveOneScreen', keys: 'PageUp/Down' },
    ],
  },
  {
    titleKey: 'dialogs.shortcuts.categorySelection',
    items: [
      { labelKey: 'dialogs.shortcuts.extendSelection', keys: 'Shift+{arrow}' },
      { labelKey: 'dialogs.shortcuts.extendSelectionToDataEdge', keys: `${mod}+Shift+{arrow}` },
      { labelKey: 'dialogs.shortcuts.selectAll', keys: `${mod}+A` },
      { labelKey: 'dialogs.shortcuts.selectRow', keys: 'Shift+Space' },
      { labelKey: 'dialogs.shortcuts.selectColumn', keys: `${mod}+Space` },
    ],
  },
  {
    titleKey: 'dialogs.shortcuts.categoryEditing',
    items: [
      { labelKey: 'dialogs.shortcuts.editCell', keys: 'F2' },
      { labelKey: 'dialogs.shortcuts.confirmMoveDown', keys: 'Enter' },
      { labelKey: 'dialogs.shortcuts.confirmMoveUp', keys: 'Shift+Enter' },
      { labelKey: 'dialogs.shortcuts.confirmMoveRightLeft', keys: 'Tab / Shift+Tab' },
      { labelKey: 'dialogs.shortcuts.newLineInCell', keys: 'Alt+Enter' },
      { labelKey: 'dialogs.shortcuts.fillSelection', keys: `${mod}+Enter` },
      { labelKey: 'dialogs.shortcuts.cancelEdit', keys: 'Esc' },
      { labelKey: 'common.delete', keys: 'Delete' },
      { labelKey: 'dialogs.shortcuts.fillDown', keys: `${mod}+D` },
      { labelKey: 'dialogs.shortcuts.fillRight', keys: `${mod}+R` },
      { labelKey: 'dialogs.shortcuts.insertToday', keys: `${mod}+;` },
      { labelKey: 'dialogs.shortcuts.insertNow', keys: `${mod}+Shift+;` },
    ],
  },
  {
    titleKey: 'dialogs.shortcuts.categoryFormatting',
    items: [
      { labelKey: 'dialogs.shortcuts.boldItalicUnderline', keys: `${mod}+B / I / U` },
      { labelKey: 'dialogs.shortcuts.strikethrough', keys: `${mod}+Shift+X` },
      { labelKey: 'dialogs.shortcuts.alignCenterLeftRight', keys: `${mod}+Shift+E / L / R` },
      { labelKey: 'dialogs.shortcuts.clearFormatting', keys: `${mod}+\\` },
    ],
  },
  {
    titleKey: 'dialogs.shortcuts.categoryClipboard',
    items: [
      { labelKey: 'dialogs.shortcuts.copyCutPaste', keys: `${mod}+C / X / V` },
      { labelKey: 'dialogs.shortcuts.pasteValuesOnly', keys: `${mod}+Shift+V` },
    ],
  },
  {
    titleKey: 'dialogs.shortcuts.categoryOther',
    items: [
      { labelKey: 'dialogs.shortcuts.undoRedo', keys: `${mod}+Z / Y` },
      { labelKey: 'dialogs.shortcuts.find', keys: `${mod}+F` },
      { labelKey: 'dialogs.shortcuts.findReplace', keys: `${mod}+H` },
      { labelKey: 'dialogs.shortcuts.showShortcuts', keys: `${mod}+/` },
    ],
  },
];

interface ShortcutsDialogProps {
  visible: boolean;
  onClose: () => void;
}

export const ShortcutsDialog = memo(function ShortcutsDialog({
  visible,
  onClose,
}: ShortcutsDialogProps) {
  const { t } = useI18n();
  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  // useEffect required: global keydown listener to close the dialog on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="glass-panel rounded-2xl w-[640px] max-h-[80vh] flex flex-col animate-dialog-spring">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-grid-line">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('dialogs.shortcuts.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-text-primary hover:text-error text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-4">
            {CATEGORIES.map((category) => (
              <div key={category.titleKey} className="space-y-1.5">
                <div className="text-xs font-semibold text-text-primary">
                  {t(category.titleKey)}
                </div>
                <div className="space-y-1">
                  {category.items.map((item) => (
                    <div
                      key={item.labelKey}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-text-primary/80">{t(item.labelKey)}</span>
                      <kbd className="px-1.5 py-0.5 rounded border border-grid-line bg-header-bg text-[11px] font-mono whitespace-nowrap">
                        {item.keys.replace('{arrow}', t('dialogs.shortcuts.arrowKey'))}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-grid-line">
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs bg-ui-bg border border-grid-line rounded hover:bg-header-bg"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
});
