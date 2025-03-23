import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import { hardcodedJobs } from '@/lib/hardcodedJobs';

// Helper function to find common/most relevant email
function findCommonEmail(emails: string[]): string | null {
  if (!emails || emails.length === 0) return null;
  if (emails.length === 1) return emails[0];

  // First try to find emails with common patterns
  const priorityEmails = emails.filter(email => {
    const lowerEmail = email.toLowerCase();
    return lowerEmail.includes('contact') || 
           lowerEmail.includes('info') || 
           lowerEmail.includes('hello') || 
           lowerEmail.includes('support');
  });
  
  if (priorityEmails.length > 0) {
    return priorityEmails[0];
  }
  
  // If no priority emails, return the first one
  return emails[0];
}

// Clean and group emails by domain
function groupAndCleanEmails(results: any[]): { [domain: string]: string[] } {
  const emailsByDomain: { [domain: string]: string[] } = {};
  
  results.forEach(result => {
    if (result.email) {
      // Extract domain from email
      const emailParts = result.email.split('@');
      if (emailParts.length !== 2) return;
      
      const domain = emailParts[1].toLowerCase();
      
      if (!emailsByDomain[domain]) {
        emailsByDomain[domain] = [];
      }
      
      // Add email if not already in the list
      if (!emailsByDomain[domain].includes(result.email)) {
        emailsByDomain[domain].push(result.email);
      }
    }
  });
  
  return emailsByDomain;
}

export async function GET(request: NextRequest) {
  let freshPrisma = null;

  try {
    // Extract job ID from request URL
    const url = new URL(request.url);
    const id = url.pathname.split('/').slice(-2)[0]; // Get the ID from the path

    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`Download request for job ID: ${id}`);

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('Download request - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`Download request - User ID: ${userId}`);

    let results: any[] = [];
    let jobName = 'job-export';
    
    // For hardcoded users, check in-memory store first
    if (userId.startsWith('hardcoded-') && hardcodedJobs.has(id)) {
      console.log(`Checking in-memory job for hardcoded user ${userId}`);
      const job = hardcodedJobs.get(id);
      
      // Check if this job belongs to this user
      if (job.userId !== userId) {
        console.log(`Job ${id} belongs to ${job.userId}, not current user ${userId}`);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
      
      console.log(`Found in-memory job ${id} with ${job.results?.length || 0} results`);
      results = job.results || [];
      jobName = job.name || 'job-export';
    }
    
    // If results are empty, try to fetch from database
    // Always fetch from database for non-hardcoded users
    if (results.length === 0 || !userId.startsWith('hardcoded-')) {
      console.log(`Fetching job ${id} results from database`);
      
      try {
        // Create fresh client to avoid prepared statement conflicts
        freshPrisma = prismaClientSingleton();
        
        // Get job from database
        const job = await freshPrisma.job.findUnique({
          where: { id },
          include: {
            results: true,
          },
        });

        if (!job) {
          console.log(`Job ${id} not found in database`);
          return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Check if the job belongs to the current user
        if (job.userId !== userId) {
          console.log(`Job ${id} belongs to ${job.userId}, not current user ${userId}`);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        jobName = job.name || 'job-export';
        results = job.results;
        console.log(`Found database job ${id} with ${results.length} results`);
      } catch (dbError) {
        console.error(`Database error fetching job ${id} results:`, dbError);
        
        // If we already have memory results, continue with those
        if (results.length > 0) {
          console.log(`Proceeding with ${results.length} memory results despite database error`);
        } else {
          return NextResponse.json({ error: 'Database error fetching job results' }, { status: 500 });
        }
      } finally {
        if (freshPrisma) {
          await freshPrisma.$disconnect();
        }
      }
    }

    // Convert results to CSV
    let csv = 'Website,Email\n';
    
    // Group emails by domain for quality control
    const emailsByDomain = groupAndCleanEmails(results);
    
    // Map of websites to their corresponding emails (cleaned)
    const websiteToEmail: Map<string, string> = new Map();
    
    // Process each result and map website to best email
    results.forEach(result => {
      let website = result.website || '';
      
      // Clean up website for CSV (remove http/https)
      if (website.startsWith('http://')) {
        website = website.substring(7);
      } else if (website.startsWith('https://')) {
        website = website.substring(8);
      }
      
      // Remove trailing slash if present
      if (website.endsWith('/')) {
        website = website.substring(0, website.length - 1);
      }
      
      // Only add if we have a website
      if (website) {
        if (result.email) {
          websiteToEmail.set(website, result.email);
        } else if (!websiteToEmail.has(website)) {
          // Only set to empty if we don't already have an email for this website
          websiteToEmail.set(website, '');
        }
      }
    });
    
    // Build CSV from the map
    websiteToEmail.forEach((email, website) => {
      // Escape quotes in CSV
      const safeWebsite = website.replace(/"/g, '""');
      const safeEmail = email.replace(/"/g, '""');
      
      csv += `"${safeWebsite}","${safeEmail}"\n`;
    });

    // Set response headers for CSV download
    const filename = `${jobName.replace(/[^\w\s-]/gi, '')}-${new Date().toISOString().slice(0, 10)}.csv`;
    
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generating CSV:', error);
    return NextResponse.json({ error: 'Failed to generate CSV' }, { status: 500 });
  }
}