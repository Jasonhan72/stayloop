# Stayloop 🏠

AI-powered tenant screening platform for Ontario landlords.

## Features
- 📋 Online tenant application forms with shareable links
- 🤖 AI scoring using Claude API (income ratio, employment, rental history)
- ⚖️ LTB record search via CanLII API
- 🔒 PIPEDA & Ontario Human Rights Code compliant
- 📊 Landlord dashboard with real-time analytics

## Tech Stack
- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: Supabase (PostgreSQL + Auth + RLS)
- **AI**: Anthropic Claude API
- **LTB Records**: CanLII API
- **Deployment**: Cloudflare Pages

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in your API keys
npm run dev
```

## Environment Variables
See `.env.example` for required variables.

## Database Schema
Run `/supabase/schema.sql` against your Supabase project.
