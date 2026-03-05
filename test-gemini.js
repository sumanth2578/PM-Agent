import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

function getApiKey() {
    try {
        const envPath = path.join(process.cwd(), ".env");
        const envContent = fs.readFileSync(envPath, "utf-8");
        const match = envContent.match(/VITE_GEMINI_API_KEY=(.*)/);
        return match ? match[1].trim() : null;
    } catch (e) {
        return null;
    }
}

async function listModels() {
    const apiKey = getApiKey();
    if (!apiKey) {
        console.error("VITE_GEMINI_API_KEY not found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    console.log("Checking models for API key...");

    const modelsToTry = [
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ];

    for (const modelName of modelsToTry) {
        try {
            console.log(`Trying model: ${modelName}...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("test run");
            console.log(`✅ Model ${modelName} is available.`);
        } catch (e) {
            console.log(`❌ Model ${modelName} returned error: ${e.message}`);
        }
    }
}

listModels();
