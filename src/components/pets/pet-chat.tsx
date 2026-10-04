"use client";

// ============================================================
// PetChat — WhatsApp-style chat for the agent team.
//
// List view: one private thread per hired agent + a "Team chat"
// group thread where all of them hang out. Chat view: bubbles,
// streaming replies, confirm chips (agents stay confirm-first).
//
// Threads are the SAME AIConversation records Noor uses, so every
// chat stays in sync across both surfaces — and the group replies
// round-robin through the roster unless the user @mentions a
// specific agent (one responder per message).
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, PawPrint, Send, X } from "lucide-react";
import { storage } from "@/lib/storage";
import { chatStream, NoorCapError } from "@/lib/ai-stream";
import { sanitizeStoredReply, executeAction, type ProposedAction } from "@/lib/ai-actions";
import {
  agentTurns,
  ensureGroupConversation,
  ensurePetConversation,
  petPersonaPrefix,
} from "@/lib/pet-agent";
import { assignScoutJob, kickScoutRunner } from "@/lib/scout-jobs";
import { stripPetFlavor } from "@/lib/action-clean";
import { skillForCommand, getSkills, type NoorSkill } from "@/lib/noor-skills";
import { runResearchPipeline, wantsResearch } from "@/lib/research-run";
import { petById, petSvg } from "@/lib/pets";
import { PET_JOBS } from "@/lib/pet-jobs";
import { novellaModelId } from "@/lib/ai-models";
import { useI18n } from "@/lib/i18n";
import { cn, generateId } from "@/lib/utils";
import { splitLinks } from "@/lib/link-text";
import type { AIMessage, PetAgent } from "@/types";

const GROUP = "__group__";

interface MentionOpt {
  name: string;
  agent: PetAgent;
}

function proposalTitle(p: { action: string; params: Record<string, unknown> }): string {
  const label = p.action.replace(/_/g, " ");
  const raw = p.params?.title ?? p.params?.name ?? p.params?.content ?? p.params?.date;
  const detail = typeof raw === "string" && raw.trim() ? " \u201c" + raw.trim().slice(0, 40) + "\u201d" : "";
  return label + detail;
}

const timeOf = (ts: string) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Role display name: i18n key with the catalog's title as fallback. */
const roleName = (t: (k: string, fb?: string) => string, role: string) =>
  t(`petjob.${role}.name`, PET_JOBS.find((j) => j.role === role)?.name || role);

const listTime = (ts: string) => {
  const d = new Date(ts);
  if (d.toDateString() === new Date().toDateString()) return timeOf(ts);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/**
 * Pet bubbles are plain text, so links would be dead weight: render the
 * content as text runs + compact anchors ("openai.com/devday" label, full
 * address in the href) via splitLinks().
 */
function renderLinks(content: string, mine: boolean): React.ReactNode[] {
  const cls = mine
    ? "font-medium underline underline-offset-2 break-all opacity-90 hover:opacity-100"
    : "text-primary-500 underline underline-offset-2 break-all hover:opacity-80";
  const out: React.ReactNode[] = [];
  splitLinks(content).forEach((tok, i) => {
    if (tok.type === "link") {
      out.push(
        <a key={`lnk${i}`} href={tok.href} target="_blank" rel="noopener noreferrer" className={cls}>
          {tok.label}
        </a>
      );
    } else if (tok.type === "strong") {
      // **bold** -> real weight (same treatment Noor's markdown gives it).
      out.push(
        <strong key={`stg${i}`} className="font-semibold">
          {tok.text}
        </strong>
      );
    } else if (tok.type === "em") {
      // *x* markers drop; per Noor's style italics are never slanted.
      out.push(
        <em key={`em${i}`} className={mine ? "not-italic opacity-80" : "not-italic text-muted-foreground"}>
          {tok.text}
        </em>
      );
    } else if (tok.text) {
      out.push(tok.text);
    }
  });
  return out.length ? out : [content];
}

function Avatar({ agent, size = 44 }: { agent?: PetAgent; size?: number }) {
  const pet = agent ? petById(agent.petId) : null;
  if (!pet) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-500"
        style={{ width: size, height: size }}
      >
        <PawPrint className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 overflow-hidden rounded-full bg-secondary"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: petSvg(pet, "h-full w-full") }}
    />
  );
}

