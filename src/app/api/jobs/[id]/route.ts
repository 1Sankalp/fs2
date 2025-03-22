import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get the id from params directly
    const jobId = params.id;
    if (!jobId) {
      return NextResponse.json({ message: 'Job ID is required' }, { status: 400 });
    }

    // Fetch the job
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
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
    const results = await prisma.result.findMany({
      where: {
        jobId: jobId,
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
    console.error('Get job details error:', error);
    return NextResponse.json(
      { message: 'Failed to fetch job details' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    // Get the id from params directly
    const jobId = params.id;
    if (!jobId) {
      return NextResponse.json({ message: 'Job ID is required' }, { status: 400 });
    }

    // Fetch the job to ensure it exists and belongs to the user
    const job = await prisma.job.findUnique({
      where: {
        id: jobId,
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
    await prisma.result.deleteMany({
      where: {
        jobId: jobId,
      },
    });

    // Then delete the job
    await prisma.job.delete({
      where: {
        id: jobId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete job error:', error);
    return NextResponse.json(
      { message: 'Failed to delete job' },
      { status: 500 }
    );
  }
} 