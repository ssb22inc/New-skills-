import type { SeekerProfile } from '@/types/user'
import type { PersonalityProfile } from '@/types/user'

export function scorePersonality(
  seeker: SeekerProfile
): { score: number; details: string[] } {
  const personality = seeker.personality as Partial<PersonalityProfile>
  const details: string[] = []

  if (!personality || !personality.confidence || personality.confidence < 0.5) {
    return { score: 70, details: ['Personality profile incomplete'] }
  }

  // High conscientiousness = reliable tenant
  if ((personality.conscientiousness ?? 50) >= 70) {
    details.push('High conscientiousness indicates reliable tenant habits')
  }

  // High agreeableness = good neighbor
  if ((personality.agreeableness ?? 50) >= 70) {
    details.push('High agreeableness suggests cooperative living style')
  }

  // Balanced score based on "landlord-favorable" traits
  const reliabilityScore = (
    (personality.conscientiousness ?? 50) * 0.5 +
    (personality.agreeableness ?? 50) * 0.3 +
    (100 - (personality.neuroticism ?? 50)) * 0.2
  )

  const score = Math.round(reliabilityScore)
  return { score: Math.min(100, score), details }
}
