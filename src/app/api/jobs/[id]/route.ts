import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prismaClientSingleton } from '../../../../lib/prisma';

export async function GET(
  request: NextRequest,
  context: any
) {
  // Create a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    // Get the id from params
    const id = context.params.id;
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ message: 'Job ID is required' }, { status: 400 });
    }
    
    // Handle hardcoded users with demo job IDs
    const userId = session.user.id;
    if (userId.startsWith('hardcoded-') && id.startsWith('demo-')) {
      // Generate mock data for hardcoded users
      const username = userId.replace('hardcoded-', '');
      const mockJob = {
        id: id,
        name: `Demo for ${username}`,
        sheetUrl: 'https://docs.google.com/spreadsheets/d/example',
        columnName: 'Website',
        status: 'completed',
        totalUrls: 5,
        processedUrls: 5,
        progress: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: userId
      };
      
      const mockResults = [
        { id: `result-1-${id}`, website: 'example.com', email: 'contact@example.com', createdAt: new Date(), jobId: id },
        { id: `result-2-${id}`, website: 'demo-site.com', email: 'info@demo-site.com', createdAt: new Date(), jobId: id },
        { id: `result-3-${id}`, website: 'test-company.com', email: 'hello@test-company.com', createdAt: new Date(), jobId: id },
        { id: `result-4-${id}`, website: 'acme.org', email: 'support@acme.org', createdAt: new Date(), jobId: id },
        { id: `result-5-${id}`, website: 'business.net', email: 'sales@business.net', createdAt: new Date(), jobId: id }
      ];
      
      return NextResponse.json({
        job: mockJob,
        results: mockResults
      });
    }

    try {
      // Fetch the job
      const job = await freshPrisma.job.findUnique({
        where: {
          id: id,
        },
      });

      if (!job) {
        return NextResponse.json({ message: 'Job not found' }, { status: 404 });
      }

      // Check if the job belongs to the current user
      if (job.userId !== session.user.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
      }

      // Fetch the job results
      const results = await freshPrisma.result.findMany({
        where: {
          jobId: id,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      return NextResponse.json({
        job,
        results,
      });
    } catch (error) {
      console.error('Database query error:', error);
      return NextResponse.json(
        { message: 'Database query failed', error: String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Get job details error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch job details' },
      { status: 500 }
    );
  } finally {
    // Clean up the Prisma client
    await freshPrisma.$disconnect();
  }
}

export async function DELETE(
  request: NextRequest,
  context: any
) {
  // Create a fresh Prisma client to avoid prepared statement issues
  const freshPrisma = prismaClientSingleton();
  
  try {
    // Get the id from params
    const id = context.params.id;
    
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({ message: 'Job ID is required' }, { status: 400 });
    }
    
    // Handle hardcoded users with demo jobs - just return success
    const userId = session.user.id;
    if (userId.startsWith('hardcoded-') && id.startsWith('demo-')) {
      return NextResponse.json({ success: true });
    }

    try {
      // Fetch the job to ensure it exists and belongs to the user
      const job = await freshPrisma.job.findUnique({
        where: {
          id: id,
        },
      });

      if (!job) {
        return NextResponse.json({ message: 'Job not found' }, { status: 404 });
      }

      // Check if the job belongs to the current user
      if (job.userId !== session.user.id) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
      }

      // First delete all results for this job
      await freshPrisma.result.deleteMany({
        where: {
          jobId: id,
        },
      });

      // Then delete the job
      await freshPrisma.job.delete({
        where: {
          id: id,
        },
      });

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error('Database operation error:', error);
      return NextResponse.json(
        { message: 'Failed to delete job from database', error: String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Delete job error:', error);
    return NextResponse.json(
      { message: 'Failed to delete job' },
      { status: 500 }
    );
  } finally {
    // Clean up the Prisma client
    await freshPrisma.$disconnect();
  }
} 