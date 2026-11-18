import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export function useExamInProgress(userId: string | undefined, refreshKey: string): boolean {
  const [inProgress, setInProgress] = useState(false);

  useEffect(() => {
    if (!userId) {
      setInProgress(false);
      return;
    }
    let active = true;
    supabase
      .from("exam_attempts")
      .select("id")
      .eq("student_id", userId)
      .eq("status", "in_progress")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setInProgress(!error && data !== null);
      });
    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  return inProgress;
}
