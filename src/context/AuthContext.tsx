import {
  createContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

export interface AuthContextType {
  accessToken: string | null;
  user: UserInfo | null;
  login: (access: string, user: UserInfo) => void;
  logout: () => void;
}

interface UserInfo {
  username: string;
  email: string;
  created_at: string;
  full_name: string;
  timezone: string;
}

/**
 * Everything logout() is allowed to remove. localStorage also holds the
 * colour theme, zoom level, onboarding flag, title-bar preference and any
 * unsaved journal draft, none of which belong to the session. Clearing the
 * lot, as this used to, was silent data loss inside a logout button.
 */
const AUTH_KEYS = ["accessToken", "userInfo", "authMode"] as const;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem("accessToken"),
  );
  const [user, setUser] = useState<UserInfo | null>(() => {
    const storedUser = localStorage.getItem("userInfo");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const login = useCallback((access: string, userInfo: UserInfo) => {
    setAccessToken(access);

    // Clone before mutation
    const clonedUserInfo = structuredClone(userInfo);

    setUser(userInfo);

    localStorage.setItem("accessToken", access);

    localStorage.setItem("userInfo", JSON.stringify(clonedUserInfo));
  }, []);

  const logout = useCallback(() => {
    // PrivateRoute reads this context rather than localStorage, so resetting
    // the state is what actually signs the user out. Without it the session
    // survived until the next reload.
    setAccessToken(null);
    setUser(null);
    for (const key of AUTH_KEYS) localStorage.removeItem(key);
  }, []);

  // A stable value: consumers put logout in effect dependency arrays, and an
  // inline object literal gave it a fresh identity on every render.
  const value = useMemo(
    () => ({ accessToken, user, login, logout }),
    [accessToken, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthContext;
