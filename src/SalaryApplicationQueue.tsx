import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { CheckCircle2, Clock3, ExternalLink, FileText, LockKeyhole, LogIn, RefreshCw, ShieldCheck, X, XCircle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

type SalaryApplication = {
  id: string;
  user_id: string;
  applicant_first_name: string;
  applicant_last_name: string;
  employment_number: string;
  payslip_url: string | null;
  context_type: 'creator_support' | 'shop_order' | 'salary_facility';
  context_label: string;
  amount: number;
  status: 'pending_mfi' | 'approved' | 'rejected';
  approved_limit: number | null;
  pin_set_at: string | null;
  reviewer_notes: string | null;
  outstanding_amount: number;
  created_at: string;
  reviewed_at: string | null;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const mediaApiUrl = import.meta.env.VITE_MEDIA_API_URL?.replace(/\/+$/, '');
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type ReviewDialog = {
  application: SalaryApplication;
  decision: 'approved' | 'rejected';
};

export default function SalaryApplicationQueue() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<SalaryApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reviewDialog, setReviewDialog] = useState<ReviewDialog | null>(null);
  const [approvedLimit, setApprovedLimit] = useState('');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [reviewFormError, setReviewFormError] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setRows([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadApplications = useCallback(async () => {
    if (!supabase || !session?.access_token || session.user.app_metadata.role !== 'mfi_operator') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('salary_applications')
      .select('id, user_id, applicant_first_name, applicant_last_name, employment_number, payslip_url, context_type, context_label, amount, status, approved_limit, pin_set_at, reviewer_notes, created_at, reviewed_at')
      .eq('context_type', 'salary_facility')
      .order('created_at', { ascending: false })
      .limit(100);
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const applications = (data || []) as SalaryApplication[];
    const userIds = [...new Set(applications.map((application) => application.user_id))];
    const [paymentResult, mandateResult] = userIds.length
      ? await Promise.all([
          supabase
            .from('salary_payment_authorizations')
            .select('user_id, amount')
            .in('user_id', userIds)
            .eq('status', 'authorized'),
          supabase
            .from('creator_support_mandates')
            .select('supporter_id, monthly_amount')
            .in('supporter_id', userIds)
            .eq('status', 'active'),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (paymentResult.error || mandateResult.error) {
      setError(paymentResult.error?.message || mandateResult.error?.message || 'Could not load outstanding payment totals.');
      setRows([]);
      setLoading(false);
      return;
    }

    const outstandingByUser = new Map<string, number>();
    for (const payment of paymentResult.data || []) {
      outstandingByUser.set(payment.user_id, (outstandingByUser.get(payment.user_id) || 0) + Number(payment.amount));
    }
    for (const mandate of mandateResult.data || []) {
      outstandingByUser.set(mandate.supporter_id, (outstandingByUser.get(mandate.supporter_id) || 0) + Number(mandate.monthly_amount));
    }
    setRows(applications.map((application) => ({
      ...application,
      outstanding_amount: outstandingByUser.get(application.user_id) || 0,
    })));
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void loadApplications();
    const timer = window.setInterval(() => { void loadApplications(); }, 20000);
    return () => window.clearInterval(timer);
  }, [loadApplications]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setError('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
    });
    if (signInError) setError(signInError.message);
  };

  const openReviewDialog = (application: SalaryApplication, decision: ReviewDialog['decision']) => {
    setApprovedLimit(application.approved_limit ? String(application.approved_limit) : '');
    setReviewerNotes('');
    setReviewFormError('');
    setReviewDialog({ application, decision });
  };

  useEffect(() => {
    if (!reviewDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyId) setReviewDialog(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewDialog, busyId]);

  const review = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewDialog || !supabase || !session?.user) return;
    const { application, decision } = reviewDialog;
    let approvedLimitAmount: number | null = null;
    if (decision === 'approved') {
      approvedLimitAmount = Number(approvedLimit);
      if (!Number.isFinite(approvedLimitAmount) || approvedLimitAmount <= 0) {
        setReviewFormError('Enter a valid limit greater than ZMW 0.00.');
        return;
      }
    }

    setBusyId(application.id);
    setReviewFormError('');
    setError('');
    setMessage('');
    const updatePayload: Record<string, any> = {
      status: decision,
      reviewer_notes: reviewerNotes.trim() || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: session.user.id,
    };
    if (decision === 'approved' && approvedLimitAmount !== null) {
      updatePayload.approved_limit = approvedLimitAmount;
    }

    const { data, error: reviewError } = await supabase
      .from('salary_applications')
      .update(updatePayload)
      .eq('id', application.id)
      .eq('status', 'pending_mfi')
      .select('id')
      .maybeSingle();
    setBusyId('');
    if (reviewError) {
      setReviewFormError(reviewError.message);
      return;
    }
    if (!data) {
      setReviewDialog(null);
      setError('This application has already been reviewed. Refresh the queue to see its latest status.');
      await loadApplications();
      return;
    }
    setReviewDialog(null);
    setMessage(
      decision === 'approved'
        ? `Application approved with limit ZMW ${approvedLimitAmount?.toFixed(2)}. The applicant can now set their payment PIN in Sumthin.`
        : 'Application rejected.'
    );
    await loadApplications();
  };

  const openPayslip = async (application: SalaryApplication) => {
    if (!supabase || !application.payslip_url) return;
    if (application.payslip_url.startsWith('r2://private/payslips/')) {
      if (!mediaApiUrl) {
        setError('Cloudflare media storage is not configured.');
        return;
      }
      const key = application.payslip_url.slice('r2://'.length);
      const objectPath = key.slice('private/payslips/'.length);
      const payslipWindow = window.open('about:blank', '_blank');
      if (!payslipWindow) {
        setError('Allow pop-ups to view the payslip.');
        return;
      }
      payslipWindow.opener = null;
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        let accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('Your MFI session has expired. Sign in again to view this payslip.');
        const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
        const payslipUrl = `${mediaApiUrl}/api/payslips/${encodedPath}`;
        let response = await fetch(payslipUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (response.status === 401) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) throw refreshError;
          accessToken = refreshed.session?.access_token;
          if (!accessToken) throw new Error('Your MFI session has expired. Sign in again to view this payslip.');
          response = await fetch(payslipUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        }
        if (!response.ok) {
          const result = await response.json() as { error?: string };
          throw new Error(result.error || 'Could not open payslip.');
        }
        const objectUrl = URL.createObjectURL(await response.blob());
        payslipWindow.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } catch (payslipError) {
        payslipWindow.close();
        setError(payslipError instanceof Error ? payslipError.message : 'Could not open payslip.');
      }
      return;
    }

    const marker = '/salary-payslips/';
    const markerIndex = application.payslip_url.indexOf(marker);
    if (markerIndex < 0) {
      setError('Could not locate the payslip file in storage.');
      return;
    }
    const filePath = decodeURIComponent(application.payslip_url.slice(markerIndex + marker.length));
    const payslipWindow = window.open('about:blank', '_blank');
    if (!payslipWindow) {
      setError('Allow pop-ups to view the payslip.');
      return;
    }
    payslipWindow.opener = null;
    const { data, error: signedUrlError } = await supabase.storage
      .from('salary-payslips')
      .createSignedUrl(filePath, 300);
    if (signedUrlError) {
      payslipWindow.close();
      setError(signedUrlError.message);
      return;
    }
    payslipWindow.location.href = data.signedUrl;
  };

  if (!supabase) {
    return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center gap-2 text-amber-300"><LockKeyhole className="h-5 w-5" /><h2 className="font-bold">Supabase configuration needed</h2></div>
      <p className="text-sm text-slate-400">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable authenticated MFI review.</p>
    </section>;
  }

  if (!session || session.user.app_metadata.role !== 'mfi_operator') {
    return <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">MFI operator sign-in</h2></div>
      <p className="mb-5 text-sm text-slate-400">Only an account with the trusted <code>app_metadata.role = mfi_operator</code> claim can review salary applications.</p>
      {session && <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">This account is not authorized to review salary applications.</p>}
      <form className="space-y-3" onSubmit={signIn}>
        <label className="block text-xs text-slate-300">Email<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="email" name="email" autoComplete="username" required /></label>
        <label className="block text-xs text-slate-300">Password<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="password" name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"><LogIn className="h-4 w-4" /> Sign in</button>
      </form>
    </section>;
  }

  const pendingCount = rows.filter((row) => row.status === 'pending_mfi').length;
  return <section className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Awaiting MFI review</p><p className="mt-1 text-2xl font-bold text-amber-300">{pendingCount}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Approved</p><p className="mt-1 text-2xl font-bold text-emerald-300">{rows.filter((row) => row.status === 'approved').length}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Rejected</p><p className="mt-1 text-2xl font-bold text-red-300">{rows.filter((row) => row.status === 'rejected').length}</p></div>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div><h2 className="font-bold text-white">Sumthin salary applications</h2><p className="mt-1 text-xs text-slate-400">Review applicant details and payslips before making a decision.</p></div>
        <button onClick={loadApplications} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {(error || message) && <div className={`mx-4 mt-4 rounded-lg border p-3 text-xs ${error ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading applications…</div> : rows.length === 0 ? (
        <div className="p-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-200">No salary applications yet.</p><p className="mt-1 text-xs text-slate-500">New Sumthin applications will appear here.</p></div>
      ) : <div className="divide-y divide-slate-800">
        {rows.map((application) => <article key={application.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-white">{application.applicant_first_name} {application.applicant_last_name}</strong>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${application.status === 'pending_mfi' ? 'bg-amber-950 text-amber-300' : application.status === 'approved' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>{application.status.replace('_', ' ')}</span>
            </div>
            <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
              <span>Employment number: <strong className="font-mono text-slate-200">{application.employment_number}</strong></span>
              <span>Application: <strong className="text-slate-200">{application.context_label}</strong></span>
              <span>{application.context_type === 'salary_facility' ? 'Reported monthly salary' : 'Requested amount'}: <strong className="text-emerald-300">ZMW {Number(application.amount).toFixed(2)}</strong></span>
              {application.approved_limit !== null && (
                <span>Approved max limit: <strong className="text-sky-300 font-bold">ZMW {Number(application.approved_limit).toFixed(2)}</strong></span>
              )}
              <span>Current outstanding: <strong className="text-amber-300 font-bold">ZMW {Number(application.outstanding_amount).toFixed(2)}</strong></span>
              {application.approved_limit !== null && (
                <span>Available under limit: <strong className="text-emerald-300 font-bold">ZMW {Math.max(Number(application.approved_limit) - Number(application.outstanding_amount), 0).toFixed(2)}</strong></span>
              )}
              {application.pin_set_at && (
                <span className="text-emerald-400 font-medium">✓ User Payment PIN Active</span>
              )}
              <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Submitted {new Date(application.created_at).toLocaleString()}</span>
              {application.reviewed_at && <span>Reviewed {new Date(application.reviewed_at).toLocaleString()}</span>}
            </div>
            {application.reviewer_notes && <p className="mt-2 text-xs text-slate-400">Review note: {application.reviewer_notes}</p>}
            {application.payslip_url && <button onClick={() => void openPayslip(application)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-300 hover:text-sky-200"><FileText className="h-3.5 w-3.5" /> View payslip <ExternalLink className="h-3 w-3" /></button>}
          </div>
          {application.status === 'pending_mfi' && <div className="flex gap-2">
            <button disabled={busyId === application.id} onClick={() => openReviewDialog(application, 'approved')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
            <button disabled={busyId === application.id} onClick={() => openReviewDialog(application, 'rejected')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Reject</button>
          </div>}
        </article>)}
      </div>}
    </div>
    {reviewDialog && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyId) setReviewDialog(null);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="salary-review-title"
          className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 rounded-xl p-2 ${reviewDialog.decision === 'approved' ? 'bg-emerald-950 text-emerald-300' : 'bg-red-950 text-red-300'}`}>
                {reviewDialog.decision === 'approved' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
              </span>
              <div>
                <h2 id="salary-review-title" className="text-lg font-bold text-white">
                  {reviewDialog.decision === 'approved' ? 'Approve salary facility' : 'Reject application'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {reviewDialog.application.applicant_first_name} {reviewDialog.application.applicant_last_name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReviewDialog(null)}
              disabled={Boolean(busyId)}
              aria-label="Close review dialog"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          <form className="mt-5 space-y-4" onSubmit={(event) => void review(event)}>
            {reviewDialog.decision === 'approved' && (
              <>
                <p className="text-sm leading-6 text-slate-300">
                  Set the maximum outstanding balance this applicant may authorize. The limit is separate from their reported monthly salary.
                </p>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                  <p className="text-xs text-slate-400">Reported monthly salary</p>
                  <p className="mt-1 font-semibold text-slate-100">ZMW {Number(reviewDialog.application.amount).toFixed(2)}</p>
                </div>
                <label className="block text-sm font-medium text-slate-200" htmlFor="approved-limit">
                  Maximum outstanding limit (ZMW)
                  <input
                    id="approved-limit"
                    autoFocus
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={approvedLimit}
                    onChange={(event) => setApprovedLimit(event.currentTarget.value)}
                    placeholder="e.g. 5000.00"
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </label>
              </>
            )}
            <label className="block text-sm font-medium text-slate-200" htmlFor="reviewer-notes">
              {reviewDialog.decision === 'approved' ? 'Review notes (optional)' : 'Reason for declining (optional)'}
              <textarea
                id="reviewer-notes"
                rows={3}
                maxLength={1000}
                value={reviewerNotes}
                onChange={(event) => setReviewerNotes(event.currentTarget.value)}
                placeholder={reviewDialog.decision === 'approved' ? 'Add any notes for this application…' : 'Let the applicant know why this was declined…'}
                className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />
            </label>
            {reviewFormError && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{reviewFormError}</p>}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-800 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => setReviewDialog(null)}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={Boolean(busyId)}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 ${reviewDialog.decision === 'approved' ? 'bg-emerald-700 hover:bg-emerald-600' : 'bg-red-700 hover:bg-red-600'}`}
              >
                {busyId ? 'Saving review…' : reviewDialog.decision === 'approved' ? 'Approve facility' : 'Reject application'}
              </button>
            </div>
          </form>
        </section>
      </div>
    )}
  </section>;
}
