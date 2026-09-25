import { useEffect, useRef, useState } from 'react';
import type { ConditionalOperator, FilterCondition } from '../../types/grid';

interface OperatorOption {
  value: ConditionalOperator;
  label: string;
  /** How many free-text value inputs this operator needs. */
  valueCount: 0 | 1 | 2;
}

const OPERATOR_OPTIONS: OperatorOption[] = [
  { value: 'isEmpty', label: '空白', valueCount: 0 },
  { value: 'isNotEmpty', label: '空白ではない', valueCount: 0 },
  { value: 'textContains', label: 'テキストを含む', valueCount: 1 },
  { value: 'textNotContains', label: 'テキストを含まない', valueCount: 1 },
  { value: 'textStartsWith', label: 'テキストが次で始まる', valueCount: 1 },
  { value: 'textEndsWith', label: 'テキストが次で終わる', valueCount: 1 },
  { value: 'textEquals', label: 'テキストが次と完全一致', valueCount: 1 },
  { value: 'greaterThan', label: 'より大きい', valueCount: 1 },
  { value: 'greaterThanOrEqual', label: '以上', valueCount: 1 },
  { value: 'lessThan', label: 'より小さい', valueCount: 1 },
  { value: 'lessThanOrEqual', label: '以下', valueCount: 1 },
  { value: 'equal', label: '等しい', valueCount: 1 },
  { value: 'notEqual', label: '等しくない', valueCount: 1 },
  { value: 'between', label: '間にある', valueCount: 2 },
  { value: 'notBetween', label: '間にない', valueCount: 2 },
];

interface FilterMenuProps {
  colIndex: number;
  /** Unique display values found in the filter data rows for this column. */
  values: string[];
  /** Current value-checkbox selection (undefined = every value allowed / no filter). */
  selectedValues: Set<string> | undefined;
  /** Current condition-based filter for this column, if any. */
  condition: FilterCondition | undefined;
  onClose: () => void;
  /** OK: commit both the value selection and the condition together. */
  onApply: (values: Set<string> | undefined, condition: FilterCondition | undefined) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  style: React.CSSProperties;
}

export function FilterMenu({ colIndex, values, selectedValues, condition, onClose, onApply, onSortAsc, onSortDesc, style }: FilterMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [checkedValues, setCheckedValues] = useState<Set<string>>(() => selectedValues ?? new Set(values));
  const [search, setSearch] = useState('');
  const [conditionOpen, setConditionOpen] = useState(!!condition);
  const [operator, setOperator] = useState<ConditionalOperator | ''>(condition?.operator ?? '');
  const [value1, setValue1] = useState(condition?.value1 ?? '');
  const [value2, setValue2] = useState(condition?.value2 ?? '');

  // useEffect required: global click-outside listener for the filter menu
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const filteredValues = values.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  const toggleValue = (value: string) => {
    const next = new Set(checkedValues);
    if (next.has(value)) next.delete(value); else next.add(value);
    setCheckedValues(next);
  };

  const selectAll = () => setCheckedValues(new Set(values));
  const clearAll = () => setCheckedValues(new Set());

  const selectedOperator = OPERATOR_OPTIONS.find(o => o.value === operator);

  const handleOk = () => {
    const valuesToApply = checkedValues.size === values.length ? undefined : new Set(checkedValues);
    const conditionToApply: FilterCondition | undefined = conditionOpen && operator
      ? { operator, value1: value1 || undefined, value2: value2 || undefined }
      : undefined;
    onApply(valuesToApply, conditionToApply);
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute glass-surface rounded-xl z-50 py-1 w-[220px] max-h-[400px] overflow-y-auto animate-slide-down"
      style={style}
      data-testid={`filter-menu-${colIndex}`}
    >
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
        onClick={onSortAsc}
      >
        A→Z で並べ替え
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
        onClick={onSortDesc}
      >
        Z→A で並べ替え
      </button>

      <div className="border-t border-grid-line my-1" />

      {/* Condition filter (collapsible) */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
        onClick={() => setConditionOpen(o => !o)}
      >
        <span>条件でフィルタ</span>
        <span className="text-text-primary/40">{conditionOpen ? '▾' : '▸'}</span>
      </button>
      {conditionOpen && (
        <div className="px-3 py-1 flex flex-col gap-1.5">
          <select
            className="h-7 px-1.5 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
            value={operator}
            onChange={(e) => setOperator(e.target.value as ConditionalOperator | '')}
            data-testid={`filter-condition-operator-${colIndex}`}
          >
            <option value="">なし</option>
            {OPERATOR_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {selectedOperator && selectedOperator.valueCount >= 1 && (
            <input
              type="text"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              value={value1}
              onChange={(e) => setValue1(e.target.value)}
              placeholder="値"
            />
          )}
          {selectedOperator && selectedOperator.valueCount >= 2 && (
            <input
              type="text"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              placeholder="もう一方の値"
            />
          )}
        </div>
      )}

      <div className="border-t border-grid-line my-1" />

      {/* Value filter */}
      <div className="px-3 py-1">
        <div className="text-xs text-text-primary/70 mb-1">値でフィルタ</div>
        <input
          type="text"
          className="w-full h-7 px-2 mb-1 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
          placeholder="検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 mb-1">
          <button type="button" className="text-[10px] text-accent-selection hover:underline" onClick={selectAll}>すべて選択</button>
          <span className="text-[10px] text-text-primary/30">|</span>
          <button type="button" className="text-[10px] text-accent-selection hover:underline" onClick={clearAll}>クリア</button>
        </div>
        <div className="max-h-[160px] overflow-y-auto">
          {filteredValues.map((value) => (
            <label key={value} className="flex items-center gap-2 py-0.5 text-xs text-text-primary hover:bg-accent-selection/10 cursor-pointer">
              <input type="checkbox" checked={checkedValues.has(value)} onChange={() => toggleValue(value)} className="w-3 h-3" />
              <span className="truncate">{value || '(空白)'}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-grid-line my-1" />
      <div className="flex justify-end gap-2 px-3 py-1.5">
        <button type="button" className="h-6 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40" onClick={onClose}>
          キャンセル
        </button>
        <button type="button" data-btn-primary className="h-6 px-2 text-xs text-white bg-accent-selection rounded hover:opacity-90" onClick={handleOk} data-testid={`filter-menu-ok-${colIndex}`}>
          OK
        </button>
      </div>
    </div>
  );
}
