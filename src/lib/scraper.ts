import axios from 'axios';
import * as cheerio from 'cheerio';
import { prismaClientSingleton } from './prisma';
import { parse } from 'tldts';
import { hardcodedJobs } from './hardcodedJobs';

// Constants
const IGNORE_DOMAINS = [
  "wix.com", "domain.com", "example.com", "sentry.io", "wixpress.com", 
  "squarespace.com", "wordpress.com", "shopify.com"
];

const COMMON_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com", 
  "icloud.com", "protonmail.com", "mail.com", "zoho.com", "yandex.com", "gmx.com"
];

const CONTACT_PAGES = [
  "/contact", "/contact-us", "/contact.html", "/contact-us.html", "/about", 
  "/about-us", "/about.html", "/about-us.html", "/get-in-touch", "/reach-us", 
  "/connect", "/reach-out", "/our-team", "/team", "/support", "/help", "/info",
  // Add more variations
  "/contactus", "/get-in-touch-with-us", "/email-us", "/email", "/enquiry", "/inquiry",
  "/enquiries", "/inquiries", "/feedback", "/write-to-us", "/message-us", "/connect-with-us",
  "/talk-to-us", "/reach-out-to-us", "/drop-us-a-line", "/say-hello", "/ask-us",
  "/meet-us", "/meet-the-team", "/staff", "/meet-our-team", "/company/team",
  "/company/contact", "/company/about", "/company", "/who-we-are", "/lets-talk"
];

// Function to extract emails from JSON-like objects
function extractJsonEmails(obj: any): string[] {
  const found: string[] = [];
  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      for (const item of obj) {
        found.push(...extractJsonEmails(item));
      }
    } else {
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string' && 
            ['email', 'mail', 'contact'].some(k => key.toLowerCase().includes(k))) {
          if (value.includes('@') && value.includes('.')) {
            found.push(value);
          }
        } else if (typeof value === 'object' && value !== null) {
          found.push(...extractJsonEmails(value));
        }
      }
    }
  }
  return found;
}

/**
 * Start the email scraping process for a job
 */
