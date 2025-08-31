const RSSParser = require('../../src/rss-parser');
const JobStorage = require('../../src/job-storage');
const MailchimpSender = require('../../src/mailchimp-sender');

exports.handler = async (event, context) => {
  console.log('🧪 Testing with latest 10 jobs...');
  
  try {
    const rssParser = new RSSParser();
    const jobStorage = new JobStorage();
    const mailchimpSender = new MailchimpSender();
    
    // Clear existing storage first
    await jobStorage.clearJobs();
    console.log('✅ Cleared existing job storage');
    
    // Fetch latest jobs from RSS
    const allJobs = await rssParser.fetchNewJobs();
    console.log(`📥 Fetched ${allJobs.length} jobs from RSS feed`);
    
    if (allJobs.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: false,
          message: 'No jobs found in RSS feed'
        })
      };
    }
    
    // Take the first 10 jobs
    const latestJobs = allJobs.slice(0, 10);
    console.log(`📋 Selected ${latestJobs.length} jobs for testing`);
    
    // Add jobs to storage
    const storedJobs = await jobStorage.addJobs(latestJobs);
    console.log(`💾 Stored ${storedJobs.length} jobs`);
    
    // Force send email with these 10 jobs
    console.log('📧 Sending test email campaign...');
    const campaignResult = await mailchimpSender.sendJobCampaign(storedJobs);
    
    // Clear storage after sending
    await jobStorage.clearJobs();
    console.log('🧹 Cleared storage after test');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'Test completed successfully',
        jobsProcessed: storedJobs.length,
        campaignId: campaignResult.campaignId,
        jobTitles: storedJobs.map(job => job.title),
        sentAt: campaignResult.sentAt
      })
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    // Send error notification if admin email is configured
    if (process.env.ADMIN_EMAIL) {
      try {
        const mailchimpSender = new MailchimpSender();
        await mailchimpSender.sendErrorNotification(error);
      } catch (emailError) {
        console.error('Failed to send error notification:', emailError);
      }
    }
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      })
    };
  }
};