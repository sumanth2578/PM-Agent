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

async function findWorkingModel() {
    const apiKey = getApiKey();
    if (!apiKey) return;

    const genAI = new GoogleGenerativeAI(apiKey);

    // List from before plus standard ones
    const models = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
        "gemini-1.5-flash", // Re-trying with new SDK
        "gemini-1.5-pro",
        "gemini-pro"
    ];

    let results = [];

    for (const m of models) {
        try {
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("hi");
            results.push(`SUCCESS: ${m}`);
        } catch (e) {
            results.push(`FAIL: ${m} - ${e.message}`);
        }
    }

    fs.writeFileSync("working-models.txt", results.join("\n"));
}

findWorkingModel();
