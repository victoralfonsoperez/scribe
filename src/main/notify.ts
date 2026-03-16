import { Notification, BrowserWindow } from "electron";

export function notify(
  title: string,
  body: string,
  win: BrowserWindow | null,
): void {
  if (win?.isFocused()) return;

  const n = new Notification({ title, body });
  n.on("click", () => {
    win?.show();
    win?.focus();
  });
  n.show();
}