export async function startEmailScraping(jobId: string, urls: string[]) {
  const prisma = prismaClientSingleton();
  
  try {
    // Update job status to processing
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'processing' }
    });
    
    console.log(`Starting email scraping for job ${jobId} with ${urls.length} URLs`);
    
    // Process URLs in batches
    const batchSize = 5;
    let processedCount = 0;
    
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (url) => {
        try {
          // Get email from website
          const email = await extractEmailFromWebsite(url);
          
          // Save result to database
          await prisma.result.create({
            data: {
              jobId,
              website: url,
              email: email || null
            }
          });
          
          // Update in-memory job if it exists (for hardcoded users)
          if (hardcodedJobs.has(jobId)) {
            const memoryJob = hardcodedJobs.get(jobId);
            if (memoryJob && memoryJob.results) {
              memoryJob.results.push({
                website: url,
                email: email || null
              });
              memoryJob.processedWebsites = (memoryJob.processedWebsites || 0) + 1;
              memoryJob.progress = Math.min(100, Math.floor((memoryJob.processedWebsites / memoryJob.totalWebsites) * 100));
              memoryJob.updatedAt = new Date().toISOString();
              hardcodedJobs.set(jobId, memoryJob);
            }
          }
          
          processedCount++;
          
          // Log progress
          if (processedCount % 10 === 0 || processedCount === urls.length) {
            console.log(`Job ${jobId}: Processed ${processedCount}/${urls.length} URLs`);
          }
        } catch (error) {
          console.error(`Error processing URL ${url}:`, error);
          
          // Save error result to database
          await prisma.result.create({
            data: {
              jobId,
              website: url,
              email: null
            }
          });
          
          // Update in-memory job if it exists (for hardcoded users)
          if (hardcodedJobs.has(jobId)) {
            const memoryJob = hardcodedJobs.get(jobId);
            if (memoryJob && memoryJob.results) {
              memoryJob.results.push({
                website: url,
                email: null
              });
              memoryJob.processedWebsites = (memoryJob.processedWebsites || 0) + 1;
              memoryJob.progress = Math.min(100, Math.floor((memoryJob.processedWebsites / memoryJob.totalWebsites) * 100));
              memoryJob.updatedAt = new Date().toISOString();
              hardcodedJobs.set(jobId, memoryJob);
            }
          }
          
          processedCount++;
        }
      }));
      
      // Small delay between batches to avoid overwhelming system
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Update job status to completed
    await prisma.job.update({
      where: { id: jobId },
      data: { status: 'completed' }
    });
    
    // Update in-memory job if it exists
    if (hardcodedJobs.has(jobId)) {
      const memoryJob = hardcodedJobs.get(jobId);
      if (memoryJob) {
        memoryJob.status = 'completed';
        memoryJob.progress = 100;
        memoryJob.updatedAt = new Date().toISOString();
        hardcodedJobs.set(jobId, memoryJob);
      }
    }
    
    console.log(`Email scraping completed for job ${jobId}`);
  } catch (error) {
    console.error(`Error in email scraping job ${jobId}:`, error);
    
    // Mark job as failed in database
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: 'failed' }
      });
    } catch (updateError) {
      console.error(`Failed to update job status for ${jobId}:`, updateError);
    }
    
    // Update in-memory job if it exists
    if (hardcodedJobs.has(jobId)) {
      const memoryJob = hardcodedJobs.get(jobId);
      if (memoryJob) {
        memoryJob.status = 'failed';
        memoryJob.updatedAt = new Date().toISOString();
        hardcodedJobs.set(jobId, memoryJob);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Validate and clean email address
 */
function validateEmail(email: string): string | null {
  // Clean and validate the email format
  email = email.trim().toLowerCase();
  
  // Ignore image files and other non-email strings containing @ symbol
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico)/.test(email)) {
    return null;
  }
  
  // Remove any invalid start/end characters
  email = email.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.]+$/g, '');
  
  // Check if the email follows a valid pattern
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
    // Ensure the email doesn't contain file extensions or other non-email patterns
    const parts = email.split('@');
    if (parts.length === 2 && parts[1].includes('.')) {
      const domainPart = parts[1];
      // Check if the domain part looks valid (not an image or file name)
      if (!domainPart.match(/\d+x\d+/)) {  // Pattern often found in image dimensions
        return email;
      }
    }
  }
  return null;
}

/**
 * Extract domain from URL
 */
function getDomain(url: string): string | null {
  try {
    const parsed = parse(url);
    return parsed.domain ? `${parsed.domain}.${parsed.publicSuffix}` : null;
  } catch {
    return null;
  }
}

/**
 * Clean and deduplicate emails
 */
function cleanAndDeduplicateEmails(emailsList: string[]): string[] {
  if (!emailsList || emailsList.length === 0) {
    return [];
  }
  
  // First round of cleaning and deduplication
  const cleanEmails = new Set<string>();
  emailsList.forEach(email => {
    const validEmail = validateEmail(email);
    if (validEmail) {
      // Skip emails from the ignore domains
      if (!IGNORE_DOMAINS.some(ignoreDomain => validEmail.includes(ignoreDomain))) {
        cleanEmails.add(validEmail);
      }
    }
  });
  
  // Handle cases where one email is contained within another
  const emailsToRemove = new Set<string>();
  const finalEmails = Array.from(cleanEmails);
  
  for (let i = 0; i < finalEmails.length; i++) {
    for (let j = 0; j < finalEmails.length; j++) {
      if (i !== j && finalEmails[i] !== finalEmails[j]) {
        // Split emails into username and domain parts
        const email1Parts = finalEmails[i].split('@');
        const email2Parts = finalEmails[j].split('@');
        
        // Check if they have the same domain
        if (email1Parts.length === 2 && email2Parts.length === 2 && email1Parts[1] === email2Parts[1]) {
          const username1 = email1Parts[0];
          const username2 = email2Parts[0];
          
          // If one username is contained within the other
          if (username1.includes(username2)) {
            // Keep the shorter one (assuming it's cleaner)
            emailsToRemove.add(finalEmails[i]);
          } else if (username2.includes(username1)) {
            emailsToRemove.add(finalEmails[j]);
          }
          // Special case for project.info@ vs info@
          else if (username1.includes('.') && username1.split('.').pop() === username2) {
            emailsToRemove.add(finalEmails[i]);
          } else if (username2.includes('.') && username2.split('.').pop() === username1) {
            emailsToRemove.add(finalEmails[j]);
          }
        }
      }
    }
  }
  
  // Remove emails flagged for removal
  const finalCleaned = finalEmails.filter(email => !emailsToRemove.has(email));
  
  return finalCleaned;
}

