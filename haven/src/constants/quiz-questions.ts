export interface QuizQuestion {
  id: string
  category: string
  question: string
  type: 'single' | 'multi' | 'scale' | 'text'
  options?: Array<{ value: string; label: string; emoji?: string }>
  scale?: { min: number; max: number; minLabel: string; maxLabel: string }
  maps_to: string
}

export const LIFESTYLE_QUESTIONS: QuizQuestion[] = [
  {
    id: 'sleep_schedule',
    category: 'lifestyle',
    question: 'What\'s your typical sleep schedule?',
    type: 'single',
    options: [
      { value: 'early_bird', label: 'Early Bird', emoji: '🌅' },
      { value: 'night_owl', label: 'Night Owl', emoji: '🦉' },
      { value: 'flexible', label: 'It varies', emoji: '🌙' },
    ],
    maps_to: 'lifestyle.sleep_schedule',
  },
  {
    id: 'noise_tolerance',
    category: 'lifestyle',
    question: 'How would you describe your noise tolerance at home?',
    type: 'scale',
    scale: {
      min: 1,
      max: 10,
      minLabel: 'Need complete quiet',
      maxLabel: 'Fine with lots of noise',
    },
    maps_to: 'lifestyle.noise_tolerance',
  },
  {
    id: 'cleanliness',
    category: 'lifestyle',
    question: 'How would you rate your cleanliness standards?',
    type: 'scale',
    scale: {
      min: 1,
      max: 10,
      minLabel: 'Very relaxed',
      maxLabel: 'Spotless always',
    },
    maps_to: 'lifestyle.cleanliness',
  },
  {
    id: 'guest_frequency',
    category: 'lifestyle',
    question: 'How often do you have guests over?',
    type: 'single',
    options: [
      { value: 'never', label: 'Rarely or never', emoji: '🏠' },
      { value: 'rarely', label: 'A few times a month', emoji: '👥' },
      { value: 'sometimes', label: 'Weekly', emoji: '🎉' },
      { value: 'often', label: 'Multiple times a week', emoji: '🎊' },
    ],
    maps_to: 'lifestyle.guest_frequency',
  },
  {
    id: 'work_from_home',
    category: 'lifestyle',
    question: 'Do you work from home?',
    type: 'single',
    options: [
      { value: 'true', label: 'Yes, full-time remote', emoji: '💻' },
      { value: 'hybrid', label: 'Hybrid (some days)', emoji: '🏢' },
      { value: 'false', label: 'No, in-office', emoji: '🚗' },
    ],
    maps_to: 'lifestyle.work_from_home',
  },
]

export const PERSONALITY_STATEMENTS = [
  { id: 'p1', statement: 'I enjoy trying new experiences and ideas.', maps_to: 'openness' },
  { id: 'p2', statement: 'I like to keep my space organized and tidy.', maps_to: 'conscientiousness' },
  { id: 'p3', statement: 'I get energized by being around people.', maps_to: 'extraversion' },
  { id: 'p4', statement: 'I find it easy to see things from others\' perspectives.', maps_to: 'agreeableness' },
  { id: 'p5', statement: 'I tend to stay calm in stressful situations.', maps_to: 'neuroticism', reverse: true },
  { id: 'p6', statement: 'I prefer spontaneity over planning ahead.', maps_to: 'openness' },
  { id: 'p7', statement: 'I always follow through on my commitments.', maps_to: 'conscientiousness' },
  { id: 'p8', statement: 'I enjoy quiet evenings at home more than going out.', maps_to: 'extraversion', reverse: true },
]
