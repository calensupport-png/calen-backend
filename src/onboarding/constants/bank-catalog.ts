export interface BankCatalogEntry {
  id: string;
  name: string;
  country: string;
  provider: string;
}

export const BANK_CATALOG: BankCatalogEntry[] = [
  {
    id: 'providus-ng',
    name: 'Providus Bank',
    country: 'NG',
    provider: 'mock-open-banking',
  },
  {
    id: 'gtbank-ng',
    name: 'Guaranty Trust Bank',
    country: 'NG',
    provider: 'mock-open-banking',
  },
  {
    id: 'kuda-ng',
    name: 'Kuda Bank',
    country: 'NG',
    provider: 'mock-open-banking',
  },
  {
    id: 'access-ng',
    name: 'Access Bank',
    country: 'NG',
    provider: 'mock-open-banking',
  },
];