/**
 * Extract emails from a website using multiple methods
 */
async function extractEmails(baseUrl: string): Promise<string[]> {
  const emailsSet = new Set<string>();  // Use set to store unique emails
  const domain = getDomain(baseUrl);
  
  // Process a single URL and extract emails
  async function processUrl(url: string, isContactPage = false): Promise<Set<string>> {
    const localEmails = new Set<string>();
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      };
      const response = await axios.get(url, { headers, timeout: 15000 });
      const htmlContent = response.data;
      const $ = cheerio.load(htmlContent);
      
      // Method 1: Extract emails from visible text (more thorough)
      const textContent = $('body').text();
      const textEmails = textContent.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
      
      // Method 2: Enhanced mailto link extraction
      const mailtoEmails: string[] = [];
      $('a[href*="mailto:"]').each((_, element) => {
        const href = $(element).attr('href') || '';
        if (href.includes('mailto:')) {
          // Extract email from mailto: links
          const email = href.replace('mailto:', '').split('?')[0].trim();
          // Use decodeURIComponent to handle URL-encoded emails
          try {
            mailtoEmails.push(decodeURIComponent(email));
          } catch {
            mailtoEmails.push(email);
          }
        }
      });
      
      // Look for elements with mailto links but aren't properly marked as <a> tags
      $('*[href*="mailto:"], *[data-href*="mailto:"], *[data-email], *[data-mail]').each((_, element) => {
        // Check various attributes
        ['href', 'data-href', 'data-email', 'data-mail', 'onclick', 'data-content'].forEach(attr => {
          const value = $(element).attr(attr) || '';
          if (value.includes('mailto:')) {
            const email = value.replace(/^.*mailto:/, '').split(/[?'"]/)[0].trim();
            try {
              mailtoEmails.push(decodeURIComponent(email));
            } catch {
              mailtoEmails.push(email);
            }
          }
        });
      });
      
      // Also check for mailto links in onclick attributes and other handlers
      $('*[onclick*="mailto:"], *[href*="javascript"], *[data-action*="mail"]').each((_, element) => {
        const onclick = $(element).attr('onclick') || '';
        const href = $(element).attr('href') || '';
        const dataAction = $(element).attr('data-action') || '';
        
        // Check onclick for mailto pattern
        if (onclick.includes('mailto:')) {
          const matches = onclick.match(/mailto:([^'"\s)]+)/);
          if (matches && matches[1]) {
            try {
              mailtoEmails.push(decodeURIComponent(matches[1]));
            } catch {
              mailtoEmails.push(matches[1]);
            }
          }
        }
        
        // Check javascript: href
        if (href.includes('mail') || href.includes('contact')) {
          const matches = href.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (matches) mailtoEmails.push(...matches);
        }
      });
      
      // Method 3: Improved check for elements with email-related classes or IDs
      const emailClasses = [
        "email", "mail", "e-mail", "contact", "email-address", "mail-link",
        "mini-contacts", "footer-contact", "header-contact", "contact-info",
        "contact-details", "contact-email", "footer-email", "header-email", "info",
        // Add more specific email-related classes and IDs
        "email-link", "mail-to", "mailto", "email-button", "mail-button", 
        "contact-button", "email-us", "mail-us", "email-address-display",
        "vcard", "contact-card", "business-card", "contact-method", "email-wrapper"
      ];
      
      const classEmails: string[] = [];
      
      // Look for elements with email-related classes
      emailClasses.forEach(className => {
        // Look for class attributes containing the className
        $(`[class*=${className}], [id*=${className}]`).each((_, element) => {
          // Extract email from text content
          const elementText = $(element).text();
          const emailMatches = elementText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (emailMatches) classEmails.push(...emailMatches);
          
          // Also check direct children text for emails
          $(element).children().each((_, child) => {
            const childText = $(child).text();
            const childMatches = childText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (childMatches) classEmails.push(...childMatches);
          });
          
          // Check attributes for emails
          const attribs = $(element).prop('attribs') || {};
          Object.keys(attribs).forEach(attr => {
            const value = attribs[attr];
            if (typeof value === 'string' && value.includes('@')) {
              const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (matches) classEmails.push(...matches);
            }
          });
        });
      });
      
      // Method 4: Extract from all tags and attributes (comprehensive scan)
      const allTagsEmails: string[] = [];
      $('*').each((_, element) => {
        // Check tag content
        const text = $(element).text().trim();
        if (text.includes('@')) {
          const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (emailMatches) allTagsEmails.push(...emailMatches);
        }
        
        // Check all attributes for each element
        const attribs = $(element).prop('attribs') || {};
        Object.keys(attribs).forEach(attr => {
          const value = attribs[attr];
          if (typeof value === 'string' && value.includes('@')) {
            const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (matches) allTagsEmails.push(...matches);
          }
        });
      });
      
      // Method 5: Special handling for contact pages to find emails
      if (isContactPage) {
        // Look for elements that are likely to contain contact information
        $('section, div, article, aside, footer, p, span, li, dd, dt, h1, h2, h3, h4, h5, h6').each((_, element) => {
          const $el = $(element);
          const text = $el.text();
          
          // Check if element contains text suggesting it's contact info
          if (
            /contact|email|mail|get in touch|connect|reach us|inquir(y|ies)/i.test(text) ||
            text.includes('@') ||
            COMMON_EMAIL_DOMAINS.some(domain => text.includes(domain))
          ) {
            // Check for email patterns
            const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (emailMatches) classEmails.push(...emailMatches);
            
            // If this element has an onclick or data-* attribute that might contain email info
            const onClick = $el.attr('onclick') || '';
            if (onClick.includes('mail') || onClick.includes('contact')) {
              const onClickMatches = onClick.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (onClickMatches) classEmails.push(...onClickMatches);
            }
          }
        });
        
        // Look specifically for common patterns in contact pages
        // 1. Look for "Email:" label followed by an email
        $('*').each((_, element) => {
          const text = $(element).text().trim();
          if (/^(Email|E-mail|Mail|Contact)(\s*:|\s*at)?\s*$/i.test(text)) {
            // Check next sibling or parent's next sibling for email
            const sibling = $(element).next();
            const siblingText = sibling.text();
            const emailMatches = siblingText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (emailMatches) classEmails.push(...emailMatches);
          }
        });
        
        // 2. Look for contact form hidden recipients
        $('form').each((_, form) => {
          // Check form action for mailto
          const formAction = $(form).attr('action') || '';
          if (formAction.includes('mailto:')) {
            const email = formAction.replace('mailto:', '').split('?')[0].trim();
            mailtoEmails.push(email);
          }
          
          // Check all hidden inputs
          $('input', form).each((_, input) => {
            const type = $(input).attr('type') || '';
            const name = $(input).attr('name') || '';
            const value = $(input).attr('value') || '';
            
            if ((type === 'hidden' || name.includes('recipient') || name.includes('email') || name.includes('to')) && value.includes('@')) {
              const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (matches) classEmails.push(...matches);
            }
          });
        });
      }
      
      // Method 6: Extract from script tags more thoroughly, focusing on contact page scripts
      const scriptEmails: string[] = [];
      $('script').each((_, script) => {
        const content = $(script).html() || '';
        
        // Look for script with contact-related content
        if (content.includes('contact') || content.includes('email') || content.includes('mail') || 
            content.includes('@gmail.com') || COMMON_EMAIL_DOMAINS.some(domain => content.includes(domain))) {
          
          // Look for explicit email field in JSON or JavaScript objects
          const emailPatterns = [
            /"email"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /"emailAddress"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /"mail"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /"e-mail"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /"contactEmail"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /"support_email"\s*:\s*"([^"]+@[^"]+\.[^"]+)"/g,
            /email\s*[:=]\s*['"]([^'"]+@[^'"]+\.[^'"]+)['"]/g,
            /var\s+email\s*=\s*['"]([^'"]+@[^'"]+\.[^'"]+)['"]/g
          ];
          
          emailPatterns.forEach(pattern => {
            let matches;
            while ((matches = pattern.exec(content)) !== null) {
              if (matches[1]) scriptEmails.push(matches[1]);
            }
          });
          
          // Also extract general email pattern more aggressively
          const generalMatches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (generalMatches) scriptEmails.push(...generalMatches);
          
          // Check for email obfuscation via concatenation
          const concatPatterns = [
            /['"][^'"]*@[^'"]*['"]\s*\+\s*['"]/,
            /['"][^'"]*\.[^'"]*['"](\s*\+\s*['"][^'"]*\.)/,
            /string\.replace\(/
          ];
          
          if (concatPatterns.some(pattern => pattern.test(content))) {
            // Extract all string literals
            const stringLiterals = content.match(/(['"])(?:(?!\1).|\\.)*?\1/g) || [];
            const joined = stringLiterals.map(s => s.replace(/^['"]|['"]$/g, '')).join('');
            
            // Check if the joined string contains email patterns
            const joinedMatches = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
            if (joinedMatches) scriptEmails.push(...joinedMatches);
          }
          
          // Try to find JavaScript email obfuscation
          if (content.includes('fromCharCode') || content.includes('decode') || content.includes('atob')) {
            // Look for common character code patterns
            const codeMatches = content.match(/String\.fromCharCode\(([^)]+)\)/g);
            if (codeMatches) {
              codeMatches.forEach(match => {
                try {
                  // Try to evaluate the fromCharCode expression
                  const charCodes = match.match(/\(([^)]+)\)/)?.[1].split(',').map(c => parseInt(c.trim(), 10));
                  if (charCodes && !charCodes.some(isNaN)) {
                    const decoded = String.fromCharCode(...charCodes);
                    const emailMatch = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                    if (emailMatch) scriptEmails.push(...emailMatch);
                  }
                } catch (e) {
                  // Ignore errors in decoding
                }
              });
            }
            
            // Check for base64 encoded emails
            const base64Matches = content.match(/atob\(['"](.*?)['"]\)/g);
            if (base64Matches) {
              base64Matches.forEach(match => {
                try {
                  const encoded = match.match(/atob\(['"](.*?)['"]\)/)?.[1];
                  if (encoded) {
                    try {
                      const decoded = Buffer.from(encoded, 'base64').toString();
                      const emailMatch = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                      if (emailMatch) scriptEmails.push(...emailMatch);
                    } catch (e) {
                      // Ignore errors in decoding
                    }
                  }
                } catch (e) {
                  // Ignore errors in regex or decoding
                }
              });
            }
          }
        }
        
        // Try to parse any JSON objects in the script
        try {
          // Extract any JSON-like structures
          const jsonMatches = content.match(/\{[^{}]*\}/g) || [];
          for (const jsonStr of jsonMatches) {
            try {
              const data = JSON.parse(jsonStr);
              const jsonEmails = extractJsonEmails(data);
              scriptEmails.push(...jsonEmails);
            } catch {
              // Ignore invalid JSON
            }
          }
        } catch {
          // Ignore errors in JSON parsing
        }
      });
      
      // Method 7: Extract from meta tags
      const metaEmails: string[] = [];
      $('meta').each((_, meta) => {
        const content = $(meta).attr('content') || '';
        const name = $(meta).attr('name') || '';
        const property = $(meta).attr('property') || '';
        
        // Look specifically for contact metadata
        if (
          name.includes('contact') || name.includes('email') || name.includes('mail') ||
          property.includes('contact') || property.includes('email') || property.includes('mail') ||
          content.includes('@')
        ) {
          const matches = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (matches) metaEmails.push(...matches);
        }
      });
      
      // Method 8: Look specifically for common email domains in the entire HTML content
      const domainBasedEmails: string[] = [];
      
      // Enhanced pattern that looks specifically for email patterns with common domains
      COMMON_EMAIL_DOMAINS.forEach(emailDomain => {
        const domainPattern = new RegExp(`[a-zA-Z0-9._%+-]+@${emailDomain.replace('.', '\\.')}`, 'g');
        const matches = htmlContent.match(domainPattern);
        if (matches) domainBasedEmails.push(...matches);
      });
      
      // Method 9: Check for obfuscated emails
      const obfuscatedEmails: string[] = [];
      
      // Look for emails where @ is replaced with text or entities
      const obfuscatedPatterns = [
        /([a-zA-Z0-9._%+-]+)\s*(?:&#64;|[@\(\{\[]\s*at\s*[\)\}\]]|[@\(\{\[]at[\)\}\]]|\s+at\s+|@)([a-zA-Z0-9.-]+)\.([a-zA-Z]{2,})/gi,
        /<span[^>]*>([^<]*)<\/span>\s*(?:&#64;|@)\s*<span[^>]*>([^<]*)<\/span>/gi,
        /([a-zA-Z0-9._%+-]+)\s*\[at\]\s*([a-zA-Z0-9.-]+)\s*\[dot\]\s*([a-zA-Z]{2,})/gi,
        /([a-zA-Z0-9._%+-]+)\s*\(at\)\s*([a-zA-Z0-9.-]+)\s*\(dot\)\s*([a-zA-Z]{2,})/gi
      ];
      
      const bodyHtml = $('body').html() || '';
      obfuscatedPatterns.forEach(pattern => {
        let matches;
        while ((matches = pattern.exec(bodyHtml)) !== null) {
          const username = matches[1]?.trim();
          const domain = matches[2]?.trim();
          const tld = matches[3]?.trim();
          
          if (username && domain) {
            const reconstructed = `${username}@${domain}${tld ? '.' + tld : ''}`;
            if (reconstructed.includes('@') && reconstructed.includes('.')) {
              obfuscatedEmails.push(reconstructed);
            }
          }
        }
      });
      
      // Method 10: Look for reversed or encoded emails in the DOM
      const encodedEmails: string[] = [];
      
      // Check for reversed emails in text or attributes
      $('*').each((_, element) => {
        const text = $(element).text();
        if (text.includes('.') && text.includes('@')) {
          // Try reversing the text to see if it's a reversed email
          const reversed = text.split('').reverse().join('');
          const emailMatches = reversed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
          if (emailMatches) encodedEmails.push(...emailMatches);
        }
        
        // Check for encoded emails in data attributes
        const encodedAttrs = ['data-email', 'data-mail', 'data-encoded-email'];
        encodedAttrs.forEach(attr => {
          const value = $(element).attr(attr);
          if (value) {
            // Try various decodings
            try {
              // Base64
              const decoded = Buffer.from(value, 'base64').toString();
              const emailMatches = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (emailMatches) encodedEmails.push(...emailMatches);
            } catch {
              // Not base64, try other methods
            }
            
            // Hex encoding
            try {
              if (/^[0-9a-f]+$/i.test(value)) {
                const decoded = Buffer.from(value, 'hex').toString();
                const emailMatches = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
                if (emailMatches) encodedEmails.push(...emailMatches);
              }
            } catch {
              // Not hex encoded
            }
            
            // URL encoding
            try {
              const decoded = decodeURIComponent(value);
              const emailMatches = decoded.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
              if (emailMatches) encodedEmails.push(...emailMatches);
            } catch {
              // Not URL encoded
            }
          }
        });
      });
      
      // Combine all emails
      const allExtractedEmails = [
        ...textEmails,
        ...mailtoEmails,
        ...classEmails,
        ...allTagsEmails,
        ...scriptEmails,
        ...metaEmails,
        ...domainBasedEmails,
        ...obfuscatedEmails,
        ...encodedEmails
      ];
      
      // Clean and add valid emails to the local set
      allExtractedEmails.forEach(email => {
        const validEmail = validateEmail(email);
        if (validEmail && !IGNORE_DOMAINS.some(domain => validEmail.includes(domain))) {
          localEmails.add(validEmail);
        }
      });
      
    } catch (error) {
      console.error(`Error processing URL ${url}:`, error);
    }
    
    return localEmails;
  }
  
  // First process the main URL
  const mainPageEmails = await processUrl(baseUrl);
  mainPageEmails.forEach(email => emailsSet.add(email));
  
  // Then process ALL contact pages regardless of how many emails we found
  // This is important to catch emails that might only be on contact pages
  for (const contactPath of CONTACT_PAGES) {
    try {
      const contactUrl = new URL(contactPath, baseUrl).toString();
      if (contactUrl !== baseUrl) {  // Avoid processing the same URL twice
        console.log(`Checking contact page: ${contactUrl}`);
        const contactPageEmails = await processUrl(contactUrl, true);
        contactPageEmails.forEach(email => emailsSet.add(email));
      }
    } catch (error) {
      // Silently continue to the next contact page
      continue;
    }
  }
  
  // Clean and deduplicate emails
  const allEmails = cleanAndDeduplicateEmails(Array.from(emailsSet));
  
  // Prioritize emails with domain matching the website
  const domainEmails = domain 
    ? allEmails.filter(email => email.includes(domain))
    : [];
  const otherEmails = allEmails.filter(email => !domainEmails.includes(email));
  
  // Sort emails with domain emails first
  const sortedEmails = [...domainEmails.sort(), ...otherEmails.sort()];
  
  return sortedEmails;
}

// Extract email from a website
async function extractEmailFromWebsite(website: string): Promise<string | null> {
  console.log(`Extracting email from: ${website}`);
  
  try {
    // Ensure website has http/https prefix
    let url = website;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // Fetch the website content
    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Extract emails from the HTML content
    const emails = extractEmailsFromHtml(response.data);
    
    if (emails.length > 0) {
      // Get most relevant email (contact, info, etc.)
      const priorityEmails = emails.filter(email => {
        const lowerEmail = email.toLowerCase();
        return lowerEmail.includes('contact') || 
               lowerEmail.includes('info') || 
               lowerEmail.includes('hello') || 
               lowerEmail.includes('support');
      });
      
      return priorityEmails.length > 0 ? priorityEmails[0] : emails[0];
    }
    
    return null;
  } catch (error) {
    // Try with http if https failed
    if (website.includes('https://')) {
      try {
        const httpUrl = website.replace('https://', 'http://');
        const response = await axios.get(httpUrl, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
        
        const emails = extractEmailsFromHtml(response.data);
        
        if (emails.length > 0) {
          // Get most relevant email
          const priorityEmails = emails.filter(email => {
            const lowerEmail = email.toLowerCase();
            return lowerEmail.includes('contact') || 
                   lowerEmail.includes('info') || 
                   lowerEmail.includes('hello') || 
                   lowerEmail.includes('support');
          });
          
          return priorityEmails.length > 0 ? priorityEmails[0] : emails[0];
        }
        
        return null;
      } catch (innerError: any) {
        console.error(`Failed to fetch ${website} with HTTP:`, innerError);
        throw new Error(`Failed to access website: ${innerError.message}`);
      }
    }
    
    console.error(`Failed to fetch ${website}:`, error);
    throw new Error(`Failed to access website: ${(error as Error).message}`);
  }
}

// Extract emails from HTML
function extractEmailsFromHtml(html: string): string[] {
  try {
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    
    // Email regex pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = bodyText.match(emailRegex) || [];
    
    // Filter out common service emails
    return emails.filter(email => {
      const lowerEmail = email.toLowerCase();
      return !lowerEmail.includes('noreply') && 
             !lowerEmail.includes('no-reply') && 
             !lowerEmail.includes('donotreply') && 
             !lowerEmail.includes('no_reply') &&
             !lowerEmail.includes('example.com');
    });
  } catch (error) {
    console.error('Error extracting emails from HTML:', error);
    return [];
  }
} 