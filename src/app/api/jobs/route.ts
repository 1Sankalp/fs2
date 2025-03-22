import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { prismaClientSingleton } from '../../../lib/prisma';
import axios from 'axios';
import { startEmailScraping } from '../../../lib/scraper';

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
    
    // For hardcoded users, create mock data without hitting the database
    if (userId.startsWith('hardcoded-')) {
      const username = userId.replace('hardcoded-', '');
      const mockJobs = [
        {
          id: `demo-1`,
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
        }
      ];
      
      return NextResponse.json({ jobs: mockJobs });
    }
    
    // For real users, create a fresh client for database access
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

    // Handle hardcoded users without database access
    const userId = session.user.id;
    if (userId.startsWith('hardcoded-')) {
      const mockJob = {
        id: `demo-${Date.now()}`,
        name: `Demo for ${userId.replace('hardcoded-', '')}`,
        sheetUrl,
        columnName,
        status: 'completed',
        totalUrls: 5,
        processedUrls: 5,
        progress: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userId,
        results: [
          { website: 'example.com', email: 'contact@example.com' },
          { website: 'demo-site.com', email: 'info@demo-site.com' },
          { website: 'test-company.com', email: 'hello@test-company.com' }
        ]
      };
      
      return NextResponse.json({ job: mockJob }, { status: 201 });
    }

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
    const parseCSV = (csv: string) => {
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
    };

    // Helper to parse a CSV row, handling quoted fields
    const parseCSVRow = (row: string) => {
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
    };

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
    
    // Check if the user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    
    if (!user) {
      return NextResponse.json(
        { message: 'User does not exist in database' },
        { status: 400 }
      );
    }
    
    // Create a new job
    const job = await prisma.job.create({
      data: {
        sheetUrl,
        columnName,
        status: 'pending',
        totalUrls: urls.length,
        userId: userId,
        name: jobName || `${columnName} extraction`,
      },
    });

    // Start the scraping process in the background with a copy of the job ID and URLs
    // This ensures the current request can finish and close its DB connection
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