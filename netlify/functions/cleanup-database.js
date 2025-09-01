import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  console.log('🧹 Database cleanup utility triggered...');
  console.log('Query params:', context.url?.searchParams?.toString());
  
  try {
    const store = getStore('job-queue', {
      siteID: '448fec77-521b-4a59-84c2-d745b8b9d2c4',
      token: process.env.NETLIFY_AUTH_TOKEN
    });
    
    console.log('🔄 Initializing Netlify Blobs store for cleanup...');
    
    // Get current state before cleanup
    let currentData = null;
    try {
      currentData = await store.get('job-queue', { type: 'json' });
      console.log(`📊 Current queue state: ${currentData?.jobQueue?.length || 0} jobs`);
    } catch (e) {
      console.log('ℹ️ No existing data to clean');
    }
    
    // Clear the database
    await store.delete('job-queue');
    console.log('✅ Job queue database cleared');
    
    // Verify cleanup
    try {
      const verifyData = await store.get('job-queue', { type: 'json' });
      if (verifyData) {
        console.log('⚠️ Data still exists after cleanup');
      } else {
        console.log('✅ Cleanup verified - database is empty');
      }
    } catch (e) {
      console.log('✅ Cleanup verified - no data found');
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Database cleaned successfully',
      previousState: {
        totalJobs: currentData?.jobQueue?.length || 0,
        pendingJobs: currentData?.jobQueue?.filter(j => j.status === 'pending').length || 0,
        sentJobs: currentData?.jobQueue?.filter(j => j.status === 'sent').length || 0,
        emailsSent: currentData?.emailsSent || 0,
        lastProcessed: currentData?.lastProcessed || null
      },
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    
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