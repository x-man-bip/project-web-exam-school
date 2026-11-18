import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnswerMap = Record<string, any>;
export type SaveStatus = "saved" | "saving" | "pending" | "offline" | "error";
export type SaveResult = { ok: true } | { ok: false; transient: boolean; message: string };

const MIN_SYNC_DELAY_MS = 10_000;
const MAX_SYNC_DELAY_MS = 18_000;
const RETRY_DELAY_MS = 3_000;

interface LocalDraft {
  answers: AnswerMap;
  pending: boolean;
}

export function localDraftKey(userId: string, examId: string): string {
  return `exam_answers_${userId}_${examId}`;
}

export function readLocalDraft(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (!parsed || typeof parsed.answers !== "object" || parsed.answers === null) return null;
    return { answers: parsed.answers, pending: parsed.pending === true };
  } catch {
    return null;
  }
}

function writeLocalDraft(key: string, draft: LocalDraft): void {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Storage full or disabled: the in-memory answers still sync to the server.
  }
}

export function clearLocalDraft(key: string): void {
  localStorage.removeItem(key);
}

function nextSyncDelay(): number {
  return MIN_SYNC_DELAY_MS + Math.floor(Math.random() * (MAX_SYNC_DELAY_MS - MIN_SYNC_DELAY_MS + 1));
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function sendAnswers(attemptId: string, sessionToken: string | null, answers: AnswerMap): Promise<SaveResult> {
  try {
    const { error } = await supabase.rpc("save_exam_answers", {
      p_attempt_id: attemptId,
      p_answers: answers,
      p_session_token: sessionToken,
    });
    if (!error) return { ok: true };
    // Postgres/PostgREST errors always carry a code; without one the request never reached the server.
    return { ok: false, transient: !error.code, message: error.message };
  } catch (e) {
    return { ok: false, transient: true, message: e instanceof Error ? e.message : "Koneksi terputus." };
  }
}

export async function submitAttempt(attemptId: string, sessionToken: string | null): Promise<SaveResult> {
  try {
    const { error } = await supabase.rpc("submit_exam_attempt", {
      p_attempt_id: attemptId,
      p_session_token: sessionToken,
    });
    if (!error) return { ok: true };
    return { ok: false, transient: !error.code, message: error.message };
  } catch (e) {
    return { ok: false, transient: true, message: e instanceof Error ? e.message : "Koneksi terputus." };
  }
}

export async function retryWhileOffline(
  attempt: () => Promise<SaveResult>,
  onRetry?: () => void,
): Promise<SaveResult> {
  for (;;) {
    const result = await attempt();
    if (result.ok || !result.transient) return result;
    onRetry?.();
    await wait(RETRY_DELAY_MS);
  }
}

interface AutosaveOptions {
  storageKey: string;
  attemptId: string;
  sessionToken: string | null;
  enabled: boolean;
}

export function useAnswerAutosave({ storageKey, attemptId, sessionToken, enabled }: AutosaveOptions) {
  const [initial] = useState(() => readLocalDraft(storageKey));
  const [answers, setAnswers] = useState<AnswerMap>(() => initial?.answers ?? {});
  const [status, setStatus] = useState<SaveStatus>(() => (initial?.pending ? "pending" : "saved"));

  const answersRef = useRef(answers);
  const versionRef = useRef(0);
  const dirtyRef = useRef(initial?.pending ?? false);
  const inFlightRef = useRef(false);

  const sendSnapshot = useCallback(async (): Promise<SaveResult> => {
    inFlightRef.current = true;
    const snapshot = answersRef.current;
    const version = versionRef.current;
    setStatus("saving");
    const result = await sendAnswers(attemptId, sessionToken, snapshot);
    inFlightRef.current = false;

    if (result.ok) {
      if (versionRef.current === version) {
        dirtyRef.current = false;
        writeLocalDraft(storageKey, { answers: snapshot, pending: false });
        setStatus("saved");
      } else {
        setStatus("pending");
      }
      return result;
    }
    setStatus(result.transient ? "offline" : "error");
    return result;
  }, [attemptId, sessionToken, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (dirtyRef.current && !inFlightRef.current) await sendSnapshot();
      if (!cancelled) timer = setTimeout(tick, nextSyncDelay());
    };
    timer = setTimeout(tick, nextSyncDelay());

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, sendSnapshot]);

  const setAnswer = useCallback((questionId: string, value: unknown) => {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next;
    versionRef.current += 1;
    dirtyRef.current = true;
    writeLocalDraft(storageKey, { answers: next, pending: true });
    setAnswers(next);
    setStatus("pending");
  }, [storageKey]);

  const saveAll = useCallback(async (onRetry?: () => void): Promise<SaveResult> => {
    return retryWhileOffline(async () => {
      while (inFlightRef.current) await wait(200);
      if (!dirtyRef.current) return { ok: true };
      return sendSnapshot();
    }, onRetry);
  }, [sendSnapshot]);

  return { answers, setAnswer, status, saveAll };
}
