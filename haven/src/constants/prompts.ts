// Re-export from lib for convenience
export { SYSTEM_PROMPTS, buildListingPrompt, buildPhotoAnalysisPrompt } from '@/lib/openai/prompts'

export const ONBOARDING_MESSAGES = {
  SEEKER_WELCOME: `Hi! I'm Haven's AI assistant, and I'm here to help you find your perfect home. I'll ask you a few questions to understand what you're looking for. Let's start—what brings you to Haven? Are you relocating for work, looking for a temporary home, or something else?`,

  LANDLORD_WELCOME: `Welcome to Haven! I'm here to help you create a compelling listing that attracts the right tenants. Tell me about your property—what type of place is it and where is it located?`,
}
