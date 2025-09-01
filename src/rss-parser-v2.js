import Parser from 'rss-parser';
import { v4 as uuidv4 } from 'uuid';

class RSSParserV2 {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['description', 'description'],
          ['pubDate', 'pubDate'],
          ['link', 'link'],
          ['title', 'title'],
          ['crelate:location', 'crelateLocation'],
          ['crelate:jobNumber', 'crelateJobNumber'],
          ['crelate:salary', 'crelateSalary'],
          ['crelate:hours', 'crelateHours'],
          ['guid', 'guid']
        ]
      }
    });
    this.rssUrl = process.env.CRELATE_RSS_URL;
  }

  async fetchJobMetadata() {
    if (!this.rssUrl) {
      throw new Error('CRELATE_RSS_URL environment variable is required');
    }

    try {
      console.log('Fetching RSS feed metadata from:', this.rssUrl);
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        console.log('No items found in RSS feed');
        return [];
      }

      const metadata = feed.items
        .map(item => this.extractJobMetadata(item))
        .filter(job => job !== null);
      
      console.log(`Extracted ${metadata.length} job metadata from ${feed.items.length} items`);
      return metadata;
      
    } catch (error) {
      console.error('RSS metadata fetch error:', error);
      throw new Error(`Failed to fetch RSS metadata: ${error.message}`);
    }
  }

  extractJobMetadata(item) {
    try {
      if (!item.title || !item.link) {
        console.warn('Skipping item missing title or link');
        return null;
      }

      let guid = item.guid || item.link;
      
      if (typeof guid === 'object' && guid._) {
        guid = guid._;
      }
      
      if (!guid || typeof guid !== 'string') {
        guid = uuidv4();
        console.warn('Generated fallback GUID for job:', item.title.substring(0, 50));
      }

      return {
        guid: guid,
        jobNumber: item.crelateJobNumber || null,
        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        applyUrl: item.link,
        title: this.cleanText(item.title)
      };
      
    } catch (error) {
      console.error('Error extracting job metadata:', error, item);
      return null;
    }
  }

  async fetchJobDetails(guids) {
    if (!Array.isArray(guids) || guids.length === 0) {
      throw new Error('No GUIDs provided for job details fetch');
    }

    try {
      console.log(`Fetching fresh job details for ${guids.length} GUIDs`);
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        throw new Error('No items found in RSS feed for job details');
      }

      const guidSet = new Set(guids);
      const matchedJobs = [];

      for (const item of feed.items) {
        let itemGuid = item.guid || item.link;
        
        if (typeof itemGuid === 'object' && itemGuid._) {
          itemGuid = itemGuid._;
        }

        if (guidSet.has(itemGuid)) {
          const jobDetails = this.parseJobDetails(item);
          if (jobDetails) {
            matchedJobs.push(jobDetails);
          }
        }
      }

      console.log(`Found ${matchedJobs.length} job details from ${guids.length} requested GUIDs`);
      
      if (matchedJobs.length < guids.length) {
        const foundGuids = new Set(matchedJobs.map(job => job.guid));
        const missingGuids = guids.filter(guid => !foundGuids.has(guid));
        console.warn(`Missing job details for GUIDs: ${missingGuids.join(', ')}`);
      }

      return matchedJobs;
      
    } catch (error) {
      console.error('RSS job details fetch error:', error);
      throw new Error(`Failed to fetch job details: ${error.message}`);
    }
  }

  parseJobDetails(item) {
    try {
      if (!item.title || !item.link) {
        console.warn('Skipping job details for item missing title or link');
        return null;
      }

      let guid = item.guid || item.link;
      
      if (typeof guid === 'object' && guid._) {
        guid = guid._;
      }

      const job = {
        guid: guid,
        id: guid,
        title: this.cleanText(item.title),
        location: item.crelateLocation || this.extractLocation(item.title, item.description),
        salary_range: item.crelateSalary || this.extractSalaryRange(item.title, item.description),
        hours: item.crelateHours || this.extractHours(item.title, item.description),
        job_number: item.crelateJobNumber || null,
        job_description_first_sentence: this.extractFirstSentence(item.description),
        apply_url: item.link,
        published_date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        parsed_at: new Date().toISOString()
      };

      return job;
      
    } catch (error) {
      console.error('Error parsing job details:', error, item);
      return null;
    }
  }

  cleanText(text) {
    if (!text) return '';
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractLocation(title, description) {
    const text = `${title} ${this.cleanText(description || '')}`;
    
    const locationPatterns = [
      /<span[^>]*location[^>]*>([^<]+)</i,
      /location[:\s]*<[^>]*>([^<]+)</i,
      /(?:location|based in|located in|in|at)[\s:]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2,3})/i,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2,3})/,
      /([A-Z][a-z]+,\s*[A-Z]{2})/
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const location = this.cleanText(match[1]).trim();
        if (location.length > 3 && location.length < 50) {
          return location;
        }
      }
    }

    return 'Location not specified';
  }

  extractSalaryRange(title, description) {
    const text = `${title} ${this.cleanText(description || '')}`;
    
    const salaryPatterns = [
      /<span[^>]*salary[^>]*>([^<]+)</i,
      /salary[:\s]*<[^>]*>([^<]+)</i,
      /\$(\d{2,3})[k\,]?\s*[-–—]\s*\$?(\d{2,3})[k\,]?/i,
      /\$(\d{2,3})[k\,]?\s*to\s*\$?(\d{2,3})[k\,]?/i,
      /salary[:\s]*\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)/i,
      /\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)\s*(?:per year|annually)/i,
      /salary[:\s]*\$?(\d{2,3})[k]?/i,
      /\$(\d{2,3})[k]?\s*(?:per year|annually)/i
    ];

    for (const pattern of salaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          const min = match[1].replace(/,/g, '');
          const max = match[2].replace(/,/g, '');
          
          if (parseInt(min) < 1000) {
            return `$${min}-${max}k`;
          } else {
            return `$${parseInt(min).toLocaleString()}-${parseInt(max).toLocaleString()}`;
          }
        } else if (match[1]) {
          const salary = match[1].replace(/,/g, '');
          if (parseInt(salary) < 1000) {
            return `$${salary}k`;
          } else {
            return `$${parseInt(salary).toLocaleString()}`;
          }
        }
      }
    }

    return 'Salary not disclosed';
  }

  extractHours(title, description) {
    const text = `${title} ${description || ''}`;
    
    const hoursPatterns = [
      /\b(full-time|full time|ft)\b/i,
      /\b(part-time|part time|pt)\b/i,
      /\b(contract|temp|temporary)\b/i,
      /\b(freelance|consultant)\b/i
    ];

    for (const pattern of hoursPatterns) {
      const match = text.match(pattern);
      if (match) {
        const type = match[1].toLowerCase();
        if (type.includes('full')) return 'Full-time';
        if (type.includes('part')) return 'Part-time';
        if (type.includes('contract') || type.includes('temp')) return 'Contract';
        if (type.includes('freelance') || type.includes('consultant')) return 'Freelance';
      }
    }

    return 'Full-time';
  }

  extractFirstSentence(description) {
    if (!description) return 'Job description not available';
    
    const cleaned = this.cleanText(description);
    
    const descriptionPatterns = [
      /(?:Job Description|Description|About the Role|Overview|Summary|Position Summary)[\s:]*(.+?)(?:\.|$)/i,
      /<p[^>]*>([^<]+)/i,
      /^([^.!?]+[.!?])/
    ];
    
    for (const pattern of descriptionPatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1] && match[1].trim().length > 20) {
        let description = match[1].trim();
        
        description = description.replace(/^(We are|Our client is|The company|This is|Looking for)/i, '');
        description = description.trim();
        
        
        return description || 'Job description not available';
      }
    }
    
    const sentences = cleaned.split(/[.!?]+/);
    if (sentences.length > 0 && sentences[0].trim().length > 20) {
      let firstSentence = sentences[0].trim();
      
      
      return firstSentence;
    }
    
    return 'Job description not available';
  }
}

export default RSSParserV2;