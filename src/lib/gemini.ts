import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

// Initialize the Google Generative AI client with proper error handling
const getGenAI = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Google Gemini API key is not set. Please add your API key to the .env file.');
  }
  return new GoogleGenerativeAI(apiKey);
};

export async function summarizeMeeting(transcript: string) {
  try {
    // Check if transcript is valid
    if (!transcript || transcript.trim() === '') {
      return "No transcript was provided to summarize. Please ensure audio is recorded properly.";
    }

    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `
      Please analyze this meeting transcript and provide:
      1. A concise summary of key points discussed
      2. Action items and their owners (if mentioned)
      3. Important decisions made
      4. Follow-up tasks
      
      If the transcript is very short or unclear, please indicate that and provide whatever summary is possible.
      
      Transcript:
      ${transcript}
    `;

    const generationConfig = {
      temperature: 0.4,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 1024,
    };

    const safetySettings = [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
      }
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

      // Handle specific error types from the Gemini API
      if (genError instanceof Error) {
        const errorMessage = genError.message.toLowerCase();

        if (errorMessage.includes('blocked') || errorMessage.includes('safety') || errorMessage.includes('harmful')) {
          return "The AI model couldn't generate a summary due to content filtering. Please try with different content.";
        } else if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded') || errorMessage.includes('429')) {
          console.log('Gemini failed for Summary, attempting open fallback...', errorMessage);
          try {
            return await callGroqFallback(prompt, "You are an expert AI meeting assistant. Summarize the following transcript perfectly.");
          } catch (fallbackError) {
            console.error('Both AI providers failed for Summary:', fallbackError);
            return summaryTemplate;
          }
        } else if (errorMessage.includes('invalid request')) {
          throw new Error('Invalid request to Google Gemini API. The transcript might be too long.');
        }

        throw genError; // Re-throw to be caught by the outer catch block
      }

      throw genError; // Re-throw unknown errors
    }
  } catch (error) {
    console.error('Error generating summary with Google Gemini:', error);

    // Handle specific error types
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

      if (errorMessage.includes('api key') || errorMessage.includes('apikey') || errorMessage.includes('key not valid')) {
        throw new Error('Missing or invalid Google Gemini API key. Please check your .env file.');
      } else if (errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
        return summaryTemplate;
      } else if (errorMessage.includes('blocked') || errorMessage.includes('content filtered')) {
        return "The AI model couldn't generate a summary due to content filtering. Please try with different content.";
      } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
        throw new Error('Network error when connecting to Google Gemini API. Please check your internet connection.');
      }
    }

    // Fallback error message
    return "Failed to generate summary. Please try again with a different recording.";
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
  const maxRetries = 2; // Reduced retries to fail faster for fallback
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: pmGenerationConfig,
        safetySettings: pmSafetySettings as any,
      });
      const response = await result.response;
      return response.text();
    } catch (err: any) {
      const errorMsg = err?.message?.toLowerCase() || '';
      console.warn(`Gemini PM call attempt ${attempt + 1}/${maxRetries} failed:`, errorMsg);

      // Immediately fail for quota/rate limit errors to trigger fallback
      if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('limit exceeded')) {
        throw new Error('QUOTA_EXCEEDED');
      }

      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Gemini call failed after retries');
}

export async function transcribeWithGroqWhisper(audioBlob: Blob): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('No Groq API key found for transcription fallback');
  }

  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.m4a');
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'text');

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Groq Whisper error: ${response.statusText} ${JSON.stringify(errorData)}`);
    }

    return await response.text();
  } catch (error) {
    console.error('Groq Whisper transcription failed:', error);
    throw error;
  }
}

async function callGroqFallback(prompt: string, systemPrompt: string = "You are a helpful AI assistant."): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('No Groq API key found');
  }

  const url = `https://api.groq.com/openai/v1/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      model: "llama-3.1-8b-instant", // Fast, powerful, and free on Groq
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data = await response.json();
  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  throw new Error("Invalid response format from Groq API");
}

// ==================== TEMPLATE FALLBACKS ====================

