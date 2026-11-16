// Entry point of the Android app (see vite.android.config.ts).
import React from "react";
import ReactDOM from "react-dom/client";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";
import Prototype from "../Prototype";
import { KeyboardProvider } from "./index";
import { UpdateBanner } from "./update";
import "../prototype.css";
import "./native.css";

if (Capacitor.isNativePlatform()) {
  // The system back button first goes to the app (close a sheet, leave a list); it only
  // closes the app when the app has nothing left to go back from.
  void CapacitorApp.addListener("backButton", () => {
    const handled = !window.dispatchEvent(new Event("app:back", { cancelable: true }));
    if (!handled) void CapacitorApp.exitApp();
  });

  // Keep the system bars in step with the in-app theme: icon color through Capacitor, and the
  // window color behind the bars through the bridge defined in MainActivity.java.
  // setStyle resets the window color to the Android theme's, so the color is applied after it.
  const root = document.documentElement;
  const appWindow = (window as { AppWindow?: { setBackground(color: string): void } }).AppWindow;
  const syncSystemBars = () => {
    const dark = root.classList.contains("smart-shopping-dark");
    const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      .catch(() => undefined)
      .then(() => appWindow?.setBackground(paper));
  };
  new MutationObserver(syncSystemBars).observe(root, { attributes: true, attributeFilter: ["class"] });
  syncSystemBars();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <KeyboardProvider>
      <Prototype />
    </KeyboardProvider>
    <UpdateBanner />
  </React.StrictMode>,
);
