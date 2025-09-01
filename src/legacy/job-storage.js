import { getStore } from '@netlify/blobs';

class JobStorage {
  constructor() {
    this.storageKey = 'accumulated-jobs';
    this.store = null;
    this.useBlobs = false;
    this.fallbackStorage = {};
  }

  async getStore() {
    if (this.store) return this.store;
    
    try {
      console.log('🔄 Initializing Netlify Blobs store...');
      
      // Manual configuration with siteID and token
      this.store = getStore('job-storage', {
        siteID: '448fec77-521b-4a59-84c2-d745b8b9d2c4',
        token: process.env.NETLIFY_AUTH_TOKEN
      });
      this.useBlobs = true;
      console.log('✅ Netlify Blobs store initialized with manual config');
      return this.store;
      
    } catch (error) {
      console.error('❌ Blobs initialization failed:', error.message);
      console.log('📝 Falling back to in-memory storage');
      this.useBlobs = false;
      return null;
    }
  }

  async getStoredJobs() {
    try {
      const store = await this.getStore();
      
      if (store) {
        console.log('📥 Reading jobs from Netlify Blobs...');
        const jobs = await store.get(this.storageKey, { type: 'json' });
        if (jobs) {
          console.log(`📦 Retrieved ${jobs.length} stored jobs from Blobs`);
          return Array.isArray(jobs) ? jobs : [];
        }
      }
      
      console.log('📝 Using fallback storage');
      const jobs = this.fallbackStorage[this.storageKey] || [];
      console.log(`📦 Retrieved ${jobs.length} stored jobs from fallback`);
      return jobs;
      
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
      
      const store = await this.getStore();
      if (store) {
        console.log('💾 Saving jobs to Netlify Blobs...');
        await store.setJSON(this.storageKey, updatedJobs);
        console.log('✅ Jobs saved to Blobs');
      } else {
        console.log('💾 Saving jobs to fallback storage...');
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
      const store = await this.getStore();
      if (store) {
        console.log('🗑️ Clearing jobs from Netlify Blobs...');
        await store.delete(this.storageKey);
        console.log('✅ Blobs storage cleared');
      } else {
        console.log('🗑️ Clearing fallback storage...');
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

export default JobStorage;