import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:4000/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
// Handle 401: refresh token using HttpOnly cookie
api.interceptors.response.use(
  res => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Don't need to send token — browser sends HttpOnly cookie
        const res = await axios.post(
          "http://localhost:4000/api/auth/refresh-token",
          {},
          {
            withCredentials: true,
          }
        );

        const newAccessToken = res.data.accessToken;

        // Store the new accessToken (you can also use AuthContext)
        localStorage.setItem("accessToken", newAccessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error("Refresh token failed", refreshError);
        window.location.href = "/login"; // or use navigate("/login")
      }
    }

    return Promise.reject(error);
  }
);

export default api;
