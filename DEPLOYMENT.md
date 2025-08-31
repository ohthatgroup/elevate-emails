# Deployment Guide - Elevate Automated Job Email System

## Pre-Deployment Checklist

### ✅ Required Environment Variables
Set these in Netlify Dashboard → Site Settings → Environment Variables:

```
CRELATE_RSS_URL=https://jobs.crelate.com/portal/landausg/rss
MAILCHIMP_API_KEY=your-mailchimp-api-key
MAILCHIMP_SERVER_PREFIX=us5
MAILCHIMP_LIST_ID=your-list-id
ADMIN_EMAIL=admin@elevatecareer.com
EMAIL_SUBJECT=New Job Opportunities from Elevate Career Group
```

### ✅ Netlify Configuration
- Functions configured in `netlify.toml`
- Cron scheduling: `0 9 * * *` (daily at 9 AM UTC)
- External modules: `@netlify/blobs`, `@mailchimp/mailchimp_marketing`

## Deployment Steps

### 1. Connect Repository
```bash
netlify init
# OR connect via Netlify Dashboard
```

### 2. Configure Build Settings
- Build command: `npm run build` 
- Functions directory: `netlify/functions`
- Publish directory: `.`

### 3. Set Environment Variables
```bash
netlify env:set CRELATE_RSS_URL "https://jobs.crelate.com/portal/landausg/rss"
netlify env:set MAILCHIMP_API_KEY "your-key-here"
netlify env:set MAILCHIMP_SERVER_PREFIX "us5"
netlify env:set MAILCHIMP_LIST_ID "your-list-id"
netlify env:set ADMIN_EMAIL "admin@elevatecareer.com"
```

### 4. Deploy
```bash
npm run deploy
```

## Post-Deployment Verification

### Test Function Manually
```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/job-email-scheduler
```

### Check Function Logs
- Netlify Dashboard → Functions → job-email-scheduler → Logs
- Look for successful RSS parsing and job storage

### Verify Cron Schedule
- Functions tab should show "Scheduled" status
- Next execution time displayed

## Monitoring & Maintenance

### Key Metrics to Monitor
1. **Function Execution**: Daily at 9 AM UTC
2. **Job Storage**: Accumulation toward 10-job threshold  
3. **Email Campaigns**: Successful Mailchimp delivery
4. **Error Notifications**: Admin email alerts for failures

### Common Issues & Solutions

**RSS Feed Timeout**
- Increase function timeout in `netlify.toml`
- Add retry logic for network failures

**Mailchimp API Limits**
- Monitor API quota usage
- Implement exponential backoff

**Storage Issues**
- Clear old jobs periodically
- Monitor Netlify Blob usage

### Update Process
1. Make changes to repository
2. Push to connected branch
3. Netlify auto-deploys
4. Verify function logs

## Success Indicators

✅ Function executes daily without errors  
✅ New jobs are parsed and stored correctly  
✅ Email campaigns sent when 10 jobs accumulated  
✅ Admin receives error notifications when needed  
✅ Job storage cleared after successful email send  

## Support Contacts

- **Technical Issues**: Check function logs first
- **RSS Feed Issues**: Verify Crelate feed URL accessibility
- **Email Delivery**: Check Mailchimp campaign status
- **Urgent Issues**: Monitor admin email for error notifications