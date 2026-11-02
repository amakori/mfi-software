import React, { useEffect, useState } from 'react';
import {
  Activity,
  Shield,
  Smartphone,
  History,
  MessageSquare,
  HandCoins,
  Briefcase,
  AlertTriangle,
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Settings,
  Battery,
  Wifi,
  ExternalLink,
  ChevronRight,
  Flame,
  Power,
  Package,
  Truck
} from 'lucide-react';
import {
  socket,
  fetchOverview,
  fetchLoans,
  fetchBorrowers,
  fetchSettings,
  updateSettings,
  fetchSmsLogs,
  evaluateCredit,
  triggerSimulation
} from './api';
import CreatorDeductionQueue from './CreatorDeductionQueue';
import SalaryApplicationQueue from './SalaryApplicationQueue';
import FulfilmentLoanQueue from './FulfilmentLoanQueue';
import ShippingPickupsQueue from './ShippingPickupsQueue';
import CollateralVaultQueue from './CollateralVaultQueue';

export default function App() {
  const [activeTab, setActiveTab] = useState<'monitor' | 'safeguards' | 'gateways' | 'history' | 'sms' | 'creator-deductions' | 'salary-applications' | 'fulfilment' | 'shipping' | 'collateral'>('monitor');
  const [overview, setOverview] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [borrowers, setBorrowers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Credit Simulator State
  const [simPhone, setSimPhone] = useState('0977123456');
  const [simAmount, setSimAmount] = useState('250');
  const [simType, setSimType] = useState<'SEND_MONEY' | 'GET_CASH'>('SEND_MONEY');
  const [evalResult, setEvalResult] = useState<any>(null);

  // Live USSD Steps Stream
  const [liveUssdSteps, setLiveUssdSteps] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [ovData, loanData, bData, sData, smsData] = await Promise.all([
        fetchOverview(),
        fetchLoans(),
        fetchBorrowers(),
        fetchSettings(),
        fetchSmsLogs()
      ]);
      setOverview(ovData);
      setLoans(loanData);
      setBorrowers(bData);
      setSettings(sData);
      setSmsLogs(smsData);
    } catch (err) {
      console.error('Failed to load initial MFI data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Socket.io Realtime listeners
    socket.on('mfi:loan_created', (loan) => {
      setLoans((prev) => [loan, ...prev]);
      setLiveUssdSteps((prev) => [{ step: 'DISPATCH', name: `Dispatched ${loan.loan_type}`, time: new Date().toLocaleTimeString(), loanId: loan.id }, ...prev]);
    });

    socket.on('mfi:loan_updated', (loan) => {
      setLoans((prev) => prev.map((l) => (l.id === loan.id ? loan : l)));
      if (selectedLoan?.id === loan.id) setSelectedLoan(loan);
    });

    socket.on('mfi:gateway_updated', (gateway) => {
      setOverview((prev: any) => (prev ? { ...prev, gateway } : prev));
    });

    socket.on('mfi:ussd_step', (stepData) => {
      setLiveUssdSteps((prev) => [
        {
          step: stepData.step,
          name: stepData.action || stepData.stepName,
          time: new Date().toLocaleTimeString(),
          loanId: stepData.loanId
        },
        ...prev.slice(0, 20)
      ]);
    });

    socket.on('ussd:confirmation_prompt', (promptData) => {
      setLiveUssdSteps((prev) => [
        {
          step: 'INTERCEPT',
          name: `Prompt: ${promptData.recipientName} (ZMW ${promptData.amount})`,
          time: new Date().toLocaleTimeString(),
          loanId: promptData.loanId
        },
        ...prev.slice(0, 20)
      ]);
    });

    socket.on('carrier:sms_received', (res) => {
      setSmsLogs((prev) => [res.logEntry, ...prev]);
      loadData();
    });

    return () => {
      socket.off('mfi:loan_created');
      socket.off('mfi:loan_updated');
      socket.off('mfi:gateway_updated');
      socket.off('mfi:ussd_step');
      socket.off('ussd:confirmation_prompt');
      socket.off('carrier:sms_received');
    };
  }, [selectedLoan]);

  const handleToggleEmergencyFreeze = async () => {
    if (!settings) return;
    const newStatus = !settings.emergency_freeze_dispensing;
    const res = await updateSettings({ emergency_freeze_dispensing: newStatus });
    if (res.success) {
      setSettings(res.settings);
    }
  };

  const handleRunCreditCheck = async () => {
    const res = await evaluateCredit({
      borrower_phone: simPhone,
      amount: Number(simAmount),
      loan_type: simType
    });
    setEvalResult(res);
  };

  const handleStartSimulation = async (type: 'SEND_MONEY' | 'GET_CASH') => {
    setSimulating(true);
    try {
      const res = await triggerSimulation({
        loan_type: type,
        amount: type === 'SEND_MONEY' ? 150 : 500,
        recipient_phone: '0977123456',
        agent_number: '492109'
      });
      console.log('Simulation response:', res);
    } catch (e) {
      console.error('Simulation error:', e);
    } finally {
      setTimeout(() => setSimulating(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-red-600 border-t-transparent mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Connecting to Instapay MFI Core...</p>
        </div>
      </div>
    );
  }

  const gateway = overview?.gateway;
  const stats = overview?.stats;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col pb-20 md:pb-0">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center font-black text-white shadow-lg shadow-red-900/40">
              IP
            </div>
            <div>
              <h1 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Trustea MFI Partner</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-800/60">
                  Lender Core
                </span>
              </h1>
              <p className="text-xs text-slate-400">Instapay Dispensing &amp; Safeguard Management</p>
            </div>
          </div>

          {/* Gateway Status Badge & Emergency Killswitch */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs">
              <span className={`w-2.5 h-2.5 rounded-full ${gateway?.status === 'idle' ? 'bg-emerald-500 animate-pulse' : gateway?.status === 'busy' ? 'bg-amber-500 animate-ping' : 'bg-red-500'}`} />
              <span className="font-medium text-slate-300">
                {gateway?.device_name || 'Instapay Android App'} ({gateway?.status?.toUpperCase()})
              </span>
              <span className="text-emerald-400 font-bold ml-1">
                ZMW {gateway?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
            </div>

            <button
              onClick={handleToggleEmergencyFreeze}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
                settings?.emergency_freeze_dispensing
                  ? 'bg-red-600 text-white animate-pulse shadow-red-900/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{settings?.emergency_freeze_dispensing ? 'DISPENSING FROZEN' : 'Active'}</span>
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="max-w-7xl mx-auto hidden md:flex items-center space-x-2 mt-3 pt-2 border-t border-slate-800/60 text-sm">
          <button
            onClick={() => setActiveTab('monitor')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'monitor' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Monitor &amp; USSD</span>
          </button>
          <button
            onClick={() => setActiveTab('safeguards')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'safeguards' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Credit Engine &amp; Safeguards</span>
          </button>
          <button
            onClick={() => setActiveTab('gateways')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'gateways' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>Gateway Devices</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'history' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Transaction History</span>
          </button>
          <button
            onClick={() => setActiveTab('sms')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'sms' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Airtel Money SMS Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('creator-deductions')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'creator-deductions' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <HandCoins className="w-4 h-4" />
            <span>Creator Deductions</span>
          </button>
          <button
            onClick={() => setActiveTab('salary-applications')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'salary-applications' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Sumthin Applications</span>
          </button>
          <button
            onClick={() => setActiveTab('fulfilment')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'fulfilment' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Trustea Fulfilment</span>
          </button>
          <button
            onClick={() => setActiveTab('shipping')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'shipping' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Shipping Pickups</span>
          </button>
          <button
            onClick={() => setActiveTab('collateral')}
            className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg font-medium transition ${
              activeTab === 'collateral' ? 'bg-red-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Collateral &amp; Vault</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* TAB 1: LIVE MONITOR */}
        {activeTab === 'monitor' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-sm">
                <p className="text-xs text-slate-400 font-medium">Disbursed Today</p>
                <p className="text-xl md:text-2xl font-bold text-emerald-400 mt-1">
                  ZMW {stats?.totalDisbursedToday?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-slate-500 mt-1 block">Airtel Money Mobile Money</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-sm">
                <p className="text-xs text-slate-400 font-medium">Active Dispenses</p>
                <p className="text-xl md:text-2xl font-bold text-amber-400 mt-1">{stats?.activeLoansCount || 0}</p>
                <span className="text-[11px] text-slate-500 mt-1 block">In-flight USSD sessions</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-sm">
                <p className="text-xs text-slate-400 font-medium">Airtel SIM Balance</p>
                <p className="text-xl md:text-2xl font-bold text-white mt-1">
                  ZMW {gateway?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-emerald-500 mt-1 block">Available for instant loans</span>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-sm">
                <p className="text-xs text-slate-400 font-medium">Credit Approval Rate</p>
                <p className="text-xl md:text-2xl font-bold text-sky-400 mt-1">{stats?.approvalRate}%</p>
                <span className="text-[11px] text-slate-500 mt-1 block">Protected by MFI safeguards</span>
              </div>
            </div>

            {/* Live USSD Execution Timeline + Interactive Simulation Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: In-Flight Loans & Live USSD Visualizer */}
              <div className="lg:col-span-2 space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 md:p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm md:text-base font-bold text-white flex items-center space-x-2">
                      <Activity className="w-4 h-4 text-red-500 animate-pulse" />
                      <span>Live USSD Dispensing Pipeline</span>
                    </h2>
                    <span className="text-xs text-slate-400">Syncing via WebSockets</span>
                  </div>

                  {loans.filter((l) => !['COMPLETED', 'FAILED', 'REJECTED', 'CUSTOMER_CANCELLED'].includes(l.status)).length === 0 ? (
                    <div className="py-10 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-60" />
                      <p className="text-sm text-slate-300 font-medium">All USSD automation queues are clear</p>
                      <p className="text-xs text-slate-500 mt-1">The Instapay Android App is idle and ready to dispense</p>
                      <div className="mt-4 flex items-center justify-center space-x-3">
                        <button
                          onClick={() => handleStartSimulation('SEND_MONEY')}
                          disabled={simulating}
                          className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition shadow-sm"
                        >
                          Simulate Send Money (*115#)
                        </button>
                        <button
                          onClick={() => handleStartSimulation('GET_CASH')}
                          disabled={simulating}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
                        >
                          Simulate Get Cash (*115#)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {loans
                        .filter((l) => !['COMPLETED', 'FAILED', 'REJECTED', 'CUSTOMER_CANCELLED'].includes(l.status))
                        .map((loan) => (
                          <div key={loan.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-900 mr-2">
                                  {loan.loan_type === 'SEND_MONEY' ? 'SEND MONEY' : 'GET CASH'}
                                </span>
                                <span className="font-bold text-white">{loan.borrower_name}</span>
                                <span className="text-xs text-slate-400 ml-2">({loan.borrower_phone})</span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-emerald-400 text-base">ZMW {loan.amount.toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Stepper Progression */}
                            <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800 text-xs">
                              <p className="font-medium text-slate-300 mb-2 flex items-center justify-between">
                                <span>Automation Step:</span>
                                <span className="text-amber-400 font-bold uppercase">{loan.status}</span>
                              </p>
                              {loan.parsed_recipient_name && (
                                <div className="p-2 rounded bg-amber-950/40 border border-amber-800/40 text-amber-200 mb-2">
                                  Intercepted Recipient: <strong>{loan.parsed_recipient_name}</strong>
                                </div>
                              )}
                              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-red-500 h-full transition-all duration-500"
                                  style={{
                                    width:
                                      loan.status === 'DISPATCHED'
                                        ? '20%'
                                        : loan.status === 'USSD_IN_PROGRESS'
                                        ? '40%'
                                        : loan.status === 'AWAITING_CUSTOMER_CONFIRMATION'
                                        ? '65%'
                                        : loan.status === 'CUSTOMER_CONFIRMED'
                                        ? '80%'
                                        : loan.status === 'PIN_ENTERED'
                                        ? '90%'
                                        : '100%'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Recent Completed Transactions */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 md:p-5">
                  <h3 className="text-sm font-bold text-white mb-3">Recently Completed Disbursements</h3>
                  <div className="divide-y divide-slate-800/60">
                    {loans
                      .filter((l) => l.status === 'COMPLETED')
                      .slice(0, 5)
                      .map((loan) => (
                        <div key={loan.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center space-x-3">
                            <div className="w-7 h-7 rounded-full bg-emerald-950/80 text-emerald-400 flex items-center justify-center font-bold">
                              ✓
                            </div>
                            <div>
                              <p className="font-bold text-slate-200">{loan.borrower_name}</p>
                              <p className="text-slate-500">
                                {loan.loan_type === 'SEND_MONEY' ? `Sent to ${loan.recipient_phone}` : `Withdrawn at Agent ${loan.agent_number}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-emerald-400 text-sm">ZMW {loan.amount.toFixed(2)}</p>
                            <p className="text-slate-500">{loan.carrier_sms_reference || 'Airtel Verified'}</p>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Right Col: Live USSD Terminal Stream & Hardware Watchdog */}
              <div className="space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-1.5">
                      <Smartphone className="w-3.5 h-3.5 text-red-500" />
                      <span>Dispensing Phone Terminal</span>
                    </h3>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                      LIVE
                    </span>
                  </div>

                  <div className="bg-slate-950 rounded-lg p-3 font-mono text-[11px] h-72 overflow-y-auto space-y-1.5 border border-slate-800/80">
                    {liveUssdSteps.length === 0 ? (
                      <div className="text-slate-600 italic py-10 text-center">
                        Listening for USSD Accessibility events...
                      </div>
                    ) : (
                      liveUssdSteps.map((step, idx) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="text-slate-500 text-[10px]">{step.time}</span>
                          <span className="text-sky-400 font-bold">[{step.step}]</span>
                          <span className="text-slate-300 break-all">{step.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Gateway Device Quick Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Instapay Android Device</h3>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Hardware Model:</span>
                    <span className="font-bold text-slate-200">{gateway?.device_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">SIM Number:</span>
                    <span className="font-mono text-slate-200">{gateway?.phone_number}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Battery Level:</span>
                    <span className="font-bold text-emerald-400 flex items-center space-x-1">
                      <Battery className="w-3.5 h-3.5 inline" />
                      <span>{gateway?.battery_level}%</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">USSD Protocol:</span>
                    <span className="font-bold text-red-400">Airtel Zambia (*115#)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CREDIT ENGINE & SAFEGUARDS */}
        {activeTab === 'safeguards' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 md:p-6 space-y-6">
              <div>
                <h2 className="text-base font-bold text-white flex items-center space-x-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  <span>Microfinance Lending Safeguards &amp; Compliance</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Enforces statutory government regulations, partner MFI risk parameters, and phone wallet liquidity buffers.
                </p>
              </div>

              {/* Safeguard Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">Government Statutory Max Loan</span>
                  <div className="text-xl font-bold text-white">ZMW {settings?.government_max_loan_limit?.toFixed(2)}</div>
                  <p className="text-[11px] text-slate-500">Legal ceiling under micro-lending regulations</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">MFI Single Loan Ceiling</span>
                  <div className="text-xl font-bold text-sky-400">ZMW {settings?.max_single_loan?.toFixed(2)}</div>
                  <p className="text-[11px] text-slate-500">Maximum amount disbursed in a single instant transaction</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">Phone Wallet Safety Buffer</span>
                  <div className="text-xl font-bold text-amber-400">ZMW {settings?.gateway_min_reserve_buffer?.toFixed(2)}</div>
                  <p className="text-[11px] text-slate-500">Emergency reserve retained on SIM card at all times</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">Daily Borrower Cap</span>
                  <div className="text-xl font-bold text-white">ZMW {settings?.daily_borrower_limit?.toFixed(2)}</div>
                  <p className="text-[11px] text-slate-500">Maximum total borrow allowed per customer per day</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">Government Interest Cap</span>
                  <div className="text-xl font-bold text-white">{settings?.government_interest_cap_pct}%</div>
                  <p className="text-[11px] text-slate-500">Statutory interest rate upper bound</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-400">Emergency Dispense Status</span>
                  <div className="text-xl font-bold flex items-center space-x-2">
                    <span className={settings?.emergency_freeze_dispensing ? 'text-red-500' : 'text-emerald-400'}>
                      {settings?.emergency_freeze_dispensing ? 'FROZEN' : 'ACTIVE'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">Master safeguard killswitch for live device</p>
                </div>
              </div>
            </div>

            {/* Credit Engine Interactive Rule Tester */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 md:p-6 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Flame className="w-4 h-4 text-amber-400" />
                <span>Live Credit Decision &amp; Safeguard Simulator</span>
              </h3>
              <p className="text-xs text-slate-400">
                Test whether an incoming loan request would be approved or rejected by the core evaluation engine before reaching the Android phone.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium">Borrower Phone</label>
                  <input
                    type="text"
                    value={simPhone}
                    onChange={(e) => setSimPhone(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    placeholder="0977123456"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Requested Amount (ZMW)</label>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    placeholder="250"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium">Transfer Method</label>
                  <select
                    value={simType}
                    onChange={(e: any) => setSimType(e.target.value)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    <option value="SEND_MONEY">Send Money (Seller/Merchant)</option>
                    <option value="GET_CASH">Get Cash (Airtel Agent Booth)</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleRunCreditCheck}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-xs text-white transition shadow-md"
              >
                Run Credit Evaluation Engine
              </button>

              {/* Evaluation Output Drawer */}
              {evalResult && (
                <div className={`p-4 rounded-xl border mt-4 text-xs space-y-3 ${evalResult.eligible ? 'bg-emerald-950/30 border-emerald-800' : 'bg-red-950/30 border-red-800'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm flex items-center space-x-1.5">
                      {evalResult.eligible ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">INSTANT LOAN GRANTED</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4 text-red-400" />
                          <span className="text-red-400">INSTANT LOAN DECLINED</span>
                        </>
                      )}
                    </span>
                    <span className="text-slate-400 font-mono">Borrower: {evalResult.borrower?.full_name}</span>
                  </div>

                  {!evalResult.eligible && (
                    <div className="space-y-1">
                      <p className="font-bold text-red-300">Rejection Reasons:</p>
                      {evalResult.reasons.map((r: string, i: number) => (
                        <div key={i} className="text-red-200 pl-2 border-l-2 border-red-500">
                          {r}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                    <div>
                      Emergency Freeze: <strong className={evalResult.checks.emergency_freeze_passed ? 'text-emerald-400' : 'text-red-400'}>{evalResult.checks.emergency_freeze_passed ? 'PASS' : 'FAIL'}</strong>
                    </div>
                    <div>
                      Borrower Limit: <strong className={evalResult.checks.borrower_limit_passed ? 'text-emerald-400' : 'text-red-400'}>{evalResult.checks.borrower_limit_passed ? 'PASS' : 'FAIL'}</strong>
                    </div>
                    <div>
                      Gov Statutory Cap: <strong className={evalResult.checks.government_cap_passed ? 'text-emerald-400' : 'text-red-400'}>{evalResult.checks.government_cap_passed ? 'PASS' : 'FAIL'}</strong>
                    </div>
                    <div>
                      SIM Balance: <strong className={evalResult.checks.gateway_balance_passed ? 'text-emerald-400' : 'text-red-400'}>{evalResult.checks.gateway_balance_passed ? 'PASS' : 'FAIL'}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GATEWAYS */}
        {activeTab === 'gateways' && (
          <div className="space-y-6">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white">Registered Mobile Money Dispensing Phones</h2>
                  <p className="text-xs text-slate-400 mt-1">Instapay Android devices carrying physical SIM cards and USSD automation</p>
                </div>
                <button
                  onClick={loadData}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {gateway?.status?.toUpperCase()}
                      </span>
                      <h3 className="text-base font-bold text-white mt-2">{gateway?.device_name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{gateway?.phone_number}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">SIM Balance</span>
                      <p className="text-xl font-bold text-emerald-400">
                        ZMW {gateway?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 py-3 border-y border-slate-800/80 text-xs">
                    <div>
                      <span className="text-slate-500 block">Carrier</span>
                      <span className="font-bold text-red-400">{gateway?.carrier}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Battery</span>
                      <span className="font-bold text-slate-200">{gateway?.battery_level}%</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">4-Digit PIN</span>
                      <span className="font-bold text-emerald-400">Configured ✓</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleStartSimulation('SEND_MONEY')}
                      className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition shadow-sm"
                    >
                      Test Send Money USSD
                    </button>
                    <button
                      onClick={() => handleStartSimulation('GET_CASH')}
                      className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition"
                    >
                      Test Get Cash USSD
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TRANSACTION HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 md:p-5">
              <h2 className="text-base font-bold text-white mb-4">Complete Loan &amp; Dispensing Audit History</h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                    <tr>
                      <th className="p-3">Time</th>
                      <th className="p-3">Borrower</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Recipient / Agent</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Carrier Txn ID</th>
                      <th className="p-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {loans.map((loan) => (
                      <tr key={loan.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-3 text-slate-400 whitespace-nowrap">
                          {new Date(loan.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-bold text-white whitespace-nowrap">
                          {loan.borrower_name}
                          <span className="block text-[11px] font-normal text-slate-400">{loan.borrower_phone}</span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                              loan.loan_type === 'SEND_MONEY'
                                ? 'bg-red-950 text-red-400 border border-red-900'
                                : 'bg-amber-950 text-amber-400 border border-amber-900'
                            }`}
                          >
                            {loan.loan_type === 'SEND_MONEY' ? 'SEND MONEY' : 'GET CASH'}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-emerald-400 whitespace-nowrap">ZMW {loan.amount.toFixed(2)}</td>
                        <td className="p-3 text-slate-300 whitespace-nowrap">
                          {loan.loan_type === 'SEND_MONEY' ? loan.recipient_phone : `Agent ${loan.agent_number}`}
                          {loan.parsed_recipient_name && (
                            <span className="block text-[11px] text-slate-400">{loan.parsed_recipient_name}</span>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              loan.status === 'COMPLETED'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : loan.status === 'REJECTED' || loan.status === 'FAILED' || loan.status === 'CUSTOMER_CANCELLED'
                                ? 'bg-red-950 text-red-400 border border-red-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                            }`}
                          >
                            {loan.status}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-400 whitespace-nowrap">
                          {loan.carrier_sms_reference || '—'}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <button
                            onClick={() => setSelectedLoan(loan)}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] border border-slate-700"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: AIRTEL SMS LOGS */}
        {activeTab === 'sms' && (
          <div className="space-y-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center space-x-2">
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    <span>Airtel Money Carrier SMS Verification Logs</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Direct SMS messages intercepted from AirtelMoney confirming mobile money debits, transaction references, and balances.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {smsLogs.map((sms) => (
                  <div key={sms.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-400 flex items-center space-x-1.5">
                        <span>{sms.sender}</span>
                        {sms.verified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </span>
                      <span className="text-slate-500 font-mono">{new Date(sms.created_at).toLocaleString()}</span>
                    </div>

                    <div className="p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-200 font-mono text-[11px]">
                      {sms.raw_sms}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1">
                      <div>
                        Txn ID: <strong className="text-slate-200 font-mono">{sms.parsed_transaction_id}</strong>
                      </div>
                      <div>
                        Amount: <strong className="text-emerald-400">ZMW {sms.parsed_amount?.toFixed(2)}</strong>
                      </div>
                      <div>
                        Balance After: <strong className="text-white">ZMW {sms.parsed_balance_after?.toFixed(2)}</strong>
                      </div>
                      <div>
                        Matched Loan: <strong className="text-sky-400 font-mono">{sms.matched_loan_id ? 'VERIFIED ✓' : 'N/A'}</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'creator-deductions' && <CreatorDeductionQueue />}
        {activeTab === 'salary-applications' && <SalaryApplicationQueue />}
        {activeTab === 'fulfilment' && <FulfilmentLoanQueue />}
        {activeTab === 'shipping' && <ShippingPickupsQueue />}
        {activeTab === 'collateral' && <CollateralVaultQueue />}
      </main>

      {/* Audit Drawer / Modal */}
      {selectedLoan && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Loan Transaction Audit Details</h3>
              <button onClick={() => setSelectedLoan(null)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400">Loan ID:</span>
                <p className="font-mono text-slate-200 break-all">{selectedLoan.id}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400">Borrower:</span>
                  <p className="font-bold text-white">{selectedLoan.borrower_name}</p>
                  <p className="text-slate-400 font-mono">{selectedLoan.borrower_phone}</p>
                </div>
                <div>
                  <span className="text-slate-400">Amount &amp; Fee:</span>
                  <p className="font-bold text-emerald-400 text-sm">ZMW {selectedLoan.amount.toFixed(2)}</p>
                  <p className="text-slate-400">Fee: ZMW {selectedLoan.fee_amount?.toFixed(2)}</p>
                </div>
              </div>

              <div>
                <span className="text-slate-400">Target Party:</span>
                <p className="text-slate-200">
                  {selectedLoan.loan_type === 'SEND_MONEY'
                    ? `Recipient: ${selectedLoan.recipient_phone} (${selectedLoan.parsed_recipient_name || 'Verified'})`
                    : `Agent: ${selectedLoan.agent_number} (${selectedLoan.parsed_recipient_name || 'Verified'})`}
                </p>
              </div>

              <div>
                <span className="text-slate-400">Status &amp; Rejection Details:</span>
                <p className="font-bold text-amber-400">{selectedLoan.status}</p>
                {selectedLoan.rejection_reason && (
                  <p className="text-red-400 bg-red-950/40 p-2 rounded mt-1 border border-red-900">
                    {selectedLoan.rejection_reason}
                  </p>
                )}
              </div>

              {selectedLoan.carrier_sms_text && (
                <div>
                  <span className="text-slate-400">Airtel Carrier SMS Proof:</span>
                  <p className="p-2.5 rounded bg-slate-950 font-mono text-[11px] text-purple-300 border border-slate-800 mt-1">
                    {selectedLoan.carrier_sms_text}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedLoan(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
            >
              Close Audit
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900 border-t border-slate-800 flex items-center justify-around overflow-x-auto py-2">
        <button
          onClick={() => setActiveTab('monitor')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'monitor' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Activity className="w-5 h-5 mb-0.5" />
          <span>Monitor</span>
        </button>
        <button
          onClick={() => setActiveTab('safeguards')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'safeguards' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Shield className="w-5 h-5 mb-0.5" />
          <span>Safeguards</span>
        </button>
        <button
          onClick={() => setActiveTab('gateways')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'gateways' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Smartphone className="w-5 h-5 mb-0.5" />
          <span>Gateway</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'history' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <History className="w-5 h-5 mb-0.5" />
          <span>History</span>
        </button>
        <button
          onClick={() => setActiveTab('sms')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'sms' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <MessageSquare className="w-5 h-5 mb-0.5" />
          <span>SMS</span>
        </button>
        <button
          onClick={() => setActiveTab('creator-deductions')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'creator-deductions' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <HandCoins className="w-5 h-5 mb-0.5" />
          <span>MFI Support</span>
        </button>
        <button
          onClick={() => setActiveTab('salary-applications')}
          className={`flex shrink-0 flex-col items-center text-[10px] font-medium ${activeTab === 'salary-applications' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Briefcase className="w-5 h-5 mb-0.5" />
          <span>Sumthin</span>
        </button>
        <button
          onClick={() => setActiveTab('fulfilment')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'fulfilment' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Package className="w-5 h-5 mb-0.5" />
          <span>Fulfilment</span>
        </button>
        <button
          onClick={() => setActiveTab('shipping')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'shipping' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Truck className="w-5 h-5 mb-0.5" />
          <span>Shipping</span>
        </button>
        <button
          onClick={() => setActiveTab('collateral')}
          className={`flex flex-col items-center text-[10px] font-medium ${activeTab === 'collateral' ? 'text-red-500 font-bold' : 'text-slate-400'}`}
        >
          <Shield className="w-5 h-5 mb-0.5" />
          <span>Collateral</span>
        </button>
      </nav>
    </div>
  );
}
