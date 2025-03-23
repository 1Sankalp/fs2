import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import { hardcodedJobs } from '@/lib/hardcodedJobs';

export async function GET(request: NextRequest) {
  let freshPrisma = null;

  try {
    // Extract job ID from request URL
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop(); // Extract the last segment

    if (!id) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`Getting job details for job ID: ${id}`);

    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('No session found - user not authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID from session: ${userId}`);

    // Check for hardcoded users first
    if (userId.startsWith('hardcoded-')) {
      console.log(`User is hardcoded, checking memory store for job ${id}`);
      
      if (hardcodedJobs.has(id)) {
        console.log(`Found job ${id} in memory store`);
        const job = hardcodedJobs.get(id);
        
        // Check if this job belongs to this user
        if (job && job.userId !== userId) {
          console.log(`Job ${id} belongs to ${job.userId}, not current user ${userId}`);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        if (job) {
          const totalWebsites = job.totalWebsites || 0;
          const processedWebsites = job.processedWebsites || 0;
          const progress = totalWebsites > 0 ? Math.min(100, Math.floor((processedWebsites / totalWebsites) * 100)) : 0;

          return NextResponse.json({
            job: {
              id: job.id,
              name: job.name,
              status: job.status,
              sheetUrl: job.sheetUrl,
              columnName: job.columnName,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              progress: progress,
              totalUrls: totalWebsites,
              processedUrls: processedWebsites,
              userId: job.userId
            },
            results: job.results || []
          });
        }
      } else {
        console.log(`Job ${id} not found in memory store for user ${userId}`);
      }
    }

    // If we get here, we need to check the database with a fresh client
    console.log(`Fetching job ${id} from database for user ${userId}`);
    try {
      // Create a fresh client with a unique connection ID to avoid prepared statement conflicts
      freshPrisma = prismaClientSingleton();
      
      // First get the job without results to verify ownership
      const job = await freshPrisma.job.findUnique({
        where: { id },
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
      
      console.log(`Successfully found job ${id} for user ${userId} in database, fetching results...`);
      
      // Now get the results in a separate query to avoid prepared statement issues
      const results = await freshPrisma.result.findMany({
        where: { jobId: id },
        orderBy: { createdAt: 'asc' },
      });
      
      console.log(`Found ${results.length} results for job ${id}`);
      
      const totalWebsites = job.totalUrls || 0;
      const processedWebsites = results.length;
      const progress = totalWebsites > 0 ? Math.min(100, Math.floor((processedWebsites / totalWebsites) * 100)) : 0;

      // Format the response to match what the frontend expects
      return NextResponse.json({
        job: {
          ...job,
          progress,
          totalUrls: totalWebsites,
          processedUrls: processedWebsites,
        },
        results: results.map(result => ({
          website: result.website,
          email: result.email
        }))
      });
    } catch (dbError) {
      console.error(`Database error fetching job ${id}:`, dbError);
      return NextResponse.json({ error: 'Database error fetching job' }, { status: 500 });
    } finally {
      if (freshPrisma) {
        await freshPrisma.$disconnect();
      }
    }
  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json({ error: 'Failed to get job' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let freshPrisma = null;

  try {
    // Extract job ID from request URL
    const url = new URL(request.url);
    const id = url.pathname.split('/').pop();

    if (!id) {
      console.error('DELETE request missing job ID');
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`DELETE request for job ID: ${id}`);

    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('DELETE request - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`DELETE request - User ID: ${userId}`);

    try {
      // Use the imported deleteJob function from hardcodedJobs
      const { deleteJob } = await import('@/lib/hardcodedJobs');
      
      // First check if the job exists and belongs to the user
      freshPrisma = prismaClientSingleton();
      
      // Whether job is in memory or database, we need to check ownership
      let jobExists = false;
      let jobBelongsToUser = false;
      
      // Check in database first
      try {
        const dbJob = await freshPrisma.job.findUnique({
          where: { id },
          select: { id: true, userId: true }
        });
        
        if (dbJob) {
          jobExists = true;
          jobBelongsToUser = dbJob.userId === userId;
          console.log(`Job ${id} found in database, belongs to user: ${jobBelongsToUser}`);
        } else {
          console.log(`Job ${id} not found in database`);
        }
      } catch (dbLookupError) {
        console.error(`Error checking job ${id} in database:`, dbLookupError);
      }
      
      // If not in database or ownership check failed, check in memory
      if (!jobExists || !jobBelongsToUser) {
        const { hardcodedJobs } = await import('@/lib/hardcodedJobs');
        if (hardcodedJobs.has(id)) {
          const memoryJob = hardcodedJobs.get(id);
          jobExists = true;
          jobBelongsToUser = memoryJob?.userId === userId;
          console.log(`Job ${id} found in memory, belongs to user: ${jobBelongsToUser}`);
        } else {
          console.log(`Job ${id} not found in memory`);
        }
      }
      
      // If job doesn't exist anywhere, return 404
      if (!jobExists) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      
      // If job doesn't belong to user, return 403
      if (!jobBelongsToUser) {
        return NextResponse.json({ error: 'You do not have permission to delete this job' }, { status: 403 });
      }
      
      // At this point, we've verified the job exists and belongs to the user
      console.log(`Deleting job ${id} for user ${userId}`);
      const deleteResult = await deleteJob(id);
      
      if (deleteResult) {
        return NextResponse.json({ 
          success: true, 
          message: 'Job deleted successfully',
          jobId: id 
        });
      } else {
        console.error(`Failed to delete job ${id}`);
        return NextResponse.json({ 
          error: 'Failed to delete job completely', 
          partialSuccess: true 
        }, { status: 500 });
      }
    } catch (error: any) {
      console.error(`Error in DELETE handler for job ${id}:`, error);
      return NextResponse.json({ 
        error: 'Server error deleting job',
        message: error.message || 'Unknown error'
      }, { status: 500 });
    } finally {
      if (freshPrisma) {
        await freshPrisma.$disconnect();
      }
    }
  } catch (error: any) {
    console.error('Critical error in DELETE handler:', error);
    return NextResponse.json({ 
      error: 'Critical server error',
      message: error.message || 'Unknown error'
    }, { status: 500 });
  }
}