export function PetChat({ agents, onChanged }: { agents: PetAgent[]; onChanged?: () => void }) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<AIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  // Which agent is writing right now (multi-mention replies take turns).
  const [streamAgent, setStreamAgent] = useState<PetAgent | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionToken, setMentionToken] = useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionPickedRef = useRef(false);
  // /skill autocomplete (same UX as Noor's composer).
  const [allSkills, setAllSkills] = useState<NoorSkill[]>([]);
  const [slashToken, setSlashToken] = useState<string | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const skillPickedRef = useRef(false);
  useEffect(() => {
    setAllSkills(getSkills());
  }, []);

  // openId is always the REAL conversation id (the group sentinel is
  // resolved at open time); group-ness comes from the conv flag.
  const openConv = openId
    ? storage.getData().aiConversations.find((c) => c.id === openId)
    : undefined;
  const isGroup = !!openConv?.petAgentGroup;

  // Load the open thread from storage; subscribe so scout deliveries,
  // Noor-side sends and confirmations all land here live.
  const reload = useCallback(() => {
    if (!openId) {
      setMsgs([]);
      return;
    }
    const conv = storage.getData().aiConversations.find((c) => c.id === openId);
    const next = conv
      ? conv.messages.map((m) =>
          m.role === "assistant" ? { ...m, content: sanitizeStoredReply(m.content) } : m
        )
      : [];
    setMsgs(next);
  }, [openId]);

  useEffect(() => {
    if (!openId) {
      setMsgs([]);
      return;
    }
    reload();
    return storage.subscribe(reload);
  }, [openId, reload]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, streamText, openId]);

  const openChat = (id: string) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreamText("");
    setStreamAgent(null);
    setInput("");
    setMentionToken(null);
    let realId = id;
    if (id === GROUP) {
      realId = ensureGroupConversation();
    } else {
      const agent = agents.find((a) => a.id === id);
      if (!agent) return;
      realId = ensurePetConversation(agent);
    }
    setOpenId(realId);
  };

  const back = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setStreamText("");
    setStreamAgent(null);
    setOpenId(null);
  };

  const appendNote = (content: string) => {
    if (!openId) return;
    storage.addMessage(openId, {
      role: "assistant",
      content,
      model: novellaModelId(storage.getData().selectedModel),
    });
    // Storage is the source of truth — reload instead of appending
    // (the subscribe listener also reloads; appends would duplicate).
    reload();
    onChanged?.();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !openId) return;
    const convId = openId;
    const conv = storage.getData().aiConversations.find((c) => c.id === convId);
    if (!conv) return;
    const model = novellaModelId(storage.getData().selectedModel);
    // Pet replies are 1-3 in-character sentences: generate them on the
    // default (fast, thinking-off) effort so Noor's Ultra slider - which
    // now selects a slow reasoning model - never drags pet chats down.
    const streamModel = "novella-medium";

    // Responders: every @mention answers as its own employee (one reply
    // each, in order). No mentions -> round-robin in the group, bound
    // agent in a private thread.
    const skill = skillForCommand(text);
    const skillText = skill
      ? skill.rest
        ? `${skill.skill.instructions}\n\n---\n${skill.rest}`
        : skill.skill.instructions
      : null;

    let turns: { agent: PetAgent; clean: string }[] = [];
    if (isGroup) {
      const mentioned = agentTurns(text, agents);
      if (mentioned.length) {
        turns = mentioned.map((tt) => ({
          agent: tt.agent,
          clean: skillText ? `${skillText}\n\n---\n${tt.clean}` : tt.clean,
        }));
      } else if (agents.length > 0) {
        const assistants = conv.messages.filter((m) => m.role === "assistant").length;
        turns = [{ agent: agents[assistants % agents.length], clean: skillText ?? text }];
      }
    } else {
      const bound = agents.find((a) => a.id === conv.petAgentId);
      if (bound) turns = [{ agent: bound, clean: skillText ?? text }];
    }

    setInput("");
    setMentionToken(null);
    storage.addMessage(convId, { role: "user", content: text, model });
    reload();
    onChanged?.();

    if (!turns.length) {
      appendNote(
        isGroup
          ? t("pets.chatNoAgents", "No agents on the team yet — hire some from the Team tab and they'll show up here.")
          : t("pets.chatNoAgent", "This agent is no longer on duty. Hire a pet for this job from the Team tab.")
      );
      return;
    }

    setLoading(true);
    setStreamText("");
    const controller = new AbortController();
    abortRef.current = controller;
    // Persona on the final query (same contract as Noor's pet threads).
    const history = storage.getData().aiConversations.find((c) => c.id === convId)?.messages ?? [];

    try {
    for (let ti = 0; ti < turns.length; ti++) {
      const { agent, clean } = turns[ti];
      setStreamAgent(turns.length > 1 ? agent : null);
      setStreamText("");

      // Scout job hand-off: "assign: <topic>" queues a real background
      // web job (agent loop) instead of a chat reply - delivery lands here.
      if (agent.role === "scout" && clean.toLowerCase().startsWith("assign:")) {
        const topic = clean.slice(7).trim();
        const res = topic ? assignScoutJob(agent.id, topic, convId) : { ok: false };
        if (res.ok) {
          kickScoutRunner();
          appendNote(`\ud83d\udd0d ${agent.name} is on the job — findings will land in this thread.`);
          continue;
        }
      }

      // Scout research mode: same plan → search → read → synthesize pass
      // as Noor's research mode, delivered as a cited reply.
      if (agent.role === "scout" && wantsResearch(clean)) {
        setStreamText("\ud83d\udd0d Planning research...");
        // Research can die mid-pipeline on a dead/stalled model. Never show
        // the bare "could not reach" note for that: fall through to a normal
        // chat reply so Scout still answers the question.
        let researched = false;
        try {
          const run = await runResearchPipeline(clean, { onStage: (s) => setStreamText("\ud83d\udd0d " + s) });
          if (controller.signal.aborted) return;
          storage.addMessage(convId, {
            role: "assistant",
            content: run.content,
            model,
            agentId: agent.id,
            sources: run.sources,
            research: run.research as never,
          });
          reload();
          onChanged?.();
          researched = true;
        } catch {
          if (controller.signal.aborted) return;
          // fall through to the regular reply path below
        }
        if (researched) continue;
      }

      let prefix = petPersonaPrefix(agent);
      if (isGroup) {
        const others = agents.filter((a) => a.id !== agent.id).map((a) => a.name);
        prefix +=
          `\n\nGROUP CHAT: you are chatting in a team group thread with ` +
          `${others.length ? others.join(", ") + " and " : ""}the user. ` +
          `Reply ONLY as yourself ("${agent.name}") — never write lines as another agent. ` +
          `Keep it to 1-3 sentences.` +
          (turns.length > 1
            ? ` The user addressed several teammates at once; the text below is YOUR part only — answer just that, do not cover the other parts.`
            : ` The user can @mention a teammate to address them directly.`) +
          `\n`;
      }
      const query = prefix + "\n\n---\nUser: " + clean;

      const proposals: ProposedAction[] = [];
      let acc = "";
      const response = await chatStream(query, history, streamModel, {
        signal: controller.signal,
        // Pet replies are 1-3 sentences: a small budget caps worst-case
        // latency (measured ~2-3x faster to first token vs 4096).
        maxTokens: 700,
        onToken: (delta) => {
          if (controller.signal.aborted) return;
          acc += delta;
          const cleanAcc = stripPetFlavor(acc);
          setStreamText(cleanAcc || acc);
        },
        onProposeAction: (proposal) => {
          proposals.push(proposal as ProposedAction);
        },
      });
      if (controller.signal.aborted) return;
      storage.addMessage(convId, {
        role: "assistant",
        content: stripPetFlavor(response),
        model,
        agentId: agent.id,
        proposal: proposals.length ? proposals[0] : undefined,
      });
      reload();
      onChanged?.();
    }
    } catch (e) {
      if (!controller.signal.aborted) {
        if (e instanceof NoorCapError) {
          appendNote(
            "\u2b50 You've used all of today's free Noor messages. Your cap resets at midnight \u2014 or upgrade to Plus in Settings \u2192 Billing for 300 messages a day."
          );
        } else {
          appendNote(t("pets.chatFailed", "I could not reach my models just now \u2014 try again in a moment."));
        }
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
        setStreamText("");
        setStreamAgent(null);
      }
    }
  };

  // ---- confirm chips (agents are confirm-first) ----
  const resolveProposal = (msg: AIMessage, resolved: "confirmed" | "dismissed", note: string) => {
    if (!openId || !msg.proposal || msg.proposalResolved) return;
    const conv = storage.getData().aiConversations.find((c) => c.id === openId);
    if (!conv) return;
    const next = conv.messages.map((m) => (m.id === msg.id ? { ...m, proposalResolved: resolved } : m));
    const idx = next.findIndex((m) => m.id === msg.id);
    next.splice(idx + 1, 0, {
      id: generateId(),
      role: "assistant",
      content: note,
      timestamp: new Date().toISOString(),
      model: msg.model,
      agentId: msg.agentId,
    });
    storage.replaceConversationMessages(openId, next);
    reload();
    onChanged?.();
  };

  const confirmProposal = (msg: AIMessage) => {
    if (!msg.proposal) return;
    const result = executeAction({
      matched: true,
      type: msg.proposal.action as never,
      params: msg.proposal.params as Record<string, never>,
      confidence: 1,
    });
    resolveProposal(msg, "confirmed", result.success ? result.message : "I couldn't complete that: " + result.message);
  };

  const dismissProposal = (msg: AIMessage) =>
    resolveProposal(msg, "dismissed", "No problem \u2014 I left everything as it was.");

  // ---- @mention autocomplete (group composer only) ----
  const mentionMatches: MentionOpt[] =
    mentionToken === null || !isGroup
      ? []
      : agents
          .filter((a) => a.name.toLowerCase().startsWith(mentionToken.toLowerCase()))
          .slice(0, 5)
          .map((a) => ({ name: a.name, agent: a }));

  // ---- /skill autocomplete ----
  const skillSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slashMatches: NoorSkill[] =
    slashToken === null
      ? []
      : allSkills
          .filter(
            (s) =>
              s.enabled &&
              (!slashToken ||
                skillSlug(s.name).includes(slashToken.toLowerCase()) ||
                s.name.toLowerCase().includes(slashToken.toLowerCase()))
          )
          .slice(0, 5);

  const insertSkillSlug = (s: NoorSkill) => {
    const v = "/" + skillSlug(s.name) + " ";
    setInput(v);
    setSlashToken(null);
    setSlashIdx(0);
    skillPickedRef.current = true;
    requestAnimationFrame(() => {
      const el = boxRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(v.length, v.length);
      }
    });
  };

  const insertMention = (name: string) => {
    const el = boxRef.current;
    const v = input;
    const caret = el?.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at === -1) return;
    setInput(v.slice(0, at) + "@" + name + " " + v.slice(caret));
    mentionPickedRef.current = true;
    setMentionToken(null);
    setMentionIdx(0);
    requestAnimationFrame(() => {
      if (el) {
        const pos = at + name.length + 2;
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  const onComposerChange = (v: string) => {
    setInput(v);
    if (mentionPickedRef.current) {
      mentionPickedRef.current = false;
      setMentionToken(null);
    } else {
      const caret = boxRef.current?.selectionStart ?? v.length;
      const before = v.slice(0, caret);
      const at = before.lastIndexOf("@");
      const seg = at === -1 ? null : before.slice(at + 1);
      setMentionToken(seg !== null && !seg.includes("\n") ? seg : null);
      setMentionIdx(0);
    }
    if (skillPickedRef.current) {
      skillPickedRef.current = false;
      setSlashToken(null);
    } else {
      const m = /^\/([^\s]*)$/.exec(v.trim());
      setSlashToken(m ? m[1] : null);
      setSlashIdx(0);
    }
    if (boxRef.current) {
      boxRef.current.style.height = "auto";
      boxRef.current.style.height = Math.min(boxRef.current.scrollHeight, 120) + "px";
    }
  };

  const composerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0 && slashToken !== null) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const s = slashMatches[slashIdx] ?? slashMatches[0];
        if (s) insertSkillSlug(s);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setSlashToken(null); return; }
    }
    if (mentionMatches.length > 0 && mentionToken !== null) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionMatches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionMatches.length) % mentionMatches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const m = mentionMatches[mentionIdx] ?? mentionMatches[0];
        if (m) insertMention(m.name);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMentionToken(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // ============================================================
  // Views
  // ============================================================

  if (!openId) {
    // ---- chat list (WhatsApp home) ----
    const rows: { id: string; agent?: PetAgent; title: string; subtitle: string; last?: AIMessage; preview: string }[] =
      agents.length > 0
        ? [
            {
              id: GROUP,
              title: t("pets.teamChat", "Team chat"),
              subtitle: t("pets.teamChatSub", "{{n}} agents in this chat").replace(
                "{{n}}",
                String(agents.length)
              ),
              preview: "",
            },
            ...agents.map((a) => ({
              id: a.id,
              agent: a,
              title: a.name,
              subtitle: roleName(t, a.role),
              preview: "",
            })),
          ]
        : [];

    for (const row of rows) {
      const conv = storage
        .getData()
        .aiConversations.find((c) => (row.id === GROUP ? c.petAgentGroup : c.petAgentId === row.id));
      const last = conv?.messages[conv.messages.length - 1];
      row.last = last;
      row.preview = last
        ? `${last.role === "user" ? t("pets.you", "You") + ": " : ""}${last.content
            .replace(/\*\*([^*\n]+)\*\*/g, "$1")
            .replace(/\*([^*\n]+)\*/g, "$1")
            .replace(/\s+/g, " ")
            .slice(0, 70)}`
        : row.id === GROUP
          ? t("pets.teamChatEmpty", "Tap to say hi to the whole team \u{1F44B}")
          : t("pets.chatEmpty", "No messages yet");
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t("pets.chatSectionSub", "Private chats with each agent — plus one group thread for the whole team.")}
        </p>
        {rows.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 text-sm text-muted-foreground">
            <PawPrint className="h-5 w-5 shrink-0 opacity-60" />
            {t("pets.chatListEmpty", "No agents hired yet — hire pets from the Team tab to chat with them.")}
          </div>
        ) : (
          <div className="card divide-y divide-border/60 overflow-hidden p-0">
            {rows.map((row) => (
              <button
                key={row.id}
                onClick={() => openChat(row.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50"
              >
                <Avatar agent={row.agent} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{row.title}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {row.last ? listTime(row.last.timestamp) : ""}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    <span className="text-foreground/70">{row.subtitle}</span>
                    {row.preview ? " \u00b7 " + row.preview : ""}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- chat view ----
  // openId is a CONVERSATION id; the thread's agent comes from the conv flag
  // (openId only equals an agent id for legacy/edge threads).
  const openAgent = isGroup
    ? undefined
    : agents.find((a) => a.id === (openConv?.petAgentId ?? openId));
  const headerTitle = isGroup ? t("pets.teamChat", "Team chat") : openAgent?.name ?? t("pets.chat", "Chat");
  const headerSub = isGroup
    ? t("pets.teamChatSub", "{{n}} agents in this chat").replace("{{n}}", String(agents.length))
    : openAgent
      ? roleName(t, openAgent.role)
      : "";

  const senderOf = (m: AIMessage): PetAgent | undefined => {
    if (m.agentId) return agents.find((a) => a.id === m.agentId);
    if (!isGroup) return openAgent;
    return undefined;
  };

  return (
    <div className="flex h-[calc(100vh-330px)] min-h-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-background">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border/70 px-3 py-2.5">
        <button
          onClick={back}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          aria-label={t("common.back", "Back")}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar agent={openAgent} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{headerTitle}</p>
          <p className="truncate text-[11px] text-muted-foreground">{headerSub}</p>
        </div>
        {!isGroup && openAgent && (
          <a
            href={`/noor?pet=${openAgent.id}`}
            className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {t("pets.openInNoor", "Open in Noor")}
          </a>
        )}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {msgs.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <Avatar agent={openAgent} size={44} />
            <p className="text-sm font-medium text-foreground">
              {isGroup
                ? t("pets.groupStart", "Start the team chat")
                : t("pets.chatStart", "Say hi to {{name}}").replace("{{name}}", openAgent?.name ?? "")}
            </p>
            <p className="max-w-[240px] text-xs text-muted-foreground">
              {isGroup
                ? t("pets.groupStartSub", "Every hired agent hangs out here. @mention one to address them directly.")
                : t("pets.chatStartSub", "Replies stay in character — this agent is confirm-first for workspace changes.")}
            </p>
          </div>
        )}
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          // A reply that was pure flavor text strips to nothing - no ghost bubble.
          if (!m.content && !m.proposal) return null;
          const mine = m.role === "user";
          const sender = mine ? undefined : senderOf(m);
          const showName = !mine && isGroup && m.agentId !== prev?.agentId;
          const time = timeOf(m.timestamp);
          return (
            <div key={m.id} className={cn("flex items-end gap-2", mine && "justify-end")}>
              {!mine && (isGroup || !mine) && (
                <span className={cn("w-6 shrink-0", !isGroup && "invisible")}>
                  <Avatar agent={sender} size={24} />
                </span>
              )}
              <div className={cn("max-w-[78%] min-w-0", mine && "items-end")}>
                {showName && (
                  <p className="mb-0.5 px-1 text-[11px] font-semibold text-primary-500">
                    {sender?.name ?? t("pets.agent", "Agent")}
                  </p>
                )}
                {m.content && (
                  <div
                    className={cn(
                      "whitespace-pre-wrap break-words px-3 py-2 text-sm leading-snug",
                      mine
                        ? "rounded-2xl rounded-br-sm bg-primary-500 text-primary-foreground"
                        : "rounded-2xl rounded-bl-sm bg-secondary text-foreground"
                    )}
                  >
                    {renderLinks(m.content, mine)}
                  </div>
                )}
                {m.proposal && (
                  <div className="mt-1.5 rounded-2xl border border-border bg-card/90 p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {(sender?.name ?? "Noor") + " " + t("pets.wantsTo", "wants to")}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-foreground">{proposalTitle(m.proposal)}</p>
                    {m.proposalResolved ? (
                      <p className={cn("mt-1.5 text-[11px]", m.proposalResolved === "confirmed" ? "text-emerald-500" : "text-muted-foreground")}>
                        {m.proposalResolved === "confirmed" ? "\u2713 " + t("common.done", "Done") : "\u2715 " + t("common.dismissed", "Dismissed")}
                      </p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => confirmProposal(m)}
                          className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background transition-all hover:opacity-90 active:scale-95"
                        >
                          {t("common.confirm", "Confirm")}
                        </button>
                        <button
                          onClick={() => dismissProposal(m)}
                          className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          {t("common.notNow", "Not now")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <p className={cn("mt-0.5 px-1 text-[10px] text-muted-foreground/70", mine && "text-right")}>
                  {time}
                </p>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-end gap-2">
            <span className="w-6 shrink-0">
              <Avatar agent={streamAgent ?? openAgent} size={24} />
            </span>
            <div className="min-w-0">
              {streamAgent && (
                <p className="mb-0.5 px-1 text-[11px] font-semibold text-primary-500">
                  {streamAgent.name}
                </p>
              )}
              {streamText ? (
                <div className="whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm leading-snug text-foreground">
                  {renderLinks(streamText, false)}
                  <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-primary-500 align-middle" />
                </div>
              ) : (
                <div className="flex gap-1 rounded-2xl rounded-bl-sm bg-secondary px-3 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="relative border-t border-border/70 p-2.5">
        {slashMatches.length > 0 && slashToken !== null && (
          <div className="absolute bottom-full left-2.5 right-2.5 z-10 mb-2 max-h-44 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-xl">
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("assistant.skills", "Skills")}
            </p>
            {slashMatches.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSkillSlug(s);
                }}
                onMouseEnter={() => setSlashIdx(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  i === slashIdx ? "bg-secondary" : ""
                )}
              >
                <span className="truncate font-medium">/{skillSlug(s.name)}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {s.instructions.slice(0, 44)}
                </span>
              </button>
            ))}
          </div>
        )}
        {mentionMatches.length > 0 && mentionToken !== null && (
          <div className="absolute bottom-full left-2.5 right-2.5 z-10 mb-2 max-h-44 overflow-y-auto rounded-2xl border border-border bg-popover p-1 shadow-xl">
            <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("pets.mentionTitle", "Address an agent")}
            </p>
            {mentionMatches.map((m, i) => (
              <button
                key={m.agent.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m.name);
                }}
                onMouseEnter={() => setMentionIdx(i)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                  i === mentionIdx ? "bg-secondary" : ""
                )}
              >
                <Avatar agent={m.agent} size={22} />
                <span className="truncate font-medium">@{m.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {roleName(t, m.agent.role)}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={boxRef}
            value={input}
            rows={1}
            onChange={(e) => onComposerChange(e.target.value)}
            onKeyDown={composerKeyDown}
            placeholder={
              isGroup
                ? t("pets.messageTeam", "Message the team (@name to address someone)")
                : t("pets.messageAgent", "Message {{name}}").replace("{{name}}", openAgent?.name ?? "...")
            }
            className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-2xl bg-secondary/70 px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
          />
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            aria-label={t("common.send", "Send")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default PetChat;
