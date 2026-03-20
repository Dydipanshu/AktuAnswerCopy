import { NextRequest, NextResponse } from 'next/server';
import { jsonError, jsonOk, makeRequestId } from '../_utils';
import { createJob, failJob, finishJob, getJob, statusResponse, updateJob } from './_jobs';
import { downloadAnswerPdf } from './_core';

export async function POST(request: NextRequest) {
  const requestId = makeRequestId();
  try {
    const { cookies, courseValue, subject, evalLevel } = await request.json();

    if (!cookies || !courseValue || !subject?.code || !subject?.buttonName) {
      return jsonError('E_DOWNLOAD_BAD_INPUT', 'Missing download inputs', 400, { requestId });
    }

    const job = createJob();
    updateJob(job.id, { status: 'running', message: 'Starting download...' });

    setImmediate(async () => {
      try {
        const result = await downloadAnswerPdf({
          cookies,
          courseValue,
          subject,
          evalLevel,
          onProgress: ({ totalPages, downloadedPages, message }) => {
            updateJob(job.id, {
              totalPages: totalPages ?? job.totalPages,
              downloadedPages: downloadedPages ?? job.downloadedPages,
              message: message ?? job.message,
            });
          },
          log: (msg: string) => console.log(`[download ${job.id}] ${msg}`),
        });

        if ('error' in result && result.error) {
          failJob(job.id, result.error.code, result.error.message);
          return;
        }

        finishJob(job.id, result.buffer, result.filename);
      } catch (error: any) {
        console.error(`Download error (${job.id}):`, error.message);
        failJob(job.id, 'E_DOWNLOAD_FAILED', 'Download failed', error.message);
      }
    });

    return jsonOk({ jobId: job.id }, requestId);
  } catch (error: any) {
    console.error(`Download error (${requestId}):`, error.message);
    return jsonError('E_DOWNLOAD_FAILED', 'Download failed', 500, {
      detail: error.message,
      requestId,
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const action = searchParams.get('action');

  if (!jobId) {
    return jsonError('E_JOB_ID_REQUIRED', 'jobId is required', 400);
  }

  const job = getJob(jobId);
  if (!job) {
    return jsonError('E_JOB_NOT_FOUND', 'Download job not found', 404);
  }

  if (action === 'file') {
    if (job.status !== 'done' || !job.buffer || !job.filename) {
      return jsonError('E_JOB_NOT_READY', 'Download not ready', 409, { requestId: job.id });
    }

    return new NextResponse(job.buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${job.filename}"`,
        'x-request-id': job.id,
      },
    });
  }

  return statusResponse(job);
}
