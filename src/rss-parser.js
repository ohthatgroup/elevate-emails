const Parser = require('rss-parser');
const crypto = require('crypto');

class RSSParser {
  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ['description', 'description'],
          ['pubDate', 'pubDate'],
          ['link', 'link'],
          ['title', 'title']
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
        location: this.extractLocation(item.title, item.description),
        salary_range: this.extractSalaryRange(item.title, item.description),
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
    const text = `${title} ${description || ''}`;
    
    const locationPatterns = [
      /(?:in|at|located in|based in)\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/i,
      /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})/g,
      /([A-Z][a-z]+,\s*[A-Z]{2})/g
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return this.cleanText(match[1] || match[0]);
      }
    }

    return 'Location not specified';
  }

  extractSalaryRange(title, description) {
    const text = `${title} ${description || ''}`;
    
    const salaryPatterns = [
      /\$(\d{2,3})[k\,]?\s*[-–—]\s*\$?(\d{2,3})[k\,]?/i,
      /\$(\d{2,3})[k\,]?\s*to\s*\$?(\d{2,3})[k\,]?/i,
      /salary[:\s]*\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)/i,
      /\$?([\d,]+)\s*[-–—]\s*\$?([\d,]+)\s*(?:per year|annually)/i
    ];

    for (const pattern of salaryPatterns) {
      const match = text.match(pattern);
      if (match) {
        const min = match[1].replace(/,/g, '');
        const max = match[2].replace(/,/g, '');
        
        if (parseInt(min) < 1000) {
          return `$${min}–${max}k`;
        } else {
          return `$${parseInt(min).toLocaleString()}–${parseInt(max).toLocaleString()}`;
        }
      }
    }

    return 'Salary not disclosed';
  }

  extractFirstSentence(description) {
    if (!description) return 'Job description not available';
    
    const cleaned = this.cleanText(description);
    const sentences = cleaned.split(/[.!?]+/);
    
    if (sentences.length > 0 && sentences[0].trim()) {
      let firstSentence = sentences[0].trim();
      
      if (firstSentence.length > 150) {
        firstSentence = firstSentence.substring(0, 147) + '...';
      }
      
      return firstSentence;
    }
    
    return 'Job description not available';
  }
}

module.exports = RSSParser;