const summaryTemplate = `> ⚠️ **AI Quota Exceeded:** Google Gemini API rate limit reached. Displaying a structured Meeting Summary template for manual entry. Please try generating with AI again in 1-2 minutes.

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

const prdTemplate = `> ⚠️ **AI Quota Exceeded:** Google Gemini API rate limit reached. Displaying a structured PRD template for manual entry. Please try generating with AI again in 1-2 minutes.

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

const userStoriesTemplate = `> ⚠️ **AI Quota Exceeded:** Google Gemini API rate limit reached. Displaying a structured User Stories template for manual entry. Please try generating with AI again in 1-2 minutes.

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

const sprintPlanTemplate = `> ⚠️ **AI Quota Exceeded:** Google Gemini API rate limit reached. Displaying a structured Sprint Plan template for manual entry. Please try generating with AI again in 1-2 minutes.

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

export async function generatePRD(productIdea: string): Promise<string> {
  try {
    if (!productIdea || productIdea.trim() === '') {
      return "Please provide a product or feature idea to generate a PRD.";
    }

    const prompt = `
You are an expert Product Manager. Generate a comprehensive Product Requirements Document (PRD) based on the following idea or meeting summary. Use clear markdown formatting.

**Core Idea/Context:** ${productIdea}

Structure the PRD with the following sections:
## 1. Executive Summary
Brief overview of the product/feature and its value proposition.

## 2. Problem Statement
What specific problem are we solving?

## 3. Goals & Success Metrics
What does success look like? Include specific, measurable KPIs.

## 4. Target Audience
Who are the primary and secondary users?

## 5. Key Features & Requirements
Detailed breakdown of features. Prioritize them (e.g., P0, P1, P2) or split into MVP vs. V2. Include acceptance criteria where relevant.

## 6. User Experience & Design
User flows, key screens, and overall UX principles.

## 7. Technical Considerations
High-level technical requirements, constraints, or dependencies.

## 8. Timeline & Milestones
Suggested phases with estimated timelines.

## 9. Risks & Mitigations
Potential risks and how to mitigate them.

## 10. Open Questions
Questions that need to be answered before or during development.

Be thorough, specific, and actionable. Write as if this PRD will be handed directly to an engineering team.
    `;

    try {
      return await callGemini(prompt);
    } catch (geminiError: any) {
      console.log('Gemini failed for PRD, attempting open fallback...', geminiError?.message);
      try {
        return await callGroqFallback(prompt, "You are an expert Product Manager. Please complete the following request clearly and concisely in Markdown format.");
      } catch (fallbackError) {
        console.error('Both AI providers failed for PRD:', fallbackError);
        return prdTemplate;
      }
    }
  } catch (error) {
    console.error('Error generating PRD:', error);
    return prdTemplate;
  }
}

export async function generateUserStories(featureDescription: string): Promise<string> {
  try {
    if (!featureDescription || featureDescription.trim() === '') {
      return "Please provide a feature description to generate user stories.";
    }

    const prompt = `
You are an expert Product Manager and Agile coach. Generate comprehensive user stories for the following feature. Use clear markdown formatting.

**Feature Description:** ${featureDescription}

For each user story, use this format:

### Story [number]: [Title]
**As a** [user role],
**I want** [capability/action],
**So that** [benefit/value].

**Acceptance Criteria:**
- [ ] [Specific, testable criterion 1]
- [ ] [Specific, testable criterion 2]
- [ ] [Specific, testable criterion 3]

**Priority:** [P0/P1/P2]
**Story Points:** [1/2/3/5/8/13]
**Labels:** [relevant labels like "frontend", "backend", "UX", etc.]

---

Generate at least 5-8 user stories covering:
- Core happy path flows
- Edge cases and error handling
- Admin/power user scenarios
- Accessibility considerations

Order stories by priority (P0 first). Be specific and testable in acceptance criteria. Each criterion should be independently verifiable.
    `;

    try {
      return await callGemini(prompt);
    } catch (geminiError: any) {
      console.log('Gemini failed for User Stories, attempting open fallback...', geminiError?.message);
      try {
        return await callGroqFallback(prompt, "You are an expert Product Manager and Agile coach. Please complete the following request clearly and concisely in Markdown format.");
      } catch (fallbackError) {
        console.error('Both AI providers failed for User Stories:', fallbackError);
        return userStoriesTemplate;
      }
    }
  } catch (error) {
    console.error('Error generating user stories:', error);
    return userStoriesTemplate;
  }
}

