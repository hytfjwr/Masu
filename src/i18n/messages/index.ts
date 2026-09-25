import { chrome } from './chrome';
import { common } from './common';
import { devtools } from './devtools';
import { dialogs } from './dialogs';
import { engine } from './engine';
import { grid } from './grid';
import { panels } from './panels';

/** Every area table, kept separate so a test can catch a key defined in two areas. */
export const messageTables = { common, chrome, engine, grid, panels, dialogs, devtools };

export const messages = {
  ...common,
  ...chrome,
  ...engine,
  ...grid,
  ...panels,
  ...dialogs,
  ...devtools,
};

export type MessageKey = keyof typeof messages;
