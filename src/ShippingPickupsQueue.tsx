import React, { useState, useEffect } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  Utensils,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Camera,
  PenTool,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { socket, fetchShippingOrders } from './api';

export default function ShippingPickupsQueue() {
  const [orders, setOrders] = useState<any[]>([]);
  const [filterMode, setFilterMode] = useState<'ALL' | 'GOV_FOOD_DELIVERY' | 'TRUSTEA_P2P'>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const data = await fetchShippingOrders();
      setOrders(data);
      if (data.length > 0 && !selectedOrder) {
        setSelectedOrder(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    socket.on('shipping:order_updated', (updated: any) => {
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      if (selectedOrder?.id === updated.id) {
        setSelectedOrder(updated);
      }
    });

    socket.on('shipping:order_created', (newOrder: any) => {
      setOrders((prev) => [newOrder, ...prev]);
    });

    return () => {
      socket.off('shipping:order_updated');
      socket.off('shipping:order_created');
    };
  }, [selectedOrder]);

  const filtered = orders.filter((o) => {
    if (filterMode === 'ALL') return true;
    return o.mode === filterMode;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 p-4 md:p-5 rounded-2xl">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Truck className="w-5 h-5 text-sky-400" />
            <span>Shipping Pickups &amp; Delivery Corridors</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time monitoring of Government worker food deliveries (UTH ➔ Civic Center) and Trustea Escrow P2P pickups.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterMode === 'ALL' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({orders.length})
            </button>
            <button
              onClick={() => setFilterMode('GOV_FOOD_DELIVERY')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterMode === 'GOV_FOOD_DELIVERY' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Gov Food ({orders.filter((o) => o.mode === 'GOV_FOOD_DELIVERY').length})
            </button>
            <button
              onClick={() => setFilterMode('TRUSTEA_P2P')}
              className={`px-3 py-1.5 rounded-lg font-bold transition ${
                filterMode === 'TRUSTEA_P2P' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Trustea P2P ({orders.filter((o) => o.mode === 'TRUSTEA_P2P').length})
            </button>
          </div>
          <button
            onClick={loadData}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh Orders"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Orders List & Detailed Manifest Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Orders Table */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-5 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Active Pickup Queue ({filtered.length})
          </h3>

          <div className="divide-y divide-slate-800/80">
            {filtered.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`py-3.5 px-3 rounded-xl cursor-pointer transition flex items-center justify-between ${
                  selectedOrder?.id === order.id ? 'bg-slate-800/80 border border-sky-500/50' : 'hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5 ${
                      order.mode === 'GOV_FOOD_DELIVERY' ? 'bg-emerald-600' : 'bg-sky-600'
                    }`}
                  >
                    {order.mode === 'GOV_FOOD_DELIVERY' ? <Utensils className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                  </div>

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-white">{order.order_number}</span>
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                          order.status === 'PICKED_UP_IN_TRANSIT'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {order.status === 'PICKED_UP_IN_TRANSIT' ? 'IN TRANSIT' : 'READY FOR PICKUP'}
                      </span>
                    </div>

                    <p className="font-bold text-slate-200 text-xs mt-1">{order.item_title}</p>
                    <p className="text-[11px] text-slate-400">
                      {order.sender_name} ➔ {order.recipient_name}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-bold text-emerald-400 text-xs">ZMW {order.delivery_fee?.toFixed(2)}</span>
                  <span className="block text-[10px] text-slate-500 font-mono mt-0.5">
                    {order.collected_photos?.length || 0} photos &bull; {order.sender_signature_data ? 'Signed ✓' : 'Unsigned'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Selected Order Inspection Manifest */}
        <div className="space-y-4">
          {selectedOrder ? (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Pickup Manifest</span>
                  <h4 className="font-bold text-white text-sm">{selectedOrder.order_number}</h4>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    selectedOrder.status === 'PICKED_UP_IN_TRANSIT'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}
                >
                  {selectedOrder.status}
                </span>
              </div>

              {/* Corridor Route */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Pickup (Sender)</span>
                  <p className="font-bold text-slate-200">{selectedOrder.sender_name}</p>
                  <p className="text-slate-400 text-[11px]">{selectedOrder.sender_location}</p>
                  {selectedOrder.sender_facility && (
                    <p className="text-emerald-400 text-[10px]">{selectedOrder.sender_facility}</p>
                  )}
                </div>

                <div className="border-l-2 border-dashed border-slate-800 pl-3 py-0.5 text-[10px] text-slate-500 font-mono">
                  Rider: {selectedOrder.rider_name}
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block">Delivery (Recipient)</span>
                  <p className="font-bold text-slate-200">{selectedOrder.recipient_name}</p>
                  <p className="text-slate-400 text-[11px]">{selectedOrder.recipient_location}</p>
                  {selectedOrder.recipient_facility && (
                    <p className="text-sky-400 text-[10px]">{selectedOrder.recipient_facility}</p>
                  )}
                </div>
              </div>

              {/* Sender Signature Proof */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                  <PenTool className="w-3.5 h-3.5 text-sky-400" />
                  <span>Sender Handover Signature</span>
                </span>
                {selectedOrder.sender_signature_data ? (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <img
                      src={selectedOrder.sender_signature_data}
                      alt="Sender Signature"
                      className="max-h-16 mx-auto"
                    />
                    <span className="text-[10px] text-slate-400 italic mt-1 block">
                      Signed by: {selectedOrder.sender_signatory_name}
                    </span>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    Awaiting physical signature from sender on pickup app
                  </div>
                )}
              </div>

              {/* Collected Item Photos */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 flex items-center space-x-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  <span>Rider Collected Photos ({selectedOrder.collected_photos?.length || 0})</span>
                </span>
                {selectedOrder.collected_photos?.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedOrder.collected_photos.map((p: any) => (
                      <div key={p.id} className="rounded-lg overflow-hidden border border-slate-800 aspect-video relative">
                        <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1 left-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[8px] text-slate-300 truncate">
                          {p.label}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    Awaiting verification photos from rider app
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl text-slate-500 text-xs">
              Select an order to view manifest
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
