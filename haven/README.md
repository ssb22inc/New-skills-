# Haven - AI-Powered Housing Platform

Haven is a modern housing platform designed specifically for travel nurses and healthcare professionals seeking temporary, furnished housing. It features intelligent matching algorithms, AI-powered listing creation, and comprehensive verification systems.

## Features

### For Housing Seekers
- **AI-Powered Matching**: Smart compatibility scoring based on lifestyle, personality, and preferences
- **Conversational Onboarding**: Chat-based interface to gather preferences naturally
- **Personality Assessment**: OCEAN model personality profiling for better roommate matching
- **Document Verification**: Automated income and identity verification
- **Saved Searches**: Track preferences and get notified of new matches

### For Landlords
- **Voice-to-Listing**: Create listings by simply describing your property
- **AI Photo Analysis**: Automatic room detection, quality assessment, and feature extraction
- **Smart Pricing**: Market-based pricing suggestions using local rental data
- **Instant Messaging**: Built-in chat system for communicating with potential tenants
- **Bulk Import**: Import existing listings from other platforms

### Core Technologies
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Supabase** for database, authentication, and storage
- **OpenAI** for AI features (GPT-4, Vision, Embeddings, Whisper)
- **Stripe** for payments and payouts
- **Tailwind CSS** for styling
- **Zustand** for state management

## Project Structure

```
haven/
├── src/
│   ├── app/              # Next.js app router pages
│   ├── components/       # React components
│   ├── lib/             # Core libraries and utilities
│   ├── services/        # Business logic and AI services
│   ├── hooks/           # Custom React hooks
│   ├── stores/          # Zustand state stores
│   ├── types/           # TypeScript type definitions
│   └── constants/       # App constants and configuration
├── supabase/
│   ├── migrations/      # Database migrations
│   └── config.toml      # Supabase configuration
└── prisma/
    └── schema.prisma    # Prisma schema (optional, using Supabase primarily)
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- OpenAI API key
- Stripe account (for payments)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd haven
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your API keys:
- Supabase URL and keys (from your Supabase project settings)
- OpenAI API key
- Stripe keys

4. Set up the database:

If using Supabase Cloud:
- Create a new project on supabase.com
- Run the migration in the SQL editor: `supabase/migrations/001_initial_schema.sql`

If using local Supabase:
```bash
npx supabase start
npx supabase db reset
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Database Schema

The database includes comprehensive tables for:
- **User Management**: Profiles, seeker profiles, landlord profiles
- **Listings**: Properties, photos, amenities
- **Matching**: AI-powered compatibility scores
- **Bookings**: Reservations and payments
- **Messaging**: Real-time conversations
- **Reviews**: Two-way rating system
- **Verifications**: Identity and income verification
- **Analytics**: Event tracking and user behavior

See `supabase/migrations/001_initial_schema.sql` for the complete schema.

## AI Features

### Listing Creation
- **Voice-to-Text**: Use OpenAI Whisper to transcribe property descriptions
- **Photo Analysis**: GPT-4 Vision analyzes photos to extract room types, features, and quality
- **Auto-Generation**: Generate compelling listing descriptions from basic details
- **Smart Pricing**: Suggest competitive prices based on market data

### Matching Algorithm
- **Lifestyle Scoring**: Match based on sleep schedules, cleanliness, noise tolerance
- **Personality Compatibility**: OCEAN model personality assessment
- **Location Preferences**: Commute time calculations and neighborhood matching
- **Trust Scoring**: Verification status and user history
- **ML Refinement**: Learn from user interactions to improve matches

### Onboarding
- **Conversational UI**: Natural chat interface for gathering preferences
- **Document Verification**: AI-powered verification of IDs and income documents
- **Personality Quiz**: Interactive assessment for better matching

## API Routes

### AI Services
- `/api/ai/analyze-photos` - Analyze property photos
- `/api/ai/generate-listing` - Auto-generate listing content
- `/api/ai/voice-to-listing` - Convert voice to listing
- `/api/ai/chat` - Conversational onboarding
- `/api/ai/verify-document` - Document verification
- `/api/ai/suggest-pricing` - Market-based pricing

### Data Services
- `/api/listings` - CRUD operations for listings
- `/api/matches` - Get and score matches
- `/api/users` - User profile management
- `/api/payments` - Stripe integration

## Development

### Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run db:migrate` - Run database migrations

### Code Style
- TypeScript strict mode enabled
- ESLint with Next.js recommended config
- Prettier for code formatting (recommended)

## Deployment

### Vercel (Recommended)
1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Environment Variables for Production
Ensure all environment variables from `.env.local.example` are set in your deployment platform.

## Security

- Row Level Security (RLS) enabled on all Supabase tables
- API routes protected with authentication middleware
- Environment variables for sensitive keys
- Input validation using Zod schemas
- XSS and SQL injection protection

## Contributing

This project is part of a technical exercise. For production use:
1. Update dependencies to latest stable versions
2. Add comprehensive error handling
3. Implement rate limiting
4. Add monitoring and logging (e.g., Sentry)
5. Set up CI/CD pipelines
6. Add comprehensive test coverage

## License

MIT License - see LICENSE file for details

## Support

For questions or issues:
- Check the documentation in `/docs` (coming soon)
- Open an issue on GitHub
- Contact the development team

---

**Status**: Initial Setup Complete ✅

Next steps: Implement core components and API routes (see Part 2 of the project package)
