import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { CheckCircle2, Clock3, CreditCard, LogIn, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';

type Authorization = {
  id: string;
  user_id: string;
  salary_application_id: string;
  payment_type: 'donation' | 'subscription' | 'shop_order';
  amount: number;
  quantity: number;
  recipient_name: string | null;
  recipient_phone: string | null;
  note: string;
  creator_id: string | null;
  tier_id: string | null;
  product_id: string | null;
  status: 'authorized' | 'settled' | 'voided';
  created_at: string;
  settled_at: string | null;
  applicantName?: string;
  employmentNumber?: string;
  creatorName?: string;
  tierName?: string;
  productName?: string;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const paymentLabel: Record<Authorization['payment_type'], string> = {
  donation: 'Donation',
  subscription: 'Creator subscription',
  shop_order: 'Shop purchase',
};

export default function PaymentAuthorizationQueue() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Authorization[]>([]);
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

  const loadAuthorizations = useCallback(async () => {
    if (!supabase || !session?.access_token || session.user.app_metadata.role !== 'mfi_operator') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase
      .from('salary_payment_authorizations')
      .select('id, user_id, salary_application_id, payment_type, amount, quantity, recipient_name, recipient_phone, note, creator_id, tier_id, product_id, status, created_at, settled_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (loadError) {
      setError(loadError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const authorizations = (data || []) as Authorization[];
    const applicationIds = [...new Set(authorizations.map((item) => item.salary_application_id))];
    const creatorIds = [...new Set(authorizations.flatMap((item) => item.creator_id ? [item.creator_id] : []))];
    const tierIds = [...new Set(authorizations.flatMap((item) => item.tier_id ? [item.tier_id] : []))];
    const productIds = [...new Set(authorizations.flatMap((item) => item.product_id ? [item.product_id] : []))];
    const [applicationResult, creatorResult, tierResult, productResult] = await Promise.all([
      applicationIds.length
        ? supabase.from('salary_applications').select('id, applicant_first_name, applicant_last_name, employment_number').in('id', applicationIds)
        : Promise.resolve({ data: [], error: null }),
      creatorIds.length
        ? supabase.from('creator_profiles').select('id, display_name').in('id', creatorIds)
        : Promise.resolve({ data: [], error: null }),
      tierIds.length
        ? supabase.from('creator_tiers').select('id, name').in('id', tierIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? supabase.from('creator_products').select('id, name').in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const referenceError = applicationResult.error || creatorResult.error || tierResult.error || productResult.error;
    if (referenceError) {
      setError(referenceError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const applicationById = new Map((applicationResult.data || []).map((item) => [item.id, item]));
    const creatorById = new Map((creatorResult.data || []).map((item) => [item.id, item]));
    const tierById = new Map((tierResult.data || []).map((item) => [item.id, item]));
    const productById = new Map((productResult.data || []).map((item) => [item.id, item]));
    setRows(authorizations.map((item) => {
      const application = applicationById.get(item.salary_application_id);
      return {
        ...item,
        applicantName: application ? `${application.applicant_first_name} ${application.applicant_last_name}` : 'Applicant',
        employmentNumber: application?.employment_number || '',
        creatorName: item.creator_id ? creatorById.get(item.creator_id)?.display_name || 'Creator' : undefined,
        tierName: item.tier_id ? tierById.get(item.tier_id)?.name || 'Support tier' : undefined,
        productName: item.product_id ? productById.get(item.product_id)?.name || 'Shop item' : undefined,
      };
    }));
    setLoading(false);
  }, [session]);

  useEffect(() => {
    void loadAuthorizations();
    const timer = window.setInterval(() => { void loadAuthorizations(); }, 20000);
    return () => window.clearInterval(timer);
  }, [loadAuthorizations]);

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

  const review = async (authorization: Authorization, status: 'settled' | 'voided') => {
    if (!supabase) return;
    const action = status === 'settled' ? 'record settlement' : 'void this authorization';
    if (!window.confirm(`Confirm you want to ${action} for ZMW ${Number(authorization.amount).toFixed(2)}?`)) return;
    setBusyId(authorization.id);
    setError('');
    setMessage('');
    const { data, error: reviewError } = await supabase.rpc('review_salary_payment_authorization', {
      p_authorization_id: authorization.id,
      p_status: status,
    });
    setBusyId('');
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    if (data?.success !== true) {
      setError(data?.error || 'Could not update this payment authorization.');
      return;
    }
    setMessage(status === 'settled' ? 'Payment settlement recorded.' : 'Payment authorization voided.');
    await loadAuthorizations();
  };

  if (!supabase) {
    return <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-3 flex items-center gap-2 text-amber-300"><CreditCard className="h-5 w-5" /><h2 className="font-bold">Supabase configuration needed</h2></div>
      <p className="text-sm text-slate-400">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> for this app to connect to the Sumthin project.</p>
    </section>;
  }

  if (!session?.user || session.user.app_metadata.role !== 'mfi_operator') {
    return <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">MFI operator sign-in</h2></div>
      <p className="mb-5 text-sm text-slate-400">Use an authorized MFI account. Access is checked against the trusted <code>app_metadata.role</code> claim.</p>
      {session?.user && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">This account is not authorized to review payment authorizations.</div>}
      <form className="space-y-3" onSubmit={signIn}>
        <label className="block text-xs text-slate-300">Email<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="email" name="email" autoComplete="username" required /></label>
        <label className="block text-xs text-slate-300">Password<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="password" name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"><LogIn className="h-4 w-4" /> Sign in</button>
      </form>
    </section>;
  }

  const authorizedCount = rows.filter((item) => item.status === 'authorized').length;
  const settledCount = rows.filter((item) => item.status === 'settled').length;
  const voidedCount = rows.filter((item) => item.status === 'voided').length;
  return <section className="space-y-5">
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Awaiting settlement</p><p className="mt-1 text-2xl font-bold text-amber-300">{authorizedCount}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Settled</p><p className="mt-1 text-2xl font-bold text-emerald-300">{settledCount}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Voided</p><p className="mt-1 text-2xl font-bold text-slate-300">{voidedCount}</p></div>
      <div className="col-span-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-400 md:col-span-1"><Clock3 className="h-4 w-4 shrink-0 text-sky-400" /> Authorizations reserve facility limit; record settlement only after funds are transferred.</div>
    </div>

    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div><h2 className="font-bold text-white">Sumthin payment authorizations</h2><p className="mt-1 text-xs text-slate-400">Donations, creator subscriptions, and shop purchases authorized by customers.</p></div>
        <button onClick={() => void loadAuthorizations()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {(error || message) && <div className={`mx-4 mt-4 rounded-lg border p-3 text-xs ${error ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading payment authorizations…</div> : rows.length === 0 ? (
        <div className="p-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-200">No payment authorizations yet.</p><p className="mt-1 text-xs text-slate-500">New Sumthin payments will appear here after customer authorization.</p></div>
      ) : <div className="divide-y divide-slate-800">
        {rows.map((authorization) => {
          const item = authorization.payment_type === 'donation'
            ? authorization.recipient_name || 'Recipient'
            : authorization.payment_type === 'subscription'
              ? `${authorization.creatorName} · ${authorization.tierName}`
              : `${authorization.productName} · ${authorization.creatorName}`;
          return <article key={authorization.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{paymentLabel[authorization.payment_type]}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${authorization.status === 'authorized' ? 'bg-amber-950 text-amber-300' : authorization.status === 'settled' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{authorization.status}</span></div>
              <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
                <span>Customer: <strong className="text-slate-200">{authorization.applicantName}</strong></span>
                <span>Employment number: <strong className="font-mono text-slate-200">{authorization.employmentNumber || '—'}</strong></span>
                <span>For: <strong className="text-slate-200">{item}</strong></span>
                <span>Amount: <strong className="text-emerald-300">ZMW {Number(authorization.amount).toFixed(2)}</strong>{authorization.payment_type === 'shop_order' && ` · Qty ${authorization.quantity}`}</span>
                {authorization.recipient_phone && <span>Recipient phone: <strong className="font-mono text-slate-200">{authorization.recipient_phone}</strong></span>}
                <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Authorized {new Date(authorization.created_at).toLocaleString()}</span>
                {authorization.settled_at && <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Settled {new Date(authorization.settled_at).toLocaleString()}</span>}
                {authorization.note && <span className="sm:col-span-2">Note: <strong className="text-slate-200">{authorization.note}</strong></span>}
              </div>
            </div>
            {authorization.status === 'authorized' && authorization.payment_type !== 'shop_order' && <div className="flex flex-wrap gap-2">
              <button disabled={busyId === authorization.id} onClick={() => void review(authorization, 'settled')} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Record settled</button>
              <button disabled={busyId === authorization.id} onClick={() => void review(authorization, 'voided')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Void</button>
            </div>}
            {authorization.status === 'authorized' && authorization.payment_type === 'shop_order' && <span className="self-center text-xs text-slate-400">Review this order in Shop Fulfilment.</span>}
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
