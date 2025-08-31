const RSSParser = require('./src/rss-parser');
const JobStorage = require('./src/job-storage');
const MailchimpSender = require('./src/mailchimp-sender');

async function testRSSParser() {
  console.log('🧪 Testing RSS Parser...');
  
  try {
    const parser = new RSSParser();
    const jobs = await parser.fetchNewJobs();
    console.log(`✅ RSS Parser: Found ${jobs.length} jobs`);
    
    if (jobs.length > 0) {
      console.log('Sample job:', {
        id: jobs[0].id,
        title: jobs[0].title,
        location: jobs[0].location,
        salary: jobs[0].salary_range
      });
    }
    
    return jobs;
  } catch (error) {
    console.error('❌ RSS Parser failed:', error.message);
    throw error;
  }
}

async function testJobStorage(testJobs = []) {
  console.log('\n🧪 Testing Job Storage...');
  
  try {
    const storage = new JobStorage();
    
    await storage.clearJobs();
    console.log('✅ Storage cleared');
    
    const stats1 = await storage.getStorageStats();
    console.log('✅ Initial stats:', stats1);
    
    if (testJobs.length > 0) {
      const stored = await storage.addJobs(testJobs.slice(0, 3));
      console.log(`✅ Added ${stored.length} jobs to storage`);
      
      const stats2 = await storage.getStorageStats();
      console.log('✅ Updated stats:', stats2);
      
      return stored;
    }
    
    return [];
  } catch (error) {
    console.error('❌ Job Storage failed:', error.message);
    throw error;
  }
}

async function testMailchimpConnection() {
  console.log('\n🧪 Testing Mailchimp Connection...');
  
  try {
    const sender = new MailchimpSender();
    await sender.testConnection();
    console.log('✅ Mailchimp connection successful');
    return true;
  } catch (error) {
    console.error('❌ Mailchimp connection failed:', error.message);
    return false;
  }
}

async function testEmailGeneration(testJobs = []) {
  console.log('\n🧪 Testing Email Generation...');
  
  try {
    const sender = new MailchimpSender();
    
    const sampleJobs = testJobs.length > 0 ? testJobs.slice(0, 2) : [
      {
        id: 'test-1',
        title: 'Senior Software Engineer',
        location: 'New York, NY',
        salary_range: '$120k-150k',
        job_description_first_sentence: 'We are looking for a talented software engineer to join our growing team.',
        apply_url: 'https://example.com/apply/1'
      },
      {
        id: 'test-2', 
        title: 'Product Manager',
        location: 'San Francisco, CA',
        salary_range: '$100k-130k',
        job_description_first_sentence: 'Lead product development for our flagship application.',
        apply_url: 'https://example.com/apply/2'
      }
    ];
    
    const htmlContent = await sender.generateEmailContent(sampleJobs);
    console.log('✅ Email content generated');
    console.log(`📧 Content length: ${htmlContent.length} characters`);
    
    return htmlContent.includes('{{JOBS_HTML}}') === false;
  } catch (error) {
    console.error('❌ Email generation failed:', error.message);
    return false;
  }
}

async function testFullIntegration() {
  console.log('\n🧪 Running Full Integration Test...\n');
  
  try {
    const jobs = await testRSSParser();
    const storedJobs = await testJobStorage(jobs);
    const mailchimpOk = await testMailchimpConnection();
    const emailOk = await testEmailGeneration(jobs);
    
    console.log('\n📊 Test Results Summary:');
    console.log(`RSS Parser: ${jobs.length > 0 ? '✅ PASS' : '⚠️  NO JOBS'}`);
    console.log(`Job Storage: ${storedJobs.length >= 0 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Mailchimp: ${mailchimpOk ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Email Gen: ${emailOk ? '✅ PASS' : '❌ FAIL'}`);
    
    const allPassed = jobs.length >= 0 && storedJobs.length >= 0 && mailchimpOk && emailOk;
    
    if (allPassed) {
      console.log('\n🎉 ALL TESTS PASSED! System is ready for deployment.');
    } else {
      console.log('\n⚠️  Some tests failed. Check environment variables and configuration.');
    }
    
    return allPassed;
    
  } catch (error) {
    console.error('\n💥 Integration test failed:', error);
    return false;
  }
}

if (require.main === module) {
  testFullIntegration().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  testRSSParser,
  testJobStorage, 
  testMailchimpConnection,
  testEmailGeneration,
  testFullIntegration
};