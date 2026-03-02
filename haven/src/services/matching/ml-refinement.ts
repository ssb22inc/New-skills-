import { openai, EMBEDDING_MODEL } from '@/lib/openai/client'
import { createAdminClient } from '@/lib/supabase/admin'

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  return response.data[0].embedding
}

export async function refineSimilarityScore(
  seekerEmbedding: number[],
  listingEmbedding: number[],
  baseScore: number
): Promise<{ score: number; adjustment: number; confidence: number }> {
  // Cosine similarity between embeddings
  const similarity = cosineSimilarity(seekerEmbedding, listingEmbedding)
  const adjustment = Math.round((similarity - 0.5) * 20) // -10 to +10
  const refinedScore = Math.min(100, Math.max(0, baseScore + adjustment))

  return {
    score: refinedScore,
    adjustment,
    confidence: Math.abs(similarity - 0.5) * 2, // 0-1 confidence
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (magA * magB)
}

export async function updateSeekerEmbedding(
  userId: string,
  profileText: string
): Promise<void> {
  const embedding = await generateEmbedding(profileText)
  const supabase = createAdminClient()
  await supabase
    .from('seeker_profiles')
    .update({ profile_embedding: embedding })
    .eq('user_id', userId)
}
