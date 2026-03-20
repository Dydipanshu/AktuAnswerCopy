import { jsonError, jsonOk, makeRequestId } from '../_utils';

export type DownloadJobStatus = 'queued' | 'running' | 'done' | 'error';

export type DownloadJob = {
  id: string;
  status: DownloadJobStatus;
  createdAt: number;
  updatedAt: number;
  totalPages: number | null;
  downloadedPages: number;
  message?: string;
  filename?: string;
  buffer?: Uint8Array;
  error?: {
    code: string;
    message: string;
    detail?: string;
  };
};

const JOB_TTL_MS = 20 * 60 * 1000;
const jobs = new Map<string, DownloadJob>();

export function createJob(): DownloadJob {
  const id = makeRequestId();
  const now = Date.now();
  const job: DownloadJob = {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    totalPages: null,
    downloadedPages: 0,
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string) {
  cleanupJobs();
  return jobs.get(id) || null;
}

export function updateJob(id: string, patch: Partial<DownloadJob>) {
  const job = jobs.get(id);
  if (!job) return null;
  const updated: DownloadJob = {
    ...job,
    ...patch,
    updatedAt: Date.now(),
  };
  jobs.set(id, updated);
  return updated;
}

export function finishJob(id: string, buffer: Uint8Array, filename: string) {
  return updateJob(id, {
    status: 'done',
    buffer,
    filename,
    message: 'Download ready',
  });
}

export function failJob(id: string, code: string, message: string, detail?: string) {
  return updateJob(id, {
    status: 'error',
    error: { code, message, detail },
    message,
  });
}

function cleanupJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export function statusResponse(job: DownloadJob | null) {
  if (!job) {
    return jsonError('E_JOB_NOT_FOUND', 'Download job not found', 404);
  }
  return jsonOk({
    status: job.status,
    totalPages: job.totalPages,
    downloadedPages: job.downloadedPages,
    message: job.message,
    error: job.error,
    jobId: job.id,
  });
}
