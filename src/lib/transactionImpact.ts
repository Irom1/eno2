/** Illustrative labels for controlled demo merchants, not carbon estimates. */
export const GREEN_DEMO_MERCHANTS = ['COMMUNITY BIKE SHARE', 'LOCAL FARMERS MARKET', 'SECONDHAND THRIFT STORE', 'SOLAR ENERGY COOPERATIVE', 'ELECTRIC VEHICLE CHARGING'] as const;
export const NON_GREEN_DEMO_MERCHANTS = ['GAS STATION FILL-UP', 'LONG-HAUL AIRLINE TICKET', 'FAST FASHION OUTLET', 'COAL ENERGY BILL', 'EXPRESS AIR FREIGHT'] as const;
export function demoTransactionImpact(description: string): 'green' | 'non-green' | undefined {
  const normalized = description.trim().toUpperCase();
  if ((GREEN_DEMO_MERCHANTS as readonly string[]).includes(normalized)) return 'green';
  if ((NON_GREEN_DEMO_MERCHANTS as readonly string[]).includes(normalized)) return 'non-green';
}
