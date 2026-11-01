/* Country code → Region mapping. Used to derive Channel.region dynamically. */

const REGION_MAP: Record<string, string> = {
  // Asia
  IN: 'Asia', PK: 'Asia', BD: 'Asia', NP: 'Asia', BT: 'Asia', LK: 'Asia', MV: 'Asia', AF: 'Asia',
  CN: 'Asia', JP: 'Asia', KR: 'Asia', KP: 'Asia', MN: 'Asia', HK: 'Asia', MO: 'Asia', TW: 'Asia',
  TH: 'Asia', VN: 'Asia', LA: 'Asia', KH: 'Asia', MM: 'Asia', MY: 'Asia', SG: 'Asia', ID: 'Asia',
  PH: 'Asia', BN: 'Asia', TL: 'Asia', KZ: 'Asia', UZ: 'Asia', TM: 'Asia', KG: 'Asia', TJ: 'Asia',
  GE: 'Asia', AM: 'Asia', AZ: 'Asia',

  // Middle East
  AE: 'Middle East', SA: 'Middle East', QA: 'Middle East', BH: 'Middle East', KW: 'Middle East',
  OM: 'Middle East', YE: 'Middle East', IQ: 'Middle East', IR: 'Middle East', JO: 'Middle East',
  LB: 'Middle East', SY: 'Middle East', IL: 'Middle East', PS: 'Middle East', TR: 'Middle East',

  // Europe
  GB: 'Europe', IE: 'Europe', FR: 'Europe', DE: 'Europe', IT: 'Europe', ES: 'Europe', PT: 'Europe',
  NL: 'Europe', BE: 'Europe', LU: 'Europe', CH: 'Europe', AT: 'Europe', PL: 'Europe', CZ: 'Europe',
  SK: 'Europe', HU: 'Europe', RO: 'Europe', BG: 'Europe', GR: 'Europe', HR: 'Europe', SI: 'Europe',
  RS: 'Europe', BA: 'Europe', MK: 'Europe', AL: 'Europe', ME: 'Europe', XK: 'Europe', MD: 'Europe',
  UA: 'Europe', BY: 'Europe', RU: 'Europe', LT: 'Europe', LV: 'Europe', EE: 'Europe', FI: 'Europe',
  SE: 'Europe', NO: 'Europe', DK: 'Europe', IS: 'Europe', MT: 'Europe', CY: 'Europe',

  // North America
  US: 'North America', CA: 'North America', MX: 'North America', GT: 'North America',
  BZ: 'North America', SV: 'North America', HN: 'North America', NI: 'North America',
  CR: 'North America', PA: 'North America', CU: 'North America', JM: 'North America',
  HT: 'North America', DO: 'North America', TT: 'North America', PR: 'North America',
  BS: 'North America', BB: 'North America',

  // South America
  BR: 'South America', AR: 'South America', CL: 'South America', CO: 'South America',
  PE: 'South America', VE: 'South America', EC: 'South America', BO: 'South America',
  PY: 'South America', UY: 'South America', GY: 'South America', SR: 'South America',

  // Africa
  EG: 'Africa', MA: 'Africa', DZ: 'Africa', TN: 'Africa', LY: 'Africa', SD: 'Africa',
  NG: 'Africa', GH: 'Africa', SN: 'Africa', CI: 'Africa', ML: 'Africa', BF: 'Africa',
  NE: 'Africa', TD: 'Africa', CM: 'Africa', GA: 'Africa', CG: 'Africa', CD: 'Africa',
  AO: 'Africa', ZM: 'Africa', ZW: 'Africa', MZ: 'Africa', MW: 'Africa', TZ: 'Africa',
  KE: 'Africa', UG: 'Africa', RW: 'Africa', BI: 'Africa', ET: 'Africa', ER: 'Africa',
  DJ: 'Africa', SO: 'Africa', ZA: 'Africa', NA: 'Africa', BW: 'Africa', LS: 'Africa',
  SZ: 'Africa', MG: 'Africa', MU: 'Africa', MR: 'Africa', GM: 'Africa', GW: 'Africa',
  GN: 'Africa', SL: 'Africa', LR: 'Africa', TG: 'Africa', BJ: 'Africa',

  // Oceania
  AU: 'Oceania', NZ: 'Oceania', FJ: 'Oceania', PG: 'Oceania', SB: 'Oceania',
  VU: 'Oceania', WS: 'Oceania', TO: 'Oceania', KI: 'Oceania', FM: 'Oceania', NR: 'Oceania',
}

export const REGION_NAMES = [
  'Asia',
  'Middle East',
  'Europe',
  'North America',
  'South America',
  'Africa',
  'Oceania',
] as const

/** Resolve a region from an ISO country code; falls back to null when unknown. */
export function regionForCountry(code: string | null | undefined): string | null {
  if (!code) return null
  return REGION_MAP[code.trim().toUpperCase()] ?? null
}
