// The app inside the phone frame (src/App.tsx) and the Android app (src/native/main.tsx).
// State and actions live in app/useShoppingApp.ts; the screens and sheets in app/ render them.
import { Cross2Icon } from "@radix-ui/react-icons";
import type { CSSProperties } from "react";
import { useKeyboardInsets } from "./mobile";
import { CookingScreen } from "./app/CookingScreen";
import { HomeScreen } from "./app/HomeScreen";
import { ListScreen } from "./app/ListScreen";
import { AppSheet } from "./app/sheets";
import { useShoppingApp } from "./app/useShoppingApp";

export default function Prototype() {
  const app = useShoppingApp();
  const { bottomInset } = useKeyboardInsets();
  const { toast } = app;

  return (
    <div className={`shopping-app ${app.data.settings.darkMode ? "theme-dark" : ""}`} style={{ "--mobile-safe-area-height": `${bottomInset}px` } as CSSProperties}>
      {app.cooking && app.cookingRecipe
        ? <CookingScreen app={app} recipe={app.cookingRecipe} stepIndex={app.cooking.step} />
        : app.currentList ? <ListScreen app={app} list={app.currentList} /> : <HomeScreen app={app} />}
      <AppSheet app={app} />
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="toast-undo" onClick={app.undo}>Отменить</button>}
          <button onClick={() => app.setToast(null)} aria-label="Закрыть"><Cross2Icon /></button>
        </div>
      )}
    </div>
  );
}
