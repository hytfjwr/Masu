import { memo, useCallback, useState } from 'react';
import type { AggregationType, PivotTableConfig, PivotValueField } from '../../types/pivot';
import type { CellData, NumberFormat, SheetData } from '../../types/grid';
import { parseCellKey, cellKey } from '../../utils/coordinates';
import { buildPivotTable } from '../../pivot/pivotEngine';
import type { PivotComputeConfig } from '../../pivot/pivotEngine';
import { createEmptySheet } from '../../utils/sheetUtils';

interface PivotTableDialogProps {
  visible: boolean;
  onClose: () => void;
  sheets: SheetData[];
  activeSheetId: string;
  getCellData: (col: number, row: number) => CellData | undefined;
  onCreatePivot: (config: PivotTableConfig, outputSheet: SheetData, outputCells: Array<{ col: number; row: number; value: string }>) => void;
}

const AGG_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'sum', label: '合計' },
  { value: 'count', label: '個数' },
  { value: 'average', label: '平均' },
  { value: 'max', label: '最大' },
  { value: 'min', label: '最小' },
];

const FORMAT_OPTIONS: { value: NumberFormat; label: string }[] = [
  { value: 'auto', label: '自動' },
  { value: 'number', label: '数値' },
  { value: 'currency', label: '通貨' },
  { value: 'percent', label: 'パーセント' },
];

type FieldArea = 'available' | 'row' | 'col' | 'value' | 'filter';

interface FieldItem {
  index: number;
  name: string;
  area: FieldArea;
  aggregation: AggregationType;
  numberFormat: NumberFormat;
}

