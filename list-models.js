import https from 'https';

const API_KEY = 'AIzaSyB5hw49mZ7XmYp8ZgWRHHy1sH2Qg7-aRKA';
const url = `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log("AVAILABLE MODELS:");
            if (json.models) {
                json.models.forEach(m => {
                    console.log(` - ${m.name} (${m.displayName})`);
                });
            } else {
                console.log("No models found or error:", json);
            }
        } catch (e) {
            console.log("Error parsing JSON:", e.message);
            console.log("Raw Response:", data);
        }
    });
}).on('error', (err) => {
    console.log("Error fetching models:", err.message);
});
