import { create } from "zustand";

import type { AuthBundle, NewApiUser } from "@/types/auth";

export type AuthPhase = "idle" | "checking" | "authenticated" | "anonymous" | "error";

type UserStore = {
    user: NewApiUser | null;
    session: AuthBundle | null;
    phase: AuthPhase;
    setSession: (session: AuthBundle) => void;
    setPhase: (phase: AuthPhase) => void;
    clearSession: () => void;
};

// Browser login credentials stay in memory. Refresh cookies are owned by New API.
export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    session: null,
    phase: "idle",
    setSession: (session) => set({ user: session.user, session, phase: "authenticated" }),
    setPhase: (phase) => set({ phase }),
    clearSession: () => set({ user: null, session: null, phase: "anonymous" }),
}));
