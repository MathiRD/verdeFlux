# VerdeFlux

VerdeFlux is a modern personal finance dashboard built with Next.js. It provides a responsive landing page, financial metrics, income and expense tracking, recurring transactions, budget views, import/export tools, and report-ready data flows.

The app includes real authentication with NextAuth, Google OAuth, and email/password accounts backed by PostgreSQL. The finance dashboard is ready for use in the browser and stores entries per authenticated user while the remaining production step is moving every dashboard action from browser storage to persisted Prisma records.

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Prisma 7
- PostgreSQL
- NextAuth.js
- Framer Motion
- Recharts
- XLSX, CSV and JSON import/export helpers

## Requirements

- Node.js 20+
- npm
- PostgreSQL database, such as Neon
- Google OAuth credentials, if using Google sign-in

## Environment Variables

Create a `.env.local` file based on `.env.example`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/finance_app?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="change-me-with-a-random-secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Generate a secure NextAuth secret:

```bash
npx auth secret
```

Or generate one manually:

```bash
openssl rand -base64 32
```

## Google OAuth

Create an OAuth client in Google Cloud Console:

1. Open Google Cloud Console.
2. Configure the OAuth consent screen.
3. Go to Credentials.
4. Create an OAuth Client ID.
5. Choose Web application.
6. Add the redirect URIs.

Local redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

Production redirect URI:

```text
https://your-vercel-domain.vercel.app/api/auth/callback/google
```

Copy the generated values into your environment:

```env
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"
```

## Local Development

Install dependencies:

```bash
npm install
```

Generate the Prisma client:

```bash
npm run db:generate
```

Push the schema to your database:

```bash
npm run db:push
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:deploy
npm run db:studio
npm run db:clean
```

`npm run db:clean` truncates the application tables in the configured PostgreSQL database. Use it only when you intentionally want to wipe the current data.

## Deploying to Vercel

1. Push this repository to GitHub.
2. Create a new Vercel project from the GitHub repository.
3. Keep the framework preset as Next.js.
4. Add the required environment variables in Vercel.
5. Deploy.

Required production variables:

```env
DATABASE_URL="your-production-postgres-url"
NEXTAUTH_URL="https://your-vercel-domain.vercel.app"
NEXTAUTH_SECRET="your-random-secret"
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
```

The build script runs Prisma generation automatically:

```bash
prisma generate && next build
```

If you add a custom domain later, update both `NEXTAUTH_URL` and the Google OAuth redirect URI.

## Current Production Notes

- Email/password registration and login are backed by PostgreSQL.
- Google OAuth is available when the Google credentials are configured.
- Prisma, PostgreSQL models, NextAuth, and initial API routes are available.
- Full server-side persistence for every finance dashboard action still needs the UI connected to the database API.
- Import/export and PDF-style printing are available from the UI flow.
