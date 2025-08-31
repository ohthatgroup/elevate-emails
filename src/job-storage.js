const { getStore } = require('@netlify/blobs');

class JobStorage {
  constructor() {
    this.store = getStore('job-storage');
    this.storageKey = 'accumulated-jobs';
  }

  async getStoredJobs() {
    try {
      const storedData = await this.store.get(this.storageKey);
      
      if (!storedData) {
        console.log('No stored jobs found, returning empty array');
        return [];
      }
      
      const jobs = JSON.parse(storedData);
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
      await this.store.set(this.storageKey, JSON.stringify(updatedJobs));
      
      console.log(`Added ${uniqueNewJobs.length} unique jobs. Total: ${updatedJobs.length}`);
      return updatedJobs;
      
    } catch (error) {
      console.error('Error adding jobs to storage:', error);
      throw new Error(`Failed to store jobs: ${error.message}`);
    }
  }

  async clearJobs() {
    try {
      await this.store.delete(this.storageKey);
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
        await this.store.set(this.storageKey, JSON.stringify(recentJobs));
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