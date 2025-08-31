const RSSParser = require('../../src/rss-parser');
const MailchimpSender = require('../../src/mailchimp-sender');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  console.log('🧪 Testing with latest 10 jobs...');
  
  try {
    // Initialize Blobs store directly in handler - no configuration needed
    console.log('🔄 Initializing job storage...');
    const jobStore = getStore('job-storage');
    console.log('✅ Job store initialized');
    
    const rssParser = new RSSParser();
    const mailchimpSender = new MailchimpSender();
    
    // Clear existing storage first
    try {
      await jobStore.delete('accumulated-jobs');
      console.log('✅ Cleared existing job storage');
    } catch (e) {
      console.log('ℹ️ No existing storage to clear');
    }
    
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
    
    // Store jobs directly in Blobs
    console.log('💾 Storing jobs in Blobs...');
    await jobStore.setJSON('accumulated-jobs', latestJobs);
    console.log(`✅ Stored ${latestJobs.length} jobs in Blobs`);
    
    // Generate HTML email content instead of sending
    console.log('📧 Generating email HTML...');
    const htmlContent = await mailchimpSender.generateEmailContent(latestJobs);
    
    // Clear storage after test
    await jobStore.delete('accumulated-jobs');
    console.log('🧹 Cleared storage after test');
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: htmlContent
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