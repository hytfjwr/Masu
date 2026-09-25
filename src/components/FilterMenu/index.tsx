import { useEffect, useRef, useState } from 'react';
import type { ConditionalOperator, FilterCondition } from '../../types/grid';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

interface OperatorOption {
  value: ConditionalOperator;
  labelKey: MessageKey;
  /** How many free-text value inputs this operator needs. */
  valueCount: 0 | 1 | 2;
}

const OPERATOR_OPTIONS: OperatorOption[] = [
  { value: 'isEmpty', labelKey: 'grid.filterMenu.opIsEmpty', valueCount: 0 },
  { value: 'isNotEmpty', labelKey: 'grid.filterMenu.opIsNotEmpty', valueCount: 0 },
  { value: 'textContains', labelKey: 'grid.filterMenu.opTextContains', valueCount: 1 },
  { value: 'textNotContains', labelKey: 'grid.filterMenu.opTextNotContains', valueCount: 1 },
  { value: 'textStartsWith', labelKey: 'grid.filterMenu.opTextStartsWith', valueCount: 1 },
  { value: 'textEndsWith', labelKey: 'grid.filterMenu.opTextEndsWith', valueCount: 1 },
  { value: 'textEquals', labelKey: 'grid.filterMenu.opTextEquals', valueCount: 1 },
  { value: 'greaterThan', labelKey: 'grid.filterMenu.opGreaterThan', valueCount: 1 },
  { value: 'greaterThanOrEqual', labelKey: 'grid.filterMenu.opGreaterThanOrEqual', valueCount: 1 },
  { value: 'lessThan', labelKey: 'grid.filterMenu.opLessThan', valueCount: 1 },
  { value: 'lessThanOrEqual', labelKey: 'grid.filterMenu.opLessThanOrEqual', valueCount: 1 },
  { value: 'equal', labelKey: 'grid.filterMenu.opEqual', valueCount: 1 },
  { value: 'notEqual', labelKey: 'grid.filterMenu.opNotEqual', valueCount: 1 },
  { value: 'between', labelKey: 'grid.filterMenu.opBetween', valueCount: 2 },
  { value: 'notBetween', labelKey: 'grid.filterMenu.opNotBetween', valueCount: 2 },
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

export function FilterMenu({
  colIndex,
  values,
  selectedValues,
  condition,
  onClose,
  onApply,
  onSortAsc,
  onSortDesc,
  style,
}: FilterMenuProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [checkedValues, setCheckedValues] = useState<Set<string>>(
    () => selectedValues ?? new Set(values),
  );
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

  const filteredValues = values.filter((v) => v.toLowerCase().includes(search.toLowerCase()));

  const toggleValue = (value: string) => {
    const next = new Set(checkedValues);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setCheckedValues(next);
  };

  const selectAll = () => setCheckedValues(new Set(values));
  const clearAll = () => setCheckedValues(new Set());

  const selectedOperator = OPERATOR_OPTIONS.find((o) => o.value === operator);

  const handleOk = () => {
    const valuesToApply = checkedValues.size === values.length ? undefined : new Set(checkedValues);
    const conditionToApply: FilterCondition | undefined =
      conditionOpen && operator
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
        {t('grid.filterMenu.sortAsc')}
      </button>
      <button
        type="button"
        className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
        onClick={onSortDesc}
      >
        {t('grid.filterMenu.sortDesc')}
      </button>

      <div className="border-t border-grid-line my-1" />

      {/* Condition filter (collapsible) */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-text-primary hover:bg-accent-selection/10"
        onClick={() => setConditionOpen((o) => !o)}
      >
        <span>{t('grid.filterMenu.filterByCondition')}</span>
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
            <option value="">{t('grid.filterMenu.noneOption')}</option>
            {OPERATOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
          {selectedOperator && selectedOperator.valueCount >= 1 && (
            <input
              type="text"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              value={value1}
              onChange={(e) => setValue1(e.target.value)}
              placeholder={t('grid.filterMenu.valuePlaceholder')}
            />
          )}
          {selectedOperator && selectedOperator.valueCount >= 2 && (
            <input
              type="text"
              className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              value={value2}
              onChange={(e) => setValue2(e.target.value)}
              placeholder={t('grid.filterMenu.otherValuePlaceholder')}
            />
          )}
        </div>
      )}

      <div className="border-t border-grid-line my-1" />

      {/* Value filter */}
      <div className="px-3 py-1">
        <div className="text-xs text-text-primary/70 mb-1">
          {t('grid.filterMenu.filterByValues')}
        </div>
        <input
          type="text"
          className="w-full h-7 px-2 mb-1 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
          placeholder={t('grid.filterMenu.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 mb-1">
          <button
            type="button"
            className="text-[10px] text-accent-selection hover:underline"
            onClick={selectAll}
          >
            {t('grid.filterMenu.selectAll')}
          </button>
          <span className="text-[10px] text-text-primary/30">|</span>
          <button
            type="button"
            className="text-[10px] text-accent-selection hover:underline"
            onClick={clearAll}
          >
            {t('grid.filterMenu.clear')}
          </button>
        </div>
        <div className="max-h-[160px] overflow-y-auto">
          {filteredValues.map((value) => (
            <label
              key={value}
              className="flex items-center gap-2 py-0.5 text-xs text-text-primary hover:bg-accent-selection/10 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={checkedValues.has(value)}
                onChange={() => toggleValue(value)}
                className="w-3 h-3"
              />
              <span className="truncate">{value || t('grid.filterMenu.blankValue')}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="border-t border-grid-line my-1" />
      <div className="flex justify-end gap-2 px-3 py-1.5">
        <button
          type="button"
          className="h-6 px-2 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          data-btn-primary
          className="h-6 px-2 text-xs text-white bg-accent-selection rounded hover:opacity-90"
          onClick={handleOk}
          data-testid={`filter-menu-ok-${colIndex}`}
        >
          OK
        </button>
      </div>
    </div>
  );
}
