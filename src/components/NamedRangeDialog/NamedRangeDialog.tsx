import { memo, useCallback, useState } from 'react';
import type { NamedRange } from '../../types/grid';
import { useI18n } from '../../i18n/useI18n';

interface NamedRangeDialogProps {
  visible: boolean;
  onClose: () => void;
  namedRanges: NamedRange[];
  onAdd: (name: string, range: string, refSheetId?: string) => boolean;
  onUpdate: (oldName: string, newName: string, range: string, refSheetId?: string) => boolean;
  onDelete: (name: string) => boolean;
  currentSheetId: string;
  sheets: Array<{ id: string; name: string }>;
}

export const NamedRangeDialog = memo(function NamedRangeDialog({
  visible,
  onClose,
  namedRanges,
  onAdd,
  onUpdate,
  onDelete,
  currentSheetId,
  sheets,
}: NamedRangeDialogProps) {
  const { t } = useI18n();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRange, setFormRange] = useState('');
  const [formSheetId, setFormSheetId] = useState(currentSheetId);
  const [error, setError] = useState('');

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const resetForm = useCallback(() => {
    setFormName('');
    setFormRange('');
    setFormSheetId(currentSheetId);
    setError('');
    setEditingName(null);
    setIsNew(false);
  }, [currentSheetId]);

  const handleNewRange = useCallback(() => {
    resetForm();
    setIsNew(true);
  }, [resetForm]);

  const handleEditRange = useCallback(
    (nr: NamedRange) => {
      setEditingName(nr.name);
      setFormName(nr.name);
      setFormRange(nr.range);
      setFormSheetId(nr.refSheetId ?? currentSheetId);
      setError('');
      setIsNew(false);
    },
    [currentSheetId],
  );

  const handleSave = useCallback(() => {
    if (!formName.trim()) {
      setError(t('dialogs.namedRange.enterName'));
      return;
    }
    if (!formRange.trim()) {
      setError(t('dialogs.namedRange.enterRange'));
      return;
    }

    if (isNew) {
      const success = onAdd(formName.trim(), formRange.trim().toUpperCase(), formSheetId);
      if (!success) {
        setError(t('dialogs.namedRange.invalidOrExists'));
        return;
      }
    } else if (editingName) {
      const success = onUpdate(
        editingName,
        formName.trim(),
        formRange.trim().toUpperCase(),
        formSheetId,
      );
      if (!success) {
        setError(t('dialogs.namedRange.invalidOrExists'));
        return;
      }
    }
    resetForm();
  }, [formName, formRange, formSheetId, isNew, editingName, onAdd, onUpdate, resetForm, t]);

  const handleDelete = useCallback(
    (name: string) => {
      onDelete(name);
      if (editingName === name) {
        resetForm();
      }
    },
    [onDelete, editingName, resetForm],
  );

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="glass-panel rounded-2xl w-[500px] max-h-[80vh] flex flex-col animate-dialog-spring">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-grid-line">
          <h2 className="text-sm font-semibold text-text-primary">
            {t('dialogs.namedRange.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-text-primary hover:text-error text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {/* Existing named ranges list */}
          {namedRanges.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-text-primary mb-1">
                {t('dialogs.namedRange.definedNames')}
              </div>
              {namedRanges.map((nr) => {
                const sheetName = sheets.find((s) => s.id === nr.refSheetId)?.name ?? '';
                return (
                  <div
                    key={nr.name}
                    className={`flex items-center justify-between px-2 py-1 rounded text-xs border ${
                      editingName === nr.name
                        ? 'border-accent-selection bg-accent-selection/10'
                        : 'border-grid-line'
                    }`}
                  >
                    <div className="flex-1 truncate">
                      <span className="font-medium">{nr.name}</span>
                      <span className="text-text-primary/60 ml-2">
                        {sheetName ? `${sheetName}!` : ''}
                        {nr.range}
                      </span>
                    </div>
                    <div className="flex gap-1 ml-2">
                      <button
                        onClick={() => handleEditRange(nr)}
                        className="px-2 py-0.5 text-xs bg-ui-bg border border-grid-line rounded hover:bg-header-bg"
                      >
                        {t('dialogs.namedRange.edit')}
                      </button>
                      <button
                        onClick={() => handleDelete(nr.name)}
                        className="px-2 py-0.5 text-xs bg-ui-bg border border-grid-line rounded hover:bg-error/20 hover:text-error"
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {namedRanges.length === 0 && !isNew && (
            <div className="text-xs text-text-primary/60 text-center py-4">
              {t('dialogs.namedRange.empty')}
            </div>
          )}

          {/* Add/Edit Form */}
          {(isNew || editingName) && (
            <div className="border border-grid-line rounded p-3 space-y-2">
              <div className="text-xs font-medium text-text-primary">
                {isNew ? t('dialogs.namedRange.new') : t('dialogs.namedRange.edit')}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-text-primary/80 block mb-0.5">
                    {t('dialogs.namedRange.nameLabel')}
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                    placeholder={t('dialogs.namedRange.namePlaceholder')}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-text-primary/80 block mb-0.5">
                    {t('dialogs.namedRange.rangeLabel')}
                  </label>
                  <input
                    type="text"
                    value={formRange}
                    onChange={(e) => setFormRange(e.target.value)}
                    className="w-full h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                    placeholder={t('dialogs.namedRange.rangePlaceholder')}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-primary/80 block mb-0.5">
                  {t('dialogs.namedRange.sheetLabel')}
                </label>
                <select
                  value={formSheetId}
                  onChange={(e) => setFormSheetId(e.target.value)}
                  className="w-full h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded"
                >
                  {sheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {error && <div className="text-xs text-error">{error}</div>}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={resetForm}
                  className="px-3 py-1 text-xs bg-ui-bg border border-grid-line rounded hover:bg-header-bg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  className="px-3 py-1 text-xs bg-accent-selection text-white border border-accent-selection rounded hover:opacity-90"
                >
                  {t('dialogs.namedRange.save')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-grid-line">
          <button
            onClick={handleNewRange}
            className="px-3 py-1 text-xs bg-accent-selection text-white rounded hover:opacity-90"
          >
            {t('dialogs.namedRange.addNew')}
          </button>
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
