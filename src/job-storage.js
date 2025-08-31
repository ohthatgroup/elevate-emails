const { getStore } = require('@netlify/blobs');

class JobStorage {
  constructor() {
    this.storageKey = 'accumulated-jobs';
    
    // Debug environment variables
    console.log('🔍 Environment check:');
    console.log('  NETLIFY_FUNCTIONS_URL:', process.env.NETLIFY_FUNCTIONS_URL || 'undefined');
    console.log('  AWS_LAMBDA_FUNCTION_NAME:', process.env.AWS_LAMBDA_FUNCTION_NAME || 'undefined');
    console.log('  NETLIFY:', process.env.NETLIFY || 'undefined');
    console.log('  NETLIFY_SITE_ID:', process.env.NETLIFY_SITE_ID || 'undefined');
    
    try {
      console.log('🔄 Attempting to initialize Netlify Blobs...');
      this.store = getStore('job-storage');
      this.useBlobs = true;
      console.log('✅ Netlify Blobs initialized successfully');
    } catch (error) {
      console.error('❌ Netlify Blobs initialization failed:', error.name, error.message);
      console.log('📝 Falling back to in-memory storage');
      this.useBlobs = false;
      this.fallbackStorage = {};
    }
  }

  async getStoredJobs() {
    try {
      let storedData;
      
      if (this.useBlobs) {
        storedData = await this.store.get(this.storageKey);
      } else {
        storedData = this.fallbackStorage[this.storageKey];
      }
      
      if (!storedData) {
        console.log('No stored jobs found, returning empty array');
        return [];
      }
      
      const jobs = typeof storedData === 'string' ? JSON.parse(storedData) : storedData;
      console.log(`Retrieved ${jobs.length} stored jobs`);
      return Array.isArray(jobs) ? jobs : [];
      
    } catch (error) {
      console.error('Error retrieving stored jobs:', error);
      return [];
    }
  }

  async addJobs(newJobs) {
    if (!Array.isArray(newJobs) || newJobs.length === 0) {
      console.log('No new jobs to add');
      return await this.getStoredJobs();
    }

    try {
      const existingJobs = await this.getStoredJobs();
      const existingJobIds = new Set(existingJobs.map(job => job.id));
      
      const uniqueNewJobs = newJobs.filter(job => {
        if (!job.id) {
          console.warn('Job missing ID, skipping:', job.title);
          return false;
        }
        return !existingJobIds.has(job.id);
      });

      if (uniqueNewJobs.length === 0) {
        console.log('No unique new jobs to add');
        return existingJobs;
      }

      const updatedJobs = [...existingJobs, ...uniqueNewJobs];
      
      if (this.useBlobs) {
        await this.store.set(this.storageKey, JSON.stringify(updatedJobs));
      } else {
        this.fallbackStorage[this.storageKey] = updatedJobs;
      }
      
      console.log(`Added ${uniqueNewJobs.length} unique jobs. Total: ${updatedJobs.length}`);
      return updatedJobs;
      
    } catch (error) {
      console.error('Error adding jobs to storage:', error);
      throw new Error(`Failed to store jobs: ${error.message}`);
    }
  }

  async clearJobs() {
    try {
      if (this.useBlobs) {
        await this.store.delete(this.storageKey);
      } else {
        delete this.fallbackStorage[this.storageKey];
      }
      console.log('Job storage cleared successfully');
      return true;
      
    } catch (error) {
      console.error('Error clearing job storage:', error);
      throw new Error(`Failed to clear job storage: ${error.message}`);
    }
  }

  async getJobCount() {
    try {
      const jobs = await this.getStoredJobs();
      return jobs.length;
      
    } catch (error) {
      console.error('Error getting job count:', error);
      return 0;
    }
  }

  async removeOldJobs(daysOld = 30) {
    try {
      const jobs = await this.getStoredJobs();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const recentJobs = jobs.filter(job => {
        if (!job.parsed_at) return true;
        const jobDate = new Date(job.parsed_at);
        return jobDate > cutoffDate;
      });

      if (recentJobs.length !== jobs.length) {
        if (this.useBlobs) {
          await this.store.set(this.storageKey, JSON.stringify(recentJobs));
        } else {
          this.fallbackStorage[this.storageKey] = recentJobs;
        }
        console.log(`Removed ${jobs.length - recentJobs.length} old jobs`);
      }

      return recentJobs;
      
    } catch (error) {
      console.error('Error removing old jobs:', error);
      return await this.getStoredJobs();
    }
  }

  async getStorageStats() {
    try {
      const jobs = await this.getStoredJobs();
      const stats = {
        totalJobs: jobs.length,
        neededForEmail: Math.max(0, 10 - jobs.length),
        oldestJob: null,
        newestJob: null,
        storageSize: JSON.stringify(jobs).length
      };

      if (jobs.length > 0) {
        const sortedByDate = jobs
          .filter(job => job.parsed_at)
          .sort((a, b) => new Date(a.parsed_at) - new Date(b.parsed_at));
        
        if (sortedByDate.length > 0) {
          stats.oldestJob = sortedByDate[0].parsed_at;
          stats.newestJob = sortedByDate[sortedByDate.length - 1].parsed_at;
        }
      }

      return stats;
      
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return {
        totalJobs: 0,
        neededForEmail: 10,
        oldestJob: null,
        newestJob: null,
        storageSize: 0,
        error: error.message
      };
    }
  }
}

module.exports = JobStorage;