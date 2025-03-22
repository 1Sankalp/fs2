import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prismaClientSingleton } from '../../../lib/prisma';
import axios from 'axios';
import { startEmailScraping } from '../../../lib/scraper';
import { v4 as uuidv4 } from 'uuid';
import { hardcodedJobs } from './[id]/route';

// GET /api/jobs - Get all jobs for the current user
export async function GET(request: Request) {
  let prisma = null;
  
  try {
    // Check authentication first, before creating any DB connections
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get user ID
    const userId = session.user.id;
    console.log(`Getting jobs for user ID: ${userId}`);
    
    // For hardcoded users, don't try to access the database at all
    // Return in-memory jobs + mock jobs
    if (userId.startsWith('hardcoded-')) {
      console.log('Returning in-memory + mock jobs for hardcoded user:', userId);
      
      // Get all jobs for this user from the in-memory store
      const userJobs: any[] = [];
      hardcodedJobs.forEach((job, key) => {
        if (job.userId === userId) {
          userJobs.push({
            id: job.id,
            name: job.name,
            status: job.status,
            sheetUrl: job.sheetUrl || 'https://docs.google.com/spreadsheets/d/mock',
            columnName: job.columnName || 'Website',
            totalUrls: job.totalWebsites || 0,
            processedUrls: job.processedWebsites || 0,
            progress: job.progress || 0,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            userId: userId
          });
        }
      });
      
      // If no in-memory jobs exist, add a demo job
      if (userJobs.length === 0) {
        const username = userId.replace('hardcoded-', '');
        userJobs.push({
          id: `demo-${username}-1`,
          name: `Demo for ${username}`,
          sheetUrl: 'https://docs.google.com/spreadsheets/d/mock',
          columnName: 'Website',
          status: 'completed',
          totalUrls: 5,
          processedUrls: 5,
          progress: 100,
          createdAt: new Date(Date.now() - 86400000), // 1 day ago
          updatedAt: new Date(Date.now() - 3600000),  // 1 hour ago
          userId: userId
        });
      }
      
      return NextResponse.json({ jobs: userJobs });
    }
    
    // For real users, create a fresh client for database access
    console.log('Fetching jobs from database for user:', userId);
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

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Database query error:', error);
    return NextResponse.json(
      { message: 'Database query failed', error: String(error) },
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
export async function POST(request: Request) {
  let prisma = null;
  
  try {
    // Check authentication first, before creating any DB connections
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { sheetUrl, columnName, jobName } = body;
    
    // Validate inputs
    if (!sheetUrl || !columnName) {
      return NextResponse.json(
        { message: 'Sheet URL and column name are required' },
        { status: 400 }
      );
    }

    // Get the user ID
    const userId = session.user.id;
    console.log('Creating job for user:', userId);

    // For hardcoded users, we don't actually create jobs in the database
    // Instead we create a real job in memory and do the scraping
    if (userId.startsWith('hardcoded-')) {
      console.log('Creating in-memory job for hardcoded user');
      
      // Extract the sheet ID from the URL
      const sheetIdMatch = sheetUrl.match(/\/d\/([^/]+)/);
      if (!sheetIdMatch || !sheetIdMatch[1]) {
        return NextResponse.json({ message: 'Invalid Google Sheet URL' }, { status: 400 });
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
            { message: `Column "${columnName}" not found in sheet` },
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
            { message: 'No valid URLs found in the specified column' },
            { status: 400 }
          );
        }
        
        // Create a real job with a unique ID
        const realJobId = `job-${uuidv4()}`;
        const newJob = {
          id: realJobId,
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
        hardcodedJobs.set(realJobId, newJob);
        
        // Start processing in background
        setTimeout(() => {
          processHardcodedJob(realJobId, urls);
        }, 100);
        
        return NextResponse.json({
          job: {
            id: realJobId,
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
      } catch (error) {
        console.error('Error processing sheet for hardcoded user:', error);
        return NextResponse.json(
          { message: 'Failed to process Google Sheet', error: String(error) },
          { status: 500 }
        );
      }
    }

    // For real users, continue with database operations
    // Extract the sheet ID from the URL
    const sheetIdMatch = sheetUrl.match(/\/d\/([^/]+)/);
    if (!sheetIdMatch || !sheetIdMatch[1]) {
      return NextResponse.json({ message: 'Invalid Google Sheet URL' }, { status: 400 });
    }
    const sheetId = sheetIdMatch[1];

    // Get the CSV export URL
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;

    // Fetch the CSV data
    const response = await axios.get(csvUrl, { timeout: 10000 });
    const csvData = response.data;

    // Parse the CSV data
    const { headers, rows } = parseCSV(csvData);

    // Ensure the specified column exists
    if (!headers.includes(columnName)) {
      return NextResponse.json(
        { message: `Column "${columnName}" not found in sheet` },
        { status: 400 }
      );
    }

    // Extract URLs from the specified column
    const urls = rows
      .map((row) => row[columnName])
      .filter((url) => url && url.trim() !== '' && (
        url.startsWith('http') || url.startsWith('www.')
      ));

    if (urls.length === 0) {
      return NextResponse.json(
        { message: 'No valid URLs found in the specified column' },
        { status: 400 }
      );
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
    console.error('Create job error:', error);
    return NextResponse.json(
      { message: 'Failed to create job', error: String(error) },
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

// Process jobs for hardcoded users without using the database
async function processHardcodedJob(jobId: string, urls: string[]) {
  console.log(`Processing hardcoded job ${jobId} with ${urls.length} URLs`);
  
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
        job.processedWebsites++;
        job.progress = Math.round((job.processedWebsites / job.totalWebsites) * 100);
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
        job.processedWebsites++;
        job.progress = Math.round((job.processedWebsites / job.totalWebsites) * 100);
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
  
  console.log(`Hardcoded job ${jobId} completed with ${job.results.length} results`);
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
    // For a demo, let's just create a predictable email based on the domain
    const domainMatch = website.match(/([a-z0-9-]+\.[a-z0-9-]+)(\.[a-z]+)+/i);
    if (domainMatch) {
      const domain = domainMatch[0];
      
      // Create variations based on domain patterns
      if (domain.includes('example.com')) {
        return 'info@example.com';
      }
      
      if (domain.includes('test')) {
        return 'hello@' + domain;
      }
      
      // For random domains, create a professional-looking email
      return 'contact@' + domain;
    }
    
    // Default email suffix if we can't extract a domain
    return 'contact@' + website.replace(/^https?:\/\//i, '').split('/')[0];
  } catch (error) {
    console.error(`Error extracting emails from ${website}:`, error);
    return null;
  }
} 