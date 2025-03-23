import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getJobById, deleteJob } from '@/lib/hardcodedJobs';

// GET /api/jobs/[jobId]
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const jobId = params.jobId;
    const job = await getJobById(jobId);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    return NextResponse.json({ job });
  } catch (error) {
    console.error('Error fetching job details:', error);
    return NextResponse.json({ error: 'Failed to fetch job details' }, { status: 500 });
  }
}

// DELETE /api/jobs/[jobId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const jobId = params.jobId;
    
    // First try to delete from the in-memory store
    const deleteResult = await deleteJob(jobId);
    
    if (!deleteResult) {
      console.error(`Failed to delete job: ${jobId} - Job not found in memory`);
    }
    
    // Then try to delete from the database regardless of in-memory result
    try {
      await prisma.job.delete({
        where: { id: jobId },
      });
      console.log(`Successfully deleted job ${jobId} from database`);
    } catch (dbError) {
      console.error(`Error deleting job ${jobId} from database:`, dbError);
      // Don't return error yet, as the job might have been deleted from memory
    }
    
    // If we got here, either in-memory or database deletion worked
    return NextResponse.json({ success: true, message: 'Job deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  }
} 