# IntervAI Backend

A comprehensive NestJS backend for the IntervAI AI-powered interview platform.

## Features

- 🔐 **JWT Authentication** with single-device session enforcement
- 👥 **Role-based Access Control** (Company/Candidate)
- 📋 **Job Management** with proctoring configuration
- 🎥 **Interview Sessions** with real-time transcript saving
- 👁️ **Proctoring System** with incident logging and auto-termination
- 🤖 **AI Evaluation** using Google Gemini
- 💳 **Subscription Plans** (Free/Pro/Ultra) with feature gating
- 📧 **Email Notifications** for interview invitations
- 📄 **Resume Upload** with text extraction

## Tech Stack

- **Runtime:** Node.js with NestJS
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** JWT + Passport
- **AI:** Google Gemini API
- **Email:** Resend API

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Set up database:**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

4. **Start development server:**
   ```bash
   npm run start:dev
   ```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `JWT_SECRET` | Secret key for JWT signing | ✅ |
| `JWT_EXPIRATION` | Token expiration (default: 7d) | ❌ |
| `APP_URL` | Frontend URL for email links | ✅ |
| `PORT` | Server port (default: 3001) | ❌ |
| `RESEND_API_KEY` | Resend API key for email delivery | ✅ |
| `MAIL_FROM` | From email address (must be verified in Resend) | ✅ |
| `MAIL_FROM_NAME` | From name for emails (default: IntervAI) | ❌ |
| `MAIL_ENABLED` | Enable/disable email sending (default: true) | ❌ |
| `GEMINI_API_KEY` | Google Gemini API key | ✅ |
| `STRIPE_SECRET_KEY` | Stripe API key (optional) | ❌ |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/logout` - Logout and invalidate session

### Jobs (Company only)
- `POST /api/jobs` - Create new job
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs/:id/candidates` - Invite candidates
- `GET /api/jobs/:id/analytics` - Get job analytics

### Interviews
- `GET /api/interviews/token/:token` - Get interview by token (public)
- `POST /api/interviews/:token/start` - Start interview session
- `POST /api/interviews/:id/transcript` - Save response
- `POST /api/interviews/:id/proctoring` - Log proctoring event
- `POST /api/interviews/:id/complete` - Complete interview
- `GET /api/interviews/:id/evaluation` - Get evaluation

### Billing
- `GET /api/billing/status` - Get subscription status
- `POST /api/billing/subscribe` - Upgrade plan

### Upload
- `POST /api/upload/resume` - Upload resume
- `GET /api/upload/resume/:id` - Get resume text

## Subscription Plans

| Feature | Free | Pro | Ultra |
|---------|------|-----|-------|
| Candidates per job | 30 | Unlimited | Unlimited |
| Tab tracking | ✅ | ✅ | ✅ |
| Eye tracking | ❌ | ✅ | ✅ |
| Multi-face detection | ❌ | ❌ | ✅ |
| Screen recording | ❌ | ❌ | ✅ |
| Priority AI scoring | ❌ | ❌ | ✅ |

## Development

```bash
# Run in development mode
npm run start:dev

# Run in debug mode
npm run start:debug

# Build for production
npm run build

# Run production build
npm run start:prod
```

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name migration_name

# Deploy migrations (production)
npx prisma migrate deploy

# Open Prisma Studio
npx prisma studio
```

## Project Structure

```
src/
├── auth/               # Authentication module
│   ├── decorators/     # Custom decorators
│   ├── dto/            # Data transfer objects
│   └── guards/         # Auth guards
├── billing/            # Subscription management
├── common/             # Shared services
│   ├── email.service   # Email sending
│   └── gemini.service  # AI evaluation
├── interviews/         # Interview sessions
├── jobs/               # Job management
├── prisma/             # Database service
└── upload/             # File uploads
```

## License

Proprietary - All rights reserved
