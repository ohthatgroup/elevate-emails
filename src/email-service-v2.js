import mailchimp from '@mailchimp/mailchimp_marketing';
import RSSParserV2 from './rss-parser-v2.js';

class EmailServiceV2 {
  constructor() {
    this.apiKey = process.env.MAILCHIMP_API_KEY;
    this.serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;
    this.listId = process.env.MAILCHIMP_LIST_ID;
    this.emailSubject = process.env.EMAIL_SUBJECT || 'New Job Opportunities from Elevate Career Group';
    this.adminEmail = process.env.ADMIN_EMAIL;
    this.rssParser = new RSSParserV2();
    
    this.initializeMailchimp();
  }

  initializeMailchimp() {
    if (!this.apiKey || !this.serverPrefix || !this.listId) {
      throw new Error('Missing required Mailchimp environment variables: MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_LIST_ID');
    }

    mailchimp.setConfig({
      apiKey: this.apiKey,
      server: this.serverPrefix,
    });

    console.log('Mailchimp client initialized for EmailServiceV2');
  }

  async sendJobEmail(jobGuids, jobQueueManager) {
    if (!Array.isArray(jobGuids) || jobGuids.length === 0) {
      throw new Error('No job GUIDs provided for email');
    }

    if (!jobQueueManager) {
      throw new Error('JobQueueManager instance required for transaction safety');
    }

    console.log(`Starting job email transaction for ${jobGuids.length} jobs`);

    try {
      const jobs = await this.rssParser.fetchJobDetails(jobGuids);
      
      if (jobs.length === 0) {
        throw new Error('No job details found for provided GUIDs');
      }

      if (jobs.length < jobGuids.length) {
        console.warn(`Only found ${jobs.length} jobs out of ${jobGuids.length} requested GUIDs`);
      }

      console.log(`Preparing to send campaign with ${jobs.length} jobs`);
      
      const htmlContent = await this.generateEmailContent(jobs);
      const campaignResult = await this.sendCampaign(htmlContent);
      
      console.log(`✅ Campaign sent successfully with ID: ${campaignResult.campaignId}`);
      
      const markedSuccess = await jobQueueManager.markAsSent(jobGuids);
      
      if (!markedSuccess) {
        console.warn('Failed to mark jobs as sent in queue, but email was sent successfully');
      } else {
        console.log(`✅ ${jobGuids.length} jobs marked as sent in queue`);
      }
      
      return {
        success: true,
        campaignId: campaignResult.campaignId,
        jobCount: jobs.length,
        guidsProcessed: jobGuids.length,
        sentAt: new Date().toISOString(),
        queueUpdated: markedSuccess
      };
      
    } catch (error) {
      console.error('❌ Job email transaction failed:', error);
      console.log('Jobs remain in "pending" state for retry');
      throw new Error(`Failed to send job email: ${error.message}`);
    }
  }

