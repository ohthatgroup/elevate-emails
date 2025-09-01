import { schedule } from '@netlify/functions';
import RSSParserV2 from '../../src/rss-parser-v2.js';
import JobQueueManager from '../../src/job-queue-manager.js';
import EmailServiceV2 from '../../src/email-service-v2.js';

const schedulerHandler = async (event, context) => {
  console.log('🚀 Job email scheduler V2 triggered at:', new Date().toISOString());
  
  try {
    const rssParser = new RSSParserV2();
    const jobQueue = new JobQueueManager();
    const emailService = new EmailServiceV2();
    
    console.log('📊 Getting current queue stats...');
    const initialStats = await jobQueue.getQueueStats();
    console.log(`Current queue: ${initialStats.pendingJobs} pending, ${initialStats.sentJobs} sent, ${initialStats.emailsSent} emails sent total`);
    
    console.log('📥 Fetching new job metadata from RSS...');
    const jobMetadata = await rssParser.fetchJobMetadata();
    console.log(`Found ${jobMetadata.length} jobs in RSS feed`);
    
    if (jobMetadata.length === 0) {
      console.log('No jobs found in RSS feed, ending process');
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'No jobs found in RSS feed',
          queueStats: initialStats 
        })
      };
    }
    
    console.log('📝 Adding new jobs to queue...');
    const updatedQueue = await jobQueue.addNewJobs(jobMetadata);
    const pendingCount = jobQueue.getPendingCount(updatedQueue);
    console.log(`Queue updated: ${pendingCount} pending jobs`);
    
    const jobThreshold = parseInt(process.env.JOB_THRESHOLD) || 10;
    if (pendingCount >= jobThreshold) {
      console.log(`✅ Threshold reached (${pendingCount} >= ${jobThreshold}), preparing to send email`);
      
      const jobsForEmail = await jobQueue.getNextBatch(jobThreshold);
      console.log(`📧 Selected ${jobsForEmail.length} jobs for email (FIFO by pubDate)`);
      
      if (jobsForEmail.length > 0) {
        console.log(`📅 Date range: ${jobsForEmail[0].pubDate} to ${jobsForEmail[jobsForEmail.length - 1].pubDate}`);
        
        const jobGuids = jobsForEmail.map(job => job.guid);
        const emailResult = await emailService.sendJobEmail(jobGuids, jobQueue);
        
        console.log(`✅ Email campaign sent successfully: ${emailResult.campaignId}`);
        
        const finalStats = await jobQueue.getQueueStats();
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Email campaign sent successfully',
            campaignId: emailResult.campaignId,
            jobsSent: emailResult.jobCount,
            guidsProcessed: emailResult.guidsProcessed,
            queueUpdated: emailResult.queueUpdated,
            finalStats: finalStats
          })
        };
      } else {
        console.log('⚠️ No jobs retrieved for email batch');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Threshold reached but no jobs available for email',
            pendingJobs: pendingCount
          })
        };
      }
    }
    
    console.log(`⏳ Threshold not reached: ${pendingCount}/${jobThreshold} jobs`);
    
    const finalStats = await jobQueue.getQueueStats();
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Jobs added to queue, waiting for threshold',
        pendingJobs: pendingCount,
        needed: Math.max(0, jobThreshold - pendingCount),
        queueStats: finalStats
      })
    };
    
  } catch (error) {
    console.error('❌ Job scheduler V2 error:', error);
    
    if (process.env.ADMIN_EMAIL) {
      try {
        const emailService = new EmailServiceV2();
        await emailService.sendErrorNotification(error);
      } catch (emailError) {
        console.error('Failed to send error notification:', emailError);
      }
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Job scheduler V2 failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

export const handler = schedule('0 9 * * *', schedulerHandler);