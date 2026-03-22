'use client';

import { useState } from 'react';

type Step = 'login' | 'course' | 'subjects' | 'downloading' | 'complete';

interface Course {
  name: string;
  value: string;
}

interface Subject {
  code: string;
  name: string;
  asid: string;
  buttonName: string;
}

type UiError = {
  code: string;
  message: string;
  requestId?: string;
  hint?: string;
  detail?: string;
};

const STEPS: { key: Step; label: string; description: string }[] = [
  { key: 'login', label: 'Login', description: 'Sign in' },
  { key: 'course', label: 'Course', description: 'Pick exam session' },
  { key: 'subjects', label: 'Subjects', description: 'Choose scripts' },
  { key: 'downloading', label: 'Download', description: 'Generate PDF' },
];

export default function Home() {
  const [step, setStep] = useState<Step>('login');
  const [rollNo, setRollNo] = useState('');
  const [password, setPassword] = useState('');
  const [uiError, setUiError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(false);

  const [cookies, setCookies] = useState<any>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [downloadingSubject, setDownloadingSubject] = useState<string | null>(null);
  const [downloadedPdfs, setDownloadedPdfs] = useState<string[]>([]);
  const [downloadMessage, setDownloadMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [downloadJobId, setDownloadJobId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [downloadedPages, setDownloadedPages] = useState(0);
  const [evalLevel, setEvalLevel] = useState<string | null>(null);

  const clearError = () => setUiError(null);

  const setApiError = (data: any, fallbackMessage: string) => {
    const err = data?.error ?? {};
    if (err?.code && err?.message) {
      setUiError({
        code: err.code,
        message: err.message,
        requestId: err.requestId,
        hint: err.hint,
        detail: err.detail,
      });
      return;
    }
    setUiError({
      code: 'E_CLIENT_UNKNOWN',
      message: fallbackMessage,
      detail: data?.detail || data?.error,
    });
  };

  const pollJob = async (jobId: string, subject: Subject) => {
    let done = false;
    while (!done) {
      const res = await fetch(`/api/download?jobId=${jobId}`);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        setApiError(data, 'Download failed');
        return;
      }

      const status = data.status as string;
      if (typeof data.totalPages === 'number') setTotalPages(data.totalPages);
      if (typeof data.downloadedPages === 'number') setDownloadedPages(data.downloadedPages);
      if (data.message) setDownloadMessage(data.message);

      if (status === 'error') {
        setApiError(data, 'Download failed');
        return;
      }

      if (status === 'done') {
        const fileRes = await fetch(`/api/download?jobId=${jobId}&action=file`);
        if (!fileRes.ok) {
          const errData = await fileRes.json().catch(() => ({}));
          setApiError(errData, 'Download failed');
          return;
        }

        const blob = await fileRes.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${subject.code}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setDownloadedPdfs((prev) => [...prev, subject.code]);
        done = true;
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setLoading(true);
    setStatusMessage('Checking AKTU portal status...');

    try {
      const statusController = new AbortController();
      const statusTimeout = setTimeout(() => statusController.abort(), 30000);
      let shouldProceed = true;
      try {
        const statusRes = await fetch('/api/status', { signal: statusController.signal });
        clearTimeout(statusTimeout);
        if (!statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          if (statusData?.error?.code === 'E_STATUS_SLOW') {
            setStatusMessage('Portal is very slow. Login may take 1–2 minutes.');
          } else {
            setApiError(statusData, 'AKTU portal appears to be down. Please try again later.');
            shouldProceed = false;
          }
        } else {
          const statusData = await statusRes.json().catch(() => ({}));
          const ms = typeof statusData?.ms === 'number' ? statusData.ms : null;
          setStatusMessage(ms ? `Portal is up (${ms}ms). Logging in...` : 'Portal is up. Logging in...');
        }
      } catch {
        setStatusMessage('Portal status check timed out. Login may still work.');
      }

      if (!shouldProceed) return;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 140000);

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollNo, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        setApiError(data, 'Login failed');
        return;
      }

      setCookies(data.cookies);
      setStep('course');
      setStatusMessage('');

      const coursesRes = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: data.cookies }),
      });

      const coursesData = await coursesRes.json().catch(() => ({}));
      if (!coursesRes.ok || coursesData?.ok === false || coursesData?.success === false) {
        setApiError(coursesData, 'Failed to load courses');
        setStep('login');
        return;
      }

      setCookies(coursesData.cookies);
      setCourses(coursesData.courses || []);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setUiError({
          code: 'E_LOGIN_TIMEOUT',
          message: 'Login timed out (140s). Please try again.',
        });
      } else {
        setUiError({ code: 'E_NETWORK', message: 'Connection error. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCourseSelect = async (courseValue: string) => {
    setSelectedCourse(courseValue);
    setLoading(true);
    clearError();

    try {
      const res = await fetch('/api/subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies, courseValue }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false || data?.success === false) {
        setApiError(data, 'Failed to load subjects');
        return;
      }

      const nextSubjects = data.subjects || [];
      if (!nextSubjects.length) {
        setUiError({
          code: 'E_NO_SUBJECTS',
          message: 'No subjects found for that course.',
          hint: 'Go back and select the other course option shown.',
        });
        setStep('course');
        setSelectedCourse('');
        return;
      }

      setCookies(data.cookies);
      setSubjects(nextSubjects);
      setEvalLevel(data.evalLevel || null);
      setStep('subjects');
    } catch {
      setUiError({ code: 'E_NETWORK', message: 'Connection error. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSubject = async (subject: Subject) => {
    setStep('downloading');
    setDownloadingSubject(subject.code);
    setDownloadMessage('Starting download...');
    setDownloadJobId(null);
    setTotalPages(null);
    setDownloadedPages(0);
    clearError();

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookies,
          courseValue: selectedCourse,
          subject,
          evalLevel,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        setApiError(data, 'Download failed');
        return;
      }

      setDownloadJobId(data.jobId);
      await pollJob(data.jobId, subject);
    } catch (err: any) {
      setUiError({ code: 'E_DOWNLOAD', message: 'Download error' });
    } finally {
      setTimeout(() => {
        setStep('subjects');
        setDownloadingSubject(null);
        setDownloadMessage('');
        setDownloadJobId(null);
      }, 600);
    }
  };

  const handleDownloadAll = async () => {
    for (const subject of subjects) {
      await handleDownloadSubject(subject);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    setStep('complete');
  };

  const currentStepIndex = STEPS.findIndex((s) => s.key === (step === 'complete' ? 'downloading' : step));
  const progressPercent = totalPages ? Math.min(100, Math.round((downloadedPages / totalPages) * 100)) : 5;

  const errorSummary = uiError
    ? `[${uiError.code}] ${uiError.message}${uiError.requestId ? ` (ID: ${uiError.requestId})` : ''}`
    : '';

  return (
    <div className="min-h-screen bg-[linear-gradient(140deg,#f7f4ef_0%,#f2ede6_50%,#efe6dc_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(#1f2937 0.45px, transparent 0.45px)', backgroundSize: '26px 26px' }} />

      <main className="relative mx-auto max-w-4xl px-4 pb-16 pt-12">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-600">
            AKTU Answer Scripts
          </div>
          <h1 className="mt-4 text-4xl font-semibold text-slate-900 sm:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
            Answer Script Downloader
          </h1>
          <p className="mt-3 text-base text-slate-600">
            Log in, pick your course, select a subject, and download a PDF. The timeline below shows exactly where you are.
          </p>
        </header>

        <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-200/60">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Timeline</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {STEPS.map((item, idx) => {
                const isActive = idx <= currentStepIndex;
                return (
                  <div key={item.key} className="flex items-center gap-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${
                        isActive ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-[0.25em] ${isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500">{item.description}</div>
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="h-px w-10 bg-slate-300" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {uiError && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <div className="flex flex-col gap-1">
                <span className="font-semibold">{errorSummary}</span>
                {uiError.hint && <span className="text-rose-700">Hint: {uiError.hint}</span>}
                {uiError.detail && <span className="text-rose-700">Details: {uiError.detail}</span>}
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(errorSummary);
                  } catch {
                    // no-op
                  }
                }}
                className="mt-3 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-rose-700"
              >
                Copy Error
              </button>
            </div>
          )}

          {statusMessage && !uiError && (
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {statusMessage}
            </div>
          )}

          {step === 'login' && (
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Login</h2>
              <form onSubmit={handleLogin} className="mt-6 space-y-5">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    value={rollNo}
                    onChange={(e) => setRollNo(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner focus:border-slate-400 focus:outline-none"
                    placeholder="Enter your roll number"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500">
                    Password
                  </label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner focus:border-slate-400 focus:outline-none"
                    placeholder="Enter your password"
                    required
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Use the AKTU answer-copy password (usually a 7-digit number), not your college portal password.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
              </form>
            </div>
          )}

          {step === 'course' && (
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Select Course</h2>
              {loading ? (
                <div className="mt-6 text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-slate-700"></div>
                  <p className="mt-3 text-sm text-slate-500">Loading courses...</p>
                </div>
              ) : (
                <div className="mt-6 grid gap-3">
                  {courses.map((course) => (
                    <button
                      key={course.value}
                      onClick={() => handleCourseSelect(course.value)}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:bg-white"
                    >
                      <div className="text-sm font-semibold text-slate-900">{course.name}</div>
                      <div className="text-xs text-slate-500">{course.value}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(step === 'subjects' || step === 'downloading') && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-900">Select Subject</h2>
                {step === 'subjects' && subjects.length > 1 && (
                  <button
                    onClick={handleDownloadAll}
                    className="rounded-full bg-teal-600 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-teal-700"
                  >
                    Download All
                  </button>
                )}
              </div>

              {downloadingSubject && (
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Downloading: {downloadingSubject}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {totalPages
                      ? `Pages downloaded: ${downloadedPages} / ${totalPages}`
                      : 'Detecting total pages...'}
                  </p>
                  {downloadMessage && <p className="mt-1 text-xs text-slate-500">{downloadMessage}</p>}
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-teal-600 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                  {downloadJobId && (
                    <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-400">
                      Job ID: {downloadJobId}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5 grid gap-3">
                {subjects.map((subject) => (
                  <div
                    key={subject.code}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{subject.code}</div>
                        <div className="text-xs text-slate-500">{subject.name}</div>
                      </div>
                      <button
                        onClick={() => handleDownloadSubject(subject)}
                        disabled={downloadingSubject !== null}
                        className={`rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${
                          downloadingSubject !== null
                            ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {downloadingSubject === subject.code ? 'Downloading...' : 'Download PDF'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep('course')}
                className="mt-6 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900"
              >
                ← Back to Courses
              </button>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">Download Complete</h2>
              <p className="mt-2 text-sm text-slate-500">
                Successfully downloaded {downloadedPdfs.length} answer scripts.
              </p>
              <button
                onClick={() => {
                  setStep('login');
                  setRollNo('');
                  setPassword('');
                  setCourses([]);
                  setSubjects([]);
                  setDownloadedPdfs([]);
                  setCookies(null);
                }}
                className="mt-6 rounded-full bg-slate-900 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-slate-800"
              >
                Download More
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
