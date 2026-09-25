import { memo, useCallback, useEffect } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const mod = isMac ? '⌘' : 'Ctrl';

interface ShortcutItem {
  label: string;
  keys: string;
}

interface ShortcutCategory {
  title: string;
  items: ShortcutItem[];
}

const CATEGORIES: ShortcutCategory[] = [
  {
    title: '移動',
    items: [
      { label: 'セルを移動', keys: '矢印' },
      { label: 'データの端まで移動', keys: `${mod}+矢印` },
      { label: '行の先頭へ', keys: 'Home' },
      { label: 'A1へ移動', keys: `${mod}+Home` },
      { label: '使用範囲の末尾へ移動', keys: `${mod}+End` },
      { label: '1画面分移動', keys: 'PageUp/Down' },
    ],
  },
  {
    title: '選択',
    items: [
      { label: '選択範囲を拡張', keys: 'Shift+矢印' },
      { label: 'データの端まで選択範囲を拡張', keys: `${mod}+Shift+矢印` },
      { label: 'すべて選択', keys: `${mod}+A` },
      { label: '行を選択', keys: 'Shift+Space' },
      { label: '列を選択', keys: `${mod}+Space` },
    ],
  },
  {
    title: '編集',
    items: [
      { label: 'セルを編集', keys: 'F2' },
      { label: '確定して下へ移動', keys: 'Enter' },
      { label: '確定して上へ移動', keys: 'Shift+Enter' },
      { label: '確定して右/左へ移動', keys: 'Tab / Shift+Tab' },
      { label: 'セル内で改行', keys: 'Alt+Enter' },
      { label: '選択範囲全体に入力', keys: `${mod}+Enter` },
      { label: '編集をキャンセル', keys: 'Esc' },
      { label: '削除', keys: 'Delete' },
      { label: '下にフィル', keys: `${mod}+D` },
      { label: '右にフィル', keys: `${mod}+R` },
      { label: '今日の日付を入力', keys: `${mod}+;` },
      { label: '現在時刻を入力', keys: `${mod}+Shift+;` },
    ],
  },
  {
    title: '書式',
    items: [
      { label: '太字/斜体/下線', keys: `${mod}+B / I / U` },
      { label: '取り消し線', keys: `${mod}+Shift+X` },
      { label: '中央/左/右揃え', keys: `${mod}+Shift+E / L / R` },
      { label: '書式をクリア', keys: `${mod}+\\` },
    ],
  },
  {
    title: 'クリップボード',
    items: [
      { label: 'コピー/切り取り/貼り付け', keys: `${mod}+C / X / V` },
      { label: '値のみ貼り付け', keys: `${mod}+Shift+V` },
    ],
  },
  {
    title: 'その他',
    items: [
      { label: '元に戻す/やり直し', keys: `${mod}+Z / Y` },
      { label: '検索', keys: `${mod}+F` },
      { label: '検索と置換', keys: `${mod}+H` },
      { label: 'ショートカット一覧を表示', keys: `${mod}+/` },
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
          <h2 className="text-sm font-semibold text-text-primary">キーボード ショートカット</h2>
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
              <div key={category.title} className="space-y-1.5">
                <div className="text-xs font-semibold text-text-primary">{category.title}</div>
                <div className="space-y-1">
                  {category.items.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-text-primary/80">{item.label}</span>
                      <kbd className="px-1.5 py-0.5 rounded border border-grid-line bg-header-bg text-[11px] font-mono whitespace-nowrap">
                        {item.keys}
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
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
});
