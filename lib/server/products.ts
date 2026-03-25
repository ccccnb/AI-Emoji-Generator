export type ProductConfig = {
  code: string
  name: string
  description: string
  amount: string
  currency: 'USD'
  credits: number
}

export const CREDIT_PRODUCTS: ProductConfig[] = [
  {
    code: 'credit_pack_100',
    name: '100 Credits',
    description: 'Best for light creators',
    amount: '4.99',
    currency: 'USD',
    credits: 100,
  },
  {
    code: 'credit_pack_300',
    name: '300 Credits',
    description: 'Popular for frequent creators',
    amount: '12.99',
    currency: 'USD',
    credits: 300,
  },
  {
    code: 'credit_pack_1000',
    name: '1000 Credits',
    description: 'Best value for teams',
    amount: '39.00',
    currency: 'USD',
    credits: 1000,
  },
]

export function getProductByCode(code: string): ProductConfig | null {
  return CREDIT_PRODUCTS.find((p) => p.code === code) ?? null
}
