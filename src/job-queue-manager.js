import { getStore } from '@netlify/blobs';

class JobQueueManager {
  constructor() {
    this.storageKey = 'job-queue';
    this.store = null;
    this.useBlobs = false;
    this.fallbackStorage = {};
  }

  async getStore() {
    if (this.store) return this.store;
    
    try {
      console.log('🔄 Initializing Netlify Blobs store for job queue...');
      
      this.store = getStore('job-queue', {
        siteID: '448fec77-521b-4a59-84c2-d745b8b9d2c4',
        token: process.env.NETLIFY_AUTH_TOKEN
      });
      this.useBlobs = true;
      console.log('✅ Job queue store initialized with manual config');
      return this.store;
      
    } catch (error) {
      console.error('❌ Blobs initialization failed:', error.message);
      console.log('📝 Falling back to in-memory storage');
      this.useBlobs = false;
      return null;
    }
  }

  async getJobQueue() {
    try {
      const store = await this.getStore();
      
      if (store) {
        console.log('📥 Reading job queue from Netlify Blobs...');
        const queueData = await store.get(this.storageKey, { type: 'json' });
        if (queueData) {
          return this.normalizeQueueData(queueData);
        }
      }
      
      console.log('📝 Using fallback storage for queue');
      const queueData = this.fallbackStorage[this.storageKey];
      return this.normalizeQueueData(queueData);
      
    } catch (error) {
      console.error('Error retrieving job queue:', error);
      return this.getEmptyQueue();
    }
  }

  normalizeQueueData(data) {
    if (!data) return this.getEmptyQueue();
    
    return {
      jobQueue: Array.isArray(data.jobQueue) ? data.jobQueue : [],
      lastProcessed: data.lastProcessed || new Date().toISOString(),
      emailsSent: data.emailsSent || 0,
      totalJobsProcessed: data.totalJobsProcessed || 0
    };
  }

  getEmptyQueue() {
    return {
      jobQueue: [],
      lastProcessed: new Date().toISOString(),
      emailsSent: 0,
      totalJobsProcessed: 0
    };
  }

  async addNewJobs(jobMetadata) {
    if (!Array.isArray(jobMetadata) || jobMetadata.length === 0) {
      console.log('No new job metadata to add to queue');
      return await this.getJobQueue();
    }

    try {
      const queueData = await this.getJobQueue();
      const existingGuids = new Set(queueData.jobQueue.map(job => job.guid));
      
      const newJobs = jobMetadata
        .filter(job => {
          if (!job.guid) {
            console.warn('Job missing GUID, skipping:', job.title || 'unknown');
            return false;
          }
          return !existingGuids.has(job.guid);
        })
        .map(job => ({
          guid: job.guid,
          jobNumber: job.jobNumber || null,
          pubDate: job.pubDate || new Date().toISOString(),
          status: 'pending',
          discoveredAt: new Date().toISOString(),
          applyUrl: job.applyUrl
        }));

      if (newJobs.length === 0) {
        console.log('No unique new jobs to add to queue');
        return queueData;
      }

      queueData.jobQueue.push(...newJobs);
      queueData.totalJobsProcessed += newJobs.length;
      queueData.lastProcessed = new Date().toISOString();

      await this.saveQueueData(queueData);
      
      console.log(`Added ${newJobs.length} new jobs to queue. Total pending: ${this.getPendingCount(queueData)}`);
      return queueData;
      
    } catch (error) {
      console.error('Error adding jobs to queue:', error);
      throw new Error(`Failed to add jobs to queue: ${error.message}`);
    }
  }

  async getNextBatch(count = 10) {
    try {
      const queueData = await this.getJobQueue();
      const pendingJobs = queueData.jobQueue
        .filter(job => job.status === 'pending')
        .sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));

      const batchJobs = pendingJobs.slice(0, count);
      console.log(`Retrieved ${batchJobs.length} jobs for next batch (FIFO by pubDate)`);
      
