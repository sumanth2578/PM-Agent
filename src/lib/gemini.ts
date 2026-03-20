import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Initialize the Google Generative AI client with proper error handling
const getGenAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Google Gemini API key is not set. Please add your API key to the .env file.');
  }
  return new GoogleGenerativeAI(apiKey);
};

// ==================== TEMPLATE FALLBACKS ====================

const summaryTemplate = `> ⚠️ **AI Service Interruption:** Both Primary (Gemini) and Fallback (Groq) AI services are currently at their rate limits. Displaying a structured template for manual entry. Please try again in 1-2 minutes.

# Meeting Summary

## 📌 Executive Summary
[Brief high-level overview of what the meeting was about and the main conclusions reached.]

## 🎯 Key Decisions
1. [Decision 1]
2. [Decision 2]

## ✅ Action Items
- [ ] **[Name]:** [Task description] (Due: [Date])
- [ ] **[Name]:** [Task description] (Due: [Date])

## 📝 Main Discussion Points
- **[Topic 1]:** [Brief points covered]
- **[Topic 2]:** [Brief points covered]
- **[Topic 3]:** [Brief points covered]
`;

const prdTemplate = `> ⚠️ **AI Service Interruption:** Both Primary (Gemini) and Fallback (Groq) AI services are currently at their rate limits. Displaying a structured template for manual entry. Please try again in 1-2 minutes.

# Product Requirements Document (PRD)

## 1. Executive Summary
[Provide a high-level summary of the product/feature, its purpose, and target audience.]

## 2. Problem Statement
[Describe the specific problem this product/feature solves for the user.]

## 3. Goals & Success Metrics
- **Goals:** [e.g., Increase user engagement, reduce onboarding time]
- **Metrics:** [e.g., Daily Active Users (DAU), conversion rate]

## 4. Target Audience
- **Persona 1:** [Description and needs]
- **Persona 2:** [Description and needs]

## 5. Key Features & Requirements
### MVP Features
- [Feature 1 description and acceptance criteria]
- [Feature 2 description and acceptance criteria]

### Future/V2 Features
- [Feature 3 description]

## 6. User Experience & Design
[Briefly describe the user journey, key screens, and UI/UX considerations.]

## 7. Technical Considerations
[Note any specific APIs, architecture changes, or technical constraints.]

## 8. Timeline & Milestones
- **Phase 1 (Design):** [Date]
- **Phase 2 (Development):** [Date]
- **Phase 3 (Testing & Launch):** [Date]
`;

const userStoriesTemplate = `> ⚠️ **AI Service Interruption:** Both Primary (Gemini) and Fallback (Groq) AI services are currently at their rate limits. Displaying a structured template for manual entry. Please try again in 1-2 minutes.

# User Stories Backlog

### Story 1: [Core Action]
**As a** [user role],
**I want** [capability/action],
**So that** [benefit/value].

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Priority:** P0
**Story Points:** 3
**Labels:** frontend, core

---

### Story 2: [Secondary Action]
**As a** [user role],
**I want** [capability/action],
**So that** [benefit/value].

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Priority:** P1
**Story Points:** 5
**Labels:** backend, api

---

### Story 3: [Error Handling]
**As a** [user role],
**I want** [capability/action],
**So that** [benefit/value].

**Acceptance Criteria:**
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Priority:** P2
**Story Points:** 2
**Labels:** ux, edge-case
`;

const sprintPlanTemplate = `> ⚠️ **AI Service Interruption:** Both Primary (Gemini) and Fallback (Groq) AI services are currently at their rate limits. Displaying a structured template for manual entry. Please try again in 1-2 minutes.

# Sprint Plan: [Sprint Goal]

## Sprint Information
**Duration:** 2 Weeks
**Total Capacity:** [X] Story Points
**Sprint Goal:** [Define the primary objective for this sprint]

## Backlog Items

| ID | Title / Description | Priority | Points | Assignee |
|---|---|---|---|---|
| TSK-1 | [Setup database schema] | High | 5 | [Backend Dev] |
| TSK-2 | [Build login UI components] | High | 3 | [Frontend Dev] |
| TSK-3 | [Implement API endpoints] | Medium | 8 | [Backend Dev] |
| TSK-4 | [Write unit tests] | Medium | 3 | [QA/Dev] |
| TSK-5 | [Design final mockups] | Low | 2 | [Designer] |

## Risks & Dependencies
- **Risk 1:** [Description and mitigation]
- **Risk 2:** [Description and mitigation]

## Definition of Done (DoD)
- Code is peer-reviewed and merged
- Unit tests pass with >80% coverage
- Feature is tested in staging environment
- Product Manager sign-off
`;

// ==================== CORE FUNCTIONS ====================

