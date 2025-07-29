import { createContext, useState, type ReactNode } from "react";

interface AuthContextType {
  accessToken: string | null;
  user: UserInfo | null;
  login: (access: string, user: UserInfo) => void;
  logout: () => void;
}

interface UserInfo {
  username: string;
  email: string;
  created_at: string;
  full_name: string | null;
  timezone: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem("accessToken")
  );
  const [user, setUser] = useState<UserInfo | null>(() => {
    const storedUser = localStorage.getItem("userInfo");
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const login = (access: string, userInfo: UserInfo) => {
    setAccessToken(access);
    localStorage.setItem("accessToken", access);
    setUser(userInfo);
    localStorage.setItem("userInfo", JSON.stringify(userInfo));
  };

  const logout = () => {
    localStorage.clear();
  };
  return (
    <AuthContext.Provider value={{ accessToken, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