  async sendCampaign(htmlContent) {
    try {
      const campaignId = await this.createCampaign(htmlContent);
      
      await mailchimp.campaigns.send(campaignId);
      console.log(`Campaign ${campaignId} sent successfully`);
      
      return {
        campaignId: campaignId,
        sentAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Campaign send error:', error);
      throw new Error(`Failed to send campaign: ${error.response?.text || error.message}`);
    }
  }

  async createCampaign(htmlContent) {
    try {
      const campaign = await mailchimp.campaigns.create({
        type: 'regular',
        recipients: {
          list_id: this.listId,
        },
        settings: {
          subject_line: this.emailSubject,
          preview_text: `${this.emailSubject} - Check out these exciting new opportunities!`,
          title: `Job Campaign - ${new Date().toISOString().split('T')[0]}`,
          from_name: 'Elevate Career Group',
          reply_to: this.adminEmail || 'noreply@elevatecareer.com',
          auto_footer: false,
          inline_css: true,
        },
      });

      await mailchimp.campaigns.setContent(campaign.id, {
        html: htmlContent,
      });

      console.log(`Campaign created with ID: ${campaign.id}`);
      return campaign.id;
      
    } catch (error) {
      console.error('Campaign creation error:', error);
      throw new Error(`Failed to create campaign: ${error.response?.text || error.message}`);
    }
  }

  async generateEmailContent(jobs) {
    try {
      if (!Array.isArray(jobs) || jobs.length === 0) {
        throw new Error('No jobs provided for email content generation');
      }

      const jobsHtml = jobs.map(job => this.generateJobHtml(job)).join('\n');
      const totalJobs = jobs.length;
      const currentDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Opportunities - Elevate Career Group</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Roboto', Arial, sans-serif; background-color: #FFFFFF; color: #333333; line-height: 1.6;">
    
    <!-- Email Container Table -->
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FFFFFF;">
        <tr>
            <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
                    
                    <!-- Header Section -->
                    <tr>
                        <td align="center" style="padding: 0 0 40px 0;">
                            <img src="https://ucarecdn.com/bff3b3f6-0ec2-42dd-839d-3e054d168189/EmailHeader.jpg" alt="Elevate Career Group - New opportunities for you" style="max-width: 100%; height: auto; display: block;">
                        </td>
                    </tr>
                    
                    <!-- Content Section -->
                    <tr>
                        <td style="padding: 0 20px;">
                            
                            <!-- Section Title -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="padding: 0 0 30px 0;">
                                        <h2 style="font-family: 'Roboto', Arial, sans-serif; font-weight: 600; font-size: 24px; color: #5D4299; margin: 0; text-align: left;">This week's openings (${totalJobs} jobs - ${currentDate})</h2>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Jobs Section -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 60px;">
                                ${jobsHtml}
                            </table>
                            
                            <!-- Hiring Section -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 60px 0 40px 0;">
                                <tr>
                                    <td style="background-color: #F3F1F9; border-radius: 8px; padding: 32px; text-align: center;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td>
                                                    <h3 style="font-family: 'Roboto', Arial, sans-serif; font-weight: 600; font-size: 20px; color: #5D4299; margin: 0 0 20px 0;">Hiring?</h3>
                                                    <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;">Elevate is a headhunting company serving businesses and candidates across all industries.</p>
                                                    <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;"><strong>Searching for Top Talent or Your Next Career Move? Let's Make It Happen—Contact Us Today!</strong></p>
                                                    <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;">We now offer comprehensive outsourcing services alongside our recruiting solutions. Whether you need to build a full team or scale specific roles, we're your one-stop hiring and team support partner.</p>
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 16px auto 0 auto;">
                                                        <tr>
                                                            <td>
                                                                <a href="https://elevatecareer.com/contact" style="display: inline-block; background-color: #5D4299; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; font-size: 14px; font-family: 'Roboto', Arial, sans-serif;">Get Started</a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Service Areas Section -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 0 0 40px 0;">
                                <tr>
                                    <td style="background-color: #F3F1F9; border-radius: 8px; padding: 32px; text-align: center;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td>
                                                    <h3 style="font-family: 'Roboto', Arial, sans-serif; font-weight: 600; font-size: 20px; color: #5D4299; margin: 0 0 20px 0;">Service Areas</h3>
                                                    <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.6; margin: 0 0 16px 0;">Serving New York, New Jersey, Connecticut, Pennsylvania, and Florida.</p>
                                                    <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; line-height: 1.6; margin: 0;">We also do remote and outsourcing in Mexico.</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                        </td>
                    </tr>
                    
                    <!-- Contact Section -->
                    <tr>
                        <td style="padding: 0 20px 40px 20px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td style="background-color: #F3F1F9; border-radius: 8px; padding: 32px; text-align: center;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                            <tr>
                                                <td>
                                                    <h3 style="font-family: 'Roboto', Arial, sans-serif; font-weight: 600; font-size: 20px; color: #5D4299; margin: 0 0 20px 0;">Contact Us</h3>
                                                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                                        <tr>
                                                            <td style="text-align: center;">
                                                                <a href="https://wa.link/1ad9kp" style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #5D4299; text-decoration: none; font-weight: 400; display: inline-block; padding: 8px 12px;">💬 WhatsApp</a>
                                                                <a href="mailto:info@elevatecareer.com" style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #5D4299; text-decoration: none; font-weight: 400; display: inline-block; padding: 8px 12px;">✉️ Email: info@elevatecareer.com</a>
                                                                <a href="tel:9295384473" style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #5D4299; text-decoration: none; font-weight: 400; display: inline-block; padding: 8px 12px;">📞 Phone: 9295384473</a>
                                                                <a href="https://www.linkedin.com/company/elevatecareergroup" style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #5D4299; text-decoration: none; font-weight: 400; display: inline-block; padding: 8px 12px;">💼 LinkedIn</a>
                                                                <a href="https://elevatecareer.com" style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #5D4299; text-decoration: none; font-weight: 400; display: inline-block; padding: 8px 12px;">🌐 elevatecareer.com</a>
                                                            </td>
                                                        </tr>
                                                    </table>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
    
</body>
</html>`;
      
      return htmlTemplate;
      
    } catch (error) {
      console.error('Error generating email content:', error);
      throw new Error(`Failed to generate email content: ${error.message}`);
    }
  }

  generateJobHtml(job) {
    return `
      <tr>
        <td style="padding: 0 0 16px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #FFFFFF; border: 1px solid #F3F1F9; border-radius: 8px;">
            <tr>
              <td style="padding: 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background-color: #5D4299; color: #FFFFFF; padding: 6px 12px; border-radius: 4px; font-family: 'Roboto', Arial, sans-serif; font-size: 12px; font-weight: 600; margin-right: 8px;">${this.escapeHtml(job.hours || 'Full-time')}</td>
                    <td style="width: 8px;"></td>
                    <td style="background-color: #5D4299; color: #FFFFFF; padding: 6px 12px; border-radius: 4px; font-family: 'Roboto', Arial, sans-serif; font-size: 12px; font-weight: 600;">${this.escapeHtml(job.salary_range)}</td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 12px 0;">
                  <tr>
                    <td style="width: 50%;">
                      <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 14px; color: #333333; font-weight: 400; margin: 0;">${this.escapeHtml(job.location)}</p>
                    </td>
                    <td style="width: 50%; text-align: right;">
                      <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 12px; color: #A7A9AC; font-weight: 400; margin: 0;">Job #${job.job_number || 'N/A'}</p>
                    </td>
                  </tr>
                </table>
                <p style="font-family: 'Roboto', Arial, sans-serif; font-size: 16px; color: #333333; margin: 0 0 16px 0; line-height: 1.5;">${this.escapeHtml(job.job_description_first_sentence)}</p>
                <a href="${this.escapeHtml(job.apply_url)}" style="font-family: 'Roboto', Arial, sans-serif; color: #5D4299; text-decoration: none; font-weight: 600; font-size: 14px; border-bottom: 1px solid #5D4299;">Apply</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;
  }

  async sendErrorNotification(error) {
    if (!this.adminEmail) {
      console.log('No admin email configured for error notifications');
      return;
    }

    try {
      const errorMessage = {
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production'
      };

      await mailchimp.messages.send({
        message: {
          html: `
            <h2>Job Email Scheduler Error (V2)</h2>
            <p><strong>Time:</strong> ${errorMessage.timestamp}</p>
            <p><strong>Environment:</strong> ${errorMessage.environment}</p>
            <p><strong>Error:</strong> ${errorMessage.error}</p>
            <pre>${errorMessage.stack}</pre>
          `,
          subject: 'Job Email Scheduler V2 Error Alert',
          from_email: 'system@elevatecareer.com',
          from_name: 'Job Scheduler System V2',
          to: [
            {
              email: this.adminEmail,
              name: 'Administrator',
              type: 'to'
            }
          ]
        }
      });

      console.log('Error notification sent to admin');
      
    } catch (notificationError) {
      console.error('Failed to send error notification:', notificationError);
    }
  }

  async testConnection() {
    try {
      const response = await mailchimp.ping.get();
      console.log('Mailchimp connection test successful (V2):', response);
      return true;
      
    } catch (error) {
      console.error('Mailchimp connection test failed (V2):', error);
      throw new Error(`Mailchimp connection failed: ${error.response?.text || error.message}`);
    }
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

export default EmailServiceV2;