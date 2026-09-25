import { memo, useCallback, useMemo, useState } from 'react';
import type { CellStyle, ColorScalePoint, ConditionalFormatRule, ConditionalOperator } from '../../types/grid';
import { cellKey, parseCellKey } from '../../utils/coordinates';
import { ColorPicker } from '../Toolbar/ColorPicker';

type CfRange = ConditionalFormatRule['range'];

interface ConditionalFormatPanelProps {
  rules: ConditionalFormatRule[];
  onAddRule: (rule: Omit<ConditionalFormatRule, 'id'>) => void;
  onUpdateRule: (ruleId: string, updates: Partial<ConditionalFormatRule>) => void;
  onDeleteRule: (ruleId: string) => void;
  defaultRange: CfRange;
}

/** The panel's condition-select keys: value-operator based conditions plus the special rule kinds. */
type ConditionKey = ConditionalOperator | 'formula' | 'duplicate' | 'unique' | 'top' | 'bottom' | 'aboveAverage' | 'belowAverage';

const CONDITION_OPTIONS: { key: ConditionKey; label: string }[] = [
  { key: 'isEmpty', label: '空白' },
  { key: 'isNotEmpty', label: '空白ではない' },
  { key: 'textContains', label: '次を含むテキスト' },
  { key: 'textNotContains', label: '次を含まないテキスト' },
  { key: 'textStartsWith', label: '次で始まるテキスト' },
  { key: 'textEndsWith', label: '次で終わるテキスト' },
  { key: 'textEquals', label: '次と完全一致するテキスト' },
  { key: 'greaterThan', label: '次より大きい' },
  { key: 'greaterThanOrEqual', label: '以上' },
  { key: 'lessThan', label: '次より小さい' },
  { key: 'lessThanOrEqual', label: '以下' },
  { key: 'equal', label: '次と等しい' },
  { key: 'notEqual', label: '次と等しくない' },
  { key: 'between', label: '次の間にある' },
  { key: 'notBetween', label: '次の間にない' },
  { key: 'formula', label: 'カスタム数式' },
  { key: 'duplicate', label: '重複' },
  { key: 'unique', label: '一意' },
  { key: 'top', label: '上位' },
  { key: 'bottom', label: '下位' },
  { key: 'aboveAverage', label: '平均より上' },
  { key: 'belowAverage', label: '平均より下' },
];

const VALUE_OPERATOR_KEYS = new Set<ConditionKey>([
  'isEmpty', 'isNotEmpty', 'textContains', 'textNotContains', 'textStartsWith', 'textEndsWith', 'textEquals',
  'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'equal', 'notEqual', 'between', 'notBetween',
]);

function needsValue1(key: ConditionKey): boolean {
  return key !== 'isEmpty' && key !== 'isNotEmpty' && VALUE_OPERATOR_KEYS.has(key);
}
function needsValue2(key: ConditionKey): boolean {
  return key === 'between' || key === 'notBetween';
}
function needsRank(key: ConditionKey): boolean {
  return key === 'top' || key === 'bottom';
}
function needsFormula(key: ConditionKey): boolean {
  return key === 'formula';
}

const STYLE_PRESETS: { label: string; style: Partial<CellStyle> }[] = [
  { label: '薄い緑', style: { backgroundColor: '#b7e1cd', textColor: '#137333' } },
  { label: '薄い赤', style: { backgroundColor: '#f4c7c3', textColor: '#a50e0e' } },
  { label: '薄い黄', style: { backgroundColor: '#fce8b2', textColor: '#7f6000' } },
  { label: '太字', style: { bold: true } },
  { label: '赤文字', style: { textColor: '#ff0000' } },
  { label: '青背景', style: { backgroundColor: '#c6dafc' } },
];

