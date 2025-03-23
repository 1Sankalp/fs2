import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prismaClientSingleton } from '@/lib/prisma';
import { hardcodedJobs } from '@/lib/hardcodedJobs';

export async function GET(request: NextRequest) {
  const freshPrisma = prismaClientSingleton();

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID: ${userId}`);

    if (userId.startsWith('hardcoded-') && hardcodedJobs.has(id)) {
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

    console.log(`Fetching job ${id} from database`);
    const job = await freshPrisma.job.findUnique({
      where: { id },
      include: {
        results: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const totalWebsites = job.totalUrls || 0;
    const processedWebsites = job.results.length;
    const progress = totalWebsites > 0 ? Math.min(100, Math.floor((processedWebsites / totalWebsites) * 100)) : 0;

    return NextResponse.json({
      ...job,
      progress,
      totalWebsites,
      processedWebsites,
    });
  } catch (error) {
    console.error('Get job error:', error);
    return NextResponse.json({ error: 'Failed to get job' }, { status: 500 });
  } finally {
    await freshPrisma.$disconnect();
  }
}

export async function DELETE(request: NextRequest) {
  const freshPrisma = prismaClientSingleton();

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    console.log(`User ID: ${userId}`);

    if (userId.startsWith('hardcoded-') && hardcodedJobs.has(id)) {
      console.log(`Deleting job ${id} from memory store`);
      hardcodedJobs.delete(id);
      return NextResponse.json({ success: true });
    }

    console.log(`Attempting to delete job ${id} from database`);
    const job = await freshPrisma.job.findUnique({
      where: { id },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await freshPrisma.result.deleteMany({
      where: { jobId: id },
    });

    await freshPrisma.job.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete job error:', error);
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 });
  } finally {
    await freshPrisma.$disconnect();
  }
}
