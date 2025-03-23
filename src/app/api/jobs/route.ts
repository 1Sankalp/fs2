import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prismaClientSingleton } from '../../../lib/prisma';
import axios from 'axios';
import { startEmailScraping } from '../../../lib/scraper';
import { v4 as uuidv4 } from 'uuid';
import { hardcodedJobs, getJobById, deleteJob, syncJobToDatabase } from '@/lib/hardcodedJobs';
import * as cheerio from 'cheerio';
import { hash } from 'bcrypt';
import { uuid } from '@/lib/uuid';

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
        } else {
          // Update the DB job with memory job properties that might be more up-to-date
          const dbJobIndex = allJobs.findIndex(job => job.id === memJob.id);
          if (dbJobIndex !== -1) {
            // Ensure we maintain a consistent property naming convention
            allJobs[dbJobIndex] = {
              ...allJobs[dbJobIndex],
              status: memJob.status,
              progress: memJob.progress || 0,
              processedUrls: memJob.processedUrls || 0,
              updatedAt: memJob.updatedAt
            };
          }
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
        { error: `