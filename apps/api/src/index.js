import { createStore } from "./store.js";
import {
  buildPlanUsageDetails,
  FREE_PLAN_LIMITS,
  getActivePlanDefinition,
  getActiveSubscription,
  getFeatureRequirement,
  getPlanDefinition,
  hasPlanFeature,
  listPlans,
  resolvePlanUsageStatus,
} from "./plans.js";
import { describePersistence } from "./persistence.js";
import { describePostgresState } from "./postgres-state.js";
import { hasPostgresConfig, maskDatabaseUrl } from "./postgres.js";
import {
  createJournalEntry,
  createLedgerAccount,
  getAccountingSummary,
  getBookEntries,
  getGstComplianceSummary,
  getJournalEntries,
  getLedgerAccountEntries,
  getLedgerAccounts,
} from "./postgres-accounting.js";
import { summarizePostgresReports } from "./postgres-reporting.js";
import { buildAiCommand } from "./ai-assistant.js";
import { tryBuildAiCommandWithLlm } from "./ai-llm.js";

function normalizeUsageMonth(input) {
  const value = String(input || "").trim();
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}

function nextMonthlyResetDate(month) {
  const [year, monthNumber] = normalizeUsageMonth(month).split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
}

function summarizeAiLogs(logs) {
  return logs.reduce((summary, log) => {
    const intent = String(log.intent || "unknown").toLowerCase();
    const status = String(log.status || "unknown").toLowerCase();
    summary.total += 1;
    if (log.billable !== false) summary.billable += 1;
    summary.byIntent[intent] = (summary.byIntent[intent] || 0) + 1;
    summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
    return summary;
  }, { total: 0, billable: 0, byIntent: {}, byStatus: {} });
}

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
        usageDetails: buildPlanUsageDetails(usage, activePlan.limits),
        status: resolvePlanUsageStatus(usage, activePlan.limits, { planLabel: activePlan.label }),
      };
    },

    listPlans() {
      return listPlans();
    },

    getPlanDefinition(plan) {
      return getPlanDefinition(plan);
    },

    getUserPlan(user, options = {}) {
      const summary = this.getFreePlanSummary(user, options);
      if (!options.planLimits) return summary;
      const limits = {
        ...summary.limits,
        ...options.planLimits,
      };
      return {
        ...summary,
        limits,
        usageDetails: buildPlanUsageDetails(summary.usage, limits),
        status: resolvePlanUsageStatus(summary.usage, limits, { planLabel: summary.label }),
      };
    },

    userCanUseFeature(user, feature, options = {}) {
      if (options.previewPlan) return hasPlanFeature(options.previewPlan, feature);
      const subscriptions = user ? store.listSubscriptionsForUser(user.id) : [];
      return hasPlanFeature(getActivePlanDefinition(subscriptions).plan, feature);
    },

    requireFeature(user, feature, options = {}) {
      if (!this.userCanUseFeature(user, feature, options)) {
        throw new Error(getFeatureRequirement(feature).message);
      }
    },

    requireBusinessWorkspaceAccess(user, options = {}, permission = "read") {
      if (!user?.id) throw new Error("Authentication required");
      const ownerUserId = options.workspaceOwnerUserId || options.ownerUserId || user.id;
      const access = store.getBusinessWorkspaceAccess(user, ownerUserId);
      if (!access) throw new Error("Business workspace access denied");
      const owner = store.getUserById(access.ownerUserId);
      if (!owner) throw new Error("Business workspace owner not found");
      this.requireFeature(owner, "teamAccess", access.source === "owned" || access.source === "admin" ? options : {});
      if (!access.permissions?.[permission]) {
        throw new Error("This team role cannot perform this Business workspace action");
      }
      return {
        ...access,
        owner,
      };
    },

    resolveRecordsWorkspaceAccess(user, options = {}, permission = "read") {
      const ownerUserId = options.workspaceOwnerUserId || options.ownerUserId || user?.id || null;
      if (!user?.id) {
        return {
          ownerUserId,
          owner: ownerUserId ? (store.getUserById(ownerUserId) || { id: ownerUserId }) : null,
          access: {
            ownerUserId,
            permissions: {
              read: true,
              writeRecords: true,
            },
            source: "system",
          },
        };
      }
      if (ownerUserId === user.id || (user.role === "admin" && !options.workspaceOwnerUserId)) {
        return {
          ownerUserId: user.id,
          owner: user,
          access: {
            ownerUserId: user.id,
            permissions: {
              read: true,
              writeRecords: true,
            },
            source: "owned",
          },
        };
      }
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: ownerUserId,
      }, permission);
      return {
        ownerUserId: access.ownerUserId,
        owner: access.owner,
        access,
      };
    },

    getUserPlanLimits(user, options = {}) {
      let limits = null;
      if (options.previewPlan) limits = getPlanDefinition(options.previewPlan).limits;
      else {
        const subscriptions = user ? store.listSubscriptionsForUser(user.id) : [];
        limits = getActivePlanDefinition(subscriptions).limits;
      }
      if (options.planLimits) return { ...limits, ...options.planLimits };
      return limits;
    },

    getAiQuota(user, options = {}) {
      const plan = this.getUserPlan(user, options);
      const limit = Number(plan.limits?.aiCommandsPerMonth ?? 0);
      const used = store.countAiUsageForUser(user, normalizeUsageMonth(options.month));
      const unlimited = limit >= 999999;
      return {
        plan: plan.plan,
        label: plan.label,
        used,
        limit,
        remaining: unlimited ? null : Math.max(0, limit - used),
        unlimited,
        exceeded: !unlimited && used >= limit,
      };
    },

    enforceAiQuota(user, options = {}, billable = true) {
      const quota = this.getAiQuota(user, options);
      if (billable && !quota.unlimited && quota.used >= quota.limit) {
        throw new Error("AI command monthly limit reached for the active plan.");
      }
      return quota;
    },

    createCompany(input) {
      return store.createCompany(input);
    },

    listCompanies(user, options = {}) {
      if (!options.workspaceOwnerUserId && (!user || user.role === "admin")) return store.listCompanies();
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.listCompanies().filter((company) => company.ownerUserId === workspace.ownerUserId);
    },

    updateCompanyKyc(companyId, updates) {
      return store.updateCompanyKyc(companyId, updates);
    },
    updateCompany(companyId, updates) {
      return store.updateCompany(companyId, updates);
    },

    createCustomer(input, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || { id: input.ownerUserId }, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || input.ownerUserId,
      }, "writeRecords");
      return store.createCustomer({
        ...input,
        ownerUserId: workspace.ownerUserId,
      });
    },

    listCustomers(user, options = {}) {
      if (!options.workspaceOwnerUserId && (!user || user.role === "admin")) return store.listCustomers();
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === workspace.ownerUserId).map((company) => company.id));
      return store.listCustomers().filter((customer) => customer.ownerUserId === workspace.ownerUserId || companyIds.has(customer.companyId));
    },

    getCustomer(id, user, options = {}) {
      const current = store.getCustomer(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "read");
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === workspace.ownerUserId).map((company) => company.id));
      if (current.ownerUserId !== workspace.ownerUserId && !companyIds.has(current.companyId)) return null;
      return current;
    },

    updateCustomer(id, updates = {}, options = {}) {
      const current = store.getCustomer(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || (current.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: updates.workspaceOwnerUserId || options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getCustomer(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.updateCustomer(id, {
        ...updates,
        ownerUserId: workspace.ownerUserId,
      });
    },

    deleteCustomer(id, user, options = {}) {
      const current = store.getCustomer(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getCustomer(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.deleteCustomer(id);
    },

    reactivateCustomer(id, user, options = {}) {
      const current = store.getCustomer(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getCustomer(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.reactivateCustomer(id);
    },

    createVendor(input, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || { id: input.ownerUserId }, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || input.ownerUserId,
      }, "writeRecords");
      return store.createVendor({
        ...input,
        ownerUserId: workspace.ownerUserId,
      });
    },

    listVendors(user, options = {}) {
      if (!options.workspaceOwnerUserId && (!user || user.role === "admin")) return store.listVendors();
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === workspace.ownerUserId).map((company) => company.id));
      return store.listVendors().filter((vendor) => vendor.ownerUserId === workspace.ownerUserId || companyIds.has(vendor.companyId));
    },

    getVendor(id, user, options = {}) {
      const current = store.getVendor(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "read");
      const companyIds = new Set(store.listCompanies().filter((company) => company.ownerUserId === workspace.ownerUserId).map((company) => company.id));
      if (current.ownerUserId !== workspace.ownerUserId && !companyIds.has(current.companyId)) return null;
      return current;
    },

    updateVendor(id, updates = {}, options = {}) {
      const current = store.getVendor(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || (current.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: updates.workspaceOwnerUserId || options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getVendor(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.updateVendor(id, {
        ...updates,
        ownerUserId: workspace.ownerUserId,
      });
    },

    deleteVendor(id, user, options = {}) {
      const current = store.getVendor(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getVendor(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.deleteVendor(id);
    },

    reactivateVendor(id, user, options = {}) {
      const current = store.getVendor(id);
      if (!current) return null;
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current.ownerUserId,
      }, "writeRecords");
      const visible = this.getVendor(id, workspace.owner, { workspaceOwnerUserId: workspace.ownerUserId });
      if (!visible) return null;
      return store.reactivateVendor(id);
    },

    createInvoice(input, options = {}) {
      const actor = options.user || (input.actorUserId ? store.getUserById(input.actorUserId) : null) || (input.ownerUserId ? store.getUserById(input.ownerUserId) : null);
      const workspace = this.resolveRecordsWorkspaceAccess(actor, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || input.ownerUserId,
      }, "writeRecords");
      return store.createInvoice({
        ...input,
        ownerUserId: workspace.ownerUserId,
      }, this.getUserPlanLimits(workspace.owner, options));
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
      const actor = options.user || (input.actorUserId ? store.getUserById(input.actorUserId) : null) || (input.ownerUserId ? store.getUserById(input.ownerUserId) : null);
      const workspace = this.resolveRecordsWorkspaceAccess(actor, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || input.ownerUserId,
      }, "writeRecords");
      return store.createPurchaseOrder({
        ...input,
        ownerUserId: workspace.ownerUserId,
      }, this.getUserPlanLimits(workspace.owner, options));
    },

    listTeamMembers(user, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, options, "read");
      return store.listTeamMembersForWorkspace(access.ownerUserId);
    },

    createTeamMember(user, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "manageTeam");
      const email = String(input.email || "").trim().toLowerCase();
      const ownerEmail = String(access.owner?.email || "").trim().toLowerCase();
      const actorEmail = String(user.email || "").trim().toLowerCase();
      if (!email) throw new Error("Enter a valid team member email address.");
      if (email === ownerEmail || email === actorEmail) {
        throw new Error("You cannot add the workspace owner/admin email as a sub-user. Please use a different email address for Accountant or Viewer access.");
      }
      const existingUser = store.listUsers().find((entry) => String(entry.email || "").trim().toLowerCase() === email);
      if (existingUser?.role === "admin") {
        throw new Error("Admin email addresses cannot be added as Accountant or Viewer sub-users.");
      }
      const existingMember = store.listTeamMembersForWorkspace(access.ownerUserId).find((member) => (
        String(member.email || "").trim().toLowerCase() === email
        && member.status !== "removed"
      ));
      if (existingMember) {
        throw new Error("This email already has workspace access. Remove or update the existing sub-user instead.");
      }
      return store.createTeamMember({
        ...input,
        email,
        ownerUserId: access.ownerUserId,
        invitedByUserId: user.id,
      });
    },

    updateTeamMember(user, memberId, updates = {}, options = {}) {
      const current = store.listTeamMembersForUser(user).find((member) => member.id === memberId);
      const ownerUserId = updates.workspaceOwnerUserId || current?.ownerUserId || user?.id;
      this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: ownerUserId,
      }, "manageTeam");
      const member = store.updateTeamMember(memberId, updates, user);
      if (!member) throw new Error("Team member not found");
      return member;
    },

    listBusinessWorkspaces(user) {
      if (!user?.id) throw new Error("Authentication required");
      return store.listBusinessWorkspacesForUser(user);
    },

    getBusinessSettings(user, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, options, "read");
      return store.getBusinessSettingsForUser(access.owner, options.companyId || access.companyId || null) || {
        id: "",
        ownerUserId: access.ownerUserId,
        companyId: options.companyId || access.companyId || null,
        emailSettings: {},
        paymentSettings: {},
        complianceProfile: {},
        workspaceAccess: access,
      };
    },

    getBusinessEmailDeliverySettings(user, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, options, "read");
      return store.getRawBusinessSettingsForUser(access.owner, options.companyId || access.companyId || null)?.emailSettings || {};
    },

    updateBusinessSettings(user, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "manageSettings");
      return store.upsertBusinessSettings(access.owner, input);
    },

    validateBusinessEmailSettings(user, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "manageSettings");
      return store.validateBusinessEmailSettings(access.owner, input);
    },

    recordBusinessEmailDelivery(user, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "manageSettings");
      return store.recordBusinessEmailDelivery(access.owner, input);
    },

    getBusinessComplianceDashboard(user, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, options, "read");
      return store.getBusinessComplianceDashboard(access.owner, options.companyId || access.companyId || null);
    },

    getAccountingSummary(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getAccountingSummary(user, options);
    },

    getLedgerAccounts(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getLedgerAccounts(user, options);
    },

    createLedgerAccount(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return createLedgerAccount(user, input, options);
    },

    getJournalEntries(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getJournalEntries(user, options);
    },

    createJournalEntry(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return createJournalEntry(user, input, options);
    },

    getBookEntries(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getBookEntries(user, options);
    },

    getGstComplianceSummary(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getGstComplianceSummary(user, options);
    },

    getLedgerAccountEntries(user, accountId, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      return getLedgerAccountEntries(user, accountId, options);
    },

    updateComplianceTask(user, taskId, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "compliance");
      return store.updateComplianceTask(access.owner, taskId, input);
    },

    recordComplianceReminderDelivery(user, taskId, input = {}, options = {}) {
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id,
      }, "compliance");
      return store.recordComplianceReminderDelivery(access.owner, taskId, input);
    },
    listApprovalRequests(user, options = {}) {
      const targetOwnerUserId = options.workspaceOwnerUserId || user?.id;
      if (targetOwnerUserId === user?.id) {
        this.requireFeature(user, "approvals", options);
        return store.listApprovalRequestsForUser(user);
      }
      const access = this.requireBusinessWorkspaceAccess(user, options, "read");
      return store.listApprovalRequestsForUser(access.owner);
    },

    createApprovalRequest(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const targetOwnerUserId = input.workspaceOwnerUserId || options.workspaceOwnerUserId || user.id;
      if (targetOwnerUserId === user.id) {
        this.requireFeature(user, "approvals", options);
        return store.createApprovalRequest({
          ...input,
          ownerUserId: user.id,
          requestedByUserId: user.id,
        });
      }
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: targetOwnerUserId,
      }, "approvals");
      return store.createApprovalRequest({
        ...input,
        ownerUserId: access.ownerUserId,
        requestedByUserId: user.id,
      });
    },

    decideApprovalRequest(user, approvalId, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const targetOwnerUserId = input.workspaceOwnerUserId || options.workspaceOwnerUserId || user.id;
      if (targetOwnerUserId === user.id) {
        this.requireFeature(user, "approvals", options);
        const request = store.decideApprovalRequest(approvalId, {
          ...input,
          approverUserId: user.id,
        }, user);
        if (!request) throw new Error("Approval request not found");
        return request;
      }
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: targetOwnerUserId,
      }, "approvals");
      const request = store.decideApprovalRequest(approvalId, {
        ...input,
        approverUserId: user.id,
      }, access.owner);
      if (!request) throw new Error("Approval request not found");
      return request;
    },

    recordApprovalNotification(user, approvalId, input = {}, options = {}) {
      const targetOwnerUserId = input.workspaceOwnerUserId || options.workspaceOwnerUserId || user?.id;
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: targetOwnerUserId,
      }, "read");
      const request = store.recordApprovalNotification(approvalId, input, access.owner);
      if (!request) throw new Error("Approval request not found");
      return request;
    },

    listApiKeys(user, options = {}) {
      const targetOwnerUserId = options.workspaceOwnerUserId || user?.id;
      if (targetOwnerUserId === user?.id) {
        this.requireFeature(user, "apiAccess", options);
        return store.listApiKeysForUser(user);
      }
      const access = this.requireBusinessWorkspaceAccess(user, options, "apiAccess");
      return store.listApiKeysForUser(access.owner);
    },

    createApiKey(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const targetOwnerUserId = input.workspaceOwnerUserId || options.workspaceOwnerUserId || user.id;
      if (targetOwnerUserId === user.id) {
        this.requireFeature(user, "apiAccess", options);
        return store.createApiKey({
          ...input,
          ownerUserId: user.id,
        });
      }
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: targetOwnerUserId,
      }, "apiAccess");
      return store.createApiKey({
        ...input,
        ownerUserId: access.ownerUserId,
      });
    },

    revokeApiKey(user, apiKeyId, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const targetOwnerUserId = options.workspaceOwnerUserId || user.id;
      if (targetOwnerUserId === user.id) {
        this.requireFeature(user, "apiAccess", options);
        const key = store.revokeApiKey(apiKeyId, user);
        if (!key) throw new Error("API key not found");
        return key;
      }
      const access = this.requireBusinessWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: targetOwnerUserId,
      }, "apiAccess");
      const key = store.revokeApiKey(apiKeyId, access.owner);
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

    getAiCommandContext(user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return {
        user: workspace.owner,
        actorUser: user,
        workspaceAccess: workspace.access,
        companies: this.listCompanies(user, options),
        customers: this.listCustomers(user, options),
        invoices: this.listInvoices(user, options),
        purchaseOrders: this.listPurchaseOrders(user, options),
        payments: this.listPayments(user, options),
      };
    },

    createApprovedAiDraft(user, input = {}, options = {}) {
      const approved = input.approvedDraft || {};
      const intent = String(approved.intent || "").trim();
      const payload = approved.payload || {};
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "writeRecords");
      if (intent === "invoice") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options)) {
          throw new Error("AI invoice assistant is available on Pro and Business plans.");
        }
        this.enforceAiQuota(user, options, true);
        const invoice = this.createInvoice({
          ...payload,
          ownerUserId: workspace.ownerUserId,
          status: "draft",
          paymentStatus: "draft",
        }, { ...options, user, workspaceOwnerUserId: workspace.ownerUserId });
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: this.getUserPlan(user, options).plan,
          provider: "approved",
          intent,
          status: "saved",
          command: input.command,
          billable: true,
        });
        return {
          intent,
          confidence: approved.confidence || "approved",
          message: "Approved AI invoice draft saved. Review it before creating the final invoice.",
          createdRecord: invoice,
          quota: this.getAiQuota(user, options),
        };
      }
      if (intent === "purchase_order") {
        if (!this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI PO and Work Order assistant is available on Pro and Business plans.");
        }
        this.enforceAiQuota(user, options, true);
        const purchaseOrder = this.createPurchaseOrder({
          ...payload,
          ownerUserId: workspace.ownerUserId,
          status: "draft",
        }, { ...options, user, workspaceOwnerUserId: workspace.ownerUserId });
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: this.getUserPlan(user, options).plan,
          provider: "approved",
          intent,
          status: "saved",
          command: input.command,
          billable: true,
        });
        return {
          intent,
          confidence: approved.confidence || "approved",
          message: "Approved AI PO/WO draft saved. Review it before creating the final document.",
          createdRecord: purchaseOrder,
          quota: this.getAiQuota(user, options),
        };
      }
      throw new Error("Approved AI draft is missing a valid invoice or PO payload.");
    },

    finalizeAiCommandResult(user, input = {}, options = {}, result, provider = "local") {
      const plan = this.getUserPlan(user, options);
      const shouldBill = input.approvedPreview !== true && input.approvedDraft === undefined;
      const withQuota = (payload) => ({ ...payload, quota: this.getAiQuota(user, options) });

      const shouldSaveDraft = input.saveDraft !== false && input.previewOnly !== true;
      if (result.intent === "clarification") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options) && !this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI assistant is available on Pro and Business plans.");
        }
        this.enforceAiQuota(user, options, shouldBill);
        store.createAiUsageLog({
          ownerUserId: user.id,
          plan: plan.plan,
          provider,
          intent: result.intent,
          status: "clarification",
          command: input.command,
          billable: shouldBill,
        });
        return withQuota({ ...result, provider });
      }
      if (result.intent === "invoice") {
        if (!this.userCanUseFeature(user, "aiInvoiceAssist", options)) {
          throw new Error("AI invoice assistant is available on Pro and Business plans.");
        }
        this.enforceAiQuota(user, options, shouldBill);
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
          return withQuota({
            ...result,
            provider,
            proposedRecord: {
              ...result.payload,
              ...(result.preview || {}),
            },
          });
        }
        const invoice = this.createInvoice(result.payload, options);
        return withQuota({
          ...result,
          provider,
          createdRecord: invoice,
        });
      }
      if (result.intent === "purchase_order") {
        if (!this.userCanUseFeature(user, "aiPoAssist", options)) {
          throw new Error("AI PO and Work Order assistant is available on Pro and Business plans.");
        }
        this.enforceAiQuota(user, options, shouldBill);
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
          return withQuota({
            ...result,
            provider,
            proposedRecord: {
              ...result.payload,
              ...(result.preview || {}),
            },
          });
        }
        const purchaseOrder = this.createPurchaseOrder(result.payload, options);
        return withQuota({
          ...result,
          provider,
          createdRecord: purchaseOrder,
        });
      }
      if (!this.userCanUseFeature(user, "advancedReports", options)) {
        throw new Error("AI report assistant is available on Pro and Business plans.");
      }
      this.enforceAiQuota(user, options, shouldBill);
      store.createAiUsageLog({
        ownerUserId: user.id,
        plan: plan.plan,
        provider,
        intent: result.intent,
        status: "report",
        command: input.command,
        billable: shouldBill,
      });
      return withQuota({ ...result, provider });
    },

    runAiCommand(user, input = {}, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      if (input.approvedDraft) return this.createApprovedAiDraft(user, input, options);
      const command = String(input.command || "").trim();
      if (!command) throw new Error("Enter a command for the AI assistant.");
      const context = this.getAiCommandContext(user, options);
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
      const context = this.getAiCommandContext(user, options);
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

    getAiUsageSummary(user, options = {}) {
      if (!user?.id) throw new Error("Authentication required");
      const period = normalizeUsageMonth(options.month);
      const allLogs = store.listAiUsageLogsForUser(user);
      const periodLogs = allLogs
        .filter((entry) => String(entry.createdAt || "").slice(0, 7) === period)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      return {
        period,
        reset: {
          cadence: "monthly",
          nextResetAt: nextMonthlyResetDate(period),
        },
        quota: this.getAiQuota(user, { ...options, month: period }),
        summary: summarizeAiLogs(periodLogs),
        history: periodLogs.slice(0, 50),
      };
    },

    getAdminAiUsageSummary(user, options = {}) {
      if (!user || user.role !== "admin") throw new Error("Forbidden");
      const period = normalizeUsageMonth(options.month);
      const periodLogs = store.listAiUsageLogsForUser(user)
        .filter((entry) => String(entry.createdAt || "").slice(0, 7) === period);
      const groups = {};
      periodLogs.forEach((entry) => {
        const ownerUserId = entry.ownerUserId || "unknown";
        if (!groups[ownerUserId]) {
          const owner = ownerUserId === "unknown" ? null : store.getUserById(ownerUserId);
          groups[ownerUserId] = {
            ownerUserId,
            name: owner?.name || "Unknown user",
            email: owner?.email || "",
            logs: [],
            latestAt: entry.createdAt || "",
          };
        }
        groups[ownerUserId].logs.push(entry);
        if (String(entry.createdAt || "") > String(groups[ownerUserId].latestAt || "")) {
          groups[ownerUserId].latestAt = entry.createdAt || "";
        }
      });
      return {
        period,
        reset: {
          cadence: "monthly",
          nextResetAt: nextMonthlyResetDate(period),
        },
        summary: summarizeAiLogs(periodLogs),
        users: Object.values(groups)
          .map((group) => ({
            ownerUserId: group.ownerUserId,
            name: group.name,
            email: group.email,
            latestAt: group.latestAt,
            summary: summarizeAiLogs(group.logs),
          }))
          .sort((a, b) => String(b.latestAt || "").localeCompare(String(a.latestAt || ""))),
      };
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

    getSubscription(id) {
      return store.getSubscription(id);
    },

    updateSubscription(id, updates = {}) {
      return store.updateSubscription(id, updates);
    },

    cancelSubscription(id, input = {}) {
      return store.cancelSubscription(id, input);
    },

    renewSubscription(id, input = {}) {
      return store.renewSubscription(id, input);
    },

    expireSubscriptions(now) {
      return store.expireSubscriptions(now);
    },

    listMonetization() {
      return store.listMonetization();
    },

    listReports(user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.listReportsForUser(workspace.owner);
    },

    summarizePostgresReports(user, filters = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, filters, "read");
      return summarizePostgresReports(workspace.owner, filters);
    },

    summarizeMonetization() {
      return store.summarizeMonetization();
    },

    listInvoices(user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.listInvoicesForUser(workspace.owner);
    },

    getInvoice(id, user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.getInvoice(id, workspace.owner);
    },
    updateInvoice(id, updates, options = {}) {
      const actor = options.user || (updates.actorUserId ? store.getUserById(updates.actorUserId) : null);
      const current = store.getInvoice(id);
      const workspace = this.resolveRecordsWorkspaceAccess(actor || (current?.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: updates.workspaceOwnerUserId || options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      const visible = store.getInvoice(id, workspace.owner);
      if (!visible) return null;
      return store.updateInvoice(id, updates, this.getUserPlanLimits(workspace.owner, options));
    },
    deleteInvoice(id, user, options = {}) {
      const current = store.getInvoice(id);
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      return store.deleteInvoice(id, workspace.owner);
    },
    recordInvoicePayment(id, input = {}, options = {}) {
      const current = store.getInvoice(id);
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || (current?.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      const visible = store.getInvoice(id, workspace.owner);
      if (!visible) return null;
      return store.recordInvoicePayment(id, input);
    },
    createInvoicePaymentLink(id, input = {}, options = {}) {
      const invoice = store.getInvoice(id);
      if (invoice && String(invoice.status || "").toLowerCase() === "created") {
        const workspace = this.resolveRecordsWorkspaceAccess(options.user || input.user || (invoice.ownerUserId ? store.getUserById(invoice.ownerUserId) : null), {
          ...options,
          workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || invoice.ownerUserId,
        }, "writeRecords");
        const visible = store.getInvoice(id, workspace.owner);
        if (!visible) return null;
        this.requireFeature(workspace.owner, "razorpayCollections", options);
      }
      return store.createInvoicePaymentLink(id, input);
    },
    recordGatewayPayment(input) {
      return store.recordGatewayPayment(input);
    },
    listPayments(user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.listPaymentsForUser(workspace.owner);
    },

    listPurchaseOrders(user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.listPurchaseOrdersForUser(workspace.owner);
    },

    getPurchaseOrder(id, user, options = {}) {
      const workspace = this.resolveRecordsWorkspaceAccess(user, options, "read");
      return store.getPurchaseOrder(id, workspace.owner);
    },
    updatePurchaseOrder(id, updates, options = {}) {
      const actor = options.user || (updates.actorUserId ? store.getUserById(updates.actorUserId) : null);
      const current = store.getPurchaseOrder(id);
      const workspace = this.resolveRecordsWorkspaceAccess(actor || (current?.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: updates.workspaceOwnerUserId || options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      const visible = store.getPurchaseOrder(id, workspace.owner);
      if (!visible) return null;
      return store.updatePurchaseOrder(id, updates, this.getUserPlanLimits(workspace.owner, options));
    },
    recordPurchaseOrderPayment(id, input = {}, options = {}) {
      const current = store.getPurchaseOrder(id);
      const workspace = this.resolveRecordsWorkspaceAccess(options.user || (current?.ownerUserId ? store.getUserById(current.ownerUserId) : null), {
        ...options,
        workspaceOwnerUserId: input.workspaceOwnerUserId || options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      const visible = store.getPurchaseOrder(id, workspace.owner);
      if (!visible) return null;
      return store.recordPurchaseOrderPayment(id, input);
    },
    deletePurchaseOrder(id, user, options = {}) {
      const current = store.getPurchaseOrder(id);
      const workspace = this.resolveRecordsWorkspaceAccess(user, {
        ...options,
        workspaceOwnerUserId: options.workspaceOwnerUserId || current?.ownerUserId,
      }, "writeRecords");
      return store.deletePurchaseOrder(id, workspace.owner);
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

    async getPersistenceStatus() {
      let postgres = {
        configured: hasPostgresConfig(),
        database: hasPostgresConfig() ? maskDatabaseUrl() : "",
        reachable: false,
        error: "",
      };
      if (hasPostgresConfig()) {
        try {
          postgres = {
            ...postgres,
            reachable: true,
            ...(await describePostgresState()),
          };
        } catch (error) {
          postgres = {
            ...postgres,
            error: error.message,
          };
        }
      }
      return {
        persistence: describePersistence(),
        postgres,
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