export async function summarizeMeeting(transcript: string) {
  try {
    if (!transcript || transcript.trim() === '') {
      return "No transcript was provided to summarize. Please ensure audio is recorded properly.";
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      You are an expert AI Executive Assistant. Analyze this meeting transcript and provide a highly professional, comprehensive, and structured summary in Markdown. 
      
      The summary should be detailed enough to be standalone but concise enough for a busy executive. 
      Use professional Markdown formatting including bolding for emphasis. Use clean bullet points (-).
      
      Your response must follow this exact structure:
      
      # 📝 Professional Meeting Summary
      [Provide a thorough executive summary (1-2 paragraphs) that captures the core essence, strategic context, and overall outcome of the discussion.]
      
      ## 🌟 Strategic Key Highlights
      - **[Critical Takeaway]:** Provide detailed context and implications for each point.
      - **[Significant Insight]:** Explain why this matters for the project or organization.
      - (Include all other major discussion points with enough detail to be easily understandable)
      
      ## 🎯 Action Items & Accountability
      - **[Owner Name]:** [Specific, actionable task] - [Status/Deadline if mentioned]
      - [If no owners are mentioned, list the tasks clearly based on the discussion context]
      
      ## ✅ Decisions & Alignment
      - **[Decision]:** Document each final decision or consensus reached.
      
      ## 📅 Strategic Next Steps
      - [A clear roadmap of what happens next, including follow-up meetings or milestones]
      
      Transcript:
      ${transcript}
    `;

    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 2048,
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE }
    ];

    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
        safetySettings
      });

      const response = await result.response;
      const text = response.text();

      if (!text || text.trim() === '') {
        return "The AI model couldn't generate a summary. This might be due to content filtering or an issue with the transcript.";
      }

      return text;
    } catch (genError) {
      console.error('Specific error generating content with Google Gemini:', genError);
      if (genError instanceof Error) {
        const errorMessage = genError.message.toLowerCase();
        if (errorMessage.includes('blocked') || errorMessage.includes('safety')) {
          return "The AI model couldn't generate a summary due to content filtering.";
        } else {
          try {
            return await callGroqFallback(prompt, "You are an expert AI meeting assistant. Summarize the following transcript professionally.");
          } catch (fallbackError) {
            return summaryTemplate;
          }
        }
      }
      return summaryTemplate;
    }
  } catch (error) {
    console.error('Error generating summary:', error);
    return summaryTemplate;
  }
}

// ==================== PM AGENT FUNCTIONS ====================

const pmSafetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
];

const pmGenerationConfig = {
  temperature: 0.7,
  topK: 40,
  topP: 0.9,
  maxOutputTokens: 4096,
};

async function callGemini(prompt: string): Promise<string> {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  const maxRetries = 2;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: pmGenerationConfig,
        safetySettings: pmSafetySettings as any,
      });
      const response = await result.response;
      return response.text();
    } catch (err) {
      const error = err as Error;
      const errorMsg = error?.message?.toLowerCase() || '';
      if (errorMsg.includes('quota') || errorMsg.includes('429')) {
        throw new Error('QUOTA_EXCEEDED');
      }
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt + 1) * 1000));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Gemini call failed');
}

async function callGroqFallback(prompt: string, systemPrompt: string = "You are a helpful AI assistant."): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error('No Groq API key found');

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"];
  const url = `https://api.groq.com/openai/v1/chat/completions`;

  const maxSafeChars = 15000; 
  const safePrompt = prompt.length > maxSafeChars ? prompt.substring(0, maxSafeChars) + "\n...[Truncated]..." : prompt;

  for (const model of models) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: safePrompt }],
          model: model,
          temperature: 0.7,
          max_tokens: 2048
        })
      });

      if (!response.ok) continue;

      const data = await response.json();
      if (data?.choices?.[0]?.message?.content) return data.choices[0].message.content;
    } catch (err) { continue; }
  }
  throw new Error("All Groq fallbacks failed");
}

export async function generatePRD(productIdea: string): Promise<string> {
  try {
    if (!productIdea || productIdea.trim() === '') return "Please provide an idea to generate a PRD.";

    const prompt = `
You are an expert Product Manager. Generate a comprehensive, professional Product Requirements Document (PRD) based on the following idea/context:
${productIdea}

**STRICT RULE: Use professional Markdown formatting including bolding for emphasis. Use clean bullet points (-).**

Structure the PRD with these sections:
## 1. Executive Summary
## 2. Problem Statement
## 3. Goals & Success Metrics
## 4. Target Audience
## 5. Key Features & Requirements
## 6. User Experience & Design
## 7. Technical Considerations
## 8. Timeline & Milestones
## 9. Risks & Mitigations
## 10. Open Questions

Be thorough, specific, and professional.
    `;

    try {
      return await callGemini(prompt);
    } catch (err) {
      return await callGroqFallback(prompt, "You are an expert Product Manager. Generate a professional PRD.");
    }
  } catch (error) {
    return prdTemplate;
  }
}

