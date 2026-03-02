import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SeekerOnboardingData } from '@/types/user'

interface OnboardingState {
  step: number
  userType: 'seeker' | 'landlord' | null
  seekerData: Partial<SeekerOnboardingData>
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>
  setStep: (step: number) => void
  setUserType: (type: 'seeker' | 'landlord') => void
  updateSeekerData: (data: Partial<SeekerOnboardingData>) => void
  addChatMessage: (message: { role: 'user' | 'assistant'; content: string }) => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      step: 0,
      userType: null,
      seekerData: {},
      chatHistory: [],
      setStep: (step) => set({ step }),
      setUserType: (userType) => set({ userType }),
      updateSeekerData: (data) =>
        set((state) => ({ seekerData: { ...state.seekerData, ...data } })),
      addChatMessage: (message) =>
        set((state) => ({ chatHistory: [...state.chatHistory, message] })),
      reset: () => set({ step: 0, userType: null, seekerData: {}, chatHistory: [] }),
    }),
    { name: 'haven-onboarding' }
  )
)
