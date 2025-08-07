import localDB from "../db";
import bcrypt from 'bcryptjs';
import jwt from "jsonwebtoken";
import axios from 'axios'

function getUserIdFromToken(token) {
    try {
        // 1. Guard against null or undefined tokens
        if (!token) {
            return null;
        }
        const decoded = jwt.decode(token);
        return decoded;
    } catch (e) {
        console.error("Error decoding token:", e);
        return null;
    }
}

export const userGetMe = async (event, mode, token) => {
    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/users/me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const userId = getUserIdFromToken(token).id;
        if (!userId) throw new Error("Invalid token for offline mode");
        return localDB.getUserById(userId);
    }
}

export const userUpdateProfile = async (event, mode, token, payload) => {
    if (mode === 'online') {
        const response = await axios.put('http://localhost:4000/api/users/me', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const userId = getUserIdFromToken(token).id;
        if (!userId) throw new Error("Invalid token");
        const user = localDB.updateUserProfile(userId, payload);
        return {user};
    }
}

export const userGetSettings = async (event, mode, token) => {
    if (mode === 'online') {
        const response = await axios.get('http://localhost:4000/api/users/me/settings', {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const userId = getUserIdFromToken(token).id;
        if (!userId) throw new Error("Invalid token");
        return localDB.getUserSettings(userId);
    }
}

export const userUpdateSettings = async (event, mode, token, payload) => {
    if (mode === 'online') {
        const response = await axios.put('http://localhost:4000/api/users/me/settings', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const userId = getUserIdFromToken(token).id;
        if (!userId) throw new Error("Invalid token");
        localDB.updateUserSettings(userId, payload);
        return localDB.getUserSettings(userId); // Return updated settings
    }
}

export const userChangePassword = async (event, mode, token, payload) => {
    const { old_password, new_password } = payload;
    if (mode === 'online') {
        const response = await axios.put('http://localhost:4000/api/users/me/change-password', payload, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data;
    } else { // Offline
        const userToken = getUserIdFromToken(token);
        if (!userToken) throw new Error("Invalid token");
        const user = localDB.findUserByIdentifier(userToken.username); // Assuming findUser can take ID
        if (!user) throw new Error("User not found");
        const match = await bcrypt.compare(old_password, user.password_hash);
        if (!match) throw new Error("Incorrect current password");
        localDB.changePassword(userToken.id, new_password);
        return { message: "Password updated successfully" };
    }
}

export const userDeleteAccount = async (event, mode, token, payload) => {
    const { password } = payload;
    if (mode === 'online') {
        const response = await axios.delete('http://localhost:4000/api/users/me', {
            headers: { Authorization: `Bearer ${token}` },
            data: payload
        });
        return response.data;
    } else { // Offline
        const userToken = getUserIdFromToken(token);
        if (!userToken) throw new Error("Invalid token");
        const user = localDB.findUserByIdentifier(userToken.username);
        if (!user) throw new Error("User not found");
        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) throw new Error("Incorrect password");
        localDB.deleteUser(userToken.id);
        return { message: "User account deleted successfully" };
    }
}


