/** Maximum undo steps per editor. Each history retains immutable document references. */
export const UNDO_HISTORY_LIMIT = 100;

export function rememberEditorState<T>(history: T[], state: T): void {
  history.push(state);
  if (history.length > UNDO_HISTORY_LIMIT) history.splice(0, history.length - UNDO_HISTORY_LIMIT);
}
