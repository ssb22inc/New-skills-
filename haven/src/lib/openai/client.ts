import OpenAI from 'openai';

// Lazily construct the client so importing this module (e.g. during
// `next build` page-data collection) doesn't require OPENAI_API_KEY.
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop) {
    const client = getClient();
    const value = client[prop as keyof OpenAI];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export const MODEL = 'gpt-4o';
export const VISION_MODEL = 'gpt-4o';
export const EMBEDDING_MODEL = 'text-embedding-3-small';

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

export async function createChatCompletion(
  messages: OpenAI.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: 'json_object' } | { type: 'text' };
  }
) {
  return openai.chat.completions.create({
    model: options?.model || MODEL,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2000,
    response_format: options?.response_format,
  });
}

export async function transcribeAudio(audioBuffer: Blob): Promise<string> {
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
  });
  return response.text;
}
