import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const MODEL = 'gpt-4o'
export const VISION_MODEL = 'gpt-4o'
export const EMBEDDING_MODEL = 'text-embedding-3-small'
