import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';

// Create an in-memory job storage for hardcoded users
// This needs to be exported so other routes can access it
export const hardcodedJobs = new Map<string, any>();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Create a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    const id = params.id;
    console.log(`Getting job details for job ID: ${id}`);

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID: ${userId}`);

    // For hardcoded users, check in-memory store first
    if (userId.startsWith('hardcoded-')) {
      console.log(`Checking in-memory store for job ${id}`);
      
      // If we have the job in our in-memory store, use that data
      if (hardcodedJobs.has(id)) {
        console.log(`Found job ${id} in memory store`);
        const job = hardcodedJobs.get(id);
        
        return NextResponse.json({
          id: job.id,
          name: job.name,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          progress: job.progress || 0,
          totalWebsites: job.totalWebsites || 0,
          processedWebsites: job.processedWebsites || 0,
          results: job.results || []
        });
      }

      // If not in memory but is a demo job, return demo data
      if (id.startsWith('demo-')) {
        console.log(`Generating mock data for demo job ${id}`);
        // Generate a mock job with details
        const mockJob = {
          id,
          name: 'Demo Google Sheet',
          status: 'completed',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date().toISOString(),
          progress: 100,
          totalWebsites: 5,
          processedWebsites: 5,
          results: [
            { website: 'example.com', email: 'contact@example.com' },
            { website: 'demo-site.com', email: 'info@demo-site.com' },
            { website: 'test-company.com', email: 'hello@test-company.com' },
            { website: 'acme.org', email: 'support@acme.org' },
            { website: 'business.net', email: 'sales@business.net' }
          ]
        };
        
        return NextResponse.json(mockJob);
      }
    }

    // Standard database access for real users or non-demo jobs
    console.log(`Fetching job ${id} from database`);
    
    try {
      // Find the job in the database
      const job = await freshPrisma.job.findUnique({
        where: { id },
        include: {
          results: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Check if the job belongs to the current user
      if (job.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Calculate progress
      const totalWebsites = job.totalWebsites || 0;
      const processedWebsites = job.results.length;
      const progress = totalWebsites > 0 ? Math.min(100, Math.floor((processedWebsites / totalWebsites) * 100)) : 0;

      return NextResponse.json({
        ...job,
        progress,
        totalWebsites,
        processedWebsites,
      });
    } catch (error) {
      console.error('Database operation error:', error);
      return NextResponse.json(
        { error: `Database error: ${String(error)}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json(
      { error: 'Failed to get job' },
      { status: 500 }
    );
  } finally {
    await freshPrisma.$disconnect();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  // Create a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    const id = params.id;
    console.log(`Deleting job ID: ${id}`);

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID: ${userId}`);

    // For hardcoded users and in-memory jobs, just remove from memory
    if (userId.startsWith('hardcoded-')) {
      console.log(`Checking if job ${id} exists in memory store`);
      
      // Delete from in-memory if it exists
      if (hardcodedJobs.has(id)) {
        console.log(`Deleting job ${id} from memory store`);
        hardcodedJobs.delete(id);
        return NextResponse.json({ success: true });
      }
      
      // For demo jobs, just return success (nothing to delete)
      if (id.startsWith('demo-')) {
        return NextResponse.json({ success: true });
      }
    }

    // For real users and database jobs
    console.log(`Attempting to delete job ${id} from database`);
    
    try {
      // Find the job first
      const job = await freshPrisma.job.findUnique({
        where: { id },
      });

      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }

      // Check if the job belongs to the current user
      if (job.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      // Delete the job results first (due to foreign key constraints)
      await freshPrisma.result.deleteMany({
        where: { jobId: id },
      });

      // Then delete the job
      await freshPrisma.job.delete({
        where: { id },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Database operation error:', error);
      return NextResponse.json(
        { error: `Database error: ${String(error)}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Delete job error:', error);
    return NextResponse.json(
      { error: 'Failed to delete job' },
      { status: 500 }
    );
  } finally {
    await freshPrisma.$disconnect();
  }
} 