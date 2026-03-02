import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { OnboardingState, LifestyleProfile, PersonalityProfile } from '@/types/user';

interface OnboardingStore extends OnboardingState {
  setStep: (step: number) => void;
  setUserType: (type: 'seeker' | 'landlord' | 'both') => void;
  updateBasicInfo: (info: Partial<OnboardingState['basicInfo']>) => void;
  updateHousingPreferences: (prefs: Partial<OnboardingState['housingPreferences']>) => void;
  updateLifestyle: (lifestyle: Partial<LifestyleProfile>) => void;
  updatePersonality: (personality: Partial<PersonalityProfile>) => void;
  reset: () => void;
}

const initialState: OnboardingState = {
  step: 0,
  userType: null,
  basicInfo: {},
  housingPreferences: {},
  lifestyle: {},
  personality: {},
  verification: {},
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      ...initialState,
      setStep: (step) => set({ step }),
      setUserType: (userType) => set({ userType }),
      updateBasicInfo: (info) =>
        set((state) => ({ basicInfo: { ...state.basicInfo, ...info } })),
      updateHousingPreferences: (prefs) =>
        set((state) => ({ housingPreferences: { ...state.housingPreferences, ...prefs } })),
      updateLifestyle: (lifestyle) =>
        set((state) => ({ lifestyle: { ...state.lifestyle, ...lifestyle } })),
      updatePersonality: (personality) =>
        set((state) => ({ personality: { ...state.personality, ...personality } })),
      reset: () => set(initialState),
    }),
    { name: 'haven-onboarding' }
  )
);
