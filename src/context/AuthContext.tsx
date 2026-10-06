import {
  createContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";

export interface AuthContextType {
  user: UserInfo | null;
  /** True until the main process has said who, if anyone, is signed in. */
  checking: boolean;
  login: (user: UserInfo) => void;
  logout: () => Promise<void>;
}

interface UserInfo {
  username: string;
  email: string;
  created_at: string;
  full_name: string;
  timezone: string;
}

/**
 * The session lives in the main process (electron/session.js); this context
 * mirrors it. `userInfo` stays in localStorage only as a display cache, read
 * by the title bar, profile menu and a few pages for a name and avatar. It is
 * not a credential: nothing the renderer stores signs anyone in.
 *
 * The other keys are what older versions kept. logout() removes only these;
 * localStorage also holds the colour theme, zoom level, onboarding flag and
 * any unsaved journal draft, none of which belong to the session.
 */
const USER_CACHE_KEY = "userInfo";
const LEGACY_TOKEN_KEY = "accessToken";
const AUTH_KEYS = [USER_CACHE_KEY, LEGACY_TOKEN_KEY, "authMode"] as const;

type SessionReply = { userInfo: UserInfo | null };

const invoke = <T,>(channel: string, ...args: unknown[]): Promise<T> =>
  window.electron.ipcRenderer.invoke<T>(channel, ...args);

function cacheUser(user: UserInfo | null) {
  if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_CACHE_KEY);
}

/**
 * Asks the main process who is signed in. The first launch after upgrading
 * from a token-based version hands the old token over once, so nobody is
 * signed out by the upgrade itself.
 */
async function fetchSession(): Promise<UserInfo | null> {
  const legacyToken = localStorage.getItem(LEGACY_TOKEN_KEY);
  if (legacyToken) {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem("authMode");
    const adopted = await invoke<SessionReply>(
      "auth:adopt-legacy-session",
      legacyToken,
    );
    if (adopted?.userInfo) return adopted.userInfo;
  }
  const reply = await invoke<SessionReply>("auth:get-session");
  return reply?.userInfo ?? null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchSession();
      setUser(next);
      cacheUser(next);
    } catch (err) {
      // Signed out is the safe reading of a session we cannot confirm.
      console.error("Could not read the session:", err);
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  // The main window and Quick Capture share one session in the main process,
  // which announces every sign-in and sign-out to both.
  useEffect(() => {
    void refresh();
    return window.electron.ipcRenderer.on("auth:changed", () => {
      void refresh();
    });
  }, [refresh]);

  const login = useCallback((userInfo: UserInfo) => {
    setUser(userInfo);
    cacheUser(userInfo);
  }, []);

  const logout = useCallback(async () => {
    // State first: PrivateRoute reads this context, so resetting it is what
    // takes the user off the private screens, even if the IPC call fails.
    setUser(null);
    for (const key of AUTH_KEYS) localStorage.removeItem(key);
    try {
      await invoke("auth:logout");
    } catch (err) {
      console.error("Sign-out did not reach the main process:", err);
    }
  }, []);

  // A stable value: consumers put logout in effect dependency arrays, and an
  // inline object literal gave it a fresh identity on every render.
  const value = useMemo(
    () => ({ user, checking, login, logout }),
    [user, checking, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
