function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const trimmed = String(value).trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function num(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function bool(value) {
  return Boolean(value);
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function dateOnly(...values) {
  const value = text(...values);
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function timestamp(...values) {
  const value = text(...values);
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function replaceTable(client, tableName, rows, insertRow) {
  await client.query(`delete from ${tableName}`);
  for (const row of rows) {
    await insertRow(row);
  }
}

export async function syncFinancialTables(client, state = {}) {
  await client.query("delete from eazinvoice_journal_lines");
  await client.query("delete from eazinvoice_year_end_close_history");

  await replaceTable(client, "eazinvoice_ledger_accounts", toArray(state.ledgerAccounts), async (account) => {
    await client.query(
      `insert into eazinvoice_ledger_accounts
        (id, owner_user_id, company_id, business_id, account_code, account_name, account_type, normal_balance,
         system_account, status, account_role, balance_sheet_category, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, coalesce($14::timestamptz, now()), now())`,
      [
        text(account.id),
        text(account.ownerUserId),
        text(account.companyId),
        text(account.businessId),
        text(account.accountCode),
        text(account.accountName, account.name, "Account"),
        text(account.accountType, "asset"),
        text(account.normalBalance, "debit"),
        bool(account.systemAccount),
        text(account.status, "active"),
        text(account.accountRole),
        text(account.balanceSheetCategory),
        json(account),
        timestamp(account.createdAt),
      ],
    );
  });

  await replaceTable(client, "eazinvoice_year_end_closes", toArray(state.yearEndCloses), async (close) => {
    await client.query(
      `insert into eazinvoice_year_end_closes
        (id, business_id, owner_user_id, financial_year_id, financial_year, start_date, end_date, close_date, close_method,
         retained_earnings_account_id, closing_journal_id, next_financial_year_id, idempotency_key, version, status,
         closed_by_user_id, close_reason, readiness_status, readiness_snapshot, calculation_snapshot, lineage_from_close_id,
         reopened_at, reopened_by_user_id, reopen_reason, reversal_journal_id, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::date, $7::date, $8::date, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19::jsonb, $20::jsonb, $21, $22::timestamptz, $23, $24, $25, $26::jsonb, coalesce($27::timestamptz, now()), now())`,
      [
        text(close.id),
        text(close.businessId),
        text(close.ownerUserId),
        text(close.financialYearId),
        text(close.financialYear),
        dateOnly(close.startDate),
        dateOnly(close.endDate),
        dateOnly(close.closeDate),
        text(close.closeMethod, close.method, "retained_earnings_transfer"),
        text(close.retainedEarningsAccountId),
        text(close.closingJournalId),
        text(close.nextFinancialYearId),
        text(close.idempotencyKey),
        Number(close.version || 1),
        text(close.status, "closed"),
        text(close.closedByUserId),
        text(close.closeReason),
        text(close.readinessStatus),
        json(close.readinessSnapshot),
        json(close.calculationSnapshot),
        text(close.lineageFromCloseId),
        timestamp(close.reopenedAt),
        text(close.reopenedByUserId),
        text(close.reopenReason),
        text(close.reversalJournalId),
        json(close),
        timestamp(close.createdAt),
      ],
    );
  });

  await replaceTable(client, "eazinvoice_financial_years", toArray(state.financialYears), async (fy) => {
    await client.query(
      `insert into eazinvoice_financial_years
        (id, business_id, owner_user_id, financial_year, start_date, end_date, status, close_readiness_status,
         closed_at, closed_by_user_id, close_reason, reopened_at, reopened_by_user_id, reopen_reason,
         year_end_event_id, closing_journal_id, next_financial_year_id, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9::timestamptz, $10, $11, $12::timestamptz,
         $13, $14, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()), now())`,
      [
        text(fy.id),
        text(fy.businessId),
        text(fy.ownerUserId),
        text(fy.financialYear),
        dateOnly(fy.startDate),
        dateOnly(fy.endDate),
        text(fy.status, "open"),
        text(fy.closeReadinessStatus),
        timestamp(fy.closedAt),
        text(fy.closedByUserId),
        text(fy.closeReason),
        timestamp(fy.reopenedAt),
        text(fy.reopenedByUserId),
        text(fy.reopenReason),
        text(fy.yearEndEventId),
        text(fy.closingJournalId),
        text(fy.nextFinancialYearId),
        json(fy),
        timestamp(fy.createdAt),
      ],
    );
  });

  await replaceTable(client, "eazinvoice_journal_entries", toArray(state.accountingJournals), async (journal) => {
    await client.query(
      `insert into eazinvoice_journal_entries
        (id, owner_user_id, company_id, business_id, journal_number, journal_date, narration, status, currency,
         total_debit, total_credit, financial_event_id, source_type, source_id, posting_rule, posting_rule_version,
         automatic, immutable, corrects_document_id, reverses_journal_id, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
         $21::jsonb, coalesce($22::timestamptz, now()), now())`,
      [
        text(journal.id),
        text(journal.ownerUserId),
        text(journal.companyId),
        text(journal.businessId),
        text(journal.journalNumber),
        dateOnly(journal.journalDate),
        text(journal.narration),
        text(journal.status, "posted"),
        text(journal.currency, "INR"),
        num(journal.totalDebit),
        num(journal.totalCredit),
        text(journal.financialEventId),
        text(journal.sourceType),
        text(journal.sourceId),
        text(journal.postingRule),
        text(journal.postingRuleVersion),
        bool(journal.automatic),
        bool(journal.immutable),
        text(journal.correctsDocumentId),
        text(journal.reversesJournalId),
        json(journal),
        timestamp(journal.createdAt),
      ],
    );
  });

  await replaceTable(client, "eazinvoice_journal_lines", toArray(state.accountingJournalLines), async (line) => {
    await client.query(
      `insert into eazinvoice_journal_lines
        (id, journal_id, owner_user_id, company_id, business_id, account_id, line_index, description, debit, credit, currency, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, coalesce($13::timestamptz, now()), now())`,
      [
        text(line.id),
        text(line.journalId),
        text(line.ownerUserId),
        text(line.companyId),
        text(line.businessId),
        text(line.accountId, line.accountCode),
        Number(line.lineIndex || line.line_index || 1),
        text(line.description),
        num(line.debit),
        num(line.credit),
        text(line.currency, "INR"),
        json(line),
        timestamp(line.createdAt),
      ],
    );
  });

  await replaceTable(client, "eazinvoice_financial_events", toArray(state.financialEvents), async (event) => {
    await client.query(
      `insert into eazinvoice_financial_events
        (id, business_id, event_type, source_type, source_id, source_status, event_timestamp, posting_status,
         idempotency_key, journal_id, metadata, reverses_financial_event_id, reverses_journal_id, record, created_at, posted_at, failed_at)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), $8, $9, $10, $11::jsonb, $12, $13,
         $14::jsonb, coalesce($15::timestamptz, now()), $16::timestamptz, $17::timestamptz)`,
      [
        text(event.id),
        text(event.businessId),
        text(event.eventType),
        text(event.sourceType),
        text(event.sourceId),
        text(event.sourceStatus) || "",
        timestamp(event.eventTimestamp, event.createdAt),
        text(event.postingStatus, "posted"),
        text(event.idempotencyKey),
        text(event.journalId),
        json(event.metadata),
        text(event.reversesFinancialEventId),
        text(event.reversesJournalId),
        json(event),
        timestamp(event.createdAt),
        timestamp(event.postedAt),
        timestamp(event.failedAt),
      ],
    );
  });

  await syncVendorBills(client, state);
  await syncCorrections(client, state);
  await syncSettlements(client, state);
  await syncBank(client, state);
  await syncCompliance(client, state);
  await syncPeriodsAndOpeningBalances(client, state);
}

async function syncVendorBills(client, state) {
  await replaceTable(client, "eazinvoice_vendor_bills", toArray(state.vendorBills), async (bill) => {
    await client.query(
      `insert into eazinvoice_vendor_bills
        (id, owner_user_id, business_id, vendor_id, vendor_bill_number, internal_bill_number, bill_date, due_date,
         status, payment_status, expense_category, expense_account_code, currency, tax_rate, gst_mode, subtotal,
         discount, taxable_amount, tax_amount, cgst_amount, sgst_amount, igst_amount, total, paid_amount, balance_amount,
         items, source, notes, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20, $21, $22, $23, $24, $25, $26::jsonb, $27, $28, $29::jsonb, coalesce($30::timestamptz, now()), now())`,
      [
        text(bill.id), text(bill.ownerUserId), text(bill.businessId), text(bill.vendorId),
        text(bill.vendorBillNumber), text(bill.internalBillNumber), dateOnly(bill.billDate), dateOnly(bill.dueDate),
        text(bill.status, "draft"), text(bill.paymentStatus), text(bill.expenseCategory), text(bill.expenseAccountCode),
        text(bill.currency, "INR"), num(bill.taxRate), text(bill.gstMode), num(bill.subtotal), num(bill.discount),
        num(bill.taxableAmount), num(bill.taxAmount), num(bill.cgstAmount), num(bill.sgstAmount), num(bill.igstAmount),
        num(bill.total), num(bill.paidAmount), num(bill.balanceAmount), json(bill.items || []), text(bill.source),
        text(bill.notes), json(bill), timestamp(bill.createdAt),
      ],
    );
  });
}

async function syncCorrections(client, state) {
  const correctionSpecs = [
    ["eazinvoice_credit_notes", toArray(state.creditNotes), "sourceInvoiceId", "customerId", "creditNoteNumber", "creditNoteDate"],
    ["eazinvoice_vendor_credits", toArray(state.vendorCredits), "sourceVendorBillId", "vendorId", "vendorCreditNumber", "vendorCreditDate"],
  ];
  for (const [table, rows, sourceKey, counterpartyKey, numberKey, dateKey] of correctionSpecs) {
    await replaceTable(client, table, rows, async (row) => {
      await client.query(
        `insert into ${table}
          (id, business_id, owner_user_id, ${table.includes("vendor") ? "source_vendor_bill_id, vendor_id, vendor_credit_number, vendor_credit_date" : "source_invoice_id, customer_id, credit_note_number, credit_note_date"},
           reason, status, idempotency_key, currency, gst_mode, full_reversal, reverses_financial_event_id, reverses_journal_id,
           amount_applied, unapplied_credit, subtotal, discount, taxable_amount, cgst_amount, sgst_amount, igst_amount,
           tax_amount, shipping, round_off, total, items, metadata, record, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
           $20, $21, $22, $23, $24, $25, $26::jsonb, $27::jsonb, $28::jsonb, coalesce($29::timestamptz, now()), now())`,
        [
          text(row.id), text(row.businessId), text(row.ownerUserId), text(row[sourceKey]), text(row[counterpartyKey]),
          text(row[numberKey]), dateOnly(row[dateKey]), text(row.reason), text(row.status, "posted"), text(row.idempotencyKey),
          text(row.currency, "INR"), text(row.gstMode), bool(row.fullReversal), text(row.reversesFinancialEventId),
          text(row.reversesJournalId), num(row.amountApplied), num(row.unappliedCredit), num(row.subtotal), num(row.discount),
          num(row.taxableAmount), num(row.cgstAmount), num(row.sgstAmount), num(row.igstAmount), num(row.taxAmount),
          num(row.shipping), num(row.roundOff), num(row.total), json(row.items || []), json(row.metadata), json(row),
          timestamp(row.createdAt),
        ],
      );
    });
  }
}

async function syncSettlements(client, state) {
  const specs = [
    ["eazinvoice_payment_reversals", toArray(state.paymentReversals), "originalPaymentId", "invoiceId", null, "reversalDate"],
    ["eazinvoice_vendor_payment_reversals", toArray(state.vendorPaymentReversals), "originalPaymentId", "vendorBillId", "vendorId", "reversalDate"],
    ["eazinvoice_customer_refunds", toArray(state.customerRefunds), "sourceCreditNoteId", "sourceInvoiceId", "customerId", "refundDate"],
    ["eazinvoice_vendor_refunds", toArray(state.vendorRefunds), "sourceVendorCreditId", "sourceVendorBillId", "vendorId", "receivedDate"],
  ];
  for (const [table, rows, sourceA, sourceB, counterparty, dateKey] of specs) {
    await replaceTable(client, table, rows, async (row) => {
      await client.query(
        `insert into ${table}
          (id, business_id, owner_user_id, ${settlementColumns(table)}, amount, currency, method, reference, provider_reference,
           reason, status, ${table.includes("vendor_refunds") ? "received_date" : "reversal_date"}, idempotency_key, created_by_user_id,
           financial_event_id, journal_id, record, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()), now())`,
        [
          text(row.id), text(row.businessId), text(row.ownerUserId), text(row[sourceA]), text(row[sourceB]),
          counterparty ? text(row[counterparty]) : text(row.paymentDirection, "customer_payment"),
          num(row.amount), text(row.currency, "INR"), text(row.method, row.mode), text(row.reference),
          text(row.providerReference), text(row.reason), text(row.status, table.includes("refund") ? "processed" : "posted"),
          dateOnly(row[dateKey]), text(row.idempotencyKey), text(row.createdByUserId), text(row.financialEventId),
          text(row.journalId), json(row), timestamp(row.createdAt),
        ],
      );
    });
  }
}

function settlementColumns(table) {
  if (table === "eazinvoice_payment_reversals") return "original_payment_id, invoice_id, payment_direction";
  if (table === "eazinvoice_vendor_payment_reversals") return "original_payment_id, vendor_bill_id, vendor_id";
  if (table === "eazinvoice_customer_refunds") return "source_credit_note_id, source_invoice_id, customer_id";
  return "source_vendor_credit_id, source_vendor_bill_id, vendor_id";
}

async function syncBank(client, state) {
  await replaceTable(client, "eazinvoice_bank_accounts", toArray(state.bankAccounts), async (account) => {
    await client.query(
      `insert into eazinvoice_bank_accounts
        (id, business_id, owner_user_id, ledger_account_id, ledger_account_code, account_type, display_name,
         institution_name, masked_account_reference, currency, opening_balance, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, coalesce($14::timestamptz, now()), now())`,
      [text(account.id), text(account.businessId), text(account.ownerUserId), text(account.ledgerAccountId), text(account.ledgerAccountCode), text(account.accountType, "bank"), text(account.displayName, account.name), text(account.institutionName), text(account.maskedAccountReference), text(account.currency, "INR"), num(account.openingBalance), text(account.status, "active"), json(account), timestamp(account.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_bank_statement_import_batches", toArray(state.bankStatementImportBatches), async (batch) => {
    await client.query(
      `insert into eazinvoice_bank_statement_import_batches
        (id, business_id, owner_user_id, bank_account_id, source_type, file_name, reference, imported_by_user_id, status,
         line_count, duplicate_count, error_count, imported_at, record, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, coalesce($13::timestamptz, now()), $14::jsonb, coalesce($15::timestamptz, now()))`,
      [text(batch.id), text(batch.businessId), text(batch.ownerUserId), text(batch.bankAccountId), text(batch.sourceType, "manual"), text(batch.fileName), text(batch.reference), text(batch.importedByUserId), text(batch.status, "imported"), Number(batch.lineCount || 0), Number(batch.duplicateCount || 0), Number(batch.errorCount || 0), timestamp(batch.importedAt), json(batch), timestamp(batch.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_bank_statement_lines", toArray(state.bankStatementLines), async (line) => {
    await client.query(
      `insert into eazinvoice_bank_statement_lines
        (id, business_id, bank_account_id, import_batch_id, transaction_date, value_date, description, external_reference,
         debit, credit, amount, direction, currency, source, fingerprint, reconciliation_status, matched_amount,
         unmatched_amount, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
         $20::jsonb, coalesce($21::timestamptz, now()), now())`,
      [text(line.id), text(line.businessId), text(line.bankAccountId), text(line.importBatchId), dateOnly(line.transactionDate), dateOnly(line.valueDate), text(line.description), text(line.externalReference), num(line.debit), num(line.credit), num(line.amount), text(line.direction, num(line.credit) > 0 ? "credit" : "debit"), text(line.currency, "INR"), text(line.source), text(line.fingerprint, line.id), text(line.reconciliationStatus, "unmatched"), num(line.matchedAmount), num(line.unmatchedAmount, line.amount), text(line.status, "active"), json(line), timestamp(line.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_bank_reconciliation_matches", toArray(state.bankReconciliationMatches), async (match) => {
    await client.query(
      `insert into eazinvoice_bank_reconciliation_matches
        (id, business_id, owner_user_id, bank_account_id, statement_line_id, source_type, source_id, journal_id,
         journal_line_id, matched_amount, match_method, confidence, reason, status, matched_by_user_id, matched_at,
         unmatched_by_user_id, unmatched_at, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::timestamptz, $17,
         $18::timestamptz, $19::jsonb, coalesce($20::timestamptz, now()), now())`,
      [text(match.id), text(match.businessId), text(match.ownerUserId), text(match.bankAccountId), text(match.statementLineId), text(match.sourceType), text(match.sourceId), text(match.journalId), text(match.journalLineId), num(match.matchedAmount), text(match.matchMethod, "manual"), text(match.confidence), text(match.reason), text(match.status, "matched"), text(match.matchedByUserId), timestamp(match.matchedAt), text(match.unmatchedByUserId), timestamp(match.unmatchedAt), json(match), timestamp(match.createdAt)],
    );
  });
}

async function syncCompliance(client, state) {
  await replaceTable(client, "eazinvoice_tax_registrations", toArray(state.taxRegistrations), async (registration) => {
    await client.query(
      `insert into eazinvoice_tax_registrations
        (id, business_id, owner_user_id, tax_type, registration_type, gstin, masked_gstin, gstin_structurally_valid,
         externally_verified, state_code, registration_state, status, primary_registration, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, coalesce($15::timestamptz, now()), now())`,
      [text(registration.id), text(registration.businessId), text(registration.ownerUserId), text(registration.taxType, "GST"), text(registration.registrationType), text(registration.gstin), text(registration.maskedGstin), bool(registration.gstinStructurallyValid), bool(registration.externallyVerified), text(registration.stateCode), text(registration.registrationState), text(registration.status, "active"), bool(registration.primaryRegistration), json(registration), timestamp(registration.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_transaction_compliance_snapshots", toArray(state.transactionComplianceSnapshots), async (snapshot) => {
    await client.query(
      `insert into eazinvoice_transaction_compliance_snapshots
        (id, business_id, owner_user_id, tax_type, direction, source_type, source_id, document_number, document_date,
         classification_status, issues, taxable_value, cgst, sgst, igst, tax_amount, gross_value, record, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()))`,
      [text(snapshot.id), text(snapshot.businessId), text(snapshot.ownerUserId), text(snapshot.taxType, "GST"), text(snapshot.direction, "output"), text(snapshot.sourceType), text(snapshot.sourceId), text(snapshot.documentNumber), dateOnly(snapshot.documentDate), text(snapshot.classificationStatus, "prepared"), json(snapshot.issues || []), num(snapshot.taxableValue), num(snapshot.cgst), num(snapshot.sgst), num(snapshot.igst), num(snapshot.taxAmount), num(snapshot.grossValue), json(snapshot), timestamp(snapshot.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_compliance_obligations", toArray(state.complianceObligations), async (obligation) => {
    await client.query(
      `insert into eazinvoice_compliance_obligations
        (id, business_id, owner_user_id, compliance_type, obligation_type, period_type, period_key, status, source_metadata, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, coalesce($11::timestamptz, now()), now())`,
      [text(obligation.id), text(obligation.businessId), text(obligation.ownerUserId), text(obligation.complianceType, "GST"), text(obligation.obligationType, "return"), text(obligation.periodType, "month"), text(obligation.periodKey, "unknown"), text(obligation.status, "upcoming"), json(obligation.sourceMetadata), json(obligation), timestamp(obligation.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_tds_transactions", toArray(state.tdsTransactions), async (tds) => {
    await client.query(
      `insert into eazinvoice_tds_transactions
        (id, business_id, owner_user_id, vendor_id, source_type, source_id, status, gross_amount, amount_subject_to_tds,
         tds_rate, tds_amount, net_vendor_payable, period, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, coalesce($15::timestamptz, now()), now())`,
      [text(tds.id), text(tds.businessId), text(tds.ownerUserId), text(tds.vendorId), text(tds.sourceType, "vendor_bill"), text(tds.sourceId), text(tds.status, "prepared"), num(tds.grossAmount), num(tds.amountSubjectToTds), num(tds.tdsRate), num(tds.tdsAmount), num(tds.netVendorPayable), json(tds.period), json(tds), timestamp(tds.createdAt)],
    );
  });
}

async function syncPeriodsAndOpeningBalances(client, state) {
  await replaceTable(client, "eazinvoice_opening_balance_details", toArray(state.openingBalanceDetails), async (detail) => {
    await client.query(
      `insert into eazinvoice_opening_balance_details
        (id, business_id, owner_user_id, opening_balance_set_id, detail_type, customer_id, vendor_id, amount, due_date, reference, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12::jsonb, coalesce($13::timestamptz, now()), now())`,
      [text(detail.id), text(detail.businessId), text(detail.ownerUserId), text(detail.openingBalanceSetId), text(detail.detailType, "ledger"), text(detail.customerId), text(detail.vendorId), num(detail.amount), dateOnly(detail.dueDate), text(detail.reference), text(detail.status, "open"), json(detail), timestamp(detail.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_opening_balance_sets", toArray(state.openingBalanceSets), async (set) => {
    await client.query(
      `insert into eazinvoice_opening_balance_sets
        (id, business_id, owner_user_id, cutover_date, status, idempotency_key, notes, immutable, created_by_user_id, journal_id, record, created_at, updated_at)
       values ($1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11::jsonb, coalesce($12::timestamptz, now()), now())`,
      [text(set.id), text(set.businessId), text(set.ownerUserId), dateOnly(set.cutoverDate), text(set.status, "posted"), text(set.idempotencyKey), text(set.notes), set.immutable !== false, text(set.createdByUserId), text(set.journalId), json(set), timestamp(set.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_accounting_period_history", toArray(state.accountingPeriodHistory), async (history) => {
    await client.query(
      `insert into eazinvoice_accounting_period_history
        (id, business_id, accounting_period_id, action, previous_status, next_status, actor_user_id, reason, readiness_status, record, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, coalesce($11::timestamptz, now()))`,
      [text(history.id), text(history.businessId), text(history.accountingPeriodId), text(history.action, "unknown"), text(history.previousStatus), text(history.nextStatus), text(history.actorUserId), text(history.reason), text(history.readinessStatus), json(history), timestamp(history.createdAt)],
    );
  });
  await replaceTable(client, "eazinvoice_accounting_periods", toArray(state.accountingPeriods), async (period) => {
    await client.query(
      `insert into eazinvoice_accounting_periods
        (id, business_id, owner_user_id, financial_year, period_type, period_key, start_date, end_date, status,
         notes, close_history, closed_at, closed_by_user_id, reopened_at, reopened_by_user_id, close_reason, reopen_reason,
         record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11::jsonb, $12::timestamptz, $13,
         $14::timestamptz, $15, $16, $17, $18::jsonb, coalesce($19::timestamptz, now()), now())`,
      [text(period.id), text(period.businessId), text(period.ownerUserId), text(period.financialYear), text(period.periodType, "month"), text(period.periodKey), dateOnly(period.startDate), dateOnly(period.endDate), text(period.status, "open"), text(period.notes), json(period.closeHistory || []), timestamp(period.closedAt), text(period.closedByUserId), timestamp(period.reopenedAt), text(period.reopenedByUserId), text(period.closeReason), text(period.reopenReason), json(period), timestamp(period.createdAt)],
    );
  });
}

export async function detectFinancialStateDivergence(client, state = {}) {
  const checks = [
    ["invoices", "eazinvoice_invoices"],
    ["payments", "eazinvoice_payments"],
    ["vendorBills", "eazinvoice_vendor_bills"],
    ["creditNotes", "eazinvoice_credit_notes"],
    ["vendorCredits", "eazinvoice_vendor_credits"],
    ["financialEvents", "eazinvoice_financial_events"],
    ["accountingJournals", "eazinvoice_journal_entries"],
    ["accountingJournalLines", "eazinvoice_journal_lines"],
    ["bankReconciliationMatches", "eazinvoice_bank_reconciliation_matches"],
    ["transactionComplianceSnapshots", "eazinvoice_transaction_compliance_snapshots"],
    ["yearEndCloses", "eazinvoice_year_end_closes"],
  ];
  const divergences = [];
  for (const [collection, table] of checks) {
    const expected = toArray(state[collection]).length;
    const result = await client.query(`select count(*)::int as count from ${table}`);
    const actual = result.rows[0]?.count || 0;
    if (actual !== expected) {
      divergences.push({ domain: collection, expected: { count: expected }, actual: { count: actual }, severity: "critical" });
    }
  }
  return divergences;
}
