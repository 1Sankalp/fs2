import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prismaClientSingleton } from '../../../lib/prisma';
import axios from 'axios';
import { startEmailScraping } from '../../../lib/scraper';
import { v4 as uuidv4 } from 'uuid';
import { hardcodedJobs } from '../../../lib/hardcodedJobs';
import * as cheerio from 'cheerio';
import { hash } from 'bcrypt';

// GET /api/jobs - Get all jobs for the current user
export async function GET(request: NextRequest) {
  let prisma = null;
  
  try {
    // Check authentication first, before creating any DB connections
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('GET /api/jobs - No session found - user not authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID
    const userId = session.user.id;
    console.log(`GET /api/jobs - User ID from session: ${userId}`);
    
    // Print info about in-memory jobs for debugging
    console.log(`In-memory jobs map status - Size: ${hardcodedJobs.size()}`);
    hardcodedJobs.values().forEach((job) => {
      console.log(`Memory job: ${job.id} - User: ${job.userId} - Status: ${job.status}`);
    });
    
    // For hardcoded users, try to access the database but also include in-memory jobs
    if (userId.startsWith('hardcoded-')) {
      console.log(`GET /api/jobs - Getting jobs for hardcoded user from memory and DB: ${userId}`);
      
      // Get all jobs for this user from the in-memory store
      const memoryJobs: any[] = [];
      
      // Use values() and filter instead of forEach
      hardcodedJobs.values().forEach((job) => {
        if (job.userId === userId) {
          console.log(`Found in-memory job ${job.id} for user ${userId}`);
          memoryJobs.push({
            id: job.id,
            name: job.name,
            status: job.status,
            sheetUrl: job.sheetUrl || 'https://docs.google.com/spreadsheets/d/example',
            columnName: job.columnName || 'Website',
            totalUrls: job.totalWebsites || 0,
            processedUrls: job.processedWebsites || 0,
            progress: job.progress || 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            userId: userId
          });
        } else {
          console.log(`Skipping job ${job.id} as it belongs to user ${job.userId}, not ${userId}`);
        }
      });
      
      console.log(`Found ${memoryJobs.length} in-memory jobs for user ${userId}`);
      
      // Try to get database jobs as well - create a fresh client for each user request
      let dbJobs: any[] = [];
      try {
        // Create a completely fresh Prisma client for each hardcoded user
        prisma = prismaClientSingleton();
        console.log(`Created fresh database connection for user ${userId}`);
        
        // Fetch jobs from database with explicit userId filter
        dbJobs = await prisma.job.findMany({
          where: {
            userId: {
              equals: userId
            }
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        
        console.log(`Found ${dbJobs.length} database jobs for user ${userId}`);
        if (dbJobs.length > 0) {
          dbJobs.forEach(job => {
            console.log(`DB job: ${job.id} - User: ${job.userId} - Status: ${job.status}`);
          });
        }
      } catch (dbError) {
        console.error(`Database query error for hardcoded user ${userId}:`, dbError);
        // Proceed with memory jobs only
      } finally {
        // Always disconnect the client to prevent connection pool issues
        if (prisma) {
          await prisma.$disconnect();
          prisma = null;
        }
      }
      
      // Combine database and memory jobs, prioritizing memory jobs for same IDs
      const allJobs = [...dbJobs];
      
      // Add memory jobs that don't exist in DB
      for (const memJob of memoryJobs) {
        if (!allJobs.some(job => job.id === memJob.id)) {
          allJobs.push(memJob);
        }
      }
      
      // Sort by createdAt descending (newest first)
      allJobs.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      console.log(`Returning ${allJobs.length} combined jobs for user ${userId}`);
      return NextResponse.json({ jobs: allJobs });
    }
    
    // For real users, create a fresh client for database access
    console.log(`GET /api/jobs - Fetching jobs from database for user: ${userId}`);
    prisma = prismaClientSingleton();
    
    // Fetch jobs from database
    const jobs = await prisma.job.findMany({
      where: {
        userId: userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${jobs.length} database jobs for user ${userId}`);
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Get jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to get jobs' },
      { status: 500 }
    );
  } finally {
    // Clean up the Prisma client
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

// POST /api/jobs - Create a new job
export async function POST(request: NextRequest) {
  let prisma = null;
  
  try {
    // Check authentication first, before creating any DB connections
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { sheetUrl, columnName, jobName } = body;
    
    // Validate inputs
    if (!sheetUrl || !columnName) {
      return NextResponse.json(
        { error: 'Sheet URL and column name are required' },
        { status: 400 }
      );
    }

    // Get the user ID
    const userId = session.user.id;
    console.log('Creating job for user:', userId);

    // Extract the sheet ID from the URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([^/]+)/);
    if (!sheetIdMatch || !sheetIdMatch[1]) {
      return NextResponse.json({ error: 'Invalid Google Sheet URL' }, { status: 400 });
    }
    const sheetId = sheetIdMatch[1];

    try {
      // Get the CSV export URL
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

      // Fetch the CSV data
      const response = await axios.get(csvUrl, { timeout: 10000 });
      const csvData = response.data;

      // Parse the CSV data using the existing functions
      const { headers, rows } = parseCSV(csvData);

      // Ensure the specified column exists
      if (!headers.includes(columnName)) {
        return NextResponse.json(
          { error: `Column "${columnName}" not found in sheet` },
          { status: 400 }
        );
      }

      // Extract URLs from the specified column
      const urls = rows
        .map((row) => row[columnName])
        .filter((url) => url && url.trim() !== '' && (
          url.startsWith('http') || url.startsWith('www.') || 
          !url.includes(' ') // Accept domains without http/www
        ));

      if (urls.length === 0) {
        return NextResponse.json(
          { error: 'No valid URLs found in the specified column' },
          { status: 400 }
        );
      }
      
      // For hardcoded users, use in-memory processing to avoid DB errors
      if (userId.startsWith('hardcoded-')) {
        console.log('Creating job for hardcoded user - storing in memory AND database');
        
        // Create a real job ID
        const jobId = `job-${uuidv4()}`;
        
        try {
          // Save to database first
          prisma = prismaClientSingleton();
          
          // First ensure that the hardcoded user exists in the database
          const username = userId.replace('hardcoded-', '');
          const userEmail = `${username}@example.com`;
          
          // Check if user exists
          const existingUser = await prisma.user.findUnique({
            where: { email: userEmail },
          });
          
          // If user doesn't exist, create it
          if (!existingUser) {
            console.log(`Creating missing user in database for ${userId} with email ${userEmail}`);
            const hashedPassword = await hash('funnelstrike@135', 10);
            await prisma.user.create({
              data: {
                id: userId, // Use the hardcoded ID format
                name: username,
                email: userEmail,
                password: hashedPassword,
              },
            });
            console.log(`Created user ${userId} in database`);
          }
          
          // Now create the job
          const dbJob = await prisma.job.create({
            data: {
              id: jobId, // Use our generated ID
              sheetUrl,
              columnName,
              status: 'pending',
              totalUrls: urls.length,
              userId: userId, // Already contains hardcoded-username
              name: jobName || `${columnName} extraction`,
            },
          });
          
          console.log(`Created database job for hardcoded user: ${dbJob.id} with user ID: ${userId}`);
          
          // Now also store in memory for real-time processing
          const newJob = {
            id: jobId,
            name: jobName || `${columnName} extraction`,
            sheetUrl,
            columnName,
            status: 'created',
            totalWebsites: urls.length,
            processedWebsites: 0,
            progress: 0,
            results: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: userId
          };
          
          // Store in memory
          hardcodedJobs.set(jobId, newJob);
          console.log(`Stored job ${jobId} in memory for user ${userId}`);
          
          // Start processing in background
          setTimeout(() => {
            processJob(jobId, urls);
          }, 100);
          
          return NextResponse.json({
            job: {
              id: jobId,
              name: newJob.name,
              sheetUrl,
              columnName,
              status: 'created',
              totalUrls: urls.length,
              processedUrls: 0,
              progress: 0,
              createdAt: newJob.createdAt,
              updatedAt: newJob.updatedAt,
              userId
            }
          }, { status: 201 });
        } catch (dbError) {
          console.error('Error saving hardcoded job to database:', dbError);
          
          // Fall back to memory-only if database fails
          const newJob = {
            id: jobId,
            name: jobName || `${columnName} extraction`,
            sheetUrl,
            columnName,
            status: 'created',
            totalWebsites: urls.length,
            processedWebsites: 0,
            progress: 0,
            results: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            userId: userId
          };
          
          // Store in memory only
          hardcodedJobs.set(jobId, newJob);
          console.log(`Stored job ${jobId} in memory ONLY for user ${userId} (database save failed)`);
          
          // Start processing in background
          setTimeout(() => {
            processJob(jobId, urls);
          }, 100);
          
          return NextResponse.json({
            job: {
              id: jobId,
              name: newJob.name,
              sheetUrl,
              columnName,
              status: 'created',
              totalUrls: urls.length,
              processedUrls: 0,
              progress: 0,
              createdAt: newJob.createdAt,
              updatedAt: newJob.updatedAt,
              userId
            }
          }, { status: 201 });
        }
      }

      // Create a fresh Prisma client for database operations
      prisma = prismaClientSingleton();
      
      console.log(`Creating job for user ${userId} with ${urls.length} URLs`);
      const finalJobName = jobName || `${columnName} extraction`;
      const job = await prisma.job.create({
        data: {
          sheetUrl,
          columnName,
          status: 'pending',
          totalUrls: urls.length,
          userId: userId,
          name: finalJobName,
        },
      });

      // Start the scraping process in the background with a copy of the job ID and URLs
      const jobId = job.id;
      const urlsCopy = [...urls];
      
      // Use setTimeout to run this after the current request is complete
      setTimeout(() => {
        startEmailScraping(jobId, urlsCopy);
      }, 100);

      return NextResponse.json({ job }, { status: 201 });
    } catch (error) {
      console.error('Job creation error:', error);
      return NextResponse.json(
        { error: `Failed to process sheet: ${String(error)}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Create job error:', error);
    return NextResponse.json(
      { error: `Failed to create job: ${String(error)}` },
      { status: 500 }
    );
  } finally {
    // Clean up the Prisma client
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

// Helper function to parse CSV
function parseCSV(csv: string) {
  const lines = csv.split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse headers (first row)
  const headers = parseCSVRow(lines[0]);
  
  // Parse data rows (skip header)
  const rows = lines.slice(1).map(line => {
    if (line.trim() === '') return {};
    const rowValues = parseCSVRow(line);
    
    // Create an object mapping headers to values
    return headers.reduce((obj, header, i) => {
      obj[header] = rowValues[i] || '';
      return obj;
    }, {} as Record<string, string>);
  }).filter(row => Object.keys(row).length > 0);
  
  return { headers, rows };
}

// Helper to parse a CSV row, handling quoted fields
function parseCSVRow(row: string) {
  const fields = [];
  let inQuotes = false;
  let currentField = '';
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
      inQuotes = !inQuotes;
      continue;
    }
    
    if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
      continue;
    }
    
    currentField += char;
  }
  
  // Add the last field
  fields.push(currentField.trim());
  
  return fields.map(field => {
    // Remove surrounding quotes
    if (field.startsWith('"') && field.endsWith('"')) {
      return field.substring(1, field.length - 1);
    }
    return field;
  });
}

// Process jobs for hardcoded users
async function processJob(jobId: string, urls: string[]) {
  console.log(`Processing job ${jobId} with ${urls.length} URLs`);
  
  // Get the job from memory
  const job = hardcodedJobs.get(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found in memory store`);
    return;
  }
  
  // Update job status to processing
  job.status = 'processing';
  job.updatedAt = new Date().toISOString();
  hardcodedJobs.set(jobId, { ...job });
  
  // Process URLs in batches to avoid overloading
  const batchSize = 3;
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (url) => {
      try {
        // Process the website
        const email = await processWebsite(url);
        
        // Add result
        job.results.push({
          website: url,
          email
        });
        
        // Update progress
        job.processedWebsites = (job.processedWebsites || 0) + 1;
        const processedCount = job.processedWebsites || 0;
        const totalCount = job.totalWebsites || 1;
        job.progress = Math.round((processedCount / totalCount) * 100);
        job.updatedAt = new Date().toISOString();
        hardcodedJobs.set(jobId, { ...job });
        
        console.log(`Processed ${url}, progress: ${job.progress}%`);
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
        
        // Add failed result
        job.results.push({
          website: url,
          email: null
        });
        
        // Still update progress
        job.processedWebsites = (job.processedWebsites || 0) + 1;
        const processedCount = job.processedWebsites || 0;
        const totalCount = job.totalWebsites || 1;
        job.progress = Math.round((processedCount / totalCount) * 100);
        job.updatedAt = new Date().toISOString();
        hardcodedJobs.set(jobId, { ...job });
      }
    }));
    
    // Delay between batches to not overwhelm resources
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Mark as completed
  job.status = 'completed';
  job.progress = 100;
  job.updatedAt = new Date().toISOString();
  hardcodedJobs.set(jobId, { ...job });
  
  console.log(`Job ${jobId} completed with ${job.results.length} results`);
}

// Process a website to extract emails
async function processWebsite(website: string): Promise<string | null> {
  console.log(`Processing website: ${website}`);
  
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
    const email = await extractEmailsFromHtml(response.data, website);
    return email;
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
        
        const email = await extractEmailsFromHtml(response.data, website);
        return email;
      } catch (innerError) {
        console.error(`Error fetching ${website}:`, innerError);
        return null;
      }
    } else {
      console.error(`Error fetching ${website}:`, error);
      return null;
    }
  }
}

// Helper function to extract emails from HTML content
async function extractEmailsFromHtml(html: string, website: string): Promise<string | null> {
  try {
    const $ = cheerio.load(html);
    const bodyText = $('body').text();
    
    // Email regex pattern
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = bodyText.match(emailRegex) || [];
    
    if (emails.length > 0) {
      // Filter out common service emails like noreply, admin, etc.
      const filteredEmails = emails.filter(email => {
        const lowerEmail = email.toLowerCase();
        return !lowerEmail.includes('noreply') && 
               !lowerEmail.includes('no-reply') && 
               !lowerEmail.includes('donotreply') && 
               !lowerEmail.includes('no_reply');
      });
      
      if (filteredEmails.length > 0) {
        // Get most relevant email (contains 'contact', 'info', etc.)
        const priorityEmails = filteredEmails.filter(email => {
          const lowerEmail = email.toLowerCase();
          return lowerEmail.includes('contact') || 
                 lowerEmail.includes('info') || 
                 lowerEmail.includes('hello') || 
                 lowerEmail.includes('support');
        });
        
        return priorityEmails.length > 0 ? priorityEmails[0] : filteredEmails[0];
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error extracting emails from ${website}:`, error);
    return null;
  }
} 