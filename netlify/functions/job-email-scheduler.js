const { schedule } = require('@netlify/functions');
const RSSParser = require('../../src/rss-parser');
const JobStorage = require('../../src/job-storage');
const MailchimpSender = require('../../src/mailchimp-sender');

const handler = async (event, context) => {
  console.log('Job email scheduler triggered at:', new Date().toISOString());
  
  try {
    const rssParser = new RSSParser();
    const jobStorage = new JobStorage();
    const mailchimpSender = new MailchimpSender();
    
    const newJobs = await rssParser.fetchNewJobs();
    console.log(`Found ${newJobs.length} new jobs`);
    
    if (newJobs.length === 0) {
      console.log('No new jobs found, ending process');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'No new jobs found' })
      };
    }
    
    const storedJobs = await jobStorage.addJobs(newJobs);
    console.log(`Total stored jobs: ${storedJobs.length}`);
    
    if (storedJobs.length >= 10) {
      console.log('Threshold reached, sending email campaign');
      await mailchimpSender.sendJobCampaign(storedJobs);
      await jobStorage.clearJobs();
      console.log('Email sent and jobs cleared');
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Email campaign sent successfully',
          jobsSent: storedJobs.length
        })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Jobs added to storage',
        totalJobs: storedJobs.length,
        needMore: 10 - storedJobs.length
      })
    };
    
  } catch (error) {
    console.error('Job scheduler error:', error);
    
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
      body: JSON.stringify({
        error: 'Job scheduler failed',
        message: error.message
      })
    };
  }
};

exports.handler = schedule('0 9 * * *', handler);