      return batchJobs;
      
    } catch (error) {
      console.error('Error getting next batch:', error);
      return [];
    }
  }

  async markAsSent(guids) {
    if (!Array.isArray(guids) || guids.length === 0) {
      console.log('No GUIDs provided to mark as sent');
      return false;
    }

    try {
      const queueData = await this.getJobQueue();
      const guidSet = new Set(guids);
      let markedCount = 0;

      queueData.jobQueue.forEach(job => {
        if (guidSet.has(job.guid) && job.status === 'pending') {
          job.status = 'sent';
          job.sentAt = new Date().toISOString();
          markedCount++;
        }
      });

      if (markedCount > 0) {
        queueData.emailsSent += 1;
        queueData.lastProcessed = new Date().toISOString();
        await this.saveQueueData(queueData);
        console.log(`Marked ${markedCount} jobs as sent. Total emails sent: ${queueData.emailsSent}`);
      }

      return markedCount > 0;
      
    } catch (error) {
      console.error('Error marking jobs as sent:', error);
      throw new Error(`Failed to mark jobs as sent: ${error.message}`);
    }
  }

  async saveQueueData(queueData) {
    const store = await this.getStore();
    if (store) {
      console.log('💾 Saving queue data to Netlify Blobs...');
      await store.setJSON(this.storageKey, queueData);
      console.log('✅ Queue data saved to Blobs');
    } else {
      console.log('💾 Saving queue data to fallback storage...');
      this.fallbackStorage[this.storageKey] = queueData;
    }
  }

  getPendingCount(queueData = null) {
    if (!queueData) return 0;
    return queueData.jobQueue.filter(job => job.status === 'pending').length;
  }

  async getQueueStats() {
    try {
      const queueData = await this.getJobQueue();
      const pendingJobs = queueData.jobQueue.filter(job => job.status === 'pending');
      const sentJobs = queueData.jobQueue.filter(job => job.status === 'sent');
      
      const stats = {
        totalJobs: queueData.jobQueue.length,
        pendingJobs: pendingJobs.length,
        sentJobs: sentJobs.length,
        neededForEmail: Math.max(0, 10 - pendingJobs.length),
        emailsSent: queueData.emailsSent,
        totalJobsProcessed: queueData.totalJobsProcessed,
        lastProcessed: queueData.lastProcessed,
        oldestPendingJob: null,
        newestPendingJob: null
      };

      if (pendingJobs.length > 0) {
        const sortedPending = pendingJobs
          .sort((a, b) => new Date(a.pubDate) - new Date(b.pubDate));
        stats.oldestPendingJob = sortedPending[0].pubDate;
        stats.newestPendingJob = sortedPending[sortedPending.length - 1].pubDate;
      }

      return stats;
      
    } catch (error) {
      console.error('Error getting queue stats:', error);
      return {
        totalJobs: 0,
        pendingJobs: 0,
        sentJobs: 0,
        neededForEmail: 10,
        emailsSent: 0,
        totalJobsProcessed: 0,
        lastProcessed: null,
        oldestPendingJob: null,
        newestPendingJob: null,
        error: error.message
      };
    }
  }

  async cleanupOldJobs(daysOld = 90) {
    try {
      const queueData = await this.getJobQueue();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);
      
      const originalCount = queueData.jobQueue.length;
      queueData.jobQueue = queueData.jobQueue.filter(job => {
        if (job.status === 'pending') return true;
        if (!job.sentAt) return true;
        const jobDate = new Date(job.sentAt);
        return jobDate > cutoffDate;
      });

      const removedCount = originalCount - queueData.jobQueue.length;
      if (removedCount > 0) {
        await this.saveQueueData(queueData);
        console.log(`Cleaned up ${removedCount} old sent jobs (older than ${daysOld} days)`);
      }

      return queueData;
      
    } catch (error) {
      console.error('Error cleaning up old jobs:', error);
      return await this.getJobQueue();
    }
  }
}

export default JobQueueManager;