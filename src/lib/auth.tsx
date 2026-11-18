import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { isSessionRevoked, markSessionRevoked } from "./sessionGuard";
import type { Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isHomeroom: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  isHomeroom: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHomeroom, setIsHomeroom] = useState(false);

  async function loadProfile(uid: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.error("Profile load error", error);
      return null;
    }
    return data as Profile | null;
  }

  async function checkHomeroom(uid: string): Promise<boolean> {
    // Check via class_periods for the active academic year + semester
    const { data: activeYear } = await supabase
      .from("academic_years")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();
    const { data: activeSem } = await supabase
      .from("semesters")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    if (!activeYear?.id || !activeSem?.id) return false;

    const { count, error } = await supabase
      .from("class_periods")
      .select("*", { count: "exact", head: true })
      .eq("homeroom_teacher_id", uid)
      .eq("academic_year_id", activeYear.id)
      .eq("semester_id", activeSem.id);
    if (error) return false;
    return (count ?? 0) > 0;
  }

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        Promise.all([
          loadProfile(data.session.user.id),
          checkHomeroom(data.session.user.id),
        ]).then(([p, homeroom]) => {
          if (!active) return;
          setProfile(p);
          setIsHomeroom(homeroom);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        (async () => {
          const [p, homeroom] = await Promise.all([
            loadProfile(sess.user.id),
            checkHomeroom(sess.user.id),
          ]);
          setProfile(p);
          setIsHomeroom(homeroom);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setIsHomeroom(false);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const verify = async () => {
      if (cancelled) return;
      if (await isSessionRevoked()) {
        if (cancelled) return;
        markSessionRevoked();
        await supabase.auth.signOut({ scope: "local" });
      }
    };
    const interval = window.setInterval(verify, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void verify();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setIsHomeroom(false);
  };

  const refreshProfile = async () => {
    if (!session?.user) return;
    const [p, homeroom] = await Promise.all([
      loadProfile(session.user.id),
      checkHomeroom(session.user.id),
    ]);
    setProfile(p);
    setIsHomeroom(homeroom);
  };

  return (
    <AuthContext.Provider value={{ session, profile, loading, isHomeroom, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
