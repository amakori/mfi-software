import React, { useState, useEffect } from 'react';
import {
  Shield,
  Smartphone,
  Laptop,
  Sun,
  Tv,
  Bike,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  PenTool,
  Camera,
  RefreshCw,
  TrendingUp,
  Zap
} from 'lucide-react';
import { socket, fetchCollateralPickups } from './api';

export default function CollateralVaultQueue() {
  const [collaterals, setCollaterals] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await fetchCollateralPickups();
      setCollaterals(data);
      if (data.length > 0 && !selectedItem) {
        setSelectedItem(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    socket.on('collateral:pickup_completed', (payload: any) => {
      setCollaterals((prev) => prev.map((c) => (c.id === payload.collateral.id ? payload.collateral : c)));
      if (selectedItem?.id === payload.collateral.id) {
        setSelectedItem(payload.collateral);
      }
    });

    socket.on('collateral:created', (newCol: any) => {
      setCollaterals((prev) => [newCol, ...prev]);
    });

    return () => {
      socket.off('collateral:pickup_completed');
      socket.off('collateral:created');
    };
  }, [selectedItem]);

  const totalVaultFmv = collaterals.reduce((sum, c) => sum + Number(c.estimated_fmv || 0), 0);
  const totalApprovedLimit = collaterals.reduce((sum, c) => sum + Number(c.approved_credit_limit || 0), 0);
  const totalHeadroom = totalVaultFmv - totalApprovedLimit;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 md:p-5 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Shield className="w-5 h-5 text-red-500" />
            <span>Pledged Collateral Management &amp; InstaPay Credit Lines</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Automated valuation appraisals with high borrower adoption (72%-75% LTV) and secure MFI liquidation headroom.
          </p>
        </div>

        <button
          onClick={loadData}
          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 self-start sm:self-center"
          title="Refresh Collateral"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Total Collateral Market Value (FMV)</span>
          <p className="text-xl font-bold text-white mt-1">
            ZMW {totalVaultFmv.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-slate-500 mt-0.5 block">{collaterals.length} pledged asset items</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">Activated InstaPay Borrowing Lines</span>
          <p className="text-xl font-bold text-emerald-400 mt-1">
            ZMW {totalApprovedLimit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-emerald-500 mt-0.5 block">High adoption 70%-75% LTV granted</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium">MFI Liquidation Headroom Margin</span>
          <p className="text-xl font-bold text-amber-400 mt-1">
            ZMW {totalHeadroom.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <span className="text-[10px] text-amber-500 mt-0.5 block">Safety cushion for MFI collateral vault</span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Collateral Items List */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Pledged Items Directory ({collaterals.length})
          </h3>

          <div className="divide-y divide-slate-800/80">
            {collaterals.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`py-3.5 px-3 rounded-xl cursor-pointer transition flex items-center justify-between ${
                  selectedItem?.id === item.id ? 'bg-slate-800/80 border border-red-500/50' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-800 text-red-400 flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                    {item.item_category === 'SMARTPHONE' ? (
                      <Smartphone className="w-4 h-4" />
                    ) : item.item_category === 'LAPTOP' ? (
                      <Laptop className="w-4 h-4" />
                    ) : item.item_category === 'POWER_SOLAR' ? (
                      <Sun className="w-4 h-4" />
                    ) : item.item_category === 'APPLIANCE' ? (
                      <Tv className="w-4 h-4" />
                    ) : (
                      <Bike className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-white">{item.collateral_code}</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-400 border border-amber-800">
                        {item.condition_grade} &bull; {item.loan_to_value_pct}% LTV
                      </span>
                      {item.instapay_account_activated && (
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          INSTAPAY ACTIVE ✓
                        </span>
                      )}
                    </div>

                    <p className="font-bold text-slate-200 text-xs mt-1">
                      {item.item_make} {item.item_model}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Borrower: <strong className="text-white">{item.borrower_name}</strong> ({item.borrower_phone})
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-500 block">Instant Credit Line</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ZMW {item.approved_credit_limit?.toFixed(2)}
                  </span>
                  <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                    FMV: ZMW {item.estimated_fmv?.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Collateral Appraisal & Handover Audit Card */}
        <div className="space-y-4">
          {selectedItem ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Collateral Item</span>
                  <h4 className="font-bold text-white text-sm">{selectedItem.collateral_code}</h4>
                </div>
                <span
                  className={`text-[10px] font-bold px-2.5 py-0.5 rounded uppercase ${
                    selectedItem.status === 'ACCEPTED_AND_TRANSIT' || selectedItem.status === 'IN_MFI_VAULT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {selectedItem.status}
                </span>
              </div>

              {/* Valuation Breakdown */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Item:</span>
                  <span className="font-bold text-white">
                    {selectedItem.item_make} {selectedItem.item_model}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Condition Grade:</span>
                  <span className="font-bold text-amber-400">{selectedItem.condition_grade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fair Market Value:</span>
                  <span className="text-slate-200 font-bold">ZMW {selectedItem.estimated_fmv?.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Borrower Credit Granted:</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    ZMW {selectedItem.approved_credit_limit?.toFixed(2)} ({selectedItem.loan_to_value_pct}% LTV)
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-800">
                  <span className="text-slate-400">MFI Vault Headroom:</span>
                  <span className="font-mono text-amber-300">
                    +ZMW {selectedItem.mfi_headroom_margin?.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Borrower Details */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase font-bold block">Borrower Profile</span>
                <p className="font-bold text-white">{selectedItem.borrower_name}</p>
                <p className="text-slate-400 text-[11px] font-mono">Phone: {selectedItem.borrower_phone}</p>
                <p className="text-slate-400 text-[11px] font-mono">NRC: {selectedItem.borrower_nrc}</p>
                <p className="text-slate-400 text-[11px]">Address: {selectedItem.borrower_address}</p>
              </div>

              {/* Dispatched SMS Status */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
                  <span>Borrower Onboarding SMS</span>
                </span>
                {selectedItem.instapay_sms_sent ? (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-purple-900/60 font-mono text-[11px] text-purple-200">
                    &ldquo;{selectedItem.instapay_sms_text}&rdquo;
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-slate-500 text-xs">
                    Pending handover confirmation to send activation SMS
                  </div>
                )}
              </div>

              {/* Borrower Signature Proof */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                  <PenTool className="w-3.5 h-3.5 text-red-500" />
                  <span>Borrower Custody Handover Signature</span>
                </span>
                {selectedItem.borrower_signature_data ? (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <img
                      src={selectedItem.borrower_signature_data}
                      alt="Borrower Signature"
                      className="max-h-16 mx-auto"
                    />
                    <span className="text-[10px] text-slate-400 italic mt-1 block">
                      Signed by: {selectedItem.borrower_name}
                    </span>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-slate-500 text-xs text-center">
                    Awaiting digital signature from borrower on pickup
                  </div>
                )}
              </div>

              {/* Inspection Photos */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                  <Camera className="w-3.5 h-3.5 text-red-500" />
                  <span>Inspection Photos ({selectedItem.inspection_photos?.length || 0})</span>
                </span>
                {selectedItem.inspection_photos?.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedItem.inspection_photos.map((p: any) => (
                      <div key={p.id} className="rounded-lg overflow-hidden border border-slate-800 aspect-video relative">
                        <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 left-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[8px] text-slate-300 truncate">
                          {p.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-slate-500 text-xs text-center">
                    Awaiting inspection photos from rider app
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-500 text-xs">
              Select a collateral item to view appraisal details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
