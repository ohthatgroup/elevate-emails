import RSSParserV2 from '../../src/rss-parser-v2.js';
import JobQueueManager from '../../src/job-queue-manager.js';
import EmailServiceV2 from '../../src/email-service-v2.js';

export default async (req, context) => {
  console.log('🧪 Testing with V2 architecture...');
  console.log('Environment variables:', Object.keys(process.env).filter(key => key.includes('NETLIFY')));
  console.log('Context keys:', Object.keys(context || {}));
  
  try {
    const rssParser = new RSSParserV2();
    const jobQueue = new JobQueueManager();
    const emailService = new EmailServiceV2();
    
    console.log('📊 Getting current queue stats...');
    let queueStats = await jobQueue.getQueueStats();
    console.log(`Current queue: ${queueStats.pendingJobs} pending, ${queueStats.sentJobs} sent, ${queueStats.emailsSent} total emails sent`);
    
    console.log('📥 Fetching job metadata from RSS...');
    const jobMetadata = await rssParser.fetchJobMetadata();
    console.log(`📋 Found ${jobMetadata.length} jobs in RSS feed`);
    
    if (jobMetadata.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'No jobs found in RSS feed',
        queueStats: queueStats
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('📝 Adding job metadata to queue...');
    const updatedQueue = await jobQueue.addNewJobs(jobMetadata);
    const pendingCount = jobQueue.getPendingCount(updatedQueue);
    console.log(`📦 Queue updated: ${pendingCount} pending jobs`);
    
    queueStats = await jobQueue.getQueueStats();
    console.log(`📈 Queue stats: ${queueStats.totalJobs} total, ${queueStats.pendingJobs} pending, ${queueStats.sentJobs} sent`);
    
    const jobThreshold = 10;
    if (pendingCount >= jobThreshold) {
      console.log(`✅ Threshold reached (${pendingCount} >= ${jobThreshold}), preparing test email`);
      
      const jobsForEmail = await jobQueue.getNextBatch(jobThreshold);
      console.log(`📧 Selected ${jobsForEmail.length} jobs for email (FIFO by pubDate)`);
      
      if (jobsForEmail.length > 0) {
        console.log(`📅 Date range: ${jobsForEmail[0].pubDate} to ${jobsForEmail[jobsForEmail.length - 1].pubDate}`);
        console.log(`🏷️ Job GUIDs: ${jobsForEmail.map(j => j.guid.substring(0, 8)).join(', ')}...`);
        
        console.log('🔄 Fetching fresh job details for email content...');
        const jobGuids = jobsForEmail.map(job => job.guid);
        const jobs = await rssParser.fetchJobDetails(jobGuids);
        console.log(`📋 Retrieved ${jobs.length} job details for email`);
        
        if (jobs.length > 0) {
          console.log(`🎯 Sample jobs: ${jobs.slice(0, 3).map(j => j.title.substring(0, 30)).join(', ')}...`);
          
          const htmlContent = await emailService.generateEmailContent(jobs);
          console.log('✅ Generated email HTML content');
          
          // SIMULATE EMAIL SEND: Mark these jobs as sent in the queue
          console.log('📤 Simulating email send - marking jobs as sent...');
          const jobGuids = jobsForEmail.map(job => job.guid);
          const markResult = await jobQueue.markAsSent(jobGuids);
          console.log(`✅ Marked ${jobGuids.length} jobs as sent: ${markResult}`);
          
          const finalStats = await jobQueue.getQueueStats();
          console.log(`📊 Updated queue: ${finalStats.pendingJobs} pending, ${finalStats.sentJobs} sent`);
          
          return new Response(htmlContent, {
            status: 200,
            headers: { 
              'Content-Type': 'text/html',
              'X-Jobs-Count': jobs.length.toString(),
              'X-Jobs-Sent': 'true',
              'X-Queue-Stats': JSON.stringify(finalStats)
            }
          });
        } else {
          console.log('⚠️ No job details found for selected jobs');
          return new Response(JSON.stringify({
            success: false,
            message: 'No job details found for selected jobs',
            selectedGuids: jobGuids.length,
            queueStats: queueStats
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        console.log('⚠️ No jobs retrieved for email batch');
        return new Response(JSON.stringify({
          success: false,
          message: 'Threshold reached but no jobs available for email',
          pendingJobs: pendingCount,
          queueStats: queueStats
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      const needed = jobThreshold - pendingCount;
      const statusMessage = `Not enough jobs yet. Have ${pendingCount}, need ${needed} more for email.`;
      console.log(`⏳ ${statusMessage}`);
      
      const sampleJobs = await jobQueue.getNextBatch(Math.min(pendingCount, 5));
      
      return new Response(JSON.stringify({
        success: false,
        message: statusMessage,
        currentCount: pendingCount,
        needed: needed,
        queueStats: queueStats,
        sampleJobs: sampleJobs.map(job => ({
          guid: job.guid.substring(0, 8) + '...',
          jobNumber: job.jobNumber,
          pubDate: job.pubDate,
          status: job.status
        }))
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
  } catch (error) {
    console.error('❌ Test V2 failed:', error);
    
    if (process.env.ADMIN_EMAIL) {
      try {
        const emailService = new EmailServiceV2();
        await emailService.sendErrorNotification(error);
      } catch (emailError) {
        console.error('Failed to send error notification:', emailError);
      }
    }
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};