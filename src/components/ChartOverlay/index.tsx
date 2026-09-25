import { memo, useEffect, useState } from 'react';
import { ChartPanel } from './ChartPanel';
import type { ChartData } from '../../types/chart';
import type { CellData } from '../../types/grid';

interface ChartOverlayProps {
  charts: ChartData[];
  getCellData: (col: number, row: number) => CellData | undefined;
  version: number;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}

export const ChartOverlay = memo(function ChartOverlay({
  charts,
  getCellData,
  version,
  onMove,
  onResize,
  onDelete,
  onEdit,
}: ChartOverlayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // useEffect required: clicking outside any chart panel clears the selection border
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-chart-panel]')) {
        setSelectedId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selectedId]);

  if (charts.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {charts.map((chart) => (
        <div key={chart.id} className="pointer-events-auto">
          <ChartPanel
            chart={chart}
            getCellData={getCellData}
            version={version}
            selected={selectedId === chart.id}
            onSelect={setSelectedId}
            onMove={onMove}
            onResize={onResize}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        </div>
      ))}
    </div>
  );
});
