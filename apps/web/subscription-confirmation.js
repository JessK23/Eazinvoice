import { requireSession } from "./common.js?v=20260601-session";

const sessionContext = await requireSession();
if (sessionContext) document.getElementById("protectedContent")?.removeAttribute("hidden");
