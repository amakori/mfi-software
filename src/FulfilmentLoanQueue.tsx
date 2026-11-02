import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { CheckCircle2, Clock3, LockKeyhole, LogIn, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type FulfilmentLoan = {
  id: string;
  transaction_id: string;
  borrower_name: string;
  borrower_phone: string;
  amount: number;
  status: 'pending_mfi' | 'approved' | 'rejected' | 'funded' | 'returned';
  consent_at: string;
  review_note: string | null;
  payout_reference: string | null;
  transaction: {
    id: string;
    status: string;
    seller_name: string | null;
    item_description: string | null;
    item_value: number | null;
    insurance_amount: number | null;
    return_window_ends_at: string | null;
    fleetbase_order_id: string | null;
    fleetbase_status: string | null;
    fleetbase_tracking_url: string | null;
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hubUrl = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function FulfilmentLoanQueue() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<FulfilmentLoan[]>([]);
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
      setSession(data.session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setRows([]);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadRequests = useCallback(async () => {
    if (!session?.access_token || session.user.app_metadata.role !== 'mfi_operator') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${hubUrl}/api/fulfilment/mfi/loans`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not load fulfilment loan requests.');
      setRows(result as FulfilmentLoan[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load fulfilment loan requests.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadRequests();
    const timer = window.setInterval(() => { void loadRequests(); }, 20000);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  const postAction = async (loan: FulfilmentLoan, action: string, payload: Record<string, unknown>) => {
    if (!session?.access_token) return;
    setBusyId(loan.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${hubUrl}/api/fulfilment/mfi/loans/${encodeURIComponent(loan.id)}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'The MFI action could not be completed.');
      setMessage('MFI action recorded. Participant SMS messages have been queued.');
      await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The MFI action could not be completed.');
    } finally {
      setBusyId('');
    }
  };

  const review = (loan: FulfilmentLoan, decision: 'approved' | 'rejected') => {
    const reviewNote = decision === 'rejected' ? window.prompt('Reason for declining this request (optional):') : '';
    if (decision === 'rejected' && reviewNote === null) return;
    void postAction(loan, 'review', { decision, review_note: reviewNote?.trim() || null });
  };

  const resolveReturn = (loan: FulfilmentLoan, decision: 'accepted' | 'declined') => {
    if (!window.confirm(decision === 'accepted'
      ? 'Accept this return? No seller payout or salary loan will be created.'
      : 'Decline this return request and resume the return window?')) return;
    void postAction(loan, 'return', { decision });
  };

  const settle = (loan: FulfilmentLoan) => {
    const payoutReference = window.prompt('Confirm that the seller was paid, then enter the payout reference.');
    if (!payoutReference?.trim()) return;
    void postAction(loan, 'settle', { payout_reference: payoutReference.trim() });
  };

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

  if (!supabase) {
    return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center gap-2 text-amber-300"><LockKeyhole className="h-5 w-5" /><h2 className="font-bold">Supabase configuration needed</h2></div>
      <p className="text-sm text-slate-400">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable authenticated MFI review.</p>
    </section>;
  }

  if (!session || session.user.app_metadata.role !== 'mfi_operator') {
    return <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">MFI operator sign-in</h2></div>
      <p className="mb-5 text-sm text-slate-400">Only an account with the trusted <code>app_metadata.role = mfi_operator</code> claim can review fulfilment loans.</p>
      {session && <p className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">This account is not authorized to review fulfilment loans.</p>}
      <form className="space-y-3" onSubmit={signIn}>
        <label className="block text-xs text-slate-300">Email<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="email" name="email" autoComplete="username" required /></label>
        <label className="block text-xs text-slate-300">Password<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="password" name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"><LogIn className="h-4 w-4" /> Sign in</button>
      </form>
    </section>;
  }

  const pending = rows.filter((row) => row.status === 'pending_mfi').length;
  const readyToSettle = rows.filter((row) => row.status === 'approved' && row.transaction.status === 'settlement_due').length;
  return <section className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Awaiting MFI review</p><p className="mt-1 text-2xl font-bold text-amber-300">{pending}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Return requests</p><p className="mt-1 text-2xl font-bold text-sky-300">{rows.filter((row) => row.transaction.status === 'return_requested').length}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Ready to settle</p><p className="mt-1 text-2xl font-bold text-emerald-300">{readyToSettle}</p></div>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div><h2 className="font-bold text-white">Trustea fulfilment loans</h2><p className="mt-1 text-xs text-slate-400">Review borrower consent, coordinate delivery, and settle only after the return window.</p></div>
        <button onClick={() => void loadRequests()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {(error || message) && <div className={`mx-4 mt-4 rounded-lg border p-3 text-xs ${error ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading fulfilment loans…</div> : rows.length === 0 ? (
        <div className="p-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-200">No fulfilment loan requests.</p><p className="mt-1 text-xs text-slate-500">Buyer requests appear here after they confirm the seller’s item.</p></div>
      ) : <div className="divide-y divide-slate-800">
        {rows.map((loan) => {
          const transaction = loan.transaction;
          const isBusy = busyId === loan.id;
          const isReturn = transaction.status === 'return_requested';
          const isSettle = loan.status === 'approved' && transaction.status === 'settlement_due';
          return <article key={loan.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{loan.borrower_name}</strong><span className="font-mono text-xs text-slate-500">{loan.borrower_phone}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${loan.status === 'pending_mfi' ? 'bg-amber-950 text-amber-300' : loan.status === 'funded' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-300'}`}>{loan.status.replace('_', ' ')}</span></div>
              <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
                <span>Transaction: <strong className="font-mono text-slate-200">{loan.transaction_id.slice(0, 8).toUpperCase()}</strong></span>
                <span>Salary deduction: <strong className="text-emerald-300">ZMW {Number(loan.amount).toFixed(2)}</strong></span>
                <span>Item: <strong className="text-slate-200">{transaction.item_description || 'Item details unavailable'}</strong></span>
                <span>Seller value: <strong className="text-slate-200">ZMW {Number(transaction.item_value || 0).toFixed(2)}</strong></span>
                <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Consented {new Date(loan.consent_at).toLocaleString()}</span>
                {transaction.return_window_ends_at && <span>Return window ends {new Date(transaction.return_window_ends_at).toLocaleString()}</span>}
                {transaction.fleetbase_order_id && <span>Fleetbase order: <strong className="font-mono text-slate-200">{transaction.fleetbase_order_id}</strong> · {transaction.fleetbase_status || 'created'}</span>}
                {loan.payout_reference && <span>Payout reference: <strong className="font-mono text-slate-200">{loan.payout_reference}</strong></span>}
              </div>
              {transaction.fleetbase_tracking_url && <a className="mt-2 inline-flex text-xs text-sky-300 hover:text-sky-200" href={transaction.fleetbase_tracking_url} target="_blank" rel="noreferrer">Open Fleetbase tracking</a>}
              {loan.review_note && <p className="mt-2 text-xs text-slate-500">Review note: {loan.review_note}</p>}
            </div>
            {loan.status === 'pending_mfi' && <div className="flex flex-wrap gap-2">
              <button disabled={isBusy} onClick={() => review(loan, 'approved')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; send to Fleetbase</button>
              <button disabled={isBusy} onClick={() => review(loan, 'rejected')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Decline</button>
            </div>}
            {isReturn && <div className="flex flex-wrap gap-2">
              <button disabled={isBusy} onClick={() => resolveReturn(loan, 'accepted')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Accept return</button>
              <button disabled={isBusy} onClick={() => resolveReturn(loan, 'declined')} className="flex items-center gap-1.5 rounded-lg border border-amber-800 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Decline return</button>
            </div>}
            {isSettle && <button disabled={isBusy} onClick={() => settle(loan)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{isBusy ? 'Processing…' : 'Confirm seller payout & originate loan'}</button>}
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
