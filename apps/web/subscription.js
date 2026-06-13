import { apiClient, requireSession } from "./common.js?v=20260601-session";

const form = document.getElementById("subscriptionForm");
const status = document.getElementById("subscriptionStatus");
const sessionContext = await requireSession();
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");
document.getElementById("protectedContent")?.removeAttribute("hidden");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const entityType = data.get("entityType");
    const aadhaarNumber = String(data.get("aadhaarNumber") || "").replace(/\D/g, "");
    const hasAadhaar = aadhaarNumber.length >= 4;
    const fileEntries = await Promise.all(["panDocument", "aadhaarDocument", "gstDocument"].map(async (field) => {
      const file = data.get(field);
      if (!file || typeof file === "string") return null;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
        reader.readAsDataURL(file);
      });
      return {
        fileName: file.name,
        mimeType: file.type,
        dataUrl,
      };
    }));
    const uploaded = fileEntries.filter(Boolean).length
      ? await apiClient.uploadDocuments(token, fileEntries.filter(Boolean))
      : { files: [] };
    await apiClient.createCompany(token, {
      ownerUserId: null,
      name: data.get("entityName"),
      legalName: data.get("entityName"),
      entityType,
      address: data.get("address"),
      gstNumber: data.get("gstNumber"),
      panNumber: data.get("panNumber"),
      addressProof: data.get("addressProof"),
      documentNames: uploaded.files.map((file) => file.storedName),
      documentFiles: uploaded.files,
      logoUrl: data.get("logoUrl"),
      kycStatus: "pending",
      kycMode: "document-review",
      aadhaarLast4: hasAadhaar ? aadhaarNumber.slice(-4) : "",
    });
    window.location.href = "/apps/web/dashboard.html";
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});
