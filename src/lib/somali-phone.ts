// Somali mobile numbers: normalise any common way staff type them and tell which operator and
// mobile-money wallet the number belongs to. Prefixes follow the NCA numbering plan (+ 90, widely used
// by Golis). Shared by the server (to route payments) and the order screen (to show the wallet).

export type Wallet =
  | 'EVC_PLUS'
  | 'JEEB'
  | 'ZAAD'
  | 'KAASH_PLUS'
  | 'SAHAL'
  | 'KAYD'
  | 'EDAHAB'
  | 'EMAAL'
  | 'MYCASH';

export interface Operator {
  operator: string;
  /** Mobile virtual network running on the operator, e.g. Somnet on Hormuud. */
  network?: string;
  wallet: Wallet;
  walletName: string;
}

const HORMUUD: Operator = { operator: 'Hormuud', wallet: 'EVC_PLUS', walletName: 'EVC Plus' };
const PREFIXES: Record<string, Operator> = {
  '61': HORMUUD,
  '77': HORMUUD,
  '78': HORMUUD,
  '68': { operator: 'Hormuud', network: 'Somnet', wallet: 'JEEB', walletName: 'Jeeb' },
  '63': { operator: 'Telesom', wallet: 'ZAAD', walletName: 'ZAAD' },
  '67': {
    operator: 'Telesom',
    network: 'Soltelco',
    wallet: 'KAASH_PLUS',
    walletName: 'Kaash Plus',
  },
  '60': { operator: 'Golis', wallet: 'SAHAL', walletName: 'SAHAL' },
  '72': { operator: 'Golis', wallet: 'SAHAL', walletName: 'SAHAL' },
  '90': { operator: 'Golis', wallet: 'SAHAL', walletName: 'SAHAL' },
  '70': { operator: 'Golis', network: 'Durdur', wallet: 'KAYD', walletName: 'Kayd' },
  '62': { operator: 'Somtel', wallet: 'EDAHAB', walletName: 'eDahab' },
  '65': { operator: 'Somtel', wallet: 'EDAHAB', walletName: 'eDahab' },
  '66': { operator: 'Somtel', wallet: 'EDAHAB', walletName: 'eDahab' },
  '76': { operator: 'Somtel', wallet: 'EDAHAB', walletName: 'eDahab' },
  '69': { operator: 'NationLink', wallet: 'EMAAL', walletName: 'e-Maal' },
  '71': { operator: 'Amtel', wallet: 'MYCASH', walletName: 'MyCash' },
  '75': { operator: 'Amtel', wallet: 'MYCASH', walletName: 'MyCash' },
};

export interface SomaliNumber extends Operator {
  /** International form without "+", as WaafiPay expects: 252 + 9 digits, e.g. 252615442493. */
  msisdn: string;
  /** Local form, e.g. 615442493. */
  local: string;
  prefix: string;
}

/**
 * Accepts 615442493, 0615442493, 252615442493, +252 61 544 2493, 00252-61-5442493.
 * Returns null for anything that isn't a Somali mobile number with a known prefix.
 */
export function parseSomaliMobile(input: string | null | undefined): SomaliNumber | null {
  if (!input) return null;
  let digits = String(input).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, '').replace(/^00/, '');
  if (digits.startsWith('252')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^\d{9}$/.test(digits)) return null;
  const prefix = digits.slice(0, 2),
    operator = PREFIXES[prefix];
  if (!operator) return null;
  return { ...operator, prefix, local: digits, msisdn: '252' + digits };
}

/** "Hormuud · EVC Plus", "Somnet (Hormuud) · Jeeb". */
export function describeOperator(n: Operator) {
  return `${n.network ? `${n.network} (${n.operator})` : n.operator} · ${n.walletName}`;
}
