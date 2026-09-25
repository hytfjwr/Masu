# Masu

[![CI](https://github.com/hytfjwr/Masu/actions/workflows/ci.yml/badge.svg)](https://github.com/hytfjwr/Masu/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/hytfjwr/Masu/actions/workflows/pages.yml/badge.svg)](https://github.com/hytfjwr/Masu/actions/workflows/pages.yml)

A spreadsheet editor that runs entirely in your browser. There is no server and no cloud: formula evaluation, file import/export, PDF generation and autosave all happen client-side.

**Live demo:** https://hytfjwr.github.io/Masu/

## Features

- **Formula engine** — 250+ Excel-compatible functions, dynamic arrays with spilling, `LET` / `LAMBDA` / `MAP` / `REDUCE`, cross-sheet references and named ranges
- **Files** — open and save XLSX, CSV (with Shift_JIS detection), JSON and the native `.masu.json` format (older `.tabula.json` files still open)
- **Data tools** — sorting, filters, remove duplicates, data validation, conditional formatting, row/column grouping
- **Visualization** — charts, sparklines and pivot tables
- **Printing** — print preview and PDF export
- **Autosave** — your workbook is kept in IndexedDB and restored on reload
- Frozen panes, find & replace, keyboard shortcuts, IME-friendly in-cell editing, and dark mode

## Getting started

Requires Node.js and [pnpm](https://pnpm.io/) 11. The toolchain is [Vite+](https://viteplus.dev/) (`vp`), which bundles Vite, Vitest, Oxlint and Oxfmt.

```bash
pnpm install
pnpm dev
```

## Scripts

| Command      | Description                                    |
| ------------ | ---------------------------------------------- |
| `pnpm dev`   | Start the dev server                           |
| `pnpm build` | Type-check with `tsc` and build for production |
| `pnpm check` | Format check, lint and type-aware lint         |
| `pnpm lint`  | Lint with Oxlint                               |
| `pnpm fmt`   | Format with Oxfmt                              |
| `pnpm test`  | Run the test suite with Vitest                 |

## Tech stack

React 19, TypeScript 7, Vite+, Tailwind CSS v4, TanStack Virtual, Recharts, ExcelJS and jsPDF.