export async function generateSprintPlan(backlogItems: string, duration: string = '2 weeks'): Promise<string> {
  try {
    if (!backlogItems || backlogItems.trim() === '') {
      return "Please provide backlog items to generate a sprint plan.";
    }

    const prompt = `
You are an expert Agile Scrum Master and Product Manager. Create a structured sprint plan from the following backlog of items/ideas. Use clear markdown formatting.

**Backlog Items/Context:** ${backlogItems}

Please structure the sprint plan as follows:

## Sprint Goal
[A clear, concise 1-2 sentence goal for the sprint]

## Sprint Capacity & Assumptions
- Sprint Duration: ${duration}
- [Any other assumptions you make about team size/composition]

## Sprint Backlog
Present the selected items in a markdown table with the following columns:
| ID | Title | Priority | Status | Assignee Role | Story Points |

*Include 5-10 logical items broken down from the context provided.*

## Key Dependencies & Risks
Identify 2-3 potential risks or dependencies that could impact this sprint and propose mitigations.

## Daily Standup Focus
What should be the key areas of focus for the team during this sprint?

Be realistic with story point estimates. Total points should be achievable within the sprint duration for the team size.
    `;

    try {
      return await callGemini(prompt);
    } catch (geminiError: any) {
      console.log('Gemini failed for Sprint Plan, attempting open fallback...', geminiError?.message);
      try {
        return await callGroqFallback(prompt, "You are an expert Agile Scrum Master and Product Manager. Please complete the following request clearly and concisely in Markdown format.");
      } catch (fallbackError) {
        console.error('Both AI providers failed for Sprint Plan:', fallbackError);
        return sprintPlanTemplate;
      }
    }
  } catch (error) {
    console.error('Error generating sprint plan:', error);
    return sprintPlanTemplate;
  }
}

