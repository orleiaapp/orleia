"use client";

// ============================================================
// Orleia Calendar — the Cron-style time grid.
// True hour-by-hour week/day view: events are absolutely positioned
// by their time, draggable between days, resizable from the bottom
// edge, snapped to 15 minutes, with a live "now" line. This is the
// revolution piece — the date-grid becomes a real schedule.
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types";

const PX_PER_HOUR = 56;
const SNAP_MIN = 15;
const DAY_START_H = 0;
const DAY_HOURS = 24;

export interface GridOcc {
  ev: CalendarEvent;
  startMin: number; // minutes from midnight
  endMin: number;
}

interface Props {
  days: string[]; // yyyy-mm-dd columns
  /** All occurrences for the visible range, keyed by day. */
  occFor: (day: string) => GridOcc[];
  onMove: (eventId: string, newDay: string, newStartMin: number) => void;
  onResize: (eventId: string, newEndMin: number) => void;
  onCreate: (day: string, startMin: number, endMin: number) => void;
  onOpen: (ev: CalendarEvent) => void;
  /** Synced events (task/habit) move their source, not themselves. */
  isSynced?: (ev: CalendarEvent) => boolean;
}

function minutesFromTime(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (isNaN(h)) return fallback;
  return h * 60 + (isNaN(m) ? 0 : m);
}

function fmtDayHeader(day: string): { dow: string; num: number; isToday: boolean } {
  const d = new Date(day + "T00:00:00");
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }),
    num: d.getDate(),
    isToday: day === todayIso,
  };
}

/** Column assignment for overlapping events (Google-style lanes). */
function layoutColumns(occs: GridOcc[]): Map<CalendarEvent, { lane: number; lanes: number }> {
  const sorted = [...occs].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const info = new Map<CalendarEvent, { lane: number; lanes: number }>();
  let cluster: GridOcc[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    // Assign lanes greedily
    const laneEnds: number[] = [];
    const laneOf = new Map<GridOcc, number>();
    for (const o of cluster) {
      let lane = laneEnds.findIndex((end) => end <= o.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(o.endMin);
      } else {
        laneEnds[lane] = o.endMin;
      }
      laneOf.set(o, lane);
    }
    const lanes = laneEnds.length;
    for (const o of cluster) info.set(o.ev, { lane: laneOf.get(o)!, lanes });
    cluster = [];
    clusterEnd = -1;
  };
  for (const o of sorted) {
    if (cluster.length && o.startMin >= clusterEnd) flush();
    cluster.push(o);
    clusterEnd = Math.max(clusterEnd, o.endMin);
  }
  flush();
  return info;
}

