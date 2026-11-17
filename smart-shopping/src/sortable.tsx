// Vertical list whose rows can be reordered by dragging a handle.
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

export type DragHandle = {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  // Keeps the scroll container from treating the drag as a scroll gesture.
  "data-scroll-drag": "ignore";
  style: CSSProperties;
};

type Drag = { from: number; to: number; dy: number; height: number };

export function Sortable<T>({
  items,
  getKey,
  onReorder,
  render,
  className,
}: {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (from: number, to: number) => void;
  render: (item: T, handle: DragHandle, dragging: boolean) => ReactNode;
  className?: string;
}) {
  const rows = useRef(new Map<string, HTMLElement>());
  const [drag, setDrag] = useState<Drag | null>(null);

  const start = (index: number) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rects = items.map((item) => rows.current.get(getKey(item))?.getBoundingClientRect() ?? new DOMRect());
    const handle = event.currentTarget;
    const startY = event.clientY;
    const height = rects[index].height;
    let to = index;
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent: PointerEvent) => {
      const dy = moveEvent.clientY - startY;
      const center = rects[index].top + height / 2 + dy;
      const found = rects.findIndex((rect) => center < rect.bottom);
      to = found === -1 ? rects.length - 1 : found;
      setDrag({ from: index, to, dy, height });
    };
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      setDrag(null);
      if (to !== index) onReorder(index, to);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
    setDrag({ from: index, to: index, dy: 0, height });
  };

  const offset = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.height;
    if (drag.from > drag.to && index >= drag.to && index < drag.from) return drag.height;
    return 0;
  };

  return (
    <div className={className}>
      {items.map((item, index) => {
        const key = getKey(item);
        const dragging = drag?.from === index;
        return (
          <div
            key={key}
            ref={(element) => {
              if (element) rows.current.set(key, element);
              else rows.current.delete(key);
            }}
            className={`sortable-row ${dragging ? "sortable-dragging" : ""}`}
            style={{ transform: `translateY(${offset(index)}px)`, transition: dragging || !drag ? "none" : "transform 140ms ease" }}
          >
            {render(item, { onPointerDown: start(index), "data-scroll-drag": "ignore", style: { touchAction: "none" } }, dragging)}
          </div>
        );
      })}
    </div>
  );
}

export function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
