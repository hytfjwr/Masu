import { memo, useCallback, useMemo, useState } from 'react';
import type {
  CellDataMap,
  CellPosition,
  ValidationOperator,
  ValidationRule,
} from '../../types/grid';
import { cellKey, parseCellKey } from '../../utils/coordinates';
import { ymdToSerial, serialToParts } from '../../utils/dateSerial';
import type { MessageKey, TFunction } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

type CfRange = { startCol: number; startRow: number; endCol: number; endRow: number };

interface DataValidationPanelProps {
  /** Active sheet's cell map, used to build the rule list grouped by range. */
  cells: CellDataMap;
  /** Bumped whenever cells may have changed (cells is mutated in place, so identity alone can't be trusted). */
  version: number;
  defaultRange: CfRange;
  onSetRule: (positions: CellPosition[], rule: ValidationRule | undefined) => void;
  /** 'new' opens straight into the add-rule form (プルダウン condition), e.g. from the 挿入 > プルダウン menu item. Default 'list'. */
  initialView?: 'list' | 'new';
}

/** UI-level condition kind (splits ValidationType 'list' into value-list vs range-source variants). */
type ConditionKind =
  | 'listValues'
  | 'listRange'
  | 'checkbox'
  | 'number'
  | 'textLength'
  | 'date'
  | 'customFormula';

const CONDITION_OPTIONS: { value: ConditionKind; labelKey: MessageKey }[] = [
  { value: 'listValues', labelKey: 'panels.dataValidation.condition.listValues' },
  { value: 'listRange', labelKey: 'panels.dataValidation.condition.listRange' },
  { value: 'checkbox', labelKey: 'panels.dataValidation.condition.checkbox' },
  { value: 'number', labelKey: 'panels.dataValidation.condition.number' },
  { value: 'textLength', labelKey: 'panels.dataValidation.condition.textLength' },
  { value: 'date', labelKey: 'panels.dataValidation.condition.date' },
  { value: 'customFormula', labelKey: 'panels.dataValidation.condition.customFormula' },
];

const OPERATOR_OPTIONS: { value: ValidationOperator; labelKey: MessageKey }[] = [
  { value: 'between', labelKey: 'panels.shared.operator.between' },
  { value: 'notBetween', labelKey: 'panels.shared.operator.notBetween' },
  { value: 'equal', labelKey: 'panels.shared.operator.equal' },
  { value: 'notEqual', labelKey: 'panels.shared.operator.notEqual' },
  { value: 'greaterThan', labelKey: 'panels.shared.operator.greaterThan' },
  { value: 'greaterThanOrEqual', labelKey: 'panels.shared.operator.greaterThanOrEqual' },
  { value: 'lessThan', labelKey: 'panels.shared.operator.lessThan' },
  { value: 'lessThanOrEqual', labelKey: 'panels.shared.operator.lessThanOrEqual' },
];

function needsMax(operator: ValidationOperator): boolean {
  return operator === 'between' || operator === 'notBetween';
}

const CELL_REF_RE = /^[A-Z]{1,3}\d+$/;

function formatRangeLabel(range: CfRange): string {
  const start = cellKey(range.startCol, range.startRow);
  const end = cellKey(range.endCol, range.endRow);
  return start === end ? start : `${start}:${end}`;
}

/** Parse an 'A1' / 'A1:B10' range input (case-insensitive). null if malformed. */
function parseRangeInput(input: string): CfRange | null {
  const parts = input.trim().toUpperCase().split(':');
  if (parts.length === 1) {
    if (!CELL_REF_RE.test(parts[0])) return null;
    const p = parseCellKey(parts[0]);
    return { startCol: p.col, startRow: p.row, endCol: p.col, endRow: p.row };
  }
  if (parts.length !== 2 || !CELL_REF_RE.test(parts[0]) || !CELL_REF_RE.test(parts[1])) return null;
  const a = parseCellKey(parts[0]);
  const b = parseCellKey(parts[1]);
  return {
    startCol: Math.min(a.col, b.col),
    startRow: Math.min(a.row, b.row),
    endCol: Math.max(a.col, b.col),
    endRow: Math.max(a.row, b.row),
  };
}