const COLOR_SCALE_PRESETS: { label: string; min: ColorScalePoint; mid?: ColorScalePoint; max: ColorScalePoint }[] = [
  { label: '緑 → 白', min: { type: 'min', color: '#57bb8a' }, max: { type: 'max', color: '#ffffff' } },
  { label: '白 → 緑', min: { type: 'min', color: '#ffffff' }, max: { type: 'max', color: '#57bb8a' } },
  { label: '赤 → 白 → 緑', min: { type: 'min', color: '#e67c73' }, mid: { type: 'percentile', value: 50, color: '#ffffff' }, max: { type: 'max', color: '#57bb8a' } },
  { label: '緑 → 白 → 赤', min: { type: 'min', color: '#57bb8a' }, mid: { type: 'percentile', value: 50, color: '#ffffff' }, max: { type: 'max', color: '#e67c73' } },
  { label: '白 → 赤', min: { type: 'min', color: '#ffffff' }, max: { type: 'max', color: '#e67c73' } },
  { label: '黄 → 緑', min: { type: 'min', color: '#ffd666' }, max: { type: 'max', color: '#57bb8a' } },
];

const POINT_TYPE_OPTIONS: { value: ColorScalePoint['type']; label: string }[] = [
  { value: 'min', label: '最小値' },
  { value: 'max', label: '最大値' },
  { value: 'number', label: '数値' },
  { value: 'percent', label: 'パーセント' },
  { value: 'percentile', label: 'パーセンタイル' },
];

function formatRangeLabel(range: CfRange): string {
  const start = cellKey(range.startCol, range.startRow);
  const end = cellKey(range.endCol, range.endRow);
  return start === end ? start : `${start}:${end}`;
}

const CELL_REF_RE = /^[A-Z]{1,3}\d+$/;

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

function conditionKeyOf(rule: ConditionalFormatRule): ConditionKey {
  const kind = rule.kind ?? 'value';
  if (kind === 'value') return rule.operator;
  if (kind === 'formula') return 'formula';
  return kind as ConditionKey;
}

function describeCfRule(rule: ConditionalFormatRule): string {
  const kind = rule.kind ?? 'value';
  if (kind === 'value') {
    switch (rule.operator) {
      case 'greaterThan': return `セルの値 > ${rule.value1}`;
      case 'greaterThanOrEqual': return `セルの値 >= ${rule.value1}`;
      case 'lessThan': return `セルの値 < ${rule.value1}`;
      case 'lessThanOrEqual': return `セルの値 <= ${rule.value1}`;
      case 'equal': return `セルの値 = ${rule.value1}`;
      case 'notEqual': return `セルの値 ≠ ${rule.value1}`;
      case 'between': return `セルの値が ${rule.value1} 〜 ${rule.value2} の間`;
      case 'notBetween': return `セルの値が ${rule.value1} 〜 ${rule.value2} の間ではない`;
      case 'textContains': return `テキストに「${rule.value1}」を含む`;
      case 'textNotContains': return `テキストに「${rule.value1}」を含まない`;
      case 'textStartsWith': return `テキストが「${rule.value1}」で始まる`;
      case 'textEndsWith': return `テキストが「${rule.value1}」で終わる`;
      case 'textEquals': return `テキストが「${rule.value1}」と完全一致`;
      case 'isEmpty': return '空白';
      case 'isNotEmpty': return '空白ではない';
      default: return rule.operator;
    }
  }
  if (kind === 'formula') return `カスタム数式: =${rule.formula ?? ''}`;
  if (kind === 'colorScale') return 'カラースケール';
  if (kind === 'duplicate') return '重複する値';
  if (kind === 'unique') return '一意の値';
  if (kind === 'top') return `上位 ${rule.rank ?? 0}${rule.percent ? '%' : ''}`;
  if (kind === 'bottom') return `下位 ${rule.rank ?? 0}${rule.percent ? '%' : ''}`;
  if (kind === 'aboveAverage') return '平均より上';
  if (kind === 'belowAverage') return '平均より下';
  return '';
}

