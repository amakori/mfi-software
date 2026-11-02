import { io, Socket } from 'socket.io-client';

const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3001';

export const socket: Socket = io(HUB_URL, {
  reconnection: true,
  reconnectionDelay: 1000,
});

export async function fetchOverview() {
  const res = await fetch(`${HUB_URL}/api/mfi/overview`);
  return res.json();
}

export async function fetchLoans() {
  const res = await fetch(`${HUB_URL}/api/mfi/loans`);
  return res.json();
}

export async function fetchBorrowers() {
  const res = await fetch(`${HUB_URL}/api/mfi/borrowers`);
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${HUB_URL}/api/mfi/settings`);
  return res.json();
}

export async function updateSettings(settings: any) {
  const res = await fetch(`${HUB_URL}/api/mfi/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function fetchSmsLogs() {
  const res = await fetch(`${HUB_URL}/api/mfi/sms-logs`);
  return res.json();
}

export async function evaluateCredit(payload: { borrower_phone: string; amount: number; loan_type: string }) {
  const res = await fetch(`${HUB_URL}/api/loan/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function triggerSimulation(payload: { loan_type: string; amount: number; recipient_phone?: string; agent_number?: string }) {
  const res = await fetch(`${HUB_URL}/api/simulate/run-flow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchShippingOrders() {
  const res = await fetch(`${HUB_URL}/api/shipping/orders`);
  return res.json();
}

export async function fetchCollateralPickups() {
  const res = await fetch(`${HUB_URL}/api/collateral/pickups`);
  return res.json();
}
