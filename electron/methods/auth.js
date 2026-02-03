import localDB from "../db";
import bcrypt from 'bcryptjs';
import jwt from "jsonwebtoken";
import axios from 'axios'
import http from 'http'
import url from 'url';
import { shell } from "electron";

const offlineAccessTokenSecret = "be1e968105e3d8c510625e7ae117d3b376913c6359b5063bc5ff07f1cc43cfa3229405930cdeb7bcc9e9ebf3199c0b85b1a0c2396018eee4985f2d1a0abf6002";

const generateAccessToken = (user) => {
    return jwt.sign(user, offlineAccessTokenSecret, { expiresIn: '15m' });
};

export const handleLogin = async (event, mode, credentials) => {
    const { identifier, password } = credentials;
    if (mode === 'online') {
        try {
            // Call your local backend server
            const response = await axios.post('http://localhost:4000/api/auth/login', credentials);
            return response.data;
        } catch (error) {
            console.error('Online login error:', error.response?.data || error.message);
            throw new Error(error.response?.data.message || 'Online login failed');
        }
    } else { // Offline Mode
        try {
            const user = localDB.findUserByIdentifier(identifier);
            if (!user) throw new Error('User not found');

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) throw new Error('Incorrect password');

            const accessToken = generateAccessToken({ id: user.id, username: user.username });
            // --- FIX: Ensure full_name is never undefined ---
            const userInfo = {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name || null, // Fallback to null if undefined
                created_at: user.created_at,
                profile_picture: user.profile_picture || null
            };
            return { accessToken, userInfo };
        } catch (error) {
            console.error('Offline login error:', error);
            throw error;
        }
    }
};

export const handleRegister = async (event, mode, details) => {
    if (mode === 'online') {
        try {
            // Call your local backend server started with startServer()
            const response = await axios.post('http://localhost:4000/api/auth/register', details);
            return response.data;
        } catch (error) {
            console.error('Online registration error:', error.response?.data || error.message);
            throw new Error(error.response?.data.message || 'Online registration failed');
        }
    } else { // Offline Mode
        try {
            const existingUser = localDB.findUserForCheck(details.email, details.username);
            if (existingUser) {
                throw new Error('Username or email already exists');
            }
            const newUser = localDB.createUser(details);
            return { user: newUser };
        } catch (error) {
            console.error('Offline registration error:', error);
            throw error;
        }
    }
}


export async function handleGoogleLogin() {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            try {
                const { code } = url.parse(req.url, true).query;
                if (!code) {
                    throw new Error('No authorization code received.');
                }

                // --- Step 3: Exchange Authorization Code for Tokens ---
                const tokenResponse = await axios.post(
                    "https://oauth2.googleapis.com/token",
                    {
                        code,
                        client_id: process.env.GOOGLE_CLIENT_ID, // <-- PASTE YOUR CLIENT ID HERE
                        client_secret: process.env.GOOGLE_CLIENT_SECRET, // <-- PASTE YOUR CLIENT SECRET HERE
                        redirect_uri: `http://localhost:${server.address().port}`,
                        grant_type: "authorization_code",
                    }
                );

                const { access_token, refresh_token } = tokenResponse.data;

                // --- Step 4: Use Access Token to get User Profile ---
                const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${access_token}` },
                });

                // --- Success! ---
                res.end('<h1>Authentication successful!</h1><p>You can now close this tab.</p>');
                server.close();
                resolve({
                    profile: profileResponse.data,
                    tokens: { access_token, refresh_token },
                });

            } catch (error) {
                console.error('OAuth Error:', error.response?.data || error.message);
                res.end('<h1>Authentication failed.</h1>');
                server.close();
                reject(error);
            }
        }).listen(0, () => { // Listen on a random free port
            const { port } = server.address();
            const redirectUri = `http://localhost:${port}`;

            // --- Step 2: Open the Google Auth URL in the user's default browser ---
            const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
            authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID); // <-- PASTE YOUR CLIENT ID HERE
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('scope', 'openid profile email');
            authUrl.searchParams.set('access_type', 'offline');
            authUrl.searchParams.set('prompt', 'consent');

            shell.openExternal(authUrl.toString());
        });
    });
}