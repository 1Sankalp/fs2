import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import { hardcodedJobs, getJobById, deleteJob } from '@/lib/hardcodedJobs';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  let freshPrisma = null;

  try {
    const jobId = context.params.id;

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`Getting job details for job ID: ${jobId}`);

    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('No session found - user not authenticated');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID from session: ${userId}`);

    // First check in-memory jobs
    try {
      if (hardcodedJobs.has(jobId)) {
        console.log(`Found job ${jobId} in memory store`);
        const job = hardcodedJobs.get(jobId);
        
        // Check if this job belongs to this user
        if (job && job.userId !== userId) {
          console.log(`Job ${jobId} belongs to ${job.userId}, not current user ${userId}`);
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
      }
    } catch (memoryError) {
      console.error(`Error accessing memory store for job ${jobId}:`, memoryError);
      // Continue to database check
    }

    // If we get here, we need to check the database
    console.log(`Fetching job ${jobId} from database for user ${userId}`);
    
    // Try database with retries
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    while (retryCount < MAX_RETRIES) {
      try {
        if (freshPrisma) {
          await freshPrisma.$disconnect().catch(console.error);
        }
        
        // Create a fresh client with a unique connection ID to avoid prepared statement conflicts
        freshPrisma = prismaClientSingleton();
        
        // First get the job without results to verify ownership
        const job = await freshPrisma.job.findUnique({
          where: { id: jobId },
        });

        if (!job) {
          console.log(`Job ${jobId} not found in database`);
          return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        // Check if the job belongs to the current user
        if (job.userId !== userId) {
          console.log(`Job ${jobId} belongs to ${job.userId}, not current user ${userId}`);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        console.log(`Successfully found job ${jobId} for user ${userId} in database, fetching results...`);
        
        // Now get the results in a separate query to avoid prepared statement issues
        const results = await freshPrisma.result.findMany({
          where: { jobId: jobId },
          orderBy: { createdAt: 'asc' },
        });
        
        console.log(`Found ${results.length} results for job ${jobId}`);
        
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
        
        // If we reach here, we succeeded
        break;
      } catch (dbError) {
        retryCount++;
        console.error(`Database error fetching job ${jobId} (attempt ${retryCount}/${MAX_RETRIES}):`, dbError);
        
        if (retryCount >= MAX_RETRIES) {
          // After all retries, try to load from memory as fallback
          try {
            const memoryJob = await getJobById(jobId);
            if (memoryJob && memoryJob.userId === userId) {
              console.log(`Using memory job ${jobId} as database fallback`);
              
              const totalWebsites = memoryJob.totalWebsites || 0;
              const processedWebsites = memoryJob.processedWebsites || 0;
              const progress = totalWebsites > 0 ? 
                Math.min(100, Math.floor((processedWebsites / totalWebsites) * 100)) : 0;
                
              return NextResponse.json({
                job: {
                  id: memoryJob.id,
                  name: memoryJob.name,
                  status: memoryJob.status,
                  sheetUrl: memoryJob.sheetUrl,
                  columnName: memoryJob.columnName,
                  createdAt: memoryJob.createdAt,
                  updatedAt: memoryJob.updatedAt,
                  progress: progress,
                  totalUrls: totalWebsites,
                  processedUrls: processedWebsites,
                  userId: memoryJob.userId
                },
                results: memoryJob.results || []
              });
            }
          } catch (memoryFallbackError) {
            console.error('Memory fallback failed:', memoryFallbackError);
          }
          
          return NextResponse.json({ 
            error: 'Database error fetching job',
            details: `Failed after ${MAX_RETRIES} attempts` 
          }, { status: 500 });
        }
        
        // Add exponential backoff delay between retries
        const delay = Math.pow(2, retryCount) * 300; // 600ms, 1200ms, 2400ms
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json({ error: 'Failed to get job' }, { status: 500 });
  } finally {
    if (freshPrisma) {
      await freshPrisma.$disconnect().catch(console.error);
    }
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } }
) {
  let freshPrisma = null;

  try {
    const jobId = context.params.id;

    if (!jobId) {
      console.error('DELETE request missing job ID');
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`DELETE request for job ID: ${jobId}`);

    const session = await getServerSession(authOptions);
    if (!session) {
      console.log('DELETE request - No session found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`DELETE request - User ID: ${userId}`);

    try {
      // Whether job is in memory or database, we need to check ownership
      let jobExists = false;
      let jobBelongsToUser = false;
      
      // First check in memory
      if (hardcodedJobs.has(jobId)) {
        const memoryJob = hardcodedJobs.get(jobId);
        if (memoryJob) {
          jobExists = true;
          jobBelongsToUser = memoryJob.userId === userId;
          console.log(`Job ${jobId} found in memory, belongs to user: ${jobBelongsToUser}`);
        }
      }
      
      // If not verified in memory, check database
      if (!jobExists || !jobBelongsToUser) {
        try {
          freshPrisma = prismaClientSingleton();
          
          const dbJob = await freshPrisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, userId: true }
          });
          
          if (dbJob) {
            jobExists = true;
            jobBelongsToUser = dbJob.userId === userId;
            console.log(`Job ${jobId} found in database, belongs to user: ${jobBelongsToUser}`);
          } else {
            console.log(`Job ${jobId} not found in database`);
          }
        } catch (dbLookupError) {
          console.error(`Error checking job ${jobId} in database:`, dbLookupError);
          // If we can't check database but job exists in memory
          if (jobExists) {
            // Use the memory result only
            console.log(`Using memory verification only due to database error`);
          } else {
            // Can't verify at all
            return NextResponse.json({ 
              error: 'Could not verify job ownership',
              details: 'Database connection error'
            }, { status: 500 });
          }
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
      console.log(`Deleting job ${jobId} for user ${userId}`);
      
      try {
        const deleteResult = await deleteJob(jobId);
        
        if (deleteResult) {
          return NextResponse.json({ 
            success: true, 
            message: 'Job deleted successfully',
            jobId: jobId 
          });
        } else {
          console.error(`Failed to delete job ${jobId}`);
          return NextResponse.json({ 
            error: 'Failed to delete job completely', 
            partialSuccess: true 
          }, { status: 500 });
        }
      } catch (deleteError) {
        console.error(`Error executing deleteJob for ${jobId}:`, deleteError);
        return NextResponse.json({ 
          error: 'Error deleting job',
          message: deleteError instanceof Error ? deleteError.message : 'Unknown error'
        }, { status: 500 });
      }
    } catch (error) {
      console.error(`Error in DELETE handler for job ${jobId}:`, error);
      return NextResponse.json({ 
        error: 'Server error deleting job',
        message: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    } finally {
      if (freshPrisma) {
        await freshPrisma.$disconnect().catch(console.error);
      }
    }
  } catch (error) {
    console.error('Critical error in DELETE handler:', error);
    return NextResponse.json({ 
      error: 'Critical server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