export async function analyzeFeaturePriority(featuresString: string): Promise<string> {
  try {
    if (!featuresString || featuresString.trim() === '') {
      throw new Error('Please provide features to analyze.');
    }

    const prompt = `
You are an expert Product Manager. Analyze and prioritize the following list of features. Use clear markdown formatting.

**Features to prioritize:**
${featuresString}

Please use the RICE scoring model framework (Reach, Impact, Confidence, Effort) to evaluate these features.

Output Requirements:
1. Provide a brief explanation of your prioritization strategy.
2. Present the prioritized list in a markdown table sorted from highest RICE score to lowest.
   Columns: | Feature | Reach (1-10) | Impact (1-5) | Confidence (%) | Effort (months) | RICE Score |
3. Add a short paragraph for the top 2 features explaining WHY they are the most critical.

Be data-driven and justify each score. Consider user impact, business value, and technical complexity.
    `;

    try {
      return await callGemini(prompt);
    } catch (geminiError: any) {
      console.log('Gemini failed for Feature Priority, attempting open fallback...', geminiError?.message);
      try {
        return await callGroqFallback(prompt, "You are an expert Product Manager. Please complete the following request clearly and concisely in Markdown format.");
      } catch (fallbackError) {
        console.error('Both AI providers failed for Feature Priority:', fallbackError);
        return "> ⚠️ **AI Quota Exceeded:** Unable to prioritize features via AI at this moment. Please wait 1-2 minutes for the quota to reset.";
      }
    }
  } catch (error) {
    console.error('Error analyzing feature priority:', error);
    throw new Error(error instanceof Error ? error.message : 'Failed to analyze feature priority. Please try again.');
  }
}
export async function queryKnowledge(query: string, history: any[]): Promise<string> {
  try {
    if (!query || query.trim() === '') {
      return "Please provide a question to ask the AI Memory.";
    }

    if (!history || history.length === 0) {
      return "No meeting history found to analyze. Please record or upload some meetings first!";
    }

    // Format the knowledge base from history safely
    let knowledgeBase = "";
    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      knowledgeBase += `\n--- MEETING #${i + 1} (${m.date || 'Unknown Date'}) ---\n${m.summary || m.content || 'No summary available'}\n`;
    }

    const knowledgePrompt = `
You are the "3.0 Agent" - a supreme Global Intelligence powered by 3.0 Labs. 
You are not just a chatbot; you are a world-class Product Strategist, Principal Software Architect, and Lead UI/UX Designer.

### YOUR CAPABILITIES:
1. **Perfect Context Memory**: You have access to the user's entire meeting history provided below.
2. **Deep Architectural Insight**: You can design complex system architectures, database schemas, and API structures.
3. **Premium Design Thinking**: You provide high-fidelity UI/UX suggestions, design tokens (HSL colors, spacing), and layout strategies that "WOW" the user.
4. **Strategic Critique**: You don't just agree; you analyze ideas for viability, suggest market positioning, and perform SWOT/RICE analyses where relevant.


**THE USER'S QUESTION:**
"${query}"

**YOUR KNOWLEDGE BASE (Meeting History):**
${knowledgeBase}

### OPERATIONAL INSTRUCTIONS:
1. **Context First**: If the query relates to past meetings, use the Knowledge Base as your source of truth.
2. **Design Depth**: 
   - If a UI/UX design is requested or relevant, provide specific visual descriptions.
   - Use CSS/Tailwind/React snippets for key components.
   - Suggest a premium color palette (e.g., "Deep Obsidian #0B0C10 with Electric Crimson #EF4444 accents").
3. **Architectural Complexity**:
   - For new ideas, suggest a technical stack (Node.js, Next.js, Supabase, Redis).
   - Provide a database schema or API endpoint map if appropriate.
4. **Visual UI Designs (PHOTOS)**:
   - When asked for a UI/UX design, you MUST provide a visual mockup as a "PHOTO" (image).
   - **CRITICAL**: Use the exact markdown syntax BELOW. DO NOT wrap it in code blocks. DO NOT use backticks. DO NOT indent it.
   - Syntax: ![Mockup](https://image.pollinations.ai/prompt/Descriptive+Prompt+With+Plus+Signs?width=1024&height=1024&nologo=true)
   - **IMPORTANT**: Replace spaces in the prompt with + characters.
   - Example: ![Fintech Dashboard](https://image.pollinations.ai/prompt/Premium+Fintech+Dashboard+Dark+Mode+Red+Accents+Glassmorphism?width=1024&height=1024&nologo=true)
   - Always follow the image with a description.
5. **Visual Logic (Mermaid.js)**:
   - Use flowcharts for processes or sequences.
   - **MUST USE QUOTED LABELS**.
   - Always use graph TD for vertical flow.
   - Example:
\`\`\`mermaid
graph TD
    A["Frontend"] --> B["API Gateway"]
    B --> C["Microservices"]
\`\`\`
5. **Depth of Response**: 
   - Use headers, tables, and bold text for readability.
   - Be thorough. If an idea is proposed, give a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats) automatically.
6. **Tone**: Premium, expert, helpful, and visionary. You are a partner in building 3.0 Labs.

### FORMATTING RULES:
- Use clean Markdown.
- Mermaid blocks must be followed by a brief explanation.
- Code blocks must specify the language.

Write your supreme response now:
    `;

    try {
      return await callGemini(knowledgePrompt);
    } catch (geminiError: any) {
      console.log('Gemini failed for Knowledge Chat, attempting open fallback...', geminiError?.message);
      if (geminiError.message === 'QUOTA_EXCEEDED' || geminiError.message.includes('429')) {
        try {
          return await callGroqFallback(knowledgePrompt, "You are 3.0 Labs Intelligence, a specialized PM AI Agent with perfect memory. IMPORTANT: If using Mermaid syntax, always quote node names with spaces. Answer all types of questions expertly.");
        } catch (fallbackError: any) {
          console.error('Both AI providers failed for Knowledge Chat:', fallbackError);
          return "I'm sorry, I'm currently having trouble accessing my memory banks (API limit reached). Please try again in 1-2 minutes.";
        }
      }
      throw geminiError;
    }
  } catch (error) {
    console.error('Error querying knowledge:', error);
    return "An error occurred while trying to access the AI memory. Please ensure your API keys are valid.";
  }
}