function rangePositions(range: CfRange): CellPosition[] {
  const positions: CellPosition[] = [];
  for (let r = range.startRow; r <= range.endRow; r++) {
    for (let c = range.startCol; c <= range.endCol; c++) {
      positions.push({ col: c, row: r });
    }
  }
  return positions;
}

function conditionKindOf(rule: ValidationRule): ConditionKind {
  if (rule.type === 'list') return rule.listSource ? 'listRange' : 'listValues';
  return rule.type;
}

function dateStrFromSerial(serial: number | undefined): string {
  if (serial === undefined) return '';
  const { year, month, day } = serialToParts(serial);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function serialFromDateStr(str: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return undefined;
  return ymdToSerial(Number(m[1]), Number(m[2]), Number(m[3]));
}

interface ValidatedGroup {
  key: string;
  rangeLabel: string;
  rule: ValidationRule;
  positions: CellPosition[];
}

/** Groups validated cells by identical rule content, collapsing to a rectangle when possible. */
function computeValidationGroups(cells: CellDataMap): ValidatedGroup[] {
  const byRuleJson = new Map<string, { rule: ValidationRule; positions: CellPosition[] }>();
  for (const [key, cell] of cells) {
    if (!cell.validation) continue;
    const ruleJson = JSON.stringify(cell.validation);
    const entry = byRuleJson.get(ruleJson);
    const pos = parseCellKey(key);
    if (entry) entry.positions.push(pos);
    else byRuleJson.set(ruleJson, { rule: cell.validation, positions: [pos] });
  }

  const groups: ValidatedGroup[] = [];
  let groupIdx = 0;
  for (const { rule, positions } of byRuleJson.values()) {
    const minCol = Math.min(...positions.map((p) => p.col));
    const maxCol = Math.max(...positions.map((p) => p.col));
    const minRow = Math.min(...positions.map((p) => p.row));
    const maxRow = Math.max(...positions.map((p) => p.row));
    const isRect = positions.length === (maxCol - minCol + 1) * (maxRow - minRow + 1);
    if (isRect) {
      groups.push({
        key: `g${groupIdx}`,
        rangeLabel: formatRangeLabel({
          startCol: minCol,
          startRow: minRow,
          endCol: maxCol,
          endRow: maxRow,
        }),
        rule,
        positions,
      });
    } else {
      for (const pos of positions) {
        groups.push({
          key: `g${groupIdx}-${cellKey(pos.col, pos.row)}`,
          rangeLabel: cellKey(pos.col, pos.row),
          rule,
          positions: [pos],
        });
      }
    }
    groupIdx++;
  }
  return groups.slice(0, 50);
}

function describeRuleForList(rule: ValidationRule, t: TFunction): string {
  const operatorLabel = (op: ValidationOperator) =>
    t(OPERATOR_OPTIONS.find((o) => o.value === op)!.labelKey);
  switch (rule.type) {
    case 'list':
      return rule.listSource
        ? t('panels.dataValidation.describe.listRange', { source: rule.listSource })
        : t('panels.dataValidation.describe.listValues', {
            values: (rule.listValues ?? []).join(', '),
          });
    case 'checkbox':
      return t('panels.dataValidation.condition.checkbox');
    case 'number': {
      const op = rule.operator ?? 'between';
      return needsMax(op)
        ? t('panels.dataValidation.describe.numberRange', {
            operator: operatorLabel(op),
            min: rule.min ?? '',
            max: rule.max ?? '',
          })
        : t('panels.dataValidation.describe.number', {
            operator: operatorLabel(op),
            min: rule.min ?? '',
          });
    }
    case 'textLength': {
      const op = rule.operator ?? 'between';
      return needsMax(op)
        ? t('panels.dataValidation.describe.textLengthRange', {
            operator: operatorLabel(op),
            min: rule.min ?? '',
            max: rule.max ?? '',
          })
        : t('panels.dataValidation.describe.textLength', {
            operator: operatorLabel(op),
            min: rule.min ?? '',
          });
    }
    case 'date': {
      const op = rule.operator ?? 'between';
      return needsMax(op)
        ? t('panels.dataValidation.describe.dateRange', {
            operator: operatorLabel(op),
            min: dateStrFromSerial(rule.dateMin),
            max: dateStrFromSerial(rule.dateMax),
          })
        : t('panels.dataValidation.describe.date', {
            operator: operatorLabel(op),
            min: dateStrFromSerial(rule.dateMin),
          });
    }
    case 'customFormula':
      return t('panels.dataValidation.describe.customFormula', { formula: rule.formula ?? '' });
  }
}

const inputClass =
  'h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none';
const labelClass = 'flex flex-col gap-1 text-xs text-text-primary';
const btnClass =
  'h-7 px-3 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40';
const primaryBtnClass = 'h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90';

export const DataValidationPanel = memo(function DataValidationPanel({
  cells,
  version,
  defaultRange,
  onSetRule,
  initialView = 'list',
}: DataValidationPanelProps) {
  const { t } = useI18n();
  const [editingPositions, setEditingPositions] = useState<CellPosition[] | null>(null);
  const [isNew, setIsNew] = useState(initialView === 'new');

  const [rangeInput, setRangeInput] = useState(() => formatRangeLabel(defaultRange));
  const [rangeError, setRangeError] = useState('');
  const [conditionKind, setConditionKind] = useState<ConditionKind>('listValues');

  const [listItems, setListItems] = useState<string[]>(['']);
  const [listSource, setListSource] = useState('');
  const [customChecked, setCustomChecked] = useState(false);
  const [checkedValue, setCheckedValue] = useState('TRUE');
  const [uncheckedValue, setUncheckedValue] = useState('FALSE');
  const [operator, setOperator] = useState<ValidationOperator>('between');
  const [minStr, setMinStr] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [dateMinStr, setDateMinStr] = useState('');
  const [dateMaxStr, setDateMaxStr] = useState('');
  const [formula, setFormula] = useState('');
  const [showHelpText, setShowHelpText] = useState(false);
  const [helpText, setHelpText] = useState('');
  const [rejectInvalid, setRejectInvalid] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showDropdown, setShowDropdown] = useState(true);
  const [dropdownStyle, setDropdownStyle] = useState<'chip' | 'arrow'>('chip');

  const groups = useMemo(
    () => computeValidationGroups(cells),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [cells, version],
  );

  const resetForm = useCallback(() => {
    setRangeInput(formatRangeLabel(defaultRange));
    setRangeError('');
    setConditionKind('listValues');
    setListItems(['']);
    setListSource('');
    setCustomChecked(false);
    setCheckedValue('TRUE');
    setUncheckedValue('FALSE');
    setOperator('between');
    setMinStr('');
    setMaxStr('');
    setDateMinStr('');
    setDateMaxStr('');
    setFormula('');
    setShowHelpText(false);
    setHelpText('');
    setRejectInvalid(false);
    setErrorMessage('');
    setShowDropdown(true);
    setDropdownStyle('chip');
  }, [defaultRange]);

  const handleNewRule = useCallback(() => {
    resetForm();
    setIsNew(true);
    setEditingPositions(null);
  }, [resetForm]);

  const handleEditGroup = useCallback((group: ValidatedGroup) => {
    setIsNew(false);
    setEditingPositions(group.positions);
    setRangeInput(group.rangeLabel);
    setRangeError('');
    const rule = group.rule;
    setConditionKind(conditionKindOf(rule));
    setListItems(rule.listValues && rule.listValues.length > 0 ? rule.listValues : ['']);
    setListSource(rule.listSource ?? '');
    setCustomChecked(rule.checkedValue !== undefined || rule.uncheckedValue !== undefined);
    setCheckedValue(rule.checkedValue ?? 'TRUE');
    setUncheckedValue(rule.uncheckedValue ?? 'FALSE');
    setOperator(rule.operator ?? 'between');
    setMinStr(rule.min !== undefined ? String(rule.min) : '');
    setMaxStr(rule.max !== undefined ? String(rule.max) : '');
    setDateMinStr(dateStrFromSerial(rule.dateMin));
    setDateMaxStr(dateStrFromSerial(rule.dateMax));
    setFormula(rule.formula ?? '');
    setShowHelpText(!!rule.helpText);
    setHelpText(rule.helpText ?? '');
    setRejectInvalid(rule.rejectInvalid ?? false);
    setErrorMessage(rule.errorMessage ?? '');
    setShowDropdown(rule.showDropdown ?? true);
    setDropdownStyle(rule.dropdownStyle ?? 'chip');
  }, []);

  const handleCancel = useCallback(() => {
    setEditingPositions(null);
    setIsNew(false);
  }, []);

  const handleAddListItem = useCallback(() => {
    setListItems((items) => [...items, '']);
  }, []);

  const handleListItemChange = useCallback((idx: number, value: string) => {
    setListItems((items) => items.map((v, i) => (i === idx ? value : v)));
  }, []);

  const handleRemoveListItem = useCallback((idx: number) => {
    setListItems((items) => (items.length <= 1 ? [''] : items.filter((_, i) => i !== idx)));
  }, []);

  const handleSave = useCallback(() => {
    const range = parseRangeInput(rangeInput);
    if (!range) {
      setRangeError(t('panels.dataValidation.error.rangeFormat'));
      return;
    }
    setRangeError('');

    const base: ValidationRule = {
      type:
        conditionKind === 'listValues' || conditionKind === 'listRange' ? 'list' : conditionKind,
      errorMessage: errorMessage || undefined,
      helpText: showHelpText ? helpText || undefined : undefined,
      rejectInvalid: rejectInvalid || undefined,
    };

    let rule: ValidationRule;
    switch (conditionKind) {
      case 'listValues':
        rule = {
          ...base,
          listValues: listItems.map((v) => v.trim()).filter((v) => v.length > 0),
          showDropdown,
          dropdownStyle,
        };
        break;
      case 'listRange':
        rule = { ...base, listSource: listSource.trim(), showDropdown, dropdownStyle };
        break;
      case 'checkbox':
        rule = customChecked ? { ...base, checkedValue, uncheckedValue } : base;
        break;
      case 'number':
        rule = {
          ...base,
          operator,
          min: Number(minStr) || 0,
          max: needsMax(operator) ? Number(maxStr) || 0 : undefined,
        };
        break;
      case 'textLength':
        rule = {
          ...base,
          operator,
          min: Number(minStr) || 0,
          max: needsMax(operator) ? Number(maxStr) || 0 : undefined,
        };
        break;
      case 'date':
        rule = {
          ...base,
          operator,
          dateMin: serialFromDateStr(dateMinStr) ?? 0,
          dateMax: needsMax(operator) ? serialFromDateStr(dateMaxStr) : undefined,
        };
        break;
      case 'customFormula':
        rule = { ...base, formula, anchor: { col: range.startCol, row: range.startRow } };
        break;
    }

    onSetRule(rangePositions(range), rule);
    setEditingPositions(null);
    setIsNew(false);
  }, [
    rangeInput,
    conditionKind,
    listItems,
    listSource,
    customChecked,
    checkedValue,
    uncheckedValue,
    operator,
    minStr,
    maxStr,
    dateMinStr,
    dateMaxStr,
    formula,
    showHelpText,
    helpText,
    rejectInvalid,
    errorMessage,
    showDropdown,
    dropdownStyle,
    onSetRule,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (editingPositions) onSetRule(editingPositions, undefined);
    setEditingPositions(null);
    setIsNew(false);
  }, [editingPositions, onSetRule]);

  const showForm = isNew || editingPositions !== null;
  const showDropdownStyleOption = conditionKind === 'listValues' || conditionKind === 'listRange';

  if (showForm) {
    return (
      <div className="space-y-3" data-testid="dv-panel-edit">
        <label className={labelClass}>
          <span>{t('panels.dataValidation.label.applyToRange')}</span>
          <input
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            className={inputClass}
            placeholder="A1:B10"
          />
        </label>
        {rangeError && <div className="text-xs text-error">{rangeError}</div>}

        <label className={labelClass}>
          <span>{t('panels.dataValidation.label.criteria')}</span>
          <select
            value={conditionKind}
            onChange={(e) => setConditionKind(e.target.value as ConditionKind)}
            className={inputClass}
          >
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </label>

        {conditionKind === 'listValues' && (
          <div className="space-y-1">
            <span className="text-xs text-text-primary">
              {t('panels.dataValidation.label.items')}
            </span>
            {listItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => handleListItemChange(idx, e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  className="text-text-primary/40 hover:text-error text-xs px-1"
                  onClick={() => handleRemoveListItem(idx)}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className={btnClass} onClick={handleAddListItem}>
              {t('panels.dataValidation.addItem')}
            </button>
          </div>
        )}

        {conditionKind === 'listRange' && (
          <label className={labelClass}>
            <span>{t('panels.dataValidation.label.sourceRange')}</span>
            <input
              type="text"
              value={listSource}
              onChange={(e) => setListSource(e.target.value)}
              className={inputClass}
              placeholder="Sheet2!A1:A10"
            />
          </label>
        )}

        {conditionKind === 'checkbox' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-text-primary">
              <input
                type="checkbox"
                checked={customChecked}
                onChange={(e) => setCustomChecked(e.target.checked)}
              />
              <span>{t('panels.dataValidation.label.useCustomCellValues')}</span>
            </label>
            {customChecked && (
              <div className="flex gap-2">
                <label className={`${labelClass} flex-1`}>
                  <span>{t('panels.dataValidation.label.checkedValue')}</span>
                  <input
                    type="text"
                    value={checkedValue}
                    onChange={(e) => setCheckedValue(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className={`${labelClass} flex-1`}>
                  <span>{t('panels.dataValidation.label.uncheckedValue')}</span>
                  <input
                    type="text"
                    value={uncheckedValue}
                    onChange={(e) => setUncheckedValue(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {(conditionKind === 'number' ||
          conditionKind === 'textLength' ||
          conditionKind === 'date') && (
          <div className="space-y-2">
            <label className={labelClass}>
              <span>{t('panels.dataValidation.label.criteria')}</span>
              <select
                value={operator}
                onChange={(e) => setOperator(e.target.value as ValidationOperator)}
                className={inputClass}
              >
                {OPERATOR_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            {conditionKind === 'date' ? (
              <div className="flex gap-2">
                <label className={`${labelClass} flex-1`}>
                  <span>
                    {needsMax(operator)
                      ? t('panels.dataValidation.label.startDate')
                      : t('panels.dataValidation.condition.date')}
                  </span>
                  <input
                    type="date"
                    value={dateMinStr}
                    onChange={(e) => setDateMinStr(e.target.value)}
                    className={inputClass}
                  />
                </label>
                {needsMax(operator) && (
                  <label className={`${labelClass} flex-1`}>
                    <span>{t('panels.dataValidation.label.endDate')}</span>
                    <input
                      type="date"
                      value={dateMaxStr}
                      onChange={(e) => setDateMaxStr(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <label className={`${labelClass} flex-1`}>
                  <span>
                    {needsMax(operator) ? t('panels.shared.value1') : t('panels.shared.value')}
                  </span>
                  <input
                    type="number"
                    value={minStr}
                    onChange={(e) => setMinStr(e.target.value)}
                    className={inputClass}
                  />
                </label>
                {needsMax(operator) && (
                  <label className={`${labelClass} flex-1`}>
                    <span>{t('panels.shared.value2')}</span>
                    <input
                      type="number"
                      value={maxStr}
                      onChange={(e) => setMaxStr(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        {conditionKind === 'customFormula' && (
          <label className={labelClass}>
            <span>{t('panels.dataValidation.condition.customFormula')}</span>
            <input
              type="text"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              className={inputClass}
              placeholder="=A1>10"
            />
          </label>
        )}

        {showDropdownStyleOption && (
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={showDropdown}
              onChange={(e) => setShowDropdown(e.target.checked)}
            />
            <span>{t('panels.dataValidation.label.showDropdown')}</span>
          </label>
        )}
        {showDropdownStyleOption && showDropdown && (
          <label className={labelClass}>
            <span>{t('panels.dataValidation.label.dropdownStyle')}</span>
            <select
              value={dropdownStyle}
              onChange={(e) => setDropdownStyle(e.target.value as 'chip' | 'arrow')}
              className={inputClass}
            >
              <option value="chip">{t('panels.dataValidation.dropdownStyle.chip')}</option>
              <option value="arrow">{t('panels.dataValidation.dropdownStyle.arrow')}</option>
            </select>
          </label>
        )}

        <div className="border-t border-grid-line pt-2 space-y-2">
          <div className="text-xs text-text-primary/60">
            {t('panels.dataValidation.label.advancedOptions')}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="checkbox"
              checked={showHelpText}
              onChange={(e) => setShowHelpText(e.target.checked)}
            />
            <span>{t('panels.dataValidation.label.showHelpText')}</span>
          </label>
          {showHelpText && (
            <input
              type="text"
              value={helpText}
              onChange={(e) => setHelpText(e.target.value)}
              className={`${inputClass} w-full`}
            />
          )}

          <div className="text-xs text-text-primary">
            {t('panels.dataValidation.label.onInvalidData')}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="radio"
              name="dv-invalid-mode"
              checked={!rejectInvalid}
              onChange={() => setRejectInvalid(false)}
            />
            <span>{t('panels.dataValidation.label.showWarning')}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-text-primary">
            <input
              type="radio"
              name="dv-invalid-mode"
              checked={rejectInvalid}
              onChange={() => setRejectInvalid(true)}
            />
            <span>{t('panels.dataValidation.label.rejectInput')}</span>
          </label>

          <label className={labelClass}>
            <span>{t('panels.dataValidation.label.errorMessage')}</span>
            <input
              type="text"
              value={errorMessage}
              onChange={(e) => setErrorMessage(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {editingPositions && (
            <button
              type="button"
              className="h-7 px-3 text-xs text-error bg-ui-bg border border-grid-line rounded hover:bg-error/10 mr-auto"
              onClick={handleDelete}
            >
              {t('panels.dataValidation.removeRule')}
            </button>
          )}
          <button type="button" className={btnClass} onClick={handleCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-btn-primary
            className={primaryBtnClass}
            onClick={handleSave}
            data-testid="dv-panel-save"
          >
            {t('common.done')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="dv-panel-list">
      {groups.length === 0 ? (
        <p className="text-xs text-text-primary/40">{t('panels.dataValidation.empty')}</p>
      ) : (
        groups.map((group) => (
          <div
            key={group.key}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-grid-line text-xs cursor-pointer hover:border-accent-selection"
            onClick={() => handleEditGroup(group)}
          >
            <div className="flex-1 min-w-0">
              <div className="text-text-primary/60 truncate">{group.rangeLabel}</div>
              <div className="text-text-primary truncate">{describeRuleForList(group.rule, t)}</div>
            </div>
            <button
              type="button"
              className="text-error text-[10px] hover:underline shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onSetRule(group.positions, undefined);
              }}
            >
              {t('common.delete')}
            </button>
          </div>
        ))
      )}
      <button
        type="button"
        data-btn-primary
        className={`${primaryBtnClass} w-full`}
        onClick={handleNewRule}
        data-testid="dv-panel-add"
      >
        {t('panels.dataValidation.addRule')}
      </button>
    </div>
  );
});