function colorScaleGradient(rule: ConditionalFormatRule): string {
  const cs = rule.colorScale;
  if (!cs) return 'transparent';
  const stops = [cs.min.color, ...(cs.mid ? [cs.mid.color] : []), cs.max.color];
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

const inputClass = 'h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none';
const labelClass = 'flex flex-col gap-1 text-xs text-text-primary';
const btnClass = 'h-7 px-3 text-xs text-text-primary bg-ui-bg border border-grid-line rounded hover:bg-grid-line/40';
const primaryBtnClass = 'h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90';

export const ConditionalFormatPanel = memo(function ConditionalFormatPanel({
  rules,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
  defaultRange,
}: ConditionalFormatPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [tab, setTab] = useState<'value' | 'colorScale'>('value');

  // Range
  const [rangeInput, setRangeInput] = useState('');
  const [rangeError, setRangeError] = useState('');

  // Single-color form state
  const [conditionKey, setConditionKey] = useState<ConditionKey>('greaterThan');
  const [value1, setValue1] = useState('');
  const [value2, setValue2] = useState('');
  const [formula, setFormula] = useState('');
  const [rank, setRank] = useState('10');
  const [percent, setPercent] = useState(false);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strikethrough, setStrikethrough] = useState(false);
  const [textColor, setTextColor] = useState<string | undefined>(undefined);
  const [backgroundColor, setBackgroundColor] = useState<string | undefined>(undefined);

  // Color scale form state
  const [csMin, setCsMin] = useState<ColorScalePoint>({ type: 'min', color: '#57bb8a' });
  const [csMidEnabled, setCsMidEnabled] = useState(false);
  const [csMid, setCsMid] = useState<ColorScalePoint>({ type: 'percentile', value: 50, color: '#ffffff' });
  const [csMax, setCsMax] = useState<ColorScalePoint>({ type: 'max', color: '#e67c73' });

  const sortedRules = useMemo(() => [...rules].sort((a, b) => a.priority - b.priority), [rules]);

  const resetForm = useCallback(() => {
    setRangeInput(formatRangeLabel(defaultRange));
    setRangeError('');
    setTab('value');
    setConditionKey('greaterThan');
    setValue1('');
    setValue2('');
    setFormula('');
    setRank('10');
    setPercent(false);
    setBold(false);
    setItalic(false);
    setUnderline(false);
    setStrikethrough(false);
    setTextColor(undefined);
    setBackgroundColor(undefined);
    setCsMin({ type: 'min', color: '#57bb8a' });
    setCsMidEnabled(false);
    setCsMid({ type: 'percentile', value: 50, color: '#ffffff' });
    setCsMax({ type: 'max', color: '#e67c73' });
  }, [defaultRange]);

  const handleNewRule = useCallback(() => {
    resetForm();
    setIsNew(true);
    setEditingId(null);
  }, [resetForm]);

  const handleEditRule = useCallback((rule: ConditionalFormatRule) => {
    setIsNew(false);
    setEditingId(rule.id);
    setRangeInput(formatRangeLabel(rule.range));
    setRangeError('');
    const kind = rule.kind ?? 'value';
    if (kind === 'colorScale') {
      setTab('colorScale');
      if (rule.colorScale) {
        setCsMin(rule.colorScale.min);
        setCsMax(rule.colorScale.max);
        if (rule.colorScale.mid) {
          setCsMidEnabled(true);
          setCsMid(rule.colorScale.mid);
        } else {
          setCsMidEnabled(false);
        }
      }
    } else {
      setTab('value');
      setConditionKey(conditionKeyOf(rule));
      setValue1(rule.value1 ?? '');
      setValue2(rule.value2 ?? '');
      setFormula(rule.formula ?? '');
      setRank(String(rule.rank ?? 10));
      setPercent(rule.percent ?? false);
    }
    setBold(rule.style.bold ?? false);
    setItalic(rule.style.italic ?? false);
    setUnderline(rule.style.underline ?? false);
    setStrikethrough(rule.style.strikethrough ?? false);
    setTextColor(rule.style.textColor);
    setBackgroundColor(rule.style.backgroundColor);
  }, []);

  const handleCancel = useCallback(() => {
    setEditingId(null);
    setIsNew(false);
  }, []);

  const applyStylePreset = useCallback((style: Partial<CellStyle>) => {
    setBold(style.bold ?? false);
    setItalic(style.italic ?? false);
    setUnderline(style.underline ?? false);
    setStrikethrough(style.strikethrough ?? false);
    setTextColor(style.textColor);
    setBackgroundColor(style.backgroundColor);
  }, []);

  const applyColorScalePreset = useCallback((preset: typeof COLOR_SCALE_PRESETS[number]) => {
    setCsMin(preset.min);
    setCsMax(preset.max);
    if (preset.mid) {
      setCsMidEnabled(true);
      setCsMid(preset.mid);
    } else {
      setCsMidEnabled(false);
    }
  }, []);

  const handleSave = useCallback(() => {
    const range = parseRangeInput(rangeInput);
    if (!range) {
      setRangeError('範囲は "A1" または "A1:B10" の形式で入力してください');
      return;
    }
    setRangeError('');

    const style: Partial<CellStyle> = {
      bold: bold || undefined,
      italic: italic || undefined,
      underline: underline || undefined,
      strikethrough: strikethrough || undefined,
      textColor,
      backgroundColor,
    };

    let fields: Pick<ConditionalFormatRule, 'kind' | 'operator' | 'value1' | 'value2' | 'formula' | 'rank' | 'percent' | 'colorScale'>;
    if (tab === 'colorScale') {
      fields = {
        kind: 'colorScale',
        operator: 'greaterThan',
        value1: '',
        colorScale: { min: csMin, mid: csMidEnabled ? csMid : undefined, max: csMax },
      };
    } else if (VALUE_OPERATOR_KEYS.has(conditionKey)) {
      fields = {
        kind: 'value',
        operator: conditionKey as ConditionalOperator,
        value1,
        value2: needsValue2(conditionKey) ? value2 : undefined,
      };
    } else if (needsFormula(conditionKey)) {
      fields = { kind: 'formula', operator: 'greaterThan', value1: '', formula };
    } else if (needsRank(conditionKey)) {
      fields = { kind: conditionKey as 'top' | 'bottom', operator: 'greaterThan', value1: '', rank: Number(rank) || 0, percent };
    } else {
      // duplicate / unique / aboveAverage / belowAverage
      fields = { kind: conditionKey as 'duplicate' | 'unique' | 'aboveAverage' | 'belowAverage', operator: 'greaterThan', value1: '' };
    }

    if (isNew) {
      const maxPriority = rules.reduce((m, r) => Math.max(m, r.priority), 0);
      onAddRule({ range, style, priority: maxPriority + 1, enabled: true, ...fields });
    } else if (editingId) {
      onUpdateRule(editingId, { range, style, ...fields });
    }
    setEditingId(null);
    setIsNew(false);
  }, [rangeInput, tab, conditionKey, value1, value2, formula, rank, percent, bold, italic, underline, strikethrough,
    textColor, backgroundColor, csMin, csMid, csMidEnabled, csMax, isNew, editingId, rules, onAddRule, onUpdateRule]);

  const handleMovePriority = useCallback((rule: ConditionalFormatRule, direction: -1 | 1) => {
    const idx = sortedRules.findIndex(r => r.id === rule.id);
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sortedRules.length) return;
    const target = sortedRules[targetIdx];
    onUpdateRule(rule.id, { priority: target.priority });
    onUpdateRule(target.id, { priority: rule.priority });
  }, [sortedRules, onUpdateRule]);

  const showForm = isNew || editingId !== null;

  if (showForm) {
    return (
      <div className="space-y-3" data-testid="cf-panel-edit">
        <label className={labelClass}>
          <span>範囲</span>
          <input
            type="text"
            value={rangeInput}
            onChange={(e) => setRangeInput(e.target.value)}
            className={inputClass}
            placeholder="A1:B10"
          />
        </label>
        {rangeError && <div className="text-xs text-error">{rangeError}</div>}

        <div className="flex border-b border-grid-line">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs ${tab === 'value' ? 'text-accent-selection border-b-2 border-accent-selection' : 'text-text-primary/60'}`}
            onClick={() => setTab('value')}
          >
            単色
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 text-xs ${tab === 'colorScale' ? 'text-accent-selection border-b-2 border-accent-selection' : 'text-text-primary/60'}`}
            onClick={() => setTab('colorScale')}
          >
            カラースケール
          </button>
        </div>

        {tab === 'value' ? (
          <div className="space-y-3">
            <label className={labelClass}>
              <span>セルの書式設定の条件</span>
              <select
                value={conditionKey}
                onChange={(e) => setConditionKey(e.target.value as ConditionKey)}
                className={inputClass}
              >
                {CONDITION_OPTIONS.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </label>

            {needsValue1(conditionKey) && (
              <label className={labelClass}>
                <span>値{needsValue2(conditionKey) ? '1' : ''}</span>
                <input type="text" value={value1} onChange={(e) => setValue1(e.target.value)} className={inputClass} />
              </label>
            )}
            {needsValue2(conditionKey) && (
              <label className={labelClass}>
                <span>値2</span>
                <input type="text" value={value2} onChange={(e) => setValue2(e.target.value)} className={inputClass} />
              </label>
            )}
            {needsFormula(conditionKey) && (
              <label className={labelClass}>
                <span>カスタム数式</span>
                <input type="text" value={formula} onChange={(e) => setFormula(e.target.value)} className={inputClass} placeholder="=A1>10" />
              </label>
            )}
            {needsRank(conditionKey) && (
              <div className="flex items-end gap-2">
                <label className={`${labelClass} flex-1`}>
                  <span>件数</span>
                  <input type="number" min="1" value={rank} onChange={(e) => setRank(e.target.value)} className={inputClass} />
                </label>
                <label className="flex items-center gap-1 text-xs text-text-primary h-7">
                  <input type="checkbox" checked={percent} onChange={(e) => setPercent(e.target.checked)} />
                  <span>%</span>
                </label>
              </div>
            )}

            <div className="space-y-1">
              <div className="text-xs text-text-primary">書式</div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setBold(b => !b)} className={`w-7 h-7 text-xs font-bold rounded border ${bold ? 'bg-accent-selection/20 border-accent-selection' : 'border-grid-line'}`}>B</button>
                <button type="button" onClick={() => setItalic(b => !b)} className={`w-7 h-7 text-xs italic rounded border ${italic ? 'bg-accent-selection/20 border-accent-selection' : 'border-grid-line'}`}>I</button>
                <button type="button" onClick={() => setUnderline(b => !b)} className={`w-7 h-7 text-xs underline rounded border ${underline ? 'bg-accent-selection/20 border-accent-selection' : 'border-grid-line'}`}>U</button>
                <button type="button" onClick={() => setStrikethrough(b => !b)} className={`w-7 h-7 text-xs line-through rounded border ${strikethrough ? 'bg-accent-selection/20 border-accent-selection' : 'border-grid-line'}`}>S</button>
                <ColorPicker
                  currentColor={textColor}
                  onColorChange={setTextColor}
                  label="文字色"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.12 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z"/>
                    </svg>
                  }
                />
                <ColorPicker
                  currentColor={backgroundColor}
                  onColorChange={setBackgroundColor}
                  label="背景色"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16.56 8.94L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 000 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.58.59-1.53 0-2.12zM5.21 10L10 5.21 14.79 10H5.21zM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5z"/>
                    </svg>
                  }
                />
              </div>
              <div
                className="mt-1 px-2 py-1 text-xs rounded border border-grid-line inline-block"
                style={{
                  backgroundColor: backgroundColor ?? 'transparent',
                  color: textColor ?? 'var(--color-text-primary)',
                  fontWeight: bold ? 'bold' : undefined,
                  fontStyle: italic ? 'italic' : undefined,
                  textDecoration: [underline && 'underline', strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
                }}
              >
                プレビュー 123
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-text-primary/60">既定のスタイル</div>
              <div className="grid grid-cols-3 gap-1">
                {STYLE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="px-1.5 py-1 text-[11px] rounded border border-grid-line hover:border-accent-selection truncate"
                    style={{
                      backgroundColor: p.style.backgroundColor ?? undefined,
                      color: p.style.textColor ?? undefined,
                      fontWeight: p.style.bold ? 'bold' : undefined,
                    }}
                    onClick={() => applyStylePreset(p.style)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-text-primary/60">プリセット</div>
              <div className="grid grid-cols-2 gap-1">
                {COLOR_SCALE_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="h-6 rounded border border-grid-line hover:border-accent-selection text-[10px] text-white"
                    style={{ background: `linear-gradient(to right, ${p.min.color}, ${p.mid ? `${p.mid.color}, ` : ''}${p.max.color})` }}
                    onClick={() => applyColorScalePreset(p)}
                    title={p.label}
                  />
                ))}
              </div>
            </div>

            <div
              className="h-4 rounded border border-grid-line"
              style={{ background: `linear-gradient(to right, ${csMin.color}, ${csMidEnabled ? `${csMid.color}, ` : ''}${csMax.color})` }}
            />

            {(['min', ...(csMidEnabled ? ['mid'] : []), 'max'] as const).map((slot) => {
              const point = slot === 'min' ? csMin : slot === 'mid' ? csMid : csMax;
              const setPoint = slot === 'min' ? setCsMin : slot === 'mid' ? setCsMid : setCsMax;
              const label = slot === 'min' ? '最小点' : slot === 'mid' ? '中間点' : '最大点';
              return (
                <div key={slot} className="flex items-end gap-1">
                  <label className={`${labelClass} flex-1`}>
                    <span>{label}: 種類</span>
                    <select
                      value={point.type}
                      onChange={(e) => setPoint({ ...point, type: e.target.value as ColorScalePoint['type'] })}
                      className={inputClass}
                    >
                      {POINT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  {(point.type === 'number' || point.type === 'percent' || point.type === 'percentile') && (
                    <label className={labelClass}>
                      <span>値</span>
                      <input
                        type="number"
                        value={point.value ?? 0}
                        onChange={(e) => setPoint({ ...point, value: Number(e.target.value) || 0 })}
                        className={`${inputClass} w-16`}
                      />
                    </label>
                  )}
                  <input
                    type="color"
                    value={point.color}
                    onChange={(e) => setPoint({ ...point, color: e.target.value })}
                    className="w-8 h-7 border border-grid-line rounded cursor-pointer"
                  />
                </div>
              );
            })}

            <label className="flex items-center gap-2 text-xs text-text-primary">
              <input type="checkbox" checked={csMidEnabled} onChange={(e) => setCsMidEnabled(e.target.checked)} />
              <span>中間点を使用する</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnClass} onClick={handleCancel}>キャンセル</button>
          <button type="button" data-btn-primary className={primaryBtnClass} onClick={handleSave} data-testid="cf-panel-save">
            完了
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="cf-panel-list">
      {sortedRules.length === 0 ? (
        <p className="text-xs text-text-primary/40">ルールがありません</p>
      ) : (
        sortedRules.map((rule, idx) => (
          <div key={rule.id} className="flex items-center gap-2 px-2 py-1.5 rounded border border-grid-line text-xs">
            <div
              className="w-5 h-5 rounded shrink-0 border border-grid-line"
              style={
                (rule.kind ?? 'value') === 'colorScale'
                  ? { background: colorScaleGradient(rule) }
                  : { backgroundColor: rule.style.backgroundColor ?? 'transparent' }
              }
            />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEditRule(rule)}>
              <div className="text-text-primary/60 truncate">{formatRangeLabel(rule.range)}</div>
              <div className="text-text-primary truncate">{describeCfRule(rule)}</div>
            </div>
            <div className="flex flex-col shrink-0">
              <button type="button" disabled={idx === 0} className="text-text-primary/60 disabled:opacity-20 hover:text-text-primary" onClick={() => handleMovePriority(rule, -1)}>▲</button>
              <button type="button" disabled={idx === sortedRules.length - 1} className="text-text-primary/60 disabled:opacity-20 hover:text-text-primary" onClick={() => handleMovePriority(rule, 1)}>▼</button>
            </div>
            <button type="button" className="text-error text-[10px] hover:underline shrink-0" onClick={() => onDeleteRule(rule.id)}>削除</button>
          </div>
        ))
      )}
      <button
        type="button"
        data-btn-primary
        className={`${primaryBtnClass} w-full`}
        onClick={handleNewRule}
        data-testid="cf-panel-add"
      >
        + 条件を追加
      </button>
    </div>
  );
});
