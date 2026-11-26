import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.andyly00.korzina",
  appName: "Корзина",
  webDir: "dist/android",
  backgroundColor: "#faf7ee",
  plugins: {
    // Reminders and timers show the basket in the status bar, as push notifications do.
    LocalNotifications: { smallIcon: "ic_stat_basket", iconColor: "#2f603c" },
  },
};

export default config;
