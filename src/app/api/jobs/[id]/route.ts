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
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`Deleting job ID: ${id}`);

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
        const job = hardcodedJobs.get(id);
        
        // Check if this job belongs to this user
        if (job && job.userId !== userId) {
          console.log(`Job ${id} belongs to ${job.userId}, not current user ${userId}`);
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
        
        if (job) {
          console.log(`Deleting job ${id} from memory store`);
          hardcodedJobs.delete(id);
          
          // Also try to delete from database if it exists there
          try {
            freshPrisma = prismaClientSingleton();
            
            // Check if job exists in database
            const dbJob = await freshPrisma.job.findUnique({
              where: { id },
            });
            
            if (dbJob && dbJob.userId === userId) {
              // Delete results first
              await freshPrisma.result.deleteMany({
                where: { jobId: id },
              });
              
              // Then delete the job
              await freshPrisma.job.delete({
                where: { id },
              });
              console.log(`Also deleted job ${id} from database`);
            }
          } catch (dbError) {
            // Log but don't fail if database deletion fails
            console.error(`Failed to delete job ${id} from database:`, dbError);
          } finally {
            if (freshPrisma) {
              await freshPrisma.$disconnect();
              freshPrisma = null;
            }
          }
          
          return NextResponse.json({ success: true });
        }
      } else {
        console.log(`Job ${id} not found in memory store for user ${userId}`);
      }
    }

    // If we get here, we need to check the database
    console.log(`Attempting to delete job ${id} from database for user ${userId}`);
    
    try {
      freshPrisma = prismaClientSingleton();
      
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

      console.log(`Deleting results for job ${id}`);
      await freshPrisma.result.deleteMany({
        where: { jobId: id },
      });

      console.log(`Deleting job ${id} from database`);
      await freshPrisma.job.delete({
        where: { id },
      });

      return NextResponse.json({ success: true });
    } catch (dbError) {
      console.error(`Database error deleting job ${id}:`, dbError);
      return NextResponse.json({ error: 'Database error deleting job' }, { status: 500 });
    } finally {
      if (freshPrisma) {
        await freshPrisma.$disconnect();
      }
    }
  } catch (error) {
    console.error('Delete job error:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
}
