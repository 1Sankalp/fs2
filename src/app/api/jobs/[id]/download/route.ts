import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import { hardcodedJobs } from '@/lib/hardcodedJobs';

// Function to find common email from set of similar emails
const findCommonEmail = (emails: string[]): string => {
  if (!emails || emails.length === 0) return '';
  if (emails.length === 1) return emails[0];

  // Sort emails by length (shortest first)
  const sortedEmails = [...emails].sort((a, b) => a.length - b.length);
  const shortestEmail = sortedEmails[0];
  
  // Check if all other emails contain the shortest one
  if (sortedEmails.every(email => email.endsWith(shortestEmail))) {
    return shortestEmail;
  }
  
  // Try to find the common suffix (domain part)
  const domains = emails.map(email => {
    const atIndex = email.indexOf('@');
    return atIndex >= 0 ? email.substring(atIndex) : email;
  });
  
  const commonDomain = domains.reduce((common, domain) => {
    if (!common) return domain;
    // Find the longest common ending between current common and this domain
    let i = 1;
    while (i <= Math.min(common.length, domain.length) && 
           common.slice(-i) === domain.slice(-i)) {
      i++;
    }
    return common.slice(-i + 1);
  }, '');
  
  // Find username parts that are common or contained in others
  const usernames = emails.map(email => {
    const atIndex = email.indexOf('@');
    return atIndex >= 0 ? email.substring(0, atIndex) : '';
  });
  
  // For simplicity, find the shortest username that is contained in all others
  const sortedByUsernameLength = [...emails].sort((a, b) => {
    const aUsername = a.split('@')[0] || '';
    const bUsername = b.split('@')[0] || '';
    return aUsername.length - bUsername.length;
  });
  
  // Try each email, shortest username first
  for (const email of sortedByUsernameLength) {
    const [username, domain] = email.split('@');
    if (domain && domain.endsWith(commonDomain.slice(1)) && 
        sortedByUsernameLength.every(e => 
          e === email || e.includes(username + '@')
        )) {
      return email;
    }
  }
  
  // If no clear pattern, return the shortest email
  return shortestEmail;
};

// Group similar emails by domain
const groupAndCleanEmails = (results: { website: string, email: string | null }[]): { website: string, email: string | null }[] => {
  if (!results || results.length === 0) return [];
  
  // Group by website
  const websiteGroups: Record<string, string[]> = {};
  
  results.forEach(result => {
    if (result.email) {
      if (!websiteGroups[result.website]) {
        websiteGroups[result.website] = [];
      }
      websiteGroups[result.website].push(result.email);
    }
  });
  
  // Clean each group and create new results
  const cleanedResults: { website: string, email: string | null }[] = [];
  
  results.forEach(result => {
    // Skip if already processed
    if (cleanedResults.some(r => r.website === result.website)) {
      return;
    }
    
    const emails = websiteGroups[result.website];
    if (!emails || emails.length === 0) {
      cleanedResults.push(result); // Keep as is if no emails
    } else if (emails.length === 1) {
      cleanedResults.push({
        website: result.website,
        email: emails[0]
      });
    } else {
      // Find the common/cleanest email from the set
      const cleanedEmail = findCommonEmail(emails);
      cleanedResults.push({
        website: result.website,
        email: cleanedEmail
      });
    }
  });
  
  return cleanedResults;
};

// Define the route parameters interface to match Next.js requirements
interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  // Create a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    // Get the id from params
    const id = params.id;
    console.log(`Download requested for job ID: ${id}`);
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Get user ID
    const userId = session.user.id;
    console.log(`User ID: ${userId}`);
    
    // For hardcoded users, check in-memory store first
    if (userId.startsWith('hardcoded-')) {
      console.log(`Checking in-memory store for job ${id}`);
      
      // If we have the job in our in-memory store, use that data
      if (hardcodedJobs.has(id)) {
        console.log(`Found job ${id} in memory store`);
        const job = hardcodedJobs.get(id);
        
        // Generate CSV from in-memory results
        let csv = 'Website,Email\n';
        job.results.forEach((result: { website: string, email: string | null }) => {
          csv += `"${result.website}","${result.email || ''}"\n`;
        });

        const headers = new Headers();
        headers.append('Content-Type', 'text/csv');
        headers.append(
          'Content-Disposition',
          `attachment; filename="emails-${id}.csv"`
        );

        return new Response(csv, {
          headers,
        });
      }
    }

    // Standard flow for all users with database access
    console.log(`Fetching job ${id} from database`);
    try {
      // Fetch the job
      const job = await freshPrisma.job.findUnique({
        where: { id },
      });

      if (!job) {
        return new Response('Job not found', { status: 404 });
      }

      // Check if the job belongs to the current user
      if (job.userId !== userId) {
        return new Response('Unauthorized', { status: 403 });
      }

      // Fetch the job results
      const results = await freshPrisma.result.findMany({
        where: { jobId: id },
        orderBy: { createdAt: 'asc' },
      });

      console.log(`Found ${results.length} results for job ${id}`);

      // Clean and group emails
      const cleanedResults = groupAndCleanEmails(results);

      // Generate CSV
      let csv = 'Website,Email\n';
      cleanedResults.forEach((result) => {
        csv += `"${result.website}","${result.email || ''}"\n`;
      });

      const headers = new Headers();
      headers.append('Content-Type', 'text/csv');
      headers.append(
        'Content-Disposition',
        `attachment; filename="emails-${id}.csv"`
      );

      return new Response(csv, {
        headers,
      });
    } catch (error) {
      console.error('Database operation error:', error);
      return new Response(`Database error: ${String(error)}`, { status: 500 });
    }
  } catch (error) {
    console.error('Download job results error:', error);
    return new Response('Failed to download job results', { status: 500 });
  } finally {
    // Clean up the Prisma client
    await freshPrisma.$disconnect();
  }
} 