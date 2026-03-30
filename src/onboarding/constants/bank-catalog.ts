export interface BankCatalogEntry {
  id: string;
  name: string;
  country: string;
  provider: string;
  logoUri?: string | null;
}

export const BANK_CATALOG: BankCatalogEntry[] = [];
