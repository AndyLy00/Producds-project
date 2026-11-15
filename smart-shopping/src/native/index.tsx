// Native (Android) implementation of the small part of the `./mobile` API that the app uses.
// The prototype runtime in `src/mobile` simulates a phone inside a desktop browser; on a real
// device the system provides the screen, keyboard and scrolling, so these are thin wrappers.
// `vite.android.config.ts` aliases `./mobile` to this module for the Android build.
import {
  createContext,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type Ref,
  type TextareaHTMLAttributes,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useDrag } from "@use-gesture/react";
import { AnimatePresence, motion } from "motion/react";

type KeyboardContextValue = {
  visible: boolean;
  height: number;
  show: (element?: HTMLElement | null) => void;
  hide: () => void;
};

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

function isTextEntry(element: Element | null): element is HTMLElement {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
}

// Part of the layout viewport covered by the on-screen keyboard. Zero when the WebView itself
// is resized by the system, which is the usual case on Android.
function measureKeyboardOverlap() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
  return overlap > 60 ? Math.round(overlap) : 0;
}

export function KeyboardProvider({ children }: PropsWithChildren) {
  const [height, setHeight] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const next = measureKeyboardOverlap();
      setHeight(next);
      document.documentElement.style.setProperty("--native-keyboard-height", `${next}px`);
    };
    const updateFocus = () => setFocused(isTextEntry(document.activeElement));

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", updateFocus);
    document.addEventListener("focusout", updateFocus);

    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", updateFocus);
      document.removeEventListener("focusout", updateFocus);
    };
  }, []);

  const value = useMemo<KeyboardContextValue>(
    () => ({
      visible: focused,
      height,
      show: (element) => element?.focus(),
      hide: () => {
        const active = document.activeElement;
        if (isTextEntry(active)) active.blur();
      },
    }),
    [focused, height],
  );

  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}

export function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (!context) throw new Error("useKeyboard must be used inside KeyboardProvider");
  return context;
}

export function useKeyboardInsets() {
  const keyboard = useKeyboard();

  return {
    keyboardHeight: keyboard.height,
    keyboardFullHeight: keyboard.height,
    keyboardDragging: false,
    // System-bar insets are applied in native.css; only the keyboard overlap is reported here.
    bottomInset: keyboard.height,
    availableHeight: window.innerHeight - keyboard.height,
    isKeyboardVisible: keyboard.visible,
  };
}

type KeyboardInputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function KeyboardInput(props: KeyboardInputProps) {
  return <input {...props} />;
}

export function KeyboardTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} />;
}

export function MobileScroll({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={`native-scroll${className ? ` ${className}` : ""}`}>{children}</div>;
}

type BottomSheetProps = PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  snap?: number;
}>;

export function BottomSheet({ open, onOpenChange, title, description, snap = 0.72, children }: BottomSheetProps) {
  const keyboard = useKeyboard();
  const [dragY, setDragY] = useState(0);
  const [screenHeight, setScreenHeight] = useState(() => window.innerHeight);

  useEffect(() => {
    if (open) keyboard.hide();
  }, [open]);

  useEffect(() => {
    const update = () => setScreenHeight(window.innerHeight);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const bindDrag = useDrag(
    (state) => {
      const [, movementY] = state.movement;
      const [, velocityY] = state.velocity;
      const [, directionY] = state.direction;
      const nextY = Math.max(0, movementY);

      if (!state.last) {
        setDragY(nextY);
        return;
      }

      setDragY(0);
      if (nextY > 96 || (velocityY > 0.55 && directionY > 0)) onOpenChange(false);
    },
    { axis: "y", filterTaps: true },
  );

  // When the keyboard is open the sheet may use all the space that is left above it.
  const availableHeight = screenHeight - keyboard.height;
  const sheetHeight = Math.max(260, Math.round(availableHeight * (keyboard.height > 0 || keyboard.visible ? 0.94 : snap)));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  className="sheet-overlay"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount onOpenAutoFocus={(event) => event.preventDefault()}>
                <motion.div
                  className="bottom-sheet"
                  style={{ bottom: keyboard.height, maxHeight: sheetHeight }}
                  initial={{ y: sheetHeight + 36 }}
                  animate={{ y: dragY }}
                  exit={{ y: sheetHeight + 36, transition: { type: "spring", stiffness: 250, damping: 30, mass: 1.05 } }}
                  transition={{ type: "spring", stiffness: 500, damping: 43, mass: 0.9 }}
                >
                  <div className="sheet-handle-zone" {...bindDrag()}>
                    <div className="sheet-handle" />
                  </div>
                  <div className="sheet-header">
                    <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                    {description ? <Dialog.Description className="sheet-description">{description}</Dialog.Description> : null}
                  </div>
                  <div className="sheet-content">{children}</div>
                </motion.div>
              </Dialog.Content>
            </>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
