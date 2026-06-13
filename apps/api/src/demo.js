import { createApi } from "./index.js";
import { createStore } from "./store.js";

export function createDemoApi() {
  const store = createStore();
  const api = createApi({ store });

  const company = api.createCompany({
    name: "Demo Business",
    legalName: "Demo Business Pvt Ltd",
    email: "hello@demo.test",
    phone: "9999999999",
  });

  const customer = api.createCustomer({
    name: "Sample Customer",
    email: "customer@test.com",
    phone: "8888888888",
    companyId: company.id,
  });

  api.createInvoice({
    companyId: company.id,
    customerId: customer.id,
    invoiceNumber: "INV-0001",
    invoiceDate: "2026-05-24",
    dueDate: "2026-05-31",
    taxRate: 18,
    notes: "Thank you for your business.",
    items: [
      { description: "Service Fee", quantity: 1, rate: 5000 },
      { description: "Support", quantity: 2, rate: 750 },
    ],
  });

  return api;
}
