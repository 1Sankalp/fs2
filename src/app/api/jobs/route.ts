import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import axios from 'axios';
import { startEmailScraping } from '../../../lib/scraper';
import { v4 as uuidv4 } from 'uuid';
import { hardcodedJobs, getJobById, deleteJob, syncJobToDatabase, loadJobsFromDatabase } from '@/lib/hardcodedJobs';
import * as cheerio from 'cheerio';
import { hash } from 'bcrypt';
import { PrismaClient } from '@prisma/client';

// GET /api/jobs - Get all jobs for the current user
export async function GET(request: NextRequest) {
  let prismaClient: PrismaClient | null = null;
  
  try {
    // Check authentication first
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const userId = session.user.id;
    
    // Wrap database operations in a try-catch for more resilient operation
    try {
      // Create a fresh Prisma client for this request
      prismaClient = prismaClientSingleton();
      
      // First, check if we need to sync in-memory store with database
      if (userId.startsWith('hardcoded-')) {
        // Try to load latest database state into memory
        try {
          await loadJobsFromDatabase();
        } catch (loadError) {
          console.error('Failed to load jobs from database:', loadError);
          // Continue - we'll use what's in memory
        }
        
        // Get jobs from memory store for this user
        console.log(`Getting in-memory jobs for user ${userId}`);
        const memoryJobs = hardcodedJobs.getJobsForUser(userId);
        console.log(`Found ${memoryJobs.length} jobs in memory for user ${userId}`);
        
        // Format in-memory jobs to match expected structure
        const formattedJobs = memoryJobs.map(job => {
          const totalUrls = job.totalWebsites || 0;
          const processedUrls = job.processedWebsites || 0;
          const progress = totalUrls > 0 ? Math.floor((processedUrls / totalUrls) * 100) : 0;
          
          return {
            id: job.id,
            name: job.name,
            status: job.status,
            sheetUrl: job.sheetUrl,
            columnName: job.columnName,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            totalUrls: totalUrls,
            processedUrls: processedUrls,
            progress: progress,
          };
        });
        
        console.log(`Returning ${formattedJobs.length} combined jobs for user ${userId}`);
        return NextResponse.json({ jobs: formattedJobs });
      }
      
      // For real users, get jobs from database
      let retryCount = 0;
      const MAX_RETRIES = 3;
      
      while (retryCount < MAX_RETRIES) {
        try {
          // Query database for jobs
          const dbJobs = await prismaClient.job.findMany({
            where: { userId },
            orderBy: { updatedAt: 'desc' },
          });
          
          console.log(`Found ${dbJobs.length} jobs in database for user ${userId}`);
          
          // Query counts separately to avoid performance issues
          const jobsWithCounts = await Promise.all(
            dbJobs.map(async (job) => {
              try {
                const resultCount = await prismaClient!.result.count({
                  where: { jobId: job.id }
                });
                
                return {
                  ...job,
                  processedUrls: resultCount,
                  totalUrls: job.totalUrls || 0,
                  progress: job.totalUrls ? Math.floor((resultCount / job.totalUrls) * 100) : 0
                };
              } catch (countError) {
                console.error(`Error counting results for job ${job.id}:`, countError);
                // Return job without count information if we can't get it
                return {
                  ...job,
                  processedUrls: 0,
                  totalUrls: job.totalUrls || 0,
                  progress: 0
                };
              }
            })
          );
          
          return NextResponse.json({ jobs: jobsWithCounts });
        } catch (dbError) {
          retryCount++;
          console.error(`Database error fetching jobs (attempt ${retryCount}/${MAX_RETRIES}):`, dbError);
          
          if (retryCount >= MAX_RETRIES) {
            throw dbError; // Let outer handler catch it
          }
          
          // Add exponential backoff delay between retries
          const delay = Math.pow(2, retryCount) * 300; // 600ms, 1200ms, 2400ms
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    } catch (error) {
      console.error('Database error in GET /api/jobs:', error);
      
      // For hardcoded users, try to return memory data even if database fails
      if (userId.startsWith('hardcoded-')) {
        const memoryJobs = hardcodedJobs.getJobsForUser(userId);
        
        if (memoryJobs.length > 0) {
          console.log(`Returning ${memoryJobs.length} memory-only jobs due to database failure`);
          
          const formattedJobs = memoryJobs.map(job => ({
            id: job.id,
            name: job.name,
            status: job.status,
            sheetUrl: job.sheetUrl,
            columnName: job.columnName,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            totalUrls: job.totalWebsites || 0,
            processedUrls: job.processedWebsites || 0,
            progress: job.progress || 0,
          }));
          
          return NextResponse.json({ 
            jobs: formattedJobs,
            notice: 'Using memory-only data due to database error'
          });
        }
      }
      
      // If all else fails, return an error
      return NextResponse.json({ 
        error: 'Error fetching jobs',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Critical error in GET /api/jobs:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch jobs',
      details: error instanceof Error ? error.message : 'Unknown server error'
    }, { status: 500 });
  } finally {
    if (prismaClient) {
      await prismaClient.$disconnect().catch(console.error);
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
    console.log('Creating job for user:', userId, 'with name:', jobName);

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

        // Before creating a new job, log the current state
        console.log(`Before new job creation - in-memory jobs count: ${hardcodedJobs.size()}`);
        const existingJobsCount = hardcodedJobs.values().filter(job => job.userId === userId).length;
        console.log(`Existing jobs for user ${userId}: ${existingJobsCount}`);
        
        try {
          // Save to database first
          prisma = prismaClientSingleton();
          
          // No need to check for user by email or create it
          // Just use the hardcoded user ID directly
          console.log(`Using hardcoded user ID for job creation: ${userId}`);
          
          // Create the job using the hardcoded userID
          const dbJob = await prisma.job.create({
            data: {
              name: jobName || `${columnName} extraction`,
              status: 'processing',
              sheetUrl,
              columnName,
              userId,
              totalUrls: urls.length,
            },
          });
          
          const now = new Date().toISOString();
          
          // Create the in-memory job object - we're not clearing existing jobs
          const memoryJob = {
            id: dbJob.id,
            name: dbJob.name || `${columnName} extraction`,
            status: 'processing',
            sheetUrl,
            columnName,
            userId,
            createdAt: now,
            updatedAt: now,
            totalWebsites: urls.length,
            processedWebsites: 0,
            progress: 0,
            results: []
          };
          
          // Store in memory
          hardcodedJobs.set(dbJob.id, memoryJob);
          
          // Log the state after creating the new job
          console.log(`After new job creation - in-memory jobs count: ${hardcodedJobs.size()}`);
          const newJobsCount = hardcodedJobs.values().filter(job => job.userId === userId).length;
          console.log(`Updated jobs for user ${userId}: ${newJobsCount}`);
          
          // Start the scraping process
          startEmailScraping(dbJob.id, urls).catch(error => {
            console.error(`Error starting email scraping for job ${dbJob.id}:`, error);
          });
          
          return NextResponse.json({ success: true, job: dbJob });
        } finally {
          if (prisma) {
            await prisma.$disconnect();
          }
        }
      }
      
      // For regular users, use standard database workflow
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

// Helper function to parse a CSV row, handling quoted fields
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