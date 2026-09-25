import { memo, useRef, useState } from 'react';
import './devtools.css';
import type { DevToolsHost } from './types';
import { AstTool } from './tools/AstTool';
import { DependencyTool } from './tools/DependencyTool';
import { ProfilerTool } from './tools/ProfilerTool';
import { FunctionsTool } from './tools/FunctionsTool';
import { InspectorTool } from './tools/InspectorTool';
import { HistoryTool } from './tools/HistoryTool';
import { RenderTool } from './tools/RenderTool';
import { StorageTool } from './tools/StorageTool';
import { cellKey } from '../../utils/coordinates';
import { STORAGE_KEYS } from '../../utils/storageKeys';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/useI18n';

type TabId =
  | 'ast'
  | 'deps'
  | 'profiler'
  | 'functions'
  | 'inspector'
  | 'history'
  | 'render'
  | 'storage';

const TABS: Array<{ id: TabId; labelKey: MessageKey; icon: string }> = [
  {
    id: 'ast',
    labelKey: 'devtools.panel.tab.ast',
    icon: 'M8 2.5v3M8 5.5 4 10M8 5.5l4 4.5M4 10v3M12 10v3',
  },
  {
    id: 'deps',
    labelKey: 'devtools.panel.tab.deps',
    icon: 'M3 4h3v3H3zM10 9h3v3h-3zM6 5.5h2.5a1 1 0 0 1 1 1V9',
  },
  {
    id: 'profiler',
    labelKey: 'devtools.panel.tab.profiler',
    icon: 'M2.5 13.5h11M4 11V8M7 11V4M10 11V6.5M13 11V9',
  },
  {
    id: 'functions',
    labelKey: 'devtools.panel.tab.functions',
    icon: 'M10.5 2.5c-2 0-2.5 1-2.8 3L6.3 13c-.3 1.5-1 2-2.3 2M4.5 7.5h6',
  },
  {
    id: 'inspector',
    labelKey: 'devtools.panel.tab.inspector',
    icon: 'M2.5 2.5h11v11h-11zM2.5 6.5h11M6.5 2.5v11',
  },
  {
    id: 'history',
    labelKey: 'devtools.panel.tab.history',
    icon: 'M8 4.5V8l2.5 1.5M2.8 8a5.2 5.2 0 1 0 1.5-3.7M2.5 2.5v2.5H5',
  },
  {
    id: 'render',
    labelKey: 'devtools.panel.tab.render',
    icon: 'M2 8s2.2-4.5 6-4.5S14 8 14 8s-2.2 4.5-6 4.5S2 8 2 8zM8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z',
  },
  {
    id: 'storage',
    labelKey: 'devtools.panel.tab.storage',
    icon: 'M3 4c0-1 2.2-1.8 5-1.8s5 .8 5 1.8v8c0 1-2.2 1.8-5 1.8S3 13 3 12zM3 4c0 1 2.2 1.8 5 1.8S13 5 13 4M3 8c0 1 2.2 1.8 5 1.8S13 9 13 8',
  },
];

const TAB_STORAGE_KEY = STORAGE_KEYS.devtoolsTab;

function loadTab(): TabId {
  try {
    const saved = localStorage.getItem(TAB_STORAGE_KEY);
    if (saved && TABS.some((t) => t.id === saved)) return saved as TabId;
  } catch {
    // storage unavailable (private mode…) — fall back to the first tab
  }
  return 'ast';
}

interface DevToolsProps {
  host: DevToolsHost;
  onClose: () => void;
}

/**
 * Developer tools: one floating glass window (drag by the title bar, resize from the corner) with a
 * tab per tool. Everything the tools need from the spreadsheet comes through `host`.
 */
export const DevTools = memo(function DevTools({ host, onClose }: DevToolsProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabId>(loadTab);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const selectTab = (id: TabId) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      // not persisted — fine
    }
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const drag = (e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    setPosition({
      x: Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - 160),
      y: Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - 60),
    });
  };

  const activeKey = cellKey(host.activeCell.col, host.activeCell.row);
  const liveFormula =
    host.isEditing && host.editValue.startsWith('=') ? host.editValue.slice(1) : undefined;
  const activeFormula = liveFormula ?? host.getCell(host.activeSheetId, activeKey)?.formula;

  return (
    <div
      className="devtools glass-panel animate-dialog-spring"
      role="dialog"
      aria-label={t('devtools.panel.title')}
      data-testid="devtools"
      style={position ? { left: position.x, top: position.y } : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // The grid's shortcut handler doesn't see keys while focus is in here
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header
        className="devtools-header"
        onPointerDown={startDrag}
        onPointerMove={drag}
        onPointerUp={() => {
          dragRef.current = null;
        }}
      >
        <span className="devtools-title">{t('devtools.panel.title')}</span>
        <span className="ast-viz-badge">DEV</span>
        <span className="devtools-shortcut">⌘/Ctrl + Shift + K</span>
        <button
          type="button"
          className="ast-viz-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          ×
        </button>
      </header>

      <nav className="devtools-tabs" role="tablist" aria-label={t('devtools.panel.tools')}>
        {TABS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={tab === opt.id}
            className="devtools-tab"
            onClick={() => selectTab(opt.id)}
            data-testid={`devtools-tab-${opt.id}`}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d={opt.icon} />
            </svg>
            {t(opt.labelKey)}
          </button>
        ))}
      </nav>

      <div className="devtools-body" key={tab}>
        {tab === 'ast' && (
          <AstTool
            formula={activeFormula}
            formulaLabel={
              host.isEditing ? t('devtools.panel.cellEditingLabel', { cell: activeKey }) : activeKey
            }
            live={liveFormula !== undefined}
            version={host.version}
            onSelectRange={host.selectRange}
          />
        )}
        {tab === 'deps' && <DependencyTool host={host} />}
        {tab === 'profiler' && <ProfilerTool host={host} />}
        {tab === 'functions' && <FunctionsTool host={host} />}
        {tab === 'inspector' && <InspectorTool host={host} />}
        {tab === 'history' && <HistoryTool host={host} />}
        {tab === 'render' && <RenderTool />}
        {tab === 'storage' && <StorageTool host={host} />}
      </div>
    </div>
  );
});
