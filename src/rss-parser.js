import Parser from 'rss-parser';
import crypto from 'crypto';

class RSSParser {
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
          ['crelate:hours', 'crelateHours']
        ]
      }
    });
    this.rssUrl = process.env.CRELATE_RSS_URL;
  }

  async fetchNewJobs() {
    if (!this.rssUrl) {
      throw new Error('CRELATE_RSS_URL environment variable is required');
    }

    try {
      console.log('Fetching RSS feed from:', this.rssUrl);
      const feed = await this.parser.parseURL(this.rssUrl);
      
      if (!feed.items || feed.items.length === 0) {
        console.log('No items found in RSS feed');
        return [];
      }

      const jobs = feed.items.map(item => this.parseJobItem(item));
      const validJobs = jobs.filter(job => job !== null);
      
      console.log(`Parsed ${validJobs.length} valid jobs from ${feed.items.length} items`);
      return validJobs;
      
    } catch (error) {
      console.error('RSS parsing error:', error);
      throw new Error(`Failed to fetch RSS feed: ${error.message}`);
    }
  }

  parseJobItem(item) {
    try {
      if (!item.title || !item.link) {
        console.warn('Skipping job item missing title or link');
        return null;
      }

      const jobId = this.generateJobId(item.link, item.title);
      
      const job = {
        id: jobId,
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
      console.error('Error parsing job item:', error, item);
      return null;
    }
  }

  generateJobId(link, title) {
    const content = `${link}${title}`;
    return crypto.createHash('md5').update(content).digest('hex');
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
      // HTML-specific patterns first
      /<span[^>]*location[^>]*>([^<]+)</i,
      /location[:\s]*<[^>]*>([^<]+)</i,
      // Standard patterns
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
      // HTML-specific patterns
      /<span[^>]*salary[^>]*>([^<]+)</i,
      /salary[:\s]*<[^>]*>([^<]+)</i,
      // Standard k format
      /\$(\d{2,3})[k\,]?\s*[-–—]\s*\$?(\d{2,3})[k\,]?/i,
      /\$(\d{2,3})[k\,]?\s*to\s*\$?(\d{2,3})[k\,]?/i,
      // Full number format
      /salary[:\s]*\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)/i,
      /\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)\s*(?:per year|annually)/i,
      // Single salary values
      /salary[:\s]*\$?(\d{2,3})[k]?/i,
      /\$(\d{2,3})[k]?\s*(?:per year|annually)/i
    ];

    for (const pattern of salaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1] && match[2]) {
          // Range format
          const min = match[1].replace(/,/g, '');
          const max = match[2].replace(/,/g, '');
          
          if (parseInt(min) < 1000) {
            return `$${min}-${max}k`;
          } else {
            return `$${parseInt(min).toLocaleString()}-${parseInt(max).toLocaleString()}`;
          }
        } else if (match[1]) {
          // Single value format
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
    
    // First clean HTML and get text content
    const cleaned = this.cleanText(description);
    
    // Try to find the main job description by looking for common patterns
    const descriptionPatterns = [
      // Look for text after common intro phrases
      /(?:Job Description|Description|About the Role|Overview|Summary|Position Summary)[\s:]*(.+?)(?:\.|$)/i,
      // Look for text after HTML elements that typically contain the main description
      /<p[^>]*>([^<]+)/i,
      // Fallback to first sentence
      /^([^.!?]+[.!?])/
    ];
    
    for (const pattern of descriptionPatterns) {
      const match = cleaned.match(pattern);
      if (match && match[1] && match[1].trim().length > 20) {
        let description = match[1].trim();
        
        // Clean up common unwanted prefixes
        description = description.replace(/^(We are|Our client is|The company|This is|Looking for)/i, '');
        description = description.trim();
        
        if (description.length > 150) {
          description = description.substring(0, 147) + '...';
        }
        
        return description || 'Job description not available';
      }
    }
    
    // Fallback: take first meaningful sentence
    const sentences = cleaned.split(/[.!?]+/);
    if (sentences.length > 0 && sentences[0].trim().length > 20) {
      let firstSentence = sentences[0].trim();
      
      if (firstSentence.length > 150) {
        firstSentence = firstSentence.substring(0, 147) + '...';
      }
      
      return firstSentence;
    }
    
    return 'Job description not available';
  }
}

export default RSSParser;