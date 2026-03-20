const RECALL_API_URL = '/api/recall';
const API_KEY = import.meta.env.VITE_RECALL_API_KEY;

export interface RecallBot {
  id: string;
  status: 'pending_join' | 'joining' | 'in_call' | 'done' | 'fatal' | 'left';
  meeting_url: string;
  bot_name: string;
  created_at: string;
  metadata?: Record<string, string>;
}

export const recallService = {
  /**
   * Create and send a bot to a meeting
   */
  async createBot(meetingUrl: string, botName: string = '3.0 Agent', metadata: Record<string, string> = {}): Promise<RecallBot> {
    if (!API_KEY) throw new Error('Recall API Key is missing in .env');

    console.log('Attempting to create bot:', { meetingUrl, botName, metadata, region: import.meta.env.VITE_RECALL_REGION });

    const response = await fetch(`${RECALL_API_URL}/bot/`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        meeting_url: meetingUrl,
        bot_name: botName,
        metadata: metadata
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        console.error('Failed to parse error response:', errorText);
      }
      
      console.error('Recall Bot Creation Failed:', {
        status: response.status,
        statusText: response.statusText,
        body: errorData
      });

      const isHtml = errorText.trim().startsWith('<');
      const message = (errorData as any).detail || (errorData as any).message
        || (isHtml ? `Check your Recall API key and region (${import.meta.env.VITE_RECALL_REGION || 'us-east-1'})` : errorText)
        || response.statusText;
      throw new Error(`Recall API Error (${response.status}): ${message}`);
    }

    return response.json();
  },

  /**
   * Get current status of a bot
   */
  async getBotStatus(botId: string): Promise<RecallBot> {
    if (!API_KEY) throw new Error('Recall API Key is missing in .env');

    const response = await fetch(`${RECALL_API_URL}/bot/${botId}/`, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch bot status: ${response.statusText}`);
    return response.json();
  },

  /**
   * Get the transcript for a completed bot session
   */
  async getBotTranscript(botId: string): Promise<any[]> {
    if (!API_KEY) throw new Error('Recall API Key is missing in .env');

    const response = await fetch(`${RECALL_API_URL}/bot/${botId}/transcript/`, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch transcript: ${response.statusText}`);
    return response.json();
  },

  /**
   * List recent bots (useful for syncing state on refresh)
   */
  async listBots(): Promise<{ results: RecallBot[] }> {
    if (!API_KEY) throw new Error('Recall API Key is missing in .env');

    const response = await fetch(`${RECALL_API_URL}/bot/`, {
      headers: {
        'Authorization': `Token ${API_KEY}`,
      },
    });

    if (!response.ok) throw new Error(`Failed to list bots: ${response.statusText}`);
    return response.json();
  },

  /**
   * Format Recall transcript into the application's transcript format
   */
  formatTranscript(recallTranscript: any[]): string {
    return recallTranscript
      .map(entry => {
        const speaker = entry.speaker || 'Unknown';
        const text = entry.words.map((w: any) => w.text).join(' ');
        return `[${speaker}]: ${text}`;
      })
      .join('\n\n');
  }
};
