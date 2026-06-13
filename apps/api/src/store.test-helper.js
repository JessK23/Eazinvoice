export function createSeededStore() {
  return {
    companies: [],
    customers: [],
    invoices: [],
    counters: { company: 0, customer: 0, invoice: 0 },
  };
}

