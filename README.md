# Email Scraper - Website Email Extractor with Persistent Processing

A modern email scraping tool built with Next.js that can extract emails from websites uploaded via a Google Sheet. This tool features persistent background processing, allowing you to close your browser and return later to see your results.

## Features

- 🔐 User authentication with email/password
- 📊 Dashboard to monitor scraping jobs
- 📈 Real-time progress tracking
- 🔄 Background processing (continue even when browser is closed)
- 📋 Import websites from Google Sheets
- 📥 Download results as CSV
- 📱 Responsive design
- ☁️ Deploy to Vercel

## Tech Stack

- Next.js & React
- TypeScript
- Tailwind CSS 
- NextAuth.js for authentication
- Prisma ORM
- PostgreSQL database
- Vercel for deployment

## Getting Started

### Prerequisites

- Node.js 16+
- PostgreSQL database

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/email-scraper.git
   cd email-scraper
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   ```
   cp .env.local.example .env.local
   ```
   
   Edit the `.env.local` file with your own values:
   
   ```
   # Authentication
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-nextauth-secret-replace-in-production

   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/email_scraper"
   ```

4. Set up the database:
   ```
   npx prisma migrate dev --name init
   ```

5. Run the development server:
   ```
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

1. Create a Vercel account if you don't have one
2. Import your GitHub repository
3. Set up environment variables in Vercel:
   - `NEXTAUTH_URL`: Your production URL
   - `NEXTAUTH_SECRET`: A secure random string
   - `DATABASE_URL`: Your PostgreSQL connection string (use Vercel PostgreSQL or another provider)
4. Deploy

## How It Works

1. Sign up/Login to the platform
2. Enter a Google Sheet URL containing website URLs
3. Select the column containing the URLs
4. Start the scraping process
5. Monitor progress or close the browser and come back later
6. Download results as CSV or view them in the platform

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License. 