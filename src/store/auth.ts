import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api, ApiError } from '@/lib/api';
import type { RegisterInput, User } from '@/lib/types';

type AuthState = {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrated: boolean;
  booting: boolean;
  setHydrated: (value: boolean) => void;
  signIn: (identifier: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  signOut: () => Promise<void>;
  bootstrap: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clear: () => void;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      booting: false,

      setHydrated: (value) => set({ hydrated: value }),

      signIn: async (identifier, password) => {
        const session = await api.login(identifier.trim(), password);
        set({
          token: session.token,
          refreshToken: session.refreshToken,
          user: session.user,
          hydrated: true,
        });
        return session.user;
      },

      register: async (input) => {
        await api.register({ ...input, email: input.email.trim(), nip: input.nip.trim() });
        // Setelah akun dibuat, langsung login supaya pengguna tidak mengetik ulang.
        return get().signIn(input.email.trim(), input.password);
      },

      signOut: async () => {
        const token = get().token;
        set({ token: null, refreshToken: null, user: null });
        if (token) {
          api.logout(token).catch(() => undefined);
        }
      },

      bootstrap: async () => {
        if (get().booting) return;
        set({ booting: true });

        const token = get().token;
        if (!token) {
          set({ hydrated: true, booting: false });
          return;
        }

        try {
          const result = await api.me(token);
          set({ user: result.user, hydrated: true, booting: false });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            set({ token: null, refreshToken: null, user: null, hydrated: true, booting: false });
          } else {
            // Offline / server down: pertahankan sesi lokal supaya UI tidak logout paksa.
            set({ hydrated: true, booting: false });
          }
        }
      },

      refreshUser: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const result = await api.me(token);
          set({ user: result.user });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            set({ token: null, refreshToken: null, user: null });
          }
        }
      },

      clear: () => set({ token: null, refreshToken: null, user: null }),
    }),
    {
      name: 'absensi-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