export function TimeGrid({ days, occFor, onMove, onResize, onCreate, onOpen, isSynced }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [nowMin, setNowMin] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });
  const [nowDay, setNowDay] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [nowPct, setNowPct] = useState(0); // seconds into the minute for smooth motion

  // Live now-line
  useEffect(() => {
    const iv = setInterval(() => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
      setNowDay(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      setNowPct(d.getSeconds() / 60);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // Scroll to ~7am on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, 7 * PX_PER_HOUR - 40);
  }, []);

  // ---------------- Drag & resize state ----------------
  const [drag, setDrag] = useState<
    | { kind: "move"; evId: string; day: string; grabOffsetMin: number; durMin: number; curDay: string; curStart: number }
    | { kind: "resize"; evId: string; day: string; endMin: number; curEnd: number }
    | null
  >(null);

  const yToMin = (clientY: number): number => {
    const el = gridRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top + el.scrollTop;
    const raw = (y / PX_PER_HOUR) * 60;
    return Math.max(0, Math.min(DAY_HOURS * 60, Math.round(raw / SNAP_MIN) * SNAP_MIN));
  };

  const dayFromClientX = (clientX: number): string | null => {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const colW = rect.width / days.length;
    const idx = Math.max(0, Math.min(days.length - 1, Math.floor(x / colW)));
    return days[idx];
  };

  const onMouseDown = (e: React.MouseEvent, occ: GridOcc, day: string, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    if (isSynced?.(occ.ev)) return; // synced items open instead of dragging
    e.preventDefault();
    e.stopPropagation();
    if (mode === "move") {
      const grabOffsetMin = yToMin(e.clientY) - occ.startMin;
      setDrag({ kind: "move", evId: occ.ev.id, day, grabOffsetMin, durMin: occ.endMin - occ.startMin, curDay: day, curStart: occ.startMin });
    } else {
      setDrag({ kind: "resize", evId: occ.ev.id, day, endMin: occ.endMin, curEnd: occ.endMin });
    }
  };

  useEffect(() => {
    if (!drag) return;
    const onMoveEvt = (e: MouseEvent) => {
      if (drag.kind === "move") {
        const day = dayFromClientX(e.clientX) ?? drag.curDay;
        const start = Math.max(0, Math.min(DAY_HOURS * 60 - drag.durMin, yToMin(e.clientY) - drag.grabOffsetMin));
        setDrag({ ...drag, curDay: day, curStart: start });
      } else {
        const newEnd = Math.max(15, yToMin(e.clientY));
        setDrag({ ...drag, curEnd: newEnd });
      }
    };
    const onUp = () => {
      if (drag.kind === "move") {
        onMove(drag.evId, drag.curDay, drag.curStart);
      } else {
        onResize(drag.evId, Math.max(15, drag.curEnd));
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMoveEvt);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMoveEvt);
      window.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag]);

  // ---------------- Click-to-create (on empty grid space) ----------------
  const creating = useRef(false);
  const [draft, setDraft] = useState<{ day: string; start: number; end: number } | null>(null);

  const onGridMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-event]")) return;
    const day = dayFromClientX(e.clientX);
    if (!day) return;
    const start = yToMin(e.clientY);
    creating.current = true;
    setDraft({ day, start, end: start + 30 });
  };
  const onGridMouseMove = (e: MouseEvent) => {
    if (!creating.current || !draft) return;
    const end = Math.max(draft.start + SNAP_MIN, yToMin(e.clientY));
    setDraft({ ...draft, end });
  };
  const onGridMouseUp = () => {
    if (!creating.current || !draft) return;
    creating.current = false;
    onCreate(draft.day, draft.start, draft.end);
    setDraft(null);
  };

  useEffect(() => {
    window.addEventListener("mousemove", onGridMouseMove);
    window.addEventListener("mouseup", onGridMouseUp);
    return () => {
      window.removeEventListener("mousemove", onGridMouseMove);
      window.removeEventListener("mouseup", onGridMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const totalH = DAY_HOURS * PX_PER_HOUR;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {/* Day headers */}
      <div className="flex border-b border-border">
        <div className="w-12 shrink-0" />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
          {days.map((day) => {
            const h = fmtDayHeader(day);
            return (
              <div key={day} className={cn("py-2 text-center", h.isToday && "bg-primary-500/5")}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{h.dow}</div>
                <div className={cn("mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold", h.isToday && "bg-foreground text-background")}>
                  {h.num}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable hour grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="flex">
          {/* Hour gutter */}
          <div className="w-12 shrink-0">
            {Array.from({ length: DAY_HOURS }, (_, h) => (
              <div key={h} className="relative" style={{ height: PX_PER_HOUR }}>
                <span className="absolute -top-1.5 right-1.5 text-[10px] tabular-nums text-muted-foreground">
                  {h === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            ref={gridRef}
            className="relative grid flex-1 select-none"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}
            onMouseDown={onGridMouseDown}
          >
            {/* Hour lines per column */}
            {days.map((day) => (
              <div key={day} className="relative border-l border-border/50" style={{ height: totalH }}>
                {Array.from({ length: DAY_HOURS }, (_, h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-border/40" style={{ top: h * PX_PER_HOUR }} />
                ))}
                {/* Half-hour lines */}
                {Array.from({ length: DAY_HOURS }, (_, h) => (
                  <div key={`half-${h}`} className="absolute left-0 right-0 border-t border-dashed border-border/20" style={{ top: h * PX_PER_HOUR + PX_PER_HOUR / 2 }} />
                ))}

                {/* Events for this day */}
                {(() => {
                  const occs = occFor(day);
                  const cols = layoutColumns(occs);
                  return occs.map((occ) => {
                    if (!cols.has(occ.ev)) return null;
                    const { lane, lanes } = cols.get(occ.ev)!;
                    const isDragging = drag?.kind === "move" && drag.evId === occ.ev.id && drag.curDay === day;
                    const isResizing = drag?.kind === "resize" && drag.evId === occ.ev.id;
                    const start = isDragging ? (drag as { curStart: number }).curStart : occ.startMin;
                    const end = isResizing ? (drag as { curEnd: number }).curEnd : occ.endMin;
                    const top = (start / 60) * PX_PER_HOUR;
                    const height = Math.max(18, ((end - start) / 60) * PX_PER_HOUR);
                    const synced = isSynced?.(occ.ev) ?? false;
                    return (
                      <div
                        key={occ.ev.id + day}
                        data-event
                        onMouseDown={(e) => onMouseDown(e, occ, day, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(occ.ev);
                        }}
                        className={cn(
                          "group absolute z-10 overflow-hidden rounded-lg px-2 py-1 text-left shadow-sm ring-1 ring-inset ring-white/20 transition-colors",
                          isDragging && "z-50 cursor-grabbing opacity-90 shadow-lg",
                          synced && "cursor-default"
                        )}
                        style={{
                          top,
                          height,
                          left: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${(1 / lanes) * 100}% - 4px)`,
                          backgroundColor: occ.ev.color,
                          color: "#fff",
                        }}
                        title={`${occ.ev.title}${occ.ev.time ? " · " + occ.ev.time : ""}${occ.ev.endTime ? "–" + occ.ev.endTime : ""}`}
                      >
                        <div className="truncate text-[11px] font-semibold leading-tight">{occ.ev.title}</div>
                        {height > 34 && (
                          <div className="truncate text-[10px] leading-tight opacity-80">
                            {occ.ev.time}
                            {occ.ev.endTime ? "–" + occ.ev.endTime : ""}
                          </div>
                        )}
                        {/* Resize handle */}
                        {!synced && height > 24 && (
                          <div
                            onMouseDown={(e) => onMouseDown(e, occ, day, "resize")}
                            className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
                          />
                        )}
                      </div>
                    );
                  });
                })()}

                {/* Draft (click-drag creation) */}
                {draft?.day === day && (
                  <div
                    className="pointer-events-none absolute z-20 rounded-lg border-2 border-dashed border-foreground/40 bg-foreground/5"
                    style={{
                      top: (draft.start / 60) * PX_PER_HOUR,
                      height: Math.max(12, ((draft.end - draft.start) / 60) * PX_PER_HOUR),
                      left: 2,
                      right: 2,
                    }}
                  />
                )}

                {/* Now line */}
                {day === nowDay && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                    style={{ top: ((nowMin + nowPct) / 60) * PX_PER_HOUR }}
                  >
                    <span className="-ml-1 h-2 w-2 rounded-full bg-red-500 shadow" />
                    <span className="h-[2px] flex-1 bg-red-500/80" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
