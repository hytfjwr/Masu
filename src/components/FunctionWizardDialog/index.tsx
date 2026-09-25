import { memo, useCallback, useMemo, useState } from 'react';
import type { FunctionMeta } from '../../engine/types';
import { getCategorizedFunctions } from '../../pivot/functionCategories';
import type { FunctionCategory } from '../../pivot/functionCategories';
import { parseSignature } from '../../pivot/signatureParser';

interface FunctionWizardDialogProps {
  visible: boolean;
  onClose: () => void;
  onInsertFormula: (formula: string) => void;
  evaluateFormula: (formula: string) => string;
}

export const FunctionWizardDialog = memo(function FunctionWizardDialog({
  visible,
  onClose,
  onInsertFormula,
  evaluateFormula,
}: FunctionWizardDialogProps) {
  const categories = useMemo(() => getCategorizedFunctions(), []);
  const [selectedCategory, setSelectedCategory] = useState<FunctionCategory | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<FunctionMeta | null>(null);
  const [argValues, setArgValues] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Display functions based on category/search
  const displayedFunctions = useMemo(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase();
      const all: FunctionMeta[] = [];
      for (const cat of categories) {
        for (const fn of cat.functions) {
          if (fn.name.includes(q) || fn.description.toLowerCase().includes(searchQuery.toLowerCase())) {
            all.push(fn);
          }
        }
      }
      return all;
    }
    if (selectedCategory) {
      return selectedCategory.functions;
    }
    // Show all functions from all categories
    const all: FunctionMeta[] = [];
    for (const cat of categories) {
      for (const fn of cat.functions) {
        all.push(fn);
      }
    }
    return all;
  }, [categories, selectedCategory, searchQuery]);

  const parsedSig = useMemo(() => {
    if (!selectedFunction) return null;
    return parseSignature(selectedFunction.signature);
  }, [selectedFunction]);

  const handleSelectFunction = useCallback((fn: FunctionMeta) => {
    setSelectedFunction(fn);
    const sig = parseSignature(fn.signature);
    setArgValues(sig.args.map(() => ''));
  }, []);

  const handleArgChange = useCallback((index: number, value: string) => {
    setArgValues((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  // Build formula string from current state
  const currentFormula = useMemo(() => {
    if (!selectedFunction) return '';
    // Only trim trailing empty args to preserve positional arguments
    const args = [...argValues];
    while (args.length > 0 && args[args.length - 1].trim() === '') {
      args.pop();
    }
    return `=${selectedFunction.name}(${args.join(', ')})`;
  }, [selectedFunction, argValues]);

  // Real-time preview
  const preview = useMemo(() => {
    if (!currentFormula || currentFormula === '=') return '';
    // Only evaluate if there are args
    if (!selectedFunction) return '';
    try {
      return evaluateFormula(currentFormula);
    } catch {
      return '#ERROR!';
    }
  }, [currentFormula, selectedFunction, evaluateFormula]);

  const handleConfirm = useCallback(() => {
    if (!currentFormula || !selectedFunction) return;
    onInsertFormula(currentFormula);
    onClose();
  }, [currentFormula, selectedFunction, onInsertFormula, onClose]);

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const handleCategorySelect = useCallback((cat: FunctionCategory | null) => {
    setSelectedCategory(cat);
    setSearchQuery('');
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="glass-panel rounded-2xl p-4 min-w-[600px] max-w-[750px] max-h-[85vh] flex flex-col animate-dialog-spring"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-text-primary mb-3">関数の挿入</h3>

        <div className="flex gap-3 flex-1 min-h-0">
          {/* Left panel: categories + function list */}
          <div className="w-[240px] flex flex-col gap-2 shrink-0">
            {/* Search */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCategory(null);
              }}
              placeholder="関数を検索..."
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
            />

            {/* Categories */}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                className={`px-2 py-0.5 text-[10px] rounded border ${
                  selectedCategory === null && !searchQuery
                    ? 'bg-accent-selection text-white border-accent-selection'
                    : 'bg-ui-bg text-text-primary border-grid-line hover:border-accent-selection'
                }`}
                onClick={() => handleCategorySelect(null)}
              >
                すべて
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`px-2 py-0.5 text-[10px] rounded border ${
                    selectedCategory?.id === cat.id
                      ? 'bg-accent-selection text-white border-accent-selection'
                      : 'bg-ui-bg text-text-primary border-grid-line hover:border-accent-selection'
                  }`}
                  onClick={() => handleCategorySelect(cat)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Function list */}
            <div className="flex-1 min-h-0 overflow-auto border border-grid-line rounded bg-ui-bg">
              {displayedFunctions.map((fn) => (
                <button
                  key={fn.name}
                  type="button"
                  className={`w-full text-left px-2 py-1 text-xs border-b border-grid-line/30 ${
                    selectedFunction?.name === fn.name
                      ? 'bg-accent-selection/20 text-accent-selection'
                      : 'text-text-primary hover:bg-accent-selection/10'
                  }`}
                  onClick={() => handleSelectFunction(fn)}
                >
                  <div className="font-medium">{fn.name}</div>
                  <div className="text-[10px] text-text-primary/60 truncate">{fn.description}</div>
                </button>
              ))}
              {displayedFunctions.length === 0 && (
                <div className="text-xs text-text-primary/40 p-2">関数が見つかりません</div>
              )}
            </div>
          </div>

          {/* Right panel: arguments + preview */}
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {selectedFunction && parsedSig ? (
              <>
                {/* Function signature */}
                <div className="bg-ui-bg border border-grid-line rounded p-2">
                  <div className="text-xs font-mono text-accent-selection font-medium">
                    {selectedFunction.signature}
                  </div>
                  <div className="text-[10px] text-text-primary/70 mt-1">
                    {selectedFunction.description}
                  </div>
                </div>

                {/* Arguments */}
                <div className="flex-1 overflow-auto space-y-2">
                  {parsedSig.args.length === 0 ? (
                    <div className="text-xs text-text-primary/60 p-2">引数なし</div>
                  ) : (
                    parsedSig.args.map((arg, idx) => (
                      <label key={idx} className="flex flex-col gap-0.5">
                        <span className="text-xs text-text-primary">
                          {arg.name}
                          {arg.required ? (
                            <span className="text-red-400 ml-0.5">*</span>
                          ) : (
                            <span className="text-text-primary/40 ml-1 text-[10px]">
                              (省略可)
                            </span>
                          )}
                          {arg.variadic && (
                            <span className="text-text-primary/40 ml-1 text-[10px]">
                              (複数可)
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          value={argValues[idx] ?? ''}
                          onChange={(e) => handleArgChange(idx, e.target.value)}
                          placeholder={`${arg.name}を入力`}
                          className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none focus:border-accent-selection"
                        />
                      </label>
                    ))
                  )}
                </div>

                {/* Preview */}
                <div className="bg-ui-bg border border-grid-line rounded p-2">
                  <div className="text-[10px] text-text-primary/60 mb-0.5">数式プレビュー</div>
                  <div className="text-xs font-mono text-text-primary truncate">{currentFormula}</div>
                  {preview && (
                    <div className="mt-1">
                      <div className="text-[10px] text-text-primary/60">計算結果</div>
                      <div className="text-xs font-mono text-accent-selection">{preview}</div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-text-primary/40">
                左のリストから関数を選択してください
              </div>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-3 mt-2 border-t border-grid-line">
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
            disabled={!selectedFunction}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
});