export async function generateUserStories(featureDescription: string): Promise<string> {
  try {
    if (!featureDescription || featureDescription.trim() === '') return "Please provide a description.";

    const prompt = `
You are an expert Agile coach. Generate a comprehensive set of professional user stories for:
${featureDescription}

**STRICT RULE: Use professional Markdown formatting including bolding for emphasis. Use clean bullet points (-).**

Format each story:
### Story [n]: [Title]
**As a** [user], **I want** [action], **So that** [value].
**Acceptance Criteria:**
- [ ] [Criterion]
**Priority:** [P0/P1/P2]
**Story Points:** [1-13]

Generate 8-10 stories covering core flows, edge cases, and security.
    `;

    try {
      return await callGemini(prompt);
    } catch (err) {
      return await callGroqFallback(prompt, "You are an expert Product Manager. Generate professional User Stories.");
    }
  } catch (error) {
    return userStoriesTemplate;
  }
}

export async function generateSprintPlan(backlogItems: string, duration: string = '2 weeks'): Promise<string> {
  try {
    if (!backlogItems || backlogItems.trim() === '') return "Please provide backlog items.";

    const prompt = `
Generate a professional sprint plan for ${duration} based on:
${backlogItems}

Structure:
## Sprint Goal
## Sprint Capacity & Assumptions
## Sprint Backlog (Markdown Table: ID, Title, Priority, Status, Assignee Role, Story Points)
## Key Dependencies & Risks
## Daily Standup Focus

Be realistic and professional.
    `;

    try {
      return await callGemini(prompt);
    } catch (err) {
      return await callGroqFallback(prompt, "You are an expert Scrum Master. Generate a professional Sprint Plan.");
    }
  } catch (error) {
    return sprintPlanTemplate;
  }
}

export async function analyzeFeaturePriority(featuresString: string): Promise<string> {
  try {
    if (!featuresString || featuresString.trim() === '') throw new Error('No features provided');

    const prompt = `
Prioritize these features using the RICE model:
${featuresString}

Output:
1. Prioritization strategy explanation.
2. Markdown table sorted by RICE score.
3. Rationale for top 2 features.
    `;

    try {
      return await callGemini(prompt);
    } catch (err) {
      return await callGroqFallback(prompt, "You are an expert PM. Prioritize features using RICE.");
    }
  } catch (error) {
    return "> ⚠️ AI Service Busy. Please try again later.";
  }
}

interface HistoryItem { date?: string; summary?: string; content?: string; }

export async function queryKnowledge(query: string, history: HistoryItem[]): Promise<string> {
  try {
    if (!query || query.trim() === '') return "Please provide a question.";
    if (!history || history.length === 0) return "No history found.";

    const knowledgeBase = history.map((m, i) => `--- MEETING #${i + 1} (${m.date}) ---\n${m.summary || m.content}`).join('\n');

    const prompt = `
You are the "3.0 Agent" - a supreme Intelligence. You have access to this meeting history:
${knowledgeBase}

User Question: "${query}"

Instructions:
1. Use history as truth.
2. Provide high-fidelity design/architectural suggestions.
3. Use Mermaid for logic diagrams.
4. Use images from pollination for UI mockups: ![Mockup](https://image.pollinations.ai/prompt/Descriptive+Prompt+With+Plus+Signs?width=1024&height=1024&nologo=true)
5. Tone: Premium and visionary.
    `;

    try {
      return await callGemini(prompt);
    } catch (err) {
      return await callGroqFallback(prompt, "You are 3.0 Labs Intelligence.");
    }
  } catch (error) {
    return "Error accessing AI memory.";
  }
}

interface BriefingEvent { summary: string; date: string; }

export async function generateMorningBriefing(events: BriefingEvent[], history: HistoryItem[]): Promise<string> {
  const eventsString = events.map(e => `- ${e.summary} at ${new Date(e.date).toLocaleTimeString()}`).join('\n');
  const historyString = history.slice(0, 5).map(m => `- ${m.summary}`).join('\n');

  const prompt = `
Provide a premium morning briefing.
Agenda: ${eventsString || "None"}
History: ${historyString || "None"}

Instructions: Summarize today, connect with past context, and provide 2-3 pieces of advice.
  `;

  try {
    return await callGemini(prompt);
  } catch (err) {
    return await callGroqFallback(prompt, "You are a professional Executive Assistant.");
  }
}

export async function transcribeWithGroqWhisper(audioBlob: Blob): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error('No Groq API key found');

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.m4a');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'text');

  const response = await fetch('https://api.groq.com/openai/v1/audio/translations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) throw new Error('Whisper failed');
  return await response.text();
}
