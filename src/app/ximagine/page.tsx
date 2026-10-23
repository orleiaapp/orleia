"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { XimagineIntro } from "@/components/ximagine/intro";
import { XimagineSidebar } from "@/components/ximagine/sidebar";
import { XimagineChat } from "@/components/ximagine/chat";
import { XimagineWorkbench } from "@/components/ximagine/workbench";
import { parseBuild, mergeFiles, ximagineGenerate, type XWireMessage } from "@/lib/ximagine-ai";
import {
  loadXData,
  saveXData,
  utcDay,
  uid,
  XIMAGINE_DAILY_CREDITS,
  type XApp,
  type XChat,
  type XData,
  type XFile,
  type XMessage,
  type XMode,
  type XThemeId,
} from "@/lib/ximagine";

const CAP_MSG =
  "⚠ **Daily credits used up.** The free beta gives every device 50 turns a day; yours resets at 00:00 UTC.";
const ERR_MSG = "⚠ **Noor couldn't reach the builder.** The AI endpoint didn't answer — try again in a moment.";
const ABORT_NOTE = "_(stopped)_";

export default function XimaginePage() {
  const [data, setData] = useState<XData | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [openAppId, setOpenAppId] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<XMode>("plan");
  const [busy, setBusy] = useState(false);
  const [creditCap, setCreditCap] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  /** Null-safe state updater — the render tree only mounts once data exists. */
  const update = useCallback((fn: (d: XData) => XData) => {
    setData((prev) => (prev ? fn(prev) : prev));
  }, []);

  // Hydrate from localStorage after mount (keeps SSR/prerender output stable).
  useEffect(() => {
    const d = loadXData();
    setData(d);
    setActiveChatId(d.chats[0]?.id ?? null);
  }, []);

  // Debounced persistence — tokens stream in hot; never stringify per keystroke.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => saveXData(data), 400);
    return () => clearTimeout(t);
  }, [data]);

  // Ximagine is dark-only; keep the landing-page pattern of restoring the
  // visitor's previous theme class on unmount.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);

  const patchAssistant = useCallback(
    (cid: string, mid: string, fn: (m: XMessage) => XMessage) => {
      update((d) => ({
        ...d,
        chats: d.chats.map((c) =>
          c.id === cid ? { ...c, messages: c.messages.map((m) => (m.id === mid ? fn(m) : m)) } : c
        ),
      }));
    },
    [update]
  );

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy || !data) return;

      const day = utcDay();
      const credits = data.credits.day === day ? data.credits : { day, used: 0 };
      const ts = Date.now();
      const existing = activeChatId ? data.chats.find((c) => c.id === activeChatId) : undefined;
      const chat: XChat = existing ?? {
        id: uid(),
        title: text.length > 48 ? `${text.slice(0, 48)}…` : text,
        createdAt: ts,
        updatedAt: ts,
        mode: pendingMode,
        messages: [],
      };
      const mode = chat.mode;
      const app = chat.appId ? data.apps.find((a) => a.id === chat.appId) : undefined;
      const theme = app?.theme ?? data.defaultTheme;

      const userMsg: XMessage = { id: uid(), role: "user", content: text, ts };
      const placeholder: XMessage = { id: uid(), role: "assistant", content: "", ts };
      const wire: XWireMessage[] = [...chat.messages, userMsg]
        .filter((m) => m.content)
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-40);

      setBusy(true);
      setCreditCap(false);
      setActiveChatId(chat.id);
      setSidebarOpen(false);
      update((d) => {
        const rest = d.chats.filter((c) => c.id !== chat.id);
        const updated: XChat = { ...chat, updatedAt: ts, messages: [...chat.messages, userMsg, placeholder] };
        return { ...d, chats: [updated, ...rest] };
      });

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        let partial = "";
        const res = await ximagineGenerate({
          messages: wire,
          mode,
          theme,
          files: app?.files,
          signal: controller.signal,
          onThinking: (t) => patchAssistant(chat.id, placeholder.id, (m) => ({ ...m, thinking: t })),
          onToken: (t) => {
            partial += t;
            patchAssistant(chat.id, placeholder.id, (m) => ({ ...m, content: (m.content || "") + t }));
          },
        });

        const aborted = controller.signal.aborted;
        abortRef.current = null;

        // Build outputs are only trusted when the turn completed — a cut
        // stream would bake a half-written file into the app.
        let parsed: XFile[] = [];
        if (!aborted && !res.error && mode === "build") parsed = parseBuild(res.text).files;

        let openedAppId: string | undefined;
        const now = Date.now();

        update((d) => {
          let chats = d.chats;
          let apps = d.apps;
          const nextCredits =
            res.used !== null
              ? { day, used: res.used }
              : res.error === "credit_cap" && res.limit !== null
                ? { day, used: res.limit }
                : { day, used: credits.used + 1 };

          const content = aborted
            ? partial || ABORT_NOTE
            : res.error === "credit_cap"
              ? CAP_MSG
              : res.error
                ? ERR_MSG
                : res.text || "_(no reply)_";

          // Upsert the app (build mode, successful parse).
          let appId = chat.appId;
          let fileCount = 0;
          if (parsed.length) {
            const ex = appId ? apps.find((a) => a.id === appId) : undefined;
            if (ex) {
              const merged = mergeFiles(ex.files, parsed);
              apps = apps.map((a) => (a.id === ex.id ? { ...a, files: merged, updatedAt: now } : a));
              appId = ex.id;
              fileCount = merged.length;
            } else {
              const na: XApp = {
                id: uid(),
                chatId: chat.id,
                name: chat.title,
                theme,
                files: parsed,
                createdAt: now,
                updatedAt: now,
              };
              apps = [na, ...apps].slice(0, 30);
              appId = na.id;
              fileCount = parsed.length;
            }
            openedAppId = appId;
          }

          chats = chats.map((c) => {
            if (c.id !== chat.id) return c;
            return {
              ...c,
              appId,
              updatedAt: now,
              messages: c.messages.map((m) =>
                m.id === placeholder.id
                  ? {
                      ...m,
                      content,
                      thinking: aborted && !m.thinking ? undefined : m.thinking,
                      fileCount: aborted ? undefined : fileCount || undefined,
                    }
                  : m
              ),
            };
          });

          return { ...d, chats, apps, credits: nextCredits };
        });

        if (openedAppId) setOpenAppId(openedAppId);
        if (res.error === "credit_cap") setCreditCap(true);
        setBusy(false);
      })();
    },
    [activeChatId, busy, data, patchAssistant, pendingMode, update]
  );

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    setActiveChatId(null);
    setPendingMode("plan");
    setSidebarOpen(false);
  };

  const deleteChat = (id: string) => {
    update((d) => ({ ...d, chats: d.chats.filter((c) => c.id !== id) }));
    if (activeChatId === id) setActiveChatId(null);
  };

  const openApp = (id: string) => {
    const app = data?.apps.find((a) => a.id === id);
    setOpenAppId(id);
    setSidebarOpen(false);
    if (app && data?.chats.some((c) => c.id === app.chatId)) setActiveChatId(app.chatId);
  };

  const patchApp = (id: string, fn: (a: XApp) => XApp) =>
    update((d) => ({ ...d, apps: d.apps.map((a) => (a.id === id ? fn(a) : a)) }));

  const deleteApp = (id: string) => {
    update((d) => ({ ...d, apps: d.apps.filter((a) => a.id !== id) }));
    if (openAppId === id) setOpenAppId(null);
  };

  const setMode = (m: XMode) => {
    setPendingMode(m);
    update((d) => ({ ...d, chats: d.chats.map((c) => (c.id === activeChatId ? { ...c, mode: m } : c)) }));
  };

  if (!data) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#050508]">
        <p className="text-[11px] font-mono uppercase tracking-[0.4em] text-muted-foreground/40">Ximagine</p>
      </div>
    );
  }

  const chat = activeChatId ? data.chats.find((c) => c.id === activeChatId) ?? null : null;
  const openAppRecord = openAppId ? data.apps.find((a) => a.id === openAppId) ?? null : null;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#050508] text-foreground">
      {!data.onboarded && <XimagineIntro onDone={() => update((d) => ({ ...d, onboarded: true }))} />}

      {/* Sidebar: static on lg+, drawer below */}
      <div className={`${sidebarOpen ? "fixed inset-y-0 left-0 z-40 block" : "hidden"} lg:static lg:z-auto lg:block`}>
        <XimagineSidebar
          chats={data.chats}
          apps={data.apps}
          activeChatId={activeChatId}
          creditsUsed={data.credits.day === utcDay() ? data.credits.used : 0}
          creditsLimit={XIMAGINE_DAILY_CREDITS}
          onNewChat={newChat}
          onSelectChat={(id) => {
            setActiveChatId(id);
            setSidebarOpen(false);
          }}
          onDeleteChat={deleteChat}
          onOpenApp={openApp}
        />
      </div>
      {sidebarOpen && (
        <button
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <XimagineChat
            chat={chat}
            busy={busy}
            defaultTheme={data.defaultTheme}
            creditCap={creditCap}
            onSend={send}
            onStop={stop}
            onModeChange={setMode}
            onThemeChange={(t: XThemeId) => update((d) => ({ ...d, defaultTheme: t }))}
            onOpenApp={openApp}
            onMenu={() => setSidebarOpen(true)}
          />
        </div>

        {openAppRecord && (
          <div className="fixed inset-0 z-30 lg:static lg:z-auto lg:block">
            <XimagineWorkbench
              app={openAppRecord}
              onRename={(name) => patchApp(openAppRecord.id, (a) => ({ ...a, name }))}
              onThemeChange={(t) => patchApp(openAppRecord.id, (a) => ({ ...a, theme: t }))}
              onFilesChange={(files) => patchApp(openAppRecord.id, (a) => ({ ...a, files }))}
              onDelete={() => deleteApp(openAppRecord.id)}
              onClose={() => setOpenAppId(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
