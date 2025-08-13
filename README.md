# Elevate Career Group - Automated Job Email System

An automated system that monitors job postings via RSS feed and sends HTML email campaigns when 10 new jobs accumulate.

## Features

- **Automated RSS Monitoring**: Checks Crelate RSS feed every 24 hours
- **Job Accumulation**: Stores new jobs until 10 are collected
- **Email Campaigns**: Sends branded HTML emails via Mailchimp API
- **Duplicate Prevention**: Prevents re-processing of existing jobs
- **Error Handling**: Comprehensive logging and error recovery

## Tech Stack

- **Runtime**: Netlify Functions (Node.js 18+)
- **Scheduling**: Netlify cron jobs
- **Storage**: Netlify Blob Store
- **Email Service**: Mailchimp API

## Setup Instructions

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `CRELATE_RSS_URL`: Your Crelate RSS feed URL
- `MAILCHIMP_API_KEY`: Your Mailchimp API key
- `MAILCHIMP_SERVER_PREFIX`: Your Mailchimp server prefix (e.g., us5)
- `MAILCHIMP_LIST_ID`: Your Mailchimp audience list ID

### 2. Install Dependencies

```bash
npm install
```

### 3. Local Development

```bash
npm run dev
```

### 4. Deploy to Netlify

1. Connect your GitHub repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy:

```bash
npm run deploy
```

## Project Structure

```
/
├── netlify/
│   └── functions/
│       └── job-email-scheduler.js    # Main scheduled function
├── src/
│   ├── email-template.html          # HTML email template
│   ├── rss-parser.js               # RSS feed parsing logic
│   ├── job-storage.js              # Job storage management
│   └── mailchimp-sender.js         # Mailchimp integration
├── package.json
├── netlify.toml                    # Netlify configuration
├── .env.example                    # Environment variables template
└── README.md
```

## How It Works

1. **Daily Check**: Netlify cron job runs every 24 hours at 9 AM UTC
2. **RSS Parsing**: Fetches and parses new jobs from Crelate RSS feed
3. **Job Storage**: Stores unique jobs until 10 accumulate
4. **Email Trigger**: When 10 jobs are collected, generates HTML email
5. **Email Send**: Sends campaign via Mailchimp API
6. **Reset**: Clears job storage after successful send

## Brand Guidelines

### Colors
- Primary: #5D4299 (purple)
- Accent: #61CE70 (green)
- Secondary: #A7A9AC (grey)
- Text: #7A7A7A
- Background: #F3F7FB

### Typography
- Headings: Roboto 600
- Subheadings: Roboto Slab 400
- Body: Roboto 400

## Job Data Format

Each job includes:
- `location`: Job location (e.g., "Brooklyn, NY")
- `salary_range`: Salary range (e.g., "$85–100k")
- `job_description_first_sentence`: Brief job description
- `apply_url`: Direct application link

## Error Handling

The system includes:
- RSS parsing error recovery
- Mailchimp API failure handling
- Network timeout retries
- Admin email notifications on critical failures
- Comprehensive logging

## Support

For technical issues or questions, contact the development team.
