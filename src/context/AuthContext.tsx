import {
  createContext,
  useCallback,
  useEffect,
  useState,
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
 * The keys that make up a session. `authMode` was retired with the online
 * backend, but older installs still carry it, so logout clears it too.
 * Everything else in localStorage (theme, zoom, drafts, setup state) belongs
 * to the device rather than the session and survives a logout.
 */
const SESSION_KEYS = ["accessToken", "userInfo", "authMode"];

function readStoredUser(): UserInfo | null {
  const storedUser = localStorage.getItem("userInfo");
  return storedUser ? JSON.parse(storedUser) : null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem("accessToken"),
  );
  const [user, setUser] = useState<UserInfo | null>(readStoredUser);

  // The main window and Quick Capture each run their own AuthProvider over the
  // same localStorage. A login or logout in one fires a storage event in the
  // other, so neither keeps acting on a session that has changed under it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && !SESSION_KEYS.includes(e.key)) return;
      setAccessToken(localStorage.getItem("accessToken"));
      setUser(readStoredUser());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = (access: string, userInfo: UserInfo) => {
    setAccessToken(access);

    // Clone before mutation
    const clonedUserInfo = structuredClone(userInfo);

    setUser(userInfo);

    localStorage.setItem("accessToken", access);

    localStorage.setItem("userInfo", JSON.stringify(clonedUserInfo));
  };

  // Stable identity: components list logout in effect dependencies, and a new
  // function on every render would re-run those effects each time.
  const logout = useCallback(() => {
    for (const key of SESSION_KEYS) localStorage.removeItem(key);
    setAccessToken(null);
    setUser(null);
  }, []);
  return (
    <AuthContext.Provider value={{ accessToken, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
