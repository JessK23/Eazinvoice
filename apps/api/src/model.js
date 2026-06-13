export function createInvoiceItem(description, quantity, rate) {
  return {
    description,
    quantity,
    rate,
  };
}

export function createCompanyModel(input) {
  return {
    name: input.name,
    legalName: input.legalName ?? "",
    email: input.email ?? "",
    phone: input.phone ?? "",
  };
}
