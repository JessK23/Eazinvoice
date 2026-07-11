import { withPostgresClient } from "./postgres.js";

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

function bool(value) {
  return Boolean(value);
}

function num(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function cents(...values) {
  return Math.round(num(...values) * 100);
}

function json(value) {
  return JSON.stringify(value ?? {});
}

function dateOnly(...values) {
  const value = text(...values);
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const localMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (localMatch) return `${localMatch[3]}-${localMatch[2]}-${localMatch[1]}`;
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

function lineTotal(item) {
  return num(item.lineTotal, item.total, item.totalAmount, item.amount);
}

function lowerText(...values) {
  const value = text(...values);
  return value ? value.toLowerCase() : null;
}

function complianceStatus(settings) {
  const profile = settings?.complianceProfile || {};
  if (text(profile.gstin, profile.gstNumber) || text(profile.pan, profile.panNumber)) return "configured";
  return text(profile.status, "pending");
}

async function syncUsers(client, users) {
  for (const user of users) {
    await client.query(
      `insert into eazinvoice_users
        (id, email, name, phone, subscriber_type, account_status, email_verified, mobile_verified, is_admin, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, coalesce($11::timestamptz, now()), now())
       on conflict (id) do update set
        email = excluded.email,
        name = excluded.name,
        phone = excluded.phone,
        subscriber_type = excluded.subscriber_type,
        account_status = excluded.account_status,
        email_verified = excluded.email_verified,
        mobile_verified = excluded.mobile_verified,
        is_admin = excluded.is_admin,
        record = excluded.record,
        updated_at = now()`,
      [
        text(user.id),
        text(user.email),
        text(user.name, user.fullName, user.businessName),
        text(user.phone, user.mobile, user.mobileNumber),
        text(user.subscriberType, user.plan, "free"),
        text(user.accountStatus, user.status, "active"),
        bool(user.emailVerified),
        bool(user.mobileVerified),
        user.role === "admin" || user.isAdmin === true,
        json(user),
        timestamp(user.createdAt),
      ],
    );
  }
}

async function syncBusinessProfiles(client, companies) {
  for (const company of companies) {
    await client.query(
      `insert into eazinvoice_business_profiles
        (id, owner_user_id, company_code, entity_type, name, legal_name, business_type, gst_registered,
         gst_number, pan_number, kyc_status, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, coalesce($14::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_code = excluded.company_code,
        entity_type = excluded.entity_type,
        name = excluded.name,
        legal_name = excluded.legal_name,
        business_type = excluded.business_type,
        gst_registered = excluded.gst_registered,
        gst_number = excluded.gst_number,
        pan_number = excluded.pan_number,
        kyc_status = excluded.kyc_status,
        status = excluded.status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(company.id),
        text(company.ownerUserId, company.userId),
        text(company.companyCode),
        text(company.entityType, "company"),
        text(company.name, company.businessName),
        text(company.legalName),
        text(company.businessType),
        bool(company.gstRegistered),
        text(company.gstNumber, company.gstin),
        text(company.panNumber, company.pan),
        text(company.kycStatus, company.kycMode, "pending"),
        text(company.status, "active"),
        json(company),
        timestamp(company.createdAt),
      ],
    );
  }
}

async function syncCustomers(client, customers) {
  for (const customer of customers) {
    await client.query(
      `insert into eazinvoice_customers
        (id, owner_user_id, company_id, customer_code, customer_type, name, business_name, email, phone,
         gst_number, pan_number, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, coalesce($14::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        customer_code = excluded.customer_code,
        customer_type = excluded.customer_type,
        name = excluded.name,
        business_name = excluded.business_name,
        email = excluded.email,
        phone = excluded.phone,
        gst_number = excluded.gst_number,
        pan_number = excluded.pan_number,
        status = excluded.status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(customer.id),
        text(customer.ownerUserId, customer.userId),
        text(customer.companyId),
        text(customer.customerCode),
        text(customer.customerType, customer.category, customer.type),
        text(customer.name, customer.customerName),
        text(customer.businessName),
        text(customer.email),
        text(customer.phone, customer.mobile),
        text(customer.gstNumber, customer.gstin),
        text(customer.panNumber, customer.pan),
        text(customer.status, "active"),
        json(customer),
        timestamp(customer.createdAt),
      ],
    );
  }
}

async function syncInvoices(client, invoices, options = {}) {
  for (const invoice of invoices) {
    await client.query(
      `insert into eazinvoice_invoices
        (id, owner_user_id, company_id, customer_id, invoice_number, invoice_date, due_date, currency, status,
         payment_status, subtotal, discount, tax_amount, total, paid_amount, balance_amount, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, coalesce($18::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        customer_id = excluded.customer_id,
        invoice_number = excluded.invoice_number,
        invoice_date = excluded.invoice_date,
        due_date = excluded.due_date,
        currency = excluded.currency,
        status = excluded.status,
        payment_status = excluded.payment_status,
        subtotal = excluded.subtotal,
        discount = excluded.discount,
        tax_amount = excluded.tax_amount,
        total = excluded.total,
        paid_amount = excluded.paid_amount,
        balance_amount = excluded.balance_amount,
        record = excluded.record,
        updated_at = now()`,
      [
        text(invoice.id),
        text(invoice.ownerUserId, invoice.userId),
        text(invoice.companyId),
        text(invoice.customerId),
        text(invoice.invoiceNumber),
        dateOnly(invoice.invoiceDate, invoice.createdAt),
        dateOnly(invoice.dueDate),
        text(invoice.currency, "INR"),
        text(invoice.status, "draft"),
        text(invoice.paymentStatus, invoice.status === "draft" ? "draft" : "unpaid"),
        num(invoice.subtotal),
        num(invoice.discount),
        num(invoice.taxAmount, invoice.gst, invoice.tax),
        num(invoice.total),
        num(invoice.paidAmount),
        num(invoice.balanceAmount, num(invoice.total) - num(invoice.paidAmount)),
        json(invoice),
        timestamp(invoice.createdAt),
      ],
    );

    if (options.pruneChildRows !== false) {
      await client.query("delete from eazinvoice_invoice_items where invoice_id = $1", [text(invoice.id)]);
    }

    for (let index = 0; index < toArray(invoice.items).length; index += 1) {
      const item = invoice.items[index];
      await client.query(
        `insert into eazinvoice_invoice_items
          (line_id, invoice_id, item_index, item_name, hsn_sac, quantity, rate, discount, gst_rate, line_total, record, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         on conflict (line_id) do update set
          invoice_id = excluded.invoice_id,
          item_index = excluded.item_index,
          item_name = excluded.item_name,
          hsn_sac = excluded.hsn_sac,
          quantity = excluded.quantity,
          rate = excluded.rate,
          discount = excluded.discount,
          gst_rate = excluded.gst_rate,
          line_total = excluded.line_total,
          record = excluded.record,
          updated_at = now()`,
        [
          `${invoice.id}:item:${index + 1}`,
          text(invoice.id),
          index,
          text(item.description, item.itemName, item.name),
          text(item.hsnSac, item.hsn, item.sac),
          num(item.quantity, item.qty),
          num(item.rate),
          num(item.discount),
          num(item.gstRate, item.taxRate),
          lineTotal(item),
          json(item),
        ],
      );
    }
  }
}

async function syncPurchaseOrders(client, purchaseOrders, options = {}) {
  for (const purchaseOrder of purchaseOrders) {
    await client.query(
      `insert into eazinvoice_purchase_orders
        (id, owner_user_id, company_id, vendor_id, document_type, po_number, po_date, due_date, currency, status,
         subtotal, discount, tax_amount, total, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12, $13, $14, $15::jsonb, coalesce($16::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        vendor_id = excluded.vendor_id,
        document_type = excluded.document_type,
        po_number = excluded.po_number,
        po_date = excluded.po_date,
        due_date = excluded.due_date,
        currency = excluded.currency,
        status = excluded.status,
        subtotal = excluded.subtotal,
        discount = excluded.discount,
        tax_amount = excluded.tax_amount,
        total = excluded.total,
        record = excluded.record,
        updated_at = now()`,
      [
        text(purchaseOrder.id),
        text(purchaseOrder.ownerUserId, purchaseOrder.userId),
        text(purchaseOrder.companyId),
        text(purchaseOrder.vendorId, purchaseOrder.customerId),
        text(purchaseOrder.documentType, "po").toLowerCase(),
        text(purchaseOrder.poNumber, purchaseOrder.purchaseOrderNumber),
        dateOnly(purchaseOrder.poDate, purchaseOrder.createdAt),
        dateOnly(purchaseOrder.dueDate),
        text(purchaseOrder.currency, "INR"),
        text(purchaseOrder.status, "draft"),
        num(purchaseOrder.subtotal),
        num(purchaseOrder.discount),
        num(purchaseOrder.taxAmount, purchaseOrder.gst, purchaseOrder.tax),
        num(purchaseOrder.total),
        json(purchaseOrder),
        timestamp(purchaseOrder.createdAt),
      ],
    );

    if (options.pruneChildRows !== false) {
      await client.query("delete from eazinvoice_purchase_order_items where purchase_order_id = $1", [text(purchaseOrder.id)]);
    }

    for (let index = 0; index < toArray(purchaseOrder.items).length; index += 1) {
      const item = purchaseOrder.items[index];
      await client.query(
        `insert into eazinvoice_purchase_order_items
          (line_id, purchase_order_id, item_index, item_name, hsn_sac, quantity, rate, discount, gst_rate, line_total, record, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now())
         on conflict (line_id) do update set
          purchase_order_id = excluded.purchase_order_id,
          item_index = excluded.item_index,
          item_name = excluded.item_name,
          hsn_sac = excluded.hsn_sac,
          quantity = excluded.quantity,
          rate = excluded.rate,
          discount = excluded.discount,
          gst_rate = excluded.gst_rate,
          line_total = excluded.line_total,
          record = excluded.record,
          updated_at = now()`,
        [
          `${purchaseOrder.id}:item:${index + 1}`,
          text(purchaseOrder.id),
          index,
          text(item.description, item.itemName, item.name),
          text(item.hsnSac, item.hsn, item.sac),
          num(item.quantity, item.qty),
          num(item.rate),
          num(item.discount),
          num(item.gstRate, item.taxRate),
          lineTotal(item),
          json(item),
        ],
      );
    }
  }
}

async function syncPayments(client, payments) {
  for (const payment of payments) {
    await client.query(
      `insert into eazinvoice_payments
        (id, owner_user_id, invoice_id, amount, currency, mode, reference, payment_date, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10::jsonb, coalesce($11::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        invoice_id = excluded.invoice_id,
        amount = excluded.amount,
        currency = excluded.currency,
        mode = excluded.mode,
        reference = excluded.reference,
        payment_date = excluded.payment_date,
        status = excluded.status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(payment.id),
        text(payment.ownerUserId, payment.userId),
        text(payment.invoiceId),
        num(payment.amount),
        text(payment.currency, "INR"),
        text(payment.mode, payment.gateway, "manual"),
        text(payment.reference, payment.gatewayPaymentId),
        dateOnly(payment.paymentDate, payment.createdAt),
        text(payment.status, "recorded"),
        json(payment),
        timestamp(payment.createdAt),
      ],
    );
  }
}

export async function syncPurchaseOrderToCoreTable(purchaseOrder, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing purchase order rows.");
  }
  if (!purchaseOrder) {
    throw new Error("Purchase order is required before syncing purchase order rows.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncPurchaseOrders(client, [purchaseOrder], options);

      const verification = await client.query(
        `select
          p.document_type,
          p.status,
          p.subtotal,
          p.discount,
          p.tax_amount,
          p.total,
          (select count(*)::int from eazinvoice_purchase_order_items where purchase_order_id = p.id) as item_count
         from eazinvoice_purchase_orders p
         where p.id = $1`,
        [text(purchaseOrder.id)],
      );
      const row = verification.rows[0] || {};
      if (!verification.rows.length) {
        throw new Error("Purchase order was saved but its Postgres report row was not found.");
      }
      if (
        text(row.document_type) !== text(purchaseOrder.documentType, "po").toLowerCase()
        || text(row.status) !== text(purchaseOrder.status, "draft")
        || cents(row.subtotal) !== cents(purchaseOrder.subtotal)
        || cents(row.discount) !== cents(purchaseOrder.discount)
        || cents(row.tax_amount) !== cents(purchaseOrder.taxAmount, purchaseOrder.gst, purchaseOrder.tax)
        || cents(row.total) !== cents(purchaseOrder.total)
        || (options.pruneChildRows !== false && Number(row.item_count) !== toArray(purchaseOrder.items).length)
      ) {
        throw new Error("Purchase/work order was saved but its Postgres report row did not match the saved record.");
      }

      if (options.audit !== false) {
        await client.query(
          `insert into eazinvoice_audit_events (event_type, entity_type, entity_id, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [
            options.auditEvent || "purchase_order_synced",
            "purchase_order",
            text(purchaseOrder.id),
            json({
              ownerUserId: text(purchaseOrder.ownerUserId, purchaseOrder.userId),
              documentType: text(purchaseOrder.documentType, "po").toLowerCase(),
              status: text(purchaseOrder.status, "draft"),
              total: num(purchaseOrder.total),
              source: options.source || "runtime",
            }),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function syncInvoiceToCoreTable(invoice, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing invoice rows.");
  }
  if (!invoice) {
    throw new Error("Invoice is required before syncing invoice rows.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncInvoices(client, [invoice], options);

      const verification = await client.query(
        `select
          i.status,
          i.payment_status,
          i.total,
          i.paid_amount,
          i.balance_amount,
          (select count(*)::int from eazinvoice_invoice_items where invoice_id = i.id) as item_count
         from eazinvoice_invoices i
         where i.id = $1`,
        [text(invoice.id)],
      );
      const row = verification.rows[0] || {};
      if (!verification.rows.length) {
        throw new Error("Invoice was saved but its Postgres report row was not found.");
      }
      const expectedPaymentStatus = text(invoice.paymentStatus, invoice.status === "draft" ? "draft" : "unpaid");
      if (
        text(row.status) !== text(invoice.status, "draft")
        || text(row.payment_status) !== expectedPaymentStatus
        || cents(row.total) !== cents(invoice.total)
        || cents(row.paid_amount) !== cents(invoice.paidAmount)
        || cents(row.balance_amount) !== cents(invoice.balanceAmount, num(invoice.total) - num(invoice.paidAmount))
        || (options.pruneChildRows !== false && Number(row.item_count) !== toArray(invoice.items).length)
      ) {
        throw new Error("Invoice was saved but its Postgres report row did not match the saved invoice.");
      }

      if (options.audit !== false) {
        await client.query(
          `insert into eazinvoice_audit_events (event_type, entity_type, entity_id, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [
            options.auditEvent || "invoice_synced",
            "invoice",
            text(invoice.id),
            json({
              ownerUserId: text(invoice.ownerUserId, invoice.userId),
              status: text(invoice.status, "draft"),
              paymentStatus: text(invoice.paymentStatus, invoice.status === "draft" ? "draft" : "unpaid"),
              total: num(invoice.total),
              source: options.source || "runtime",
            }),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function syncInvoicePaymentToCoreTables(invoice, payment, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing invoice payment rows.");
  }
  if (!invoice || !payment) {
    throw new Error("Invoice and payment are required before syncing payment rows.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncInvoices(client, [invoice], {
        ...options,
        pruneChildRows: false,
      });
      await syncPayments(client, [payment]);

      const verification = await client.query(
        `select
          i.payment_status as invoice_payment_status,
          i.paid_amount,
          i.balance_amount,
          p.amount as payment_amount,
          p.status as recorded_payment_status,
          p.invoice_id
         from eazinvoice_payments p
         left join eazinvoice_invoices i on i.id = p.invoice_id
         where p.id = $2 and p.invoice_id = $1`,
        [text(invoice.id), text(payment.id)],
      );
      const row = verification.rows[0] || {};
      if (!verification.rows.length) {
        throw new Error("Invoice payment was saved but its Postgres report rows were not found.");
      }
      if (
        text(row.invoice_id) !== text(invoice.id)
        || text(row.invoice_payment_status) !== text(invoice.paymentStatus, invoice.status === "draft" ? "draft" : "unpaid")
        || cents(row.payment_amount) !== cents(payment.amount)
        || text(row.recorded_payment_status) !== text(payment.status, "recorded")
        || cents(row.paid_amount) !== cents(invoice.paidAmount)
        || cents(row.balance_amount) !== cents(invoice.balanceAmount, num(invoice.total) - num(invoice.paidAmount))
      ) {
        throw new Error("Invoice payment was saved but its Postgres report rows did not match the saved payment.");
      }

      if (options.audit !== false) {
        await client.query(
          `insert into eazinvoice_audit_events (event_type, entity_type, entity_id, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [
            options.auditEvent || "invoice_payment_synced",
            "payment",
            text(payment.id),
            json({
              invoiceId: text(invoice.id),
              ownerUserId: text(invoice.ownerUserId, invoice.userId),
              amount: num(payment.amount),
              source: options.source || "runtime",
            }),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function syncSubscriptions(client, subscriptions) {
  for (const subscription of subscriptions) {
    await client.query(
      `insert into eazinvoice_subscriptions
        (id, user_id, plan, status, amount, monthly_amount, annual_amount, billing_cycle, gateway,
         gateway_order_id, gateway_payment_id, starts_at, expires_at, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::timestamptz, $14::jsonb, coalesce($15::timestamptz, now()), now())
       on conflict (id) do update set
        user_id = excluded.user_id,
        plan = excluded.plan,
        status = excluded.status,
        amount = excluded.amount,
        monthly_amount = excluded.monthly_amount,
        annual_amount = excluded.annual_amount,
        billing_cycle = excluded.billing_cycle,
        gateway = excluded.gateway,
        gateway_order_id = excluded.gateway_order_id,
        gateway_payment_id = excluded.gateway_payment_id,
        starts_at = excluded.starts_at,
        expires_at = excluded.expires_at,
        record = excluded.record,
        updated_at = now()`,
      [
        text(subscription.id),
        text(subscription.userId, subscription.adminUserId),
        text(subscription.plan, "free").toLowerCase(),
        text(subscription.status, "active"),
        num(subscription.amount),
        num(subscription.monthlyAmount),
        num(subscription.annualAmount, subscription.amount),
        text(subscription.billingCycle, "yearly"),
        text(subscription.gateway),
        text(subscription.gatewayOrderId),
        text(subscription.gatewayPaymentId),
        timestamp(subscription.startedAt, subscription.startsAt, subscription.createdAt),
        timestamp(subscription.expiresAt, subscription.renewsAt),
        json(subscription),
        timestamp(subscription.createdAt),
      ],
    );
  }
}

async function syncBusinessSettings(client, businessSettings) {
  for (const settings of businessSettings) {
    const emailSettings = settings.emailSettings || {};
    const paymentSettings = settings.paymentSettings || {};
    await client.query(
      `insert into eazinvoice_business_settings
        (id, owner_user_id, company_id, smtp_configured, payment_gateway_configured, payment_link_enabled,
         compliance_status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, coalesce($9::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        smtp_configured = excluded.smtp_configured,
        payment_gateway_configured = excluded.payment_gateway_configured,
        payment_link_enabled = excluded.payment_link_enabled,
        compliance_status = excluded.compliance_status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(settings.id),
        text(settings.ownerUserId, settings.userId),
        text(settings.companyId),
        Boolean(text(emailSettings.smtpHost) && text(emailSettings.smtpUser) && text(emailSettings.fromEmail)),
        Boolean(text(paymentSettings.keyId)),
        bool(paymentSettings.paymentLinkEnabled),
        complianceStatus(settings),
        json(settings),
        timestamp(settings.createdAt),
      ],
    );
  }
}

async function syncComplianceTasks(client, complianceTasks) {
  for (const task of complianceTasks) {
    await client.query(
      `insert into eazinvoice_compliance_tasks
        (id, owner_user_id, company_id, compliance_rule_id, compliance_name, department, frequency,
         due_date, due_date_label, status, responsible_person, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12::jsonb, coalesce($13::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        compliance_rule_id = excluded.compliance_rule_id,
        compliance_name = excluded.compliance_name,
        department = excluded.department,
        frequency = excluded.frequency,
        due_date = excluded.due_date,
        due_date_label = excluded.due_date_label,
        status = excluded.status,
        responsible_person = excluded.responsible_person,
        record = excluded.record,
        updated_at = now()`,
      [
        text(task.id),
        text(task.ownerUserId, task.userId),
        text(task.companyId),
        text(task.complianceRuleId),
        text(task.complianceName),
        text(task.department),
        text(task.frequency),
        dateOnly(task.dueDate),
        text(task.dueDateLabel),
        lowerText(task.status, "pending"),
        text(task.responsiblePerson),
        json(task),
        timestamp(task.createdAt),
      ],
    );
  }
}

async function syncTeamMembers(client, teamMembers) {
  for (const member of teamMembers) {
    await client.query(
      `insert into eazinvoice_team_members
        (id, owner_user_id, company_id, email, name, role, status, invited_by_user_id, accepted_user_id,
         invite_expires_at, invite_delivery_status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz, $11, $12::jsonb, coalesce($13::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        email = excluded.email,
        name = excluded.name,
        role = excluded.role,
        status = excluded.status,
        invited_by_user_id = excluded.invited_by_user_id,
        accepted_user_id = excluded.accepted_user_id,
        invite_expires_at = excluded.invite_expires_at,
        invite_delivery_status = excluded.invite_delivery_status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(member.id),
        text(member.ownerUserId, member.userId),
        text(member.companyId),
        lowerText(member.email),
        text(member.name),
        lowerText(member.role, "viewer"),
        lowerText(member.status, "invited"),
        text(member.invitedByUserId),
        text(member.acceptedUserId),
        timestamp(member.inviteExpiresAt, member.expiresAt),
        text(member.inviteDeliveryStatus, member.deliveryStatus),
        json(member),
        timestamp(member.createdAt),
      ],
    );
  }
}

async function syncApprovalRequests(client, approvalRequests) {
  for (const approval of approvalRequests) {
    await client.query(
      `insert into eazinvoice_approval_requests
        (id, owner_user_id, company_id, document_type, document_id, document_number, requested_by_user_id,
         approver_user_id, status, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, coalesce($11::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        document_type = excluded.document_type,
        document_id = excluded.document_id,
        document_number = excluded.document_number,
        requested_by_user_id = excluded.requested_by_user_id,
        approver_user_id = excluded.approver_user_id,
        status = excluded.status,
        record = excluded.record,
        updated_at = now()`,
      [
        text(approval.id),
        text(approval.ownerUserId, approval.userId),
        text(approval.companyId),
        lowerText(approval.documentType, approval.type, "invoice"),
        text(approval.documentId),
        text(approval.documentNumber, approval.invoiceNumber, approval.poNumber),
        text(approval.requestedByUserId),
        text(approval.approverUserId),
        lowerText(approval.status, "pending"),
        json(approval),
        timestamp(approval.createdAt),
      ],
    );
  }
}

async function syncApiKeys(client, apiKeys) {
  for (const apiKey of apiKeys) {
    await client.query(
      `insert into eazinvoice_api_keys
        (id, owner_user_id, company_id, label, token_preview, scopes, status, revoked_at, record, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::jsonb, coalesce($10::timestamptz, now()), now())
       on conflict (id) do update set
        owner_user_id = excluded.owner_user_id,
        company_id = excluded.company_id,
        label = excluded.label,
        token_preview = excluded.token_preview,
        scopes = excluded.scopes,
        status = excluded.status,
        revoked_at = excluded.revoked_at,
        record = excluded.record,
        updated_at = now()`,
      [
        text(apiKey.id),
        text(apiKey.ownerUserId, apiKey.userId),
        text(apiKey.companyId),
        text(apiKey.label, apiKey.name),
        text(apiKey.tokenPreview, apiKey.preview),
        json(toArray(apiKey.scopes)),
        lowerText(apiKey.status, apiKey.revokedAt ? "revoked" : "active"),
        timestamp(apiKey.revokedAt),
        json(apiKey),
        timestamp(apiKey.createdAt),
      ],
    );
  }
}

export async function syncBusinessWorkspaceTables(client, state = {}, options = {}) {
  await syncBusinessSettings(client, toArray(state.businessSettings));
  await syncComplianceTasks(client, toArray(state.complianceTasks));
  await syncTeamMembers(client, toArray(state.teamMembers));
  await syncApprovalRequests(client, toArray(state.approvalRequests));
  await syncApiKeys(client, toArray(state.apiKeys));

  if (options.audit !== false) {
    await client.query(
      `insert into eazinvoice_audit_events (event_type, entity_type, metadata)
       values ($1, $2, $3::jsonb)`,
      [
        options.auditEvent || "business_workspace_synced",
        "system",
        json({
          counts: {
            businessSettings: toArray(state.businessSettings).length,
            complianceTasks: toArray(state.complianceTasks).length,
            teamMembers: toArray(state.teamMembers).length,
            approvalRequests: toArray(state.approvalRequests).length,
            apiKeys: toArray(state.apiKeys).length,
          },
          source: options.source || "runtime",
        }),
      ],
    );
  }
}

export async function syncBusinessWorkspaceToCoreTables(state = {}, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing Business workspace rows.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncBusinessWorkspaceTables(client, state, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function syncSubscriptionToCoreTable(subscription, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing subscription entitlement rows.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncSubscriptions(client, [subscription]);
      if (options.audit !== false) {
        await client.query(
          `insert into eazinvoice_audit_events (event_type, entity_type, entity_id, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [
            options.auditEvent || "subscription_entitlement_synced",
            "subscription",
            text(subscription.id),
            json({
              plan: text(subscription.plan),
              userId: text(subscription.userId),
              gateway: text(subscription.gateway),
              source: options.source || "runtime",
            }),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function countCoreState(state = {}) {
  return {
    users: toArray(state.users).length,
    businessProfiles: toArray(state.companies).length,
    customers: toArray(state.customers).length,
    invoices: toArray(state.invoices).length,
    invoiceItems: toArray(state.invoices).reduce((total, invoice) => total + toArray(invoice.items).length, 0),
    purchaseOrders: toArray(state.purchaseOrders).length,
    purchaseOrderItems: toArray(state.purchaseOrders).reduce((total, purchaseOrder) => total + toArray(purchaseOrder.items).length, 0),
    payments: toArray(state.payments).length,
    subscriptions: toArray(state.subscriptions).length,
    businessSettings: toArray(state.businessSettings).length,
    teamMembers: toArray(state.teamMembers).length,
    approvalRequests: toArray(state.approvalRequests).length,
    apiKeys: toArray(state.apiKeys).length,
  };
}

export async function syncCoreTables(client, state = {}, options = {}) {
  await syncUsers(client, toArray(state.users));
  await syncBusinessProfiles(client, toArray(state.companies));
  await syncCustomers(client, toArray(state.customers));
  await syncInvoices(client, toArray(state.invoices), options);
  await syncPurchaseOrders(client, toArray(state.purchaseOrders), options);
  await syncPayments(client, toArray(state.payments));
  await syncSubscriptions(client, toArray(state.subscriptions));
  await syncBusinessWorkspaceTables(client, state, options);

  if (options.audit !== false) {
    await client.query(
      `insert into eazinvoice_audit_events (event_type, entity_type, metadata)
       values ($1, $2, $3::jsonb)`,
      [
        options.auditEvent || "core_tables_synced",
        "system",
        json({
          counts: countCoreState(state),
          source: options.source || "manual",
        }),
      ],
    );
  }
}

export async function syncCoreTablesFromState(state = {}, options = {}) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it before syncing core Postgres tables.");
  }
  await withPostgresClient(async (client) => {
    await client.query("BEGIN");
    try {
      await syncCoreTables(client, state, options);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
