import { createStore } from "./store.js";
import {
  FREE_PLAN_LIMITS,
  getActivePlanDefinition,
  getActiveSubscription,
  getPlanDefinition,
  hasPlanFeature,
  listPlans,
  resolvePlanUsageStatus,
} from "./plans.js";
import { describePersistence } from "./persistence.js";
import { buildAiCommand } from "./ai-assistant.js";
import { tryBuildAiCommandWithLlm } from "./ai-llm.js";

export function createApi(deps = {}) {
  const store = deps.store ?? createStore();

  return {
    healthCheck() {
      return {
        ok: true,
        service: "eazinvoice-api",
      };
    },

    getFreePlanSummary(user, options = {}) {
      const usage = user ? store.countUsageForUser(user) : store.countUsage();
      const subscriptions = user ? store.listSubscriptionsForUser(user.id) : [];
      const activeSubscription = getActiveSubscription(subscriptions);
      const previewPlan = options.previewPlan ? getPlanDefinition(options.previewPlan) : null;
      const activePlan = previewPlan || getActivePlanDefinition(subscriptions);
      return {
        plan: activePlan.plan,
        label: activePlan.label,
        limits: activePlan.limits,
        features: activePlan.features,
        highlights: activePlan.highlights,
        subscription: activeSubscription,
        preview: previewPlan
          ? {
            enabled: true,
            plan: activePlan.plan,
            label: activePlan.label,
          }
          : {
            enabled: false,
          },
        catalog: listPlans(),
        usage,
        status: resolvePlanUsageStatus(usage, activePlan.limits),
      };
    },

    listPlans() {
      return listPlans();
    },

    getPlanDefinition(plan) {
      return getPlanDefinition(plan);
    },

    getUserPlan(user, options = {}) {
      return this.getFreePlanSummary(user, options);
    },

    userCanUseFeature(user, feature, options = {}) {
      if (options.previewPlan) return hasPlanFeature(options.previewPlan, feature);
      const subscriptions = user ? store.listSubscriptionsForUser(user.id) : [];
      return hasPlanFeature(getActivePlanDefinition(subscriptions).plan, feature);
    },

    requireFeature(user, feature, options = {}) {
      if (!this.userCanUseFeature(user, feature, options)) {
        throw new Error("Business tier required for this workspace feature.");
      }
    },

    getUserPlanLimits(user, options = {}) {
      if (options.previewPlan) return getPlanDefinition(options.previewPlan).limits;
      const subscriptions = user ? store.listSubscriptionsForUser(user.id) : [];
      return getActivePlanDefinition(subscriptions).limits;
    },

    createCompany(input) {
      return store.createCompany(input);
    },

    listCompanies(user) {
      if (!user || user.role === "admin") return store.listCompanies();
      return store.listCompanies().filter((company) => company.ownerUserId === user.id);
    },

    updateCompanyKyc(companyId, updates) {
      return store.updateCompanyKyc(companyId, updates);
    },
    updateCompany(companyId, updates) {
      return store.updateCompany(companyId, updates);
    },

    createCustomer(input) {
      return store.createCustomer(input);
    },

    listCustomers(user) {
      if (!user || user.role === "admin") return store.listCustomers();
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === user.id).map((company) => company.id));
      return store.listCustomers().filter((customer) => customer.ownerUserId === user.id || companyIds.has(customer.companyId));
    },

    createInvoice(input, options = {}) {
      const user = input.ownerUserId ? store.getUserById(input.ownerUserId) : null;
      return store.createInvoice(input, this.getUserPlanLimits(user, options));
    },

    runRecurringInvoiceScheduler(user, options = {}) {
      if (!this.userCanUseFeature(user, "recurringInvoices", options)) {
        throw new Error("Recurring invoice auto-drafts are available on Standard and higher plans.");
      }
      return store.runRecurringInvoiceScheduler({
        ownerUserId: user?.id,
        targetDate: options.targetDate,
        maxPerTemplate: options.maxPerTemplate,
      });
    },

    runRecurringInvoiceSchedulerForAllUsers(options = {}) {
      const users = store.listUsers();
      const results = [];
      users.forEach((user) => {
        if (!this.userCanUseFeature(user, "recurringInvoices", options)) return;
        const result = store.runRecurringInvoiceScheduler({
          ownerUserId: user.id,
          targetDate: options.targetDate,
          maxPerTemplate: options.maxPerTemplate,
        });
        results.push({
          userId: user.id,
          email: user.email,
          ...result,
        });
      });
      return {
        targetDate: options.targetDate || new Date().toISOString().slice(0, 10),
        usersChecked: users.length,
        usersProcessed: results.length,
        createdCount: results.reduce((sum, result) => sum + (result.created?.length || 0), 0),
        results,
      };
    },

    createPurchaseOrder(input, options = {}) {
      const user = input.ownerUserId ? store.getUserById(input.ownerUserId) : null;
      return store.createPurchaseOrder(input, this.getUserPlanLimits(user, options));
    },

    listTeamMembers(user, options = {}) {
      this.requireFeature(user, "teamAccess", options);
      return store.listTeamMembersForUser(user);
    },

    createTeamMember(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "teamAccess", options);
      return store.createTeamMember({
        ...input,
        ownerUserId: user.id,
        invitedByUserId: user.id,
      });
    },

    updateTeamMember(user, memberId, updates = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "teamAccess", options);
      const member = store.updateTeamMember(memberId, updates, user);
      if (!member) throw new Error("Team member not found");
      return member;
    },

    acceptTeamInvite(user, inviteToken, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const member = store.acceptTeamInvite(user, inviteToken);
      if (!member) throw new Error("Team invite not found for this email");
      return member;
    },

    getBusinessSettings(user, options = {}) {
      this.requireFeature(user, "teamAccess", options);
      return store.getBusinessSettingsForUser(user, options.companyId || null) || {
        id: "",
        ownerUserId: user?.id || null,
        companyId: options.companyId || null,
        emailSettings: {},
        paymentSettings: {},
        complianceProfile: {},
      };
    },

    getBusinessEmailDeliverySettings(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "teamAccess", options);
      return store.getRawBusinessSettingsForUser(user, options.companyId || null)?.emailSettings || {};
    },

    updateBusinessSettings(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "teamAccess", options);
      return store.upsertBusinessSettings(user, input);
    },

    validateBusinessEmailSettings(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "teamAccess", options);
      return store.validateBusinessEmailSettings(user, input);
    },

    listApprovalRequests(user, options = {}) {
      this.requireFeature(user, "approvals", options);
      return store.listApprovalRequestsForUser(user);
    },

    createApprovalRequest(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "approvals", options);
      return store.createApprovalRequest({
        ...input,
        ownerUserId: user.id,
        requestedByUserId: user.id,
      });
    },

    decideApprovalRequest(user, approvalId, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "approvals", options);
      const request = store.decideApprovalRequest(approvalId, {
        ...input,
        approverUserId: user.id,
      }, user);
      if (!request) throw new Error("Approval request not found");
      return request;
    },

    listApiKeys(user, options = {}) {
      this.requireFeature(user, "apiAccess", options);
      return store.listApiKeysForUser(user);
    },

    createApiKey(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "apiAccess", options);
      return store.createApiKey({
        ...input,
        ownerUserId: user.id,
      });
    },

    revokeApiKey(user, apiKeyId, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      this.requireFeature(user, "apiAccess", options);
      const key = store.revokeApiKey(apiKeyId, user);
      if (!key) throw new Error("API key not found");
      return key;
    },

    validateWordPressConnection(input = {}) {
      const apiKey = String(input.apiKey || input.api_key || "").trim();
      const accountEmail = String(input.accountEmail || input.account_email || "").trim().toLowerCase();
      if (!apiKey) throw new Error("WordPress API key is required.");
      const key = store.findActiveApiKeyByToken(apiKey);
      if (!key) throw new Error("Invalid or revoked WordPress API key.");
      const owner = store.getUserById(key.ownerUserId);
      if (!owner) throw new Error("API key owner was not found.");
      if (accountEmail && owner.email.toLowerCase() !== accountEmail) {
        throw new Error("API key does not belong to the supplied EazInvoice account email.");
      }
      const plan = this.getFreePlanSummary(owner);
      return {
        ok: true,
        account: {
          name: owner.name,
          email: owner.email,
        },
        plan: {
          id: plan.plan,
          label: plan.label,
          limits: plan.limits,
          features: plan.features,
          highlights: plan.highlights,
          billingCycle: plan.subscription?.billingCycle || getPlanDefinition(plan.plan).billingCycle,
          subscriptionStatus: plan.subscription?.status || (plan.plan === "free" ? "free" : "active"),
        },
        wordpress: {
          unlocked: Boolean(plan.features.wordpressPaid),
          gatewayReady: Boolean(plan.features.razorpayCollections),
          aiReady: Boolean(plan.features.aiInvoiceAssist || plan.features.aiPoAssist),
        },
        apiKey: {
          id: key.id,
          label: key.label,
          tokenPreview: key.tokenPreview,
          scopes: key.scopes || [],
          status: key.status,
          createdAt: key.createdAt,
        },
      };
    },

    getAiCommandContext(user) {
      return {
        user,
        companies: this.listCompanies(user),
        customers: this.listCustomers(user),
        invoices: this.listInvoices(user),
        purchaseOrders: this.listPurchaseOrders(user),
        payments: this.listPayments(user),
      };
    },

    createApprovedAiDraft(user, input = {}, options = {}) {
      const approved = input.approvedDraft || {};
      const intent = String(approved.intent || "").trim();
      const payload = approved.payload || {};
      if (intent === "invoice") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options)) {
          throw new Error("AI invoice assistant is available on Pro and Business plans.");
        }
        const invoice = this.createInvoice({
          ...payload,
          ownerUserId: user.id,
          status: "draft",
          paymentStatus: "draft",
        }, options);
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: this.getUserPlan(user, options).plan,
          provider: "approved",
          intent,
          status: "saved",
          command: input.command,
          billable: false,
        });
        return {
          intent,
          confidence: approved.confidence || "approved",
          message: "Approved AI invoice draft saved. Review it before creating the final invoice.",
          createdRecord: invoice,
        };
      }
      if (intent === "purchase_order") {
        if (!this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI PO and Work Order assistant is available on Pro and Business plans.");
        }
        const purchaseOrder = this.createPurchaseOrder({
          ...payload,
          ownerUserId: user.id,
          status: "draft",
        }, options);
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: this.getUserPlan(user, options).plan,
          provider: "approved",
          intent,
          status: "saved",
          command: input.command,
          billable: false,
        });
        return {
          intent,
          confidence: approved.confidence || "approved",
          message: "Approved AI PO/WO draft saved. Review it before creating the final document.",
          createdRecord: purchaseOrder,
        };
      }
      throw new Error("Approved AI draft is missing a valid invoice or PO payload.");
    },

    finalizeAiCommandResult(user, input = {}, options = {}, result, provider = "local") {
      const plan = this.getUserPlan(user, options);
      const limit = Number(plan.limits?.aiCommandsPerMonth ?? 0);
      const currentUsage = store.countAiUsageForUser(user);
      const shouldBill = input.approvedPreview !== true && input.approvedDraft === undefined;
      const enforceAiLimit = () => {
        if (shouldBill && currentUsage >= limit) {
          throw new Error("AI command monthly limit reached for the active plan.");
        }
      };

      const shouldSaveDraft = input.saveDraft !== false && input.previewOnly !== true;
      if (result.intent === "clarification") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options) && !this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI assistant is available on Pro and Business plans.");
        }
        enforceAiLimit();
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: plan.plan,
          provider,
          intent: result.intent,
          status: "clarification",
          command: input.command,
          billable: shouldBill,
        });
        return result;
      }
      if (result.intent === "invoice") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options)) {
          throw new Error("AI invoice assistant is available on Pro and Business plans.");
        }
        enforceAiLimit();
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: plan.plan,
          provider,
          intent: result.intent,
          status: shouldSaveDraft ? "saved" : "preview",
          command: input.command,
          billable: shouldBill,
        });
        if (!shouldSaveDraft) {
          return {
            ...result,
            provider,
            proposedRecord: {
              ...result.payload,
              ...(result.preview || {}),
            },
          };
        }
        const invoice = this.createInvoice(result.payload, options);
        return {
          ...result,
          provider,
          createdRecord: invoice,
        };
      }
      if (result.intent === "purchase_order") {
        if (!this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI PO and Work Order assistant is available on Pro and Business plans.");
        }
        enforceAiLimit();
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: plan.plan,
          provider,
          intent: result.intent,
          status: shouldSaveDraft ? "saved" : "preview",
          command: input.command,
          billable: shouldBill,
        });
        if (!shouldSaveDraft) {
          return {
            ...result,
            provider,
            proposedRecord: {
              ...result.payload,
              ...(result.preview || {}),
            },
          };
        }
        const purchaseOrder = this.createPurchaseOrder(result.payload, options);
        return {
          ...result,
          provider,
          createdRecord: purchaseOrder,
        };
      }
      if (!this.userCanUseFeature(user, "advancedReports", options)) {
        throw new Error("AI report assistant is available on Pro and Business plans.");
      }
      enforceAiLimit();
      store.createAiUsageLog({
        ownerUserId: user.id,
        plan: plan.plan,
        provider,
        intent: result.intent,
        status: "report",
        command: input.command,
        billable: shouldBill,
      });
      return { ...result, provider };
    },

    runAiCommand(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      if (input.approvedDraft) return this.createApprovedAiDraft(user, input, options);
      const command = String(input.command || "").trim();
      if (!command) throw new Error("Enter a command for the AI assistant.");
      const context = this.getAiCommandContext(user);
      const result = buildAiCommand(command, context);
      return this.finalizeAiCommandResult(user, input, options, result, "local");
    },

    async runAiCommandAsync(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      if (input.approvedDraft) return this.createApprovedAiDraft(user, input, options);
      const command = String(input.command || "").trim();
      if (!command) throw new Error("Enter a command for the AI assistant.");
      if (!this.userCanUseFeature(user, "aiInvoiceAssist", options)
        && !this.userCanUseFeature(user, "aiPoAssist", options)
        && !this.userCanUseFeature(user, "advancedReports", options)) {
        throw new Error("AI assistant is available on Pro and Business plans.");
      }
      const context = this.getAiCommandContext(user);
      let provider = "local";
      let result = null;
      if (input.useLlm !== false) {
        try {
          const llm = await tryBuildAiCommandWithLlm({
            command,
            context,
            apiKey: options.openAiApiKey,
            model: options.openAiModel,
            fetchImpl: options.fetchImpl,
          });
          if (llm.used && llm.result) {
            provider = llm.provider || "openai";
            result = llm.result;
          }
        } catch (error) {
          if (input.requireLlm) throw error;
          provider = "local";
        }
      }
      if (!result) result = buildAiCommand(command, context);
      return this.finalizeAiCommandResult(user, input, options, result, provider);
    },

    createUser(input) {
      return store.createUser(input);
    },

    listUsers() {
      return store.listUsers();
    },

    getUserById(id) {
      return store.getUserById(id);
    },

    getUserByEmail(email) {
      return store.getUserByEmail(email);
    },

    updateUserAuthDetails(userId, updates) {
      return store.updateUserAuthDetails(userId, updates);
    },

    updateUserProfile(userId, updates) {
      return store.updateUserProfile(userId, updates);
    },

    createSubscription(input) {
      return store.createSubscription(input);
    },

    createBillingOrder(input) {
      return store.createBillingOrder(input);
    },

    getBillingOrderByGatewayOrderId(gatewayOrderId) {
      return store.getBillingOrderByGatewayOrderId(gatewayOrderId);
    },

    updateBillingOrder(gatewayOrderId, updates) {
      return store.updateBillingOrder(gatewayOrderId, updates);
    },

    listBillingOrders() {
      return store.listBillingOrders();
    },

    createReport(input) {
      return store.createReport(input);
    },

    listSubscriptions() {
      return store.listSubscriptions();
    },

    listSubscriptionsForUser(user) {
      return user ? store.listSubscriptionsForUser(user.id) : [];
    },

    listMonetization() {
      return store.listMonetization();
    },

    listReports(user) {
      return store.listReportsForUser(user);
    },

    summarizeMonetization() {
      return store.summarizeMonetization();
    },

    listInvoices(user) {
      return store.listInvoicesForUser(user);
    },

    getInvoice(id, user) {
      return store.getInvoice(id, user);
    },
    updateInvoice(id, updates, options = {}) {
      const invoice = store.getInvoice(id);
      const user = invoice?.ownerUserId ? store.getUserById(invoice.ownerUserId) : null;
      return store.updateInvoice(id, updates, this.getUserPlanLimits(user, options));
    },
    deleteInvoice(id, user) {
      return store.deleteInvoice(id, user);
    },
    recordInvoicePayment(id, input) {
      return store.recordInvoicePayment(id, input);
    },
    createInvoicePaymentLink(id, input) {
      return store.createInvoicePaymentLink(id, input);
    },
    recordGatewayPayment(input) {
      return store.recordGatewayPayment(input);
    },
    listPayments(user) {
      return store.listPaymentsForUser(user);
    },

    listPurchaseOrders(user) {
      return store.listPurchaseOrdersForUser(user);
    },

    getPurchaseOrder(id, user) {
      return store.getPurchaseOrder(id, user);
    },
    updatePurchaseOrder(id, updates, options = {}) {
      const purchaseOrder = store.getPurchaseOrder(id);
      const user = purchaseOrder?.ownerUserId ? store.getUserById(purchaseOrder.ownerUserId) : null;
      return store.updatePurchaseOrder(id, updates, this.getUserPlanLimits(user, options));
    },
    deletePurchaseOrder(id, user) {
      return store.deletePurchaseOrder(id, user);
    },

    listRestrictedUsers() {
      return store.listRestrictedUsers();
    },

    setUserRestriction(userId, updates) {
      return store.setUserRestriction(userId, updates);
    },

    setUserPermissions(userId, permissions) {
      return store.setUserPermissions(userId, permissions);
    },

    getPersistenceStatus() {
      return {
        persistence: describePersistence(),
        records: store.summarizeRecords(),
        warning: "Render disks are ephemeral unless persistent storage or an external database is configured. Verify this before production releases.",
      };
    },

    exportDataSnapshot() {
      return store.exportState();
    },
  };
}

export function createDefaultApi() {
  return createApi();
}
