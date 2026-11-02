import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient, User } from '@supabase/supabase-js';
import { CheckCircle2, Clock3, LockKeyhole, LogIn, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type Mandate = {
  id: string;
  supporter_id: string;
  creator_id: string;
  tier_id: string;
  borrower_phone: string;
  monthly_amount: number;
  status: 'pending_mfi' | 'approved' | 'active' | 'rejected' | 'cancelled';
  consent_at: string;
  created_at: string;
  activated_at: string | null;
  review_note: string | null;
  creatorName?: string;
  creatorHandle?: string;
  tierName?: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function CreatorDeductionQueue() {
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<Mandate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadRequests = useCallback(async () => {
    if (!supabase || user?.app_metadata.role !== 'mfi_operator') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: requestError } = await supabase
      .from('creator_support_mandates')
      .select('id, supporter_id, creator_id, tier_id, borrower_phone, monthly_amount, status, consent_at, created_at, review_note, activated_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (requestError) {
      setError(requestError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const requests = (data || []) as Mandate[];
    const creatorIds = [...new Set(requests.map((request) => request.creator_id))];
    const tierIds = [...new Set(requests.map((request) => request.tier_id))];
    const [creatorResult, tierResult] = await Promise.all([
      creatorIds.length
        ? supabase.from('creator_profiles').select('id, display_name, handle').in('id', creatorIds)
        : Promise.resolve({ data: [], error: null }),
      tierIds.length
        ? supabase.from('creator_tiers').select('id, name').in('id', tierIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (creatorResult.error || tierResult.error) {
      setError(creatorResult.error?.message || tierResult.error?.message || 'Could not load creator details.');
      setRows([]);
      setLoading(false);
      return;
    }

    const creatorById = new Map((creatorResult.data || []).map((creator) => [creator.id, creator]));
    const tierById = new Map((tierResult.data || []).map((tier) => [tier.id, tier]));
    setRows(requests.map((request) => ({
      ...request,
      creatorName: creatorById.get(request.creator_id)?.display_name || 'Creator',
      creatorHandle: creatorById.get(request.creator_id)?.handle || '',
      tierName: tierById.get(request.tier_id)?.name || 'Support tier',
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') || ''),
      password: String(form.get('password') || ''),
    });
    if (signInError) setError(signInError.message);
  };

  const review = async (request: Mandate, status: 'approved' | 'active' | 'rejected') => {
    if (!supabase || !user) return;
    const reviewNote = status === 'rejected' ? window.prompt('Reason for declining this request (optional):') : null;
    if (status === 'rejected' && reviewNote === null) return;
    setBusyId(request.id);
    setError('');
    setMessage('');
    const reviewedAt = new Date().toISOString();
    const updateFields = status === 'active'
      ? { activated_at: reviewedAt, activated_by: user.id }
      : { reviewed_at: reviewedAt, reviewed_by: user.id, review_note: reviewNote?.trim() || null };
    const { error: reviewError } = await supabase
      .from('creator_support_mandates')
      .update({
        status,
        ...updateFields,
      })
      .eq('id', request.id)
      .eq('status', request.status);
    setBusyId('');
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    setMessage(status === 'approved'
      ? 'Request approved. Set up the recurring deduction, then mark it active here.'
      : status === 'active'
      ? 'Deduction schedule activated. Supporter-only access is now enabled.'
      : 'Request declined. No salary deduction was started.');
    await loadRequests();
  };

  if (!supabase) {
    return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center gap-2 text-amber-300"><LockKeyhole className="h-5 w-5" /><h2 className="font-bold">Supabase configuration needed</h2></div>
      <p className="text-sm text-slate-400">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for this app to connect to the Sumthin project.</p>
    </section>;
  }

  if (!user || user.app_metadata.role !== 'mfi_operator') {
    return <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">MFI operator sign-in</h2></div>
      <p className="mb-5 text-sm text-slate-400">Use an authorized MFI account. Access is checked against the trusted <code>app_metadata.role</code> claim.</p>
      {user && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">This account is not authorized to review deduction requests.</div>}
      <form className="space-y-3" onSubmit={signIn}>
        <label className="block text-xs text-slate-300">Email<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="email" name="email" autoComplete="username" required /></label>
        <label className="block text-xs text-slate-300">Password<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="password" name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"><LogIn className="h-4 w-4" /> Sign in</button>
      </form>
    </section>;
  }

  const pendingCount = rows.filter((request) => request.status === 'pending_mfi').length;
  const approvedCount = rows.filter((request) => request.status === 'approved').length;
  const activeCount = rows.filter((request) => request.status === 'active').length;
  return <section className="space-y-5">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Awaiting MFI review</p><p className="mt-1 text-2xl font-bold text-amber-300">{pendingCount}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Approved, setup needed</p><p className="mt-1 text-2xl font-bold text-sky-300">{approvedCount}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Payroll active</p><p className="mt-1 text-2xl font-bold text-emerald-300">{activeCount}</p></div>
      <div className="col-span-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-400 md:col-span-1"><LockKeyhole className="h-4 w-4 shrink-0 text-sky-400" /> Approve first, set up payroll, then activate access.</div>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div><h2 className="font-bold text-white">Creator salary-deduction requests</h2><p className="mt-1 text-xs text-slate-400">Verify the borrower and their consent before approving.</p></div>
        <button onClick={loadRequests} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {(error || message) && <div className={`mx-4 mt-4 rounded-lg border p-3 text-xs ${error ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading requests…</div> : rows.length === 0 ? (
        <div className="p-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-200">No deduction requests yet.</p><p className="mt-1 text-xs text-slate-500">New supporter requests will appear here.</p></div>
      ) : <div className="divide-y divide-slate-800">
        {rows.map((request) => <article key={request.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{request.creatorName}</strong>{request.creatorHandle && <span className="text-xs text-slate-500">@{request.creatorHandle}</span>}<span className={`rounded-full px-2 py-1 text-[10px] font-bold ${request.status === 'pending_mfi' ? 'bg-amber-950 text-amber-300' : request.status === 'approved' ? 'bg-sky-950 text-sky-300' : request.status === 'active' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{request.status.replace('_', ' ')}</span></div>
            <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
              <span>Borrower phone: <strong className="font-mono text-slate-200">{request.borrower_phone}</strong></span>
              <span>Tier: <strong className="text-slate-200">{request.tierName}</strong></span>
              <span>Requested deduction: <strong className="text-emerald-300">ZMW {Number(request.monthly_amount).toFixed(2)} / month</strong></span>
              <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Consented {new Date(request.consent_at).toLocaleString()}</span>
              {request.activated_at && <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Payroll active {new Date(request.activated_at).toLocaleDateString()}</span>}
            </div>
            {request.review_note && <p className="mt-2 text-xs text-slate-500">Review note: {request.review_note}</p>}
          </div>
          {request.status === 'pending_mfi' && <div className="flex gap-2">
            <button disabled={busyId === request.id} onClick={() => review(request, 'approved')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>
            <button disabled={busyId === request.id} onClick={() => review(request, 'rejected')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Decline</button>
          </div>}
          {request.status === 'approved' && <div className="flex gap-2">
            <button disabled={busyId === request.id} onClick={() => review(request, 'active')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Mark payroll active</button>
            <button disabled={busyId === request.id} onClick={() => review(request, 'rejected')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Withdraw</button>
          </div>}
        </article>)}
      </div>}
    </div>
  </section>;
}
