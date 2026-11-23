// Google AdMob banner of the Android app (@capacitor-community/admob).
//
// The banner is a native view drawn over the web view, just above the bottom navigation of the
// home screen; it is hidden whenever a list is open, in cooking mode and while a sheet is open,
// so it never covers what the user works with. There are no ads on the website.
//
// Ads are off unless the build has an ad unit id (ADMOB_BANNER_ID, see vite.android.config.ts).
// ADMOB_TESTING=1 shows Google's test ads instead of real ones: real ads must never be clicked
// by the developer.
//
// Before the first ad, Google's consent form (UMP) is shown to the people who need it (EEA, UK,
// Switzerland). Its "privacy options" can be reopened from Settings when required.
import { Capacitor } from "@capacitor/core";
import { useEffect, useState } from "react";

declare const __ADMOB_BANNER_ID__: string;
declare const __ADMOB_TESTING__: boolean;

const bannerId = typeof __ADMOB_BANNER_ID__ === "string" ? __ADMOB_BANNER_ID__ : "";
const testing = typeof __ADMOB_TESTING__ === "boolean" ? __ADMOB_TESTING__ : false;
export const adsEnabled = Boolean(bannerId) && Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";

type AdMobModule = typeof import("@capacitor-community/admob");

let started: Promise<AdMobModule | null> | null = null;
let privacyOptionsRequired = false;
let bannerShown = false;
let bannerHeight = 0;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

// Initialises the SDK and asks for consent once; resolves to null when ads may not be shown.
function start(): Promise<AdMobModule | null> {
  started ??= (async () => {
    const module = await import("@capacitor-community/admob");
    const { AdMob, AdmobConsentStatus, BannerAdPluginEvents } = module;
    await AdMob.initialize({ initializeForTesting: testing });
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) consent = await AdMob.showConsentForm();
    privacyOptionsRequired = String(consent.privacyOptionsRequirementStatus) === "REQUIRED";
    await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      bannerHeight = size.height;
      changed();
    });
    changed();
    return consent.canRequestAds ? module : null;
  })().catch((error) => {
    console.warn("Ads are not available", error);
    return null;
  });
  return started;
}

// Distance from the bottom of the screen to the top of the bottom navigation, so the banner sits
// right above it.
function navigationOffset() {
  const nav = document.querySelector(".bottom-nav");
  return nav ? Math.max(0, Math.round(window.innerHeight - nav.getBoundingClientRect().top)) : 0;
}

// Shows the banner while `wanted` and hides it otherwise. Returns the banner's height in CSS
// pixels, for the space the screen keeps free under its content.
export function useAdBanner(wanted: boolean) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((version) => version + 1);
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (!adsEnabled) return;
    let cancelled = false;
    void start().then(async (module) => {
      if (!module || cancelled) return;
      const { AdMob, BannerAdPosition, BannerAdSize } = module;
      if (!wanted) {
        if (bannerShown) await AdMob.hideBanner().catch(() => undefined);
        bannerHeight = 0;
        changed();
        return;
      }
      if (bannerShown) await AdMob.resumeBanner().catch(() => undefined);
      else {
        bannerShown = true;
        await AdMob.showBanner({ adId: bannerId, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: navigationOffset(), isTesting: testing }).catch(() => {
          bannerShown = false;
        });
      }
    });
    return () => { cancelled = true; };
  }, [wanted]);

  useEffect(() => () => {
    // Leaving the screen that shows the banner.
    if (adsEnabled && bannerShown) void import("@capacitor-community/admob").then(({ AdMob }) => AdMob.hideBanner()).catch(() => undefined);
    bannerHeight = 0;
  }, []);

  return adsEnabled && wanted ? bannerHeight : 0;
}

// Whether Settings must offer Google's privacy options for ads, and the action that opens them.
export function useAdPrivacyOptions() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!adsEnabled) return;
    const listener = () => setVersion((version) => version + 1);
    listeners.add(listener);
    void start();
    return () => void listeners.delete(listener);
  }, []);
  return {
    required: adsEnabled && privacyOptionsRequired,
    open: () => void import("@capacitor-community/admob").then(({ AdMob }) => AdMob.showPrivacyOptionsForm()).catch(() => undefined),
  };
}
