import { FormEvent, useCallback, useEffect, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { CheckCircle2, Clock3, ExternalLink, LogIn, MapPin, Package, RefreshCw, ShieldCheck, Truck, XCircle } from 'lucide-react';

type ShopOrder = {
  id: string;
  quantity: number;
  status: string;
  fulfilment_status: string;
  delivery_name: string;
  delivery_phone: string;
  delivery_address: string;
  mfi_approved_at: string | null;
  fleetbase_order_id: string | null;
  fleetbase_status: string | null;
  fleetbase_tracking_url: string | null;
  delivered_at: string | null;
  created_at: string;
  authorization: {
    id: string;
    amount: number;
    status: 'authorized' | 'settled' | 'voided';
  };
  product: { name: string; description: string } | null;
  creator: { display_name: string } | null;
  pickup: { pickup_name: string; pickup_phone: string; pickup_address: string } | null;
  customer: { name: string; employment_number: string } | null;
  return_request: {
    id: string;
    reason: string;
    status: 'pending_mfi' | 'approved' | 'declined';
    requested_at: string;
    review_note: string | null;
  } | null;
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const hubUrl = (import.meta.env.VITE_HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function ShopFulfilmentQueue() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<ShopOrder[]>([]);
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

  const loadOrders = useCallback(async () => {
    if (!session?.access_token || session.user.app_metadata.role !== 'mfi_operator') {
      setRows([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${hubUrl}/api/fulfilment/mfi/shop-orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Could not load Sumthin shop orders.');
      setRows(result as ShopOrder[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load Sumthin shop orders.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void loadOrders();
    const timer = window.setInterval(() => { void loadOrders(); }, 20000);
    return () => window.clearInterval(timer);
  }, [loadOrders]);

  const approveAndDispatch = async (order: ShopOrder) => {
    if (!session?.access_token) return;
    if (!window.confirm('Approve this shop payment and send the order to Fleetbase for complete delivery to the buyer?')) return;
    setBusyId(order.id);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${hubUrl}/api/fulfilment/mfi/shop-orders/${encodeURIComponent(order.id)}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Fleetbase did not accept the shop order.');
      setMessage(`MFI approval recorded. Fleetbase order ${result.order_id} was created for delivery to the buyer.`);
      await loadOrders();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not approve and dispatch this shop order.');
    } finally {
      setBusyId('');
    }
  };

  const reviewPayment = async (order: ShopOrder, status: 'settled' | 'voided') => {
    if (!supabase) return;
    const question = status === 'settled'
      ? 'Confirm the creator has been paid for this delivered order, then record settlement?'
      : 'Decline this shop payment and release the customer’s reserved facility limit?';
    if (!window.confirm(question)) return;
    setBusyId(order.id);
    setError('');
    setMessage('');
    const { data, error: reviewError } = await supabase.rpc('review_salary_payment_authorization', {
      p_authorization_id: order.authorization.id,
      p_status: status,
    });
    setBusyId('');
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    if (data?.success !== true) {
      setError(data?.error || 'Could not update this shop payment.');
      return;
    }
    setMessage(status === 'settled' ? 'Creator payout settlement recorded.' : 'Shop payment declined.');
    await loadOrders();
  };

  const reviewReturn = async (order: ShopOrder, status: 'approved' | 'declined') => {
    if (!supabase || !order.return_request) return;
    const decision = status === 'approved' ? 'approve' : 'decline';
    if (!window.confirm(`${decision === 'approve' ? 'Approve' : 'Decline'} this return request for MFI follow-up?`)) return;
    const reviewNote = window.prompt('Optional note for the buyer (up to 500 characters):');
    if (reviewNote === null) return;
    setBusyId(order.id);
    setError('');
    setMessage('');
    const { data, error: reviewError } = await supabase.rpc('review_creator_order_return', {
      p_return_id: order.return_request.id,
      p_status: status,
      p_review_note: reviewNote.trim() || null,
    });
    setBusyId('');
    if (reviewError) {
      setError(reviewError.message);
      return;
    }
    if (data?.success !== true) {
      setError(data?.error || 'Could not update this return request.');
      return;
    }
    setMessage(`Return request ${status}. MFI follow-up is still required; no refund or return shipment was created.`);
    await loadOrders();
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
      <div className="mb-3 flex items-center gap-2 text-amber-300"><Package className="h-5 w-5" /><h2 className="font-bold">Supabase configuration needed</h2></div>
      <p className="text-sm text-slate-400">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to enable authenticated MFI review.</p>
    </section>;
  }

  if (!session?.user || session.user.app_metadata.role !== 'mfi_operator') {
    return <section className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-2 flex items-center gap-2 text-sky-300"><ShieldCheck className="h-5 w-5" /><h2 className="font-bold">MFI operator sign-in</h2></div>
      <p className="mb-5 text-sm text-slate-400">Use an authorized MFI account. Access is checked against the trusted <code>app_metadata.role</code> claim.</p>
      {session?.user && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">This account is not authorized to review shop orders.</div>}
      <form className="space-y-3" onSubmit={signIn}>
        <label className="block text-xs text-slate-300">Email<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="email" name="email" autoComplete="username" required /></label>
        <label className="block text-xs text-slate-300">Password<input className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="password" name="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <button className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500"><LogIn className="h-4 w-4" /> Sign in</button>
      </form>
    </section>;
  }

  const pending = rows.filter((order) => !order.mfi_approved_at && order.authorization?.status === 'authorized').length;
  const inDelivery = rows.filter((order) => order.mfi_approved_at && order.fulfilment_status !== 'delivered').length;
  const delivered = rows.filter((order) => order.fulfilment_status === 'delivered').length;
  return <section className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Awaiting MFI approval</p><p className="mt-1 text-2xl font-bold text-amber-300">{pending}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">With Fleetbase</p><p className="mt-1 text-2xl font-bold text-sky-300">{inDelivery}</p></div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-400">Delivered</p><p className="mt-1 text-2xl font-bold text-emerald-300">{delivered}</p></div>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-800 p-4">
        <div><h2 className="font-bold text-white">Sumthin shop fulfilment</h2><p className="mt-1 text-xs text-slate-400">Fleetbase manages each approved order from creator pickup directly to the buyer, regardless of distance.</p></div>
        <button onClick={() => void loadOrders()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
      </div>
      {(error || message) && <div className={`mx-4 mt-4 rounded-lg border p-3 text-xs ${error ? 'border-red-900 bg-red-950/40 text-red-300' : 'border-emerald-900 bg-emerald-950/40 text-emerald-300'}`} role={error ? 'alert' : 'status'}>{error || message}</div>}
      {loading ? <div className="p-8 text-center text-sm text-slate-400">Loading shop fulfilment orders…</div> : rows.length === 0 ? (
        <div className="p-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" /><p className="mt-3 text-sm font-medium text-slate-200">No shop purchases yet.</p><p className="mt-1 text-xs text-slate-500">Authorized Sumthin shop orders will appear here.</p></div>
      ) : <div className="divide-y divide-slate-800">
        {rows.map((order) => {
          const canApprove = !order.mfi_approved_at && order.authorization?.status === 'authorized';
          const canDecline = !order.mfi_approved_at && order.authorization?.status === 'authorized';
          const canSettle = order.fulfilment_status === 'delivered' && order.authorization?.status === 'authorized';
          return <article key={order.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-white">{order.product?.name || 'Shop item'}</strong><span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-300">{order.fulfilment_status.replace(/_/g, ' ')}</span><span className="text-xs text-emerald-300">ZMW {Number(order.authorization?.amount || 0).toFixed(2)}</span></div>
              <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-slate-400 sm:grid-cols-2">
                <span>Customer: <strong className="text-slate-200">{order.customer?.name || order.delivery_name}</strong> · Qty {order.quantity}</span>
                <span>Employment number: <strong className="font-mono text-slate-200">{order.customer?.employment_number || '—'}</strong></span>
                <span>Creator: <strong className="text-slate-200">{order.creator?.display_name || 'Creator'}</strong></span>
                <span>Pickup contact: <strong className="text-slate-200">{order.pickup?.pickup_name || order.creator?.display_name || '—'} · {order.pickup?.pickup_phone || '—'}</strong></span>
                <span className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /> Pickup: {order.pickup?.pickup_address || 'Missing creator pickup address'}</span>
                <span className="flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /> Deliver to: {order.delivery_name} · {order.delivery_phone} · {order.delivery_address}</span>
                <span className="flex items-center gap-1"><Clock3 className="h-3 w-3" /> Ordered {new Date(order.created_at).toLocaleString()}</span>
                {order.fleetbase_order_id && <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Fleetbase {order.fleetbase_order_id} · {order.fleetbase_status || 'created'}</span>}
                {order.delivered_at && <span className="text-emerald-300">Delivered {new Date(order.delivered_at).toLocaleString()}</span>}
              </div>
              {order.fleetbase_tracking_url && <a className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200" href={order.fleetbase_tracking_url} target="_blank" rel="noreferrer">Open delivery tracking <ExternalLink className="h-3 w-3" /></a>}
                {order.return_request && <div className="mt-3 rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-xs text-slate-300">
                  <div className="flex flex-wrap items-center gap-2"><strong className="text-amber-200">Return request · {order.return_request.status.replace(/_/g, ' ')}</strong><span>Submitted {new Date(order.return_request.requested_at).toLocaleString()}</span></div>
                  <p className="mt-1 whitespace-pre-wrap">{order.return_request.reason}</p>
                  {order.return_request.review_note && <p className="mt-1 text-slate-400">MFI note: {order.return_request.review_note}</p>}
                  <p className="mt-2 text-slate-500">Decision records MFI review only; it does not automatically refund or arrange collection.</p>
                </div>}
            </div>
            <div className="flex flex-wrap gap-2">
              {canApprove && <button disabled={busyId === order.id} onClick={() => void approveAndDispatch(order)} className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve &amp; send to Fleetbase</button>}
              {canDecline && <button disabled={busyId === order.id} onClick={() => void reviewPayment(order, 'voided')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Decline</button>}
              {canSettle && <button disabled={busyId === order.id} onClick={() => void reviewPayment(order, 'settled')} className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Record creator payout</button>}
              {order.mfi_approved_at && order.fulfilment_status !== 'delivered' && <span className="self-center text-xs text-slate-400">Awaiting delivery before payout settlement</span>}
              {order.return_request?.status === 'pending_mfi' && <>
                <button disabled={busyId === order.id} onClick={() => void reviewReturn(order, 'approved')} className="flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" /> Approve return</button>
                <button disabled={busyId === order.id} onClick={() => void reviewReturn(order, 'declined')} className="flex items-center gap-1.5 rounded-lg border border-red-900 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" /> Decline return</button>
              </>}
            </div>
          </article>;
        })}
      </div>}
    </div>
  </section>;
}
