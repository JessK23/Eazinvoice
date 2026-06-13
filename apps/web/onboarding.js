window.location.replace("/apps/web/access.html");

/*
import { apiClient, requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
const token = sessionContext?.token;
if (!token) throw new Error("Authentication required");

const app = document.getElementById("onboardingApp");
const stepNumber = document.getElementById("stepNumber");
const stepTitle = document.getElementById("stepTitle");
const stepIntro = document.getElementById("stepIntro");
const startSetup = document.getElementById("startSetup");
const skipProfile = document.getElementById("skipProfile");
const form = document.getElementById("businessProfileForm");
const status = document.getElementById("onboardingStatus");

const stepCopy = {
  1: {
    title: "Welcome to Eazinvoice",
    intro: "Set up your business once so invoices, GST details, and payment instructions are ready when you start billing.",
  },
  2: {
    title: "Create your business profile",
    intro: "These details appear on invoices and can be completed further when you move to a paid plan.",
  },
  3: {
    title: "Your dashboard is ready",
    intro: "Use quick actions to create invoices, add customers, and keep your billing moving.",
  },
};

function showStep(step) {
  document.querySelectorAll(".onboarding-step").forEach((section) => {
    section.hidden = section.dataset.step !== String(step);
  });
  if (stepNumber) stepNumber.textContent = String(step);
  if (stepTitle) stepTitle.textContent = stepCopy[step].title;
  if (stepIntro) stepIntro.textContent = stepCopy[step].intro;
}

startSetup?.addEventListener("click", () => showStep(2));
skipProfile?.addEventListener("click", () => showStep(3));

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  try {
    const profile = await apiClient.createCompany(token, {
      profilePurpose: "onboarding",
      name: data.get("name"),
      logoUrl: data.get("logoUrl"),
      businessType: data.get("businessType"),
      entityType: data.get("entityType"),
      gstRegistered: data.get("gstRegistered") === "on",
      gstNumber: data.get("gstNumber"),
      panNumber: data.get("panNumber"),
      phone: data.get("phone"),
      email: data.get("email"),
      state: data.get("state"),
      pincode: data.get("pincode"),
      upiId: data.get("upiId"),
      address: data.get("address"),
      bankDetails: data.get("bankDetails"),
    });
    if (status) status.textContent = `Saved ${profile.name}.`;
    showStep(3);
  } catch (error) {
    if (status) status.textContent = error.message;
  }
});

app?.removeAttribute("hidden");
showStep(1);
*/