export const PivotTableDialog = memo(function PivotTableDialog({
  visible,
  onClose,
  sheets,
  activeSheetId,
  getCellData,
  onCreatePivot,
}: PivotTableDialogProps) {
  const [sourceRange, setSourceRange] = useState('');
  const [fields, setFields] = useState<FieldItem[]>([]);
  const [dragItem, setDragItem] = useState<number | null>(null);
  const [error, setError] = useState('');

  const activeSheet = sheets.find((s) => s.id === activeSheetId);

  const handleDetectFields = useCallback(() => {
    if (!sourceRange.trim() || !activeSheet) {
      setError('ソースデータ範囲を入力してください');
      return;
    }

    const rangeParts = sourceRange.trim().toUpperCase().split(':');
    if (rangeParts.length !== 2) {
      setError('範囲の形式が不正です（例: A1:D100）');
      return;
    }

    try {
      const startPos = parseCellKey(rangeParts[0]);
      const endPos = parseCellKey(rangeParts[1]);
      const minCol = Math.min(startPos.col, endPos.col);
      const maxCol = Math.max(startPos.col, endPos.col);
      const headerRow = Math.min(startPos.row, endPos.row);

      const fieldNames: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const cell = getCellData(c, headerRow);
        fieldNames.push(cell?.displayValue ?? cellKey(c, headerRow));
      }

      setFields(
        fieldNames.map((name, idx) => ({
          index: idx,
          name,
          area: 'available' as FieldArea,
          aggregation: 'sum' as AggregationType,
          numberFormat: 'auto' as NumberFormat,
        })),
      );
      setError('');
    } catch {
      setError('範囲の解析に失敗しました');
    }
  }, [sourceRange, activeSheet, getCellData]);

  const handleDragStart = useCallback((_e: React.DragEvent, index: number) => {
    setDragItem(index);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetArea: FieldArea) => {
      e.preventDefault();
      if (dragItem === null) return;
      setFields((prev) =>
        prev.map((f) => (f.index === dragItem ? { ...f, area: targetArea } : f)),
      );
      setDragItem(null);
    },
    [dragItem],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleRemoveFromArea = useCallback((index: number) => {
    setFields((prev) =>
      prev.map((f) => (f.index === index ? { ...f, area: 'available' } : f)),
    );
  }, []);

  const handleAggChange = useCallback((index: number, agg: AggregationType) => {
    setFields((prev) =>
      prev.map((f) => (f.index === index ? { ...f, aggregation: agg } : f)),
    );
  }, []);

  const handleFormatChange = useCallback((index: number, fmt: NumberFormat) => {
    setFields((prev) =>
      prev.map((f) => (f.index === index ? { ...f, numberFormat: fmt } : f)),
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (!activeSheet) return;

    const rowFields = fields.filter((f) => f.area === 'row').map((f) => f.index);
    const colFields = fields.filter((f) => f.area === 'col').map((f) => f.index);
    const valueFields: PivotValueField[] = fields
      .filter((f) => f.area === 'value')
      .map((f) => ({
        fieldIndex: f.index,
        fieldName: f.name,
        aggregation: f.aggregation,
        numberFormat: f.numberFormat === 'auto' ? undefined : f.numberFormat,
      }));
    const filterFields = fields.filter((f) => f.area === 'filter').map((f) => f.index);

    if (valueFields.length === 0) {
      setError('少なくとも1つの値フィールドを指定してください');
      return;
    }

    // Extract source data
    const rangeParts = sourceRange.trim().toUpperCase().split(':');
    const startPos = parseCellKey(rangeParts[0]);
    const endPos = parseCellKey(rangeParts[1]);
    const minCol = Math.min(startPos.col, endPos.col);
    const maxCol = Math.max(startPos.col, endPos.col);
    const minRow = Math.min(startPos.row, endPos.row);
    const maxRow = Math.max(startPos.row, endPos.row);

    const sourceData: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const row: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const cell = getCellData(c, r);
        row.push(cell?.displayValue ?? '');
      }
      sourceData.push(row);
    }

    const config: PivotComputeConfig = {
      rowFields,
      colFields,
      valueFields,
      filterFields,
    };

    const pivotResult = buildPivotTable(sourceData, config);

    // Create output sheet
    const existingNames = sheets.map((s) => s.name);
    let pivotNum = 1;
    while (existingNames.includes(`ピボット_${pivotNum}`)) {
      pivotNum++;
    }
    const outputSheet = createEmptySheet(`ピボット_${pivotNum}`);
    // Set size large enough for pivot data
    outputSheet.rowCount = Math.max(100, pivotResult.length + 10);
    outputSheet.colCount = Math.max(26, (pivotResult[0]?.length ?? 0) + 5);

    // Convert pivot result to cell values
    const outputCells: Array<{ col: number; row: number; value: string }> = [];
    for (let r = 0; r < pivotResult.length; r++) {
      for (let c = 0; c < pivotResult[r].length; c++) {
        const cell = pivotResult[r][c];
        const val = typeof cell.value === 'number' ? String(cell.value) : cell.value;
        if (val) {
          outputCells.push({ col: c, row: r, value: val });
        }
      }
    }

    const pivotConfig: PivotTableConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      sourceSheetId: activeSheetId,
      sourceRange: sourceRange.trim().toUpperCase(),
      rowFields,
      colFields,
      valueFields,
      filterFields,
      targetSheetId: outputSheet.id,
    };

    onCreatePivot(pivotConfig, outputSheet, outputCells);
    onClose();
  }, [activeSheet, fields, sourceRange, getCellData, sheets, activeSheetId, onCreatePivot, onClose]);

  const handleBackdropMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!visible) return null;

  const availableFields = fields.filter((f) => f.area === 'available');
  const rowFieldsList = fields.filter((f) => f.area === 'row');
  const colFieldsList = fields.filter((f) => f.area === 'col');
  const valueFieldsList = fields.filter((f) => f.area === 'value');
  const filterFieldsList = fields.filter((f) => f.area === 'filter');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm animate-backdrop-in"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="glass-panel rounded-2xl p-4 min-w-[560px] max-w-[700px] max-h-[90vh] overflow-auto animate-dialog-spring"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-text-primary mb-3">ピボットテーブルの挿入</h3>

        {/* Source range */}
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-primary flex-1">
              <span>ソースデータ範囲（例: A1:D100）</span>
              <input
                type="text"
                value={sourceRange}
                onChange={(e) => setSourceRange(e.target.value)}
                placeholder="A1:D100"
                className="h-7 px-2 text-xs bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
              />
            </label>
            <button
              type="button"
              data-btn-primary
              className="h-7 px-3 text-xs text-white bg-accent-selection rounded hover:opacity-90"
              onClick={handleDetectFields}
            >
              フィールド検出
            </button>
          </div>

          {error && <div className="text-xs text-red-500">{error}</div>}

          {fields.length > 0 && (
            <>
              {/* Field lists */}
              <div className="grid grid-cols-2 gap-3">
                {/* Available fields */}
                <div>
                  <div className="text-xs text-text-primary/70 mb-1 font-medium">フィールド一覧</div>
                  <div
                    className="min-h-[80px] bg-ui-bg border border-grid-line rounded p-1 space-y-0.5"
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, 'available')}
                  >
                    {availableFields.map((f) => (
                      <div
                        key={f.index}
                        draggable
                        onDragStart={(e) => handleDragStart(e, f.index)}
                        className="flex items-center h-6 px-2 text-xs text-text-primary bg-grid-bg border border-grid-line rounded cursor-grab hover:border-accent-selection"
                      >
                        {f.name}
                      </div>
                    ))}
                    {availableFields.length === 0 && (
                      <div className="text-[10px] text-text-primary/40 p-1">
                        全フィールド配置済み
                      </div>
                    )}
                  </div>
                </div>

                {/* Filter area */}
                <div>
                  <div className="text-xs text-text-primary/70 mb-1 font-medium">フィルター</div>
                  <DropArea
                    fields={filterFieldsList}
                    area="filter"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragStart={handleDragStart}
                    onRemove={handleRemoveFromArea}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Row area */}
                <div>
                  <div className="text-xs text-text-primary/70 mb-1 font-medium">行</div>
                  <DropArea
                    fields={rowFieldsList}
                    area="row"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragStart={handleDragStart}
                    onRemove={handleRemoveFromArea}
                  />
                </div>

                {/* Column area */}
                <div>
                  <div className="text-xs text-text-primary/70 mb-1 font-medium">列</div>
                  <DropArea
                    fields={colFieldsList}
                    area="col"
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onDragStart={handleDragStart}
                    onRemove={handleRemoveFromArea}
                  />
                </div>
              </div>

              {/* Value area */}
              <div>
                <div className="text-xs text-text-primary/70 mb-1 font-medium">値</div>
                <div
                  className="min-h-[60px] bg-ui-bg border border-grid-line rounded p-1 space-y-0.5"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'value')}
                >
                  {valueFieldsList.map((f) => (
                    <div
                      key={f.index}
                      draggable
                      onDragStart={(e) => handleDragStart(e, f.index)}
                      className="flex items-center gap-1 h-7 px-2 text-xs text-text-primary bg-grid-bg border border-grid-line rounded cursor-grab"
                    >
                      <span className="flex-1 truncate">{f.name}</span>
                      <select
                        value={f.aggregation}
                        onChange={(e) => handleAggChange(f.index, e.target.value as AggregationType)}
                        className="h-5 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {AGG_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={f.numberFormat}
                        onChange={(e) => handleFormatChange(f.index, e.target.value as NumberFormat)}
                        className="h-5 px-1 text-[10px] bg-ui-bg text-text-primary border border-grid-line rounded outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {FORMAT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="text-text-primary/40 hover:text-text-primary text-xs"
                        onClick={() => handleRemoveFromArea(f.index)}
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {valueFieldsList.length === 0 && (
                    <div className="text-[10px] text-text-primary/40 p-1">
                      フィールドをここにドラッグ
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-1">
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
              disabled={fields.length === 0}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

// --- Drop Area sub-component ---

interface DropAreaProps {
  fields: FieldItem[];
  area: FieldArea;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, area: FieldArea) => void;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onRemove: (index: number) => void;
}

function DropArea({ fields, area, onDragOver, onDrop, onDragStart, onRemove }: DropAreaProps) {
  return (
    <div
      className="min-h-[60px] bg-ui-bg border border-grid-line rounded p-1 space-y-0.5"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, area)}
    >
      {fields.map((f) => (
        <div
          key={f.index}
          draggable
          onDragStart={(e) => onDragStart(e, f.index)}
          className="flex items-center justify-between h-6 px-2 text-xs text-text-primary bg-grid-bg border border-grid-line rounded cursor-grab hover:border-accent-selection"
        >
          <span className="truncate">{f.name}</span>
          <button
            type="button"
            className="text-text-primary/40 hover:text-text-primary text-xs ml-1"
            onClick={() => onRemove(f.index)}
          >
            x
          </button>
        </div>
      ))}
      {fields.length === 0 && (
        <div className="text-[10px] text-text-primary/40 p-1">フィールドをここにドラッグ</div>
      )}
    </div>
  );
}
