import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
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
    model: options?.model || 'gpt-4-turbo-preview',
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 2000,
    response_format: options?.response_format,
  });
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const file = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });
  const response = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
  });
  return response.text;
}

export default openai;
