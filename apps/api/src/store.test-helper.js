export function createSeededStore() {
  return {
    companies: [],
    customers: [],
    vendors: [],
    invoices: [],
    counters: { company: 0, customer: 0, vendor: 0, invoice: 0 },
  };
}
