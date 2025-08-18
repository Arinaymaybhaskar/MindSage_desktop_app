import { execSync, exec } from 'child_process';
import { getUserIdFromToken } from '../../src/utils/electronUtils';

export const handleGetOllamaModels = (event, token) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    try {
        // Run 'ollama list' to get models
        const output = execSync('ollama list', { encoding: 'utf-8' });

        // Split into lines and skip the header
        const lines = output.trim().split('\n').slice(1);

        // Map each line into an object { name, size, modified }
        const models = lines.map(line => {
            const parts = line.trim().split(/\s{2,}/); // split by 2+ spaces
            return {
                name: parts[0],
                size: parts[1],
                modified: parts[2]
            };
        });

        return models;
    } catch (error) {
        console.error('Error fetching Ollama models:', error);
        return [];
    }
};

export const handleOllamaPrompt = async (event, token, model, prompt, jsonMode = false) => {
    const userId = getUserIdFromToken(token);
    if (!userId) {
        return { error: "Invalid token" };
    }
    if (!model || !prompt) {
        return { error: 'Model name and prompt are required.' };
    }

    try {
        const requestBody = {
            model,
            prompt,
            stream: false, // full output as one JSON
            num_predict: 300 // limit tokens for speed
        };

        // Enable JSON mode if requested
        if (jsonMode) {
            requestBody.format = 'json';
        }

        const res = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            throw new Error(`Ollama HTTP error: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        return data.response;
    } catch (err) {
        console.error('Ollama error:', err);
        return { error: err.message };
    }
};