import net from "node:net";
import tls from "node:tls";

function sanitizeLine(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}

function formatAddress(email, name = "") {
  const cleanEmail = sanitizeLine(email);
  const cleanName = sanitizeLine(name);
  return cleanName ? `"${cleanName.replace(/"/g, "'")}" <${cleanEmail}>` : cleanEmail;
}

function waitForSocket(socket, event, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    socket.once(event, onEvent);
    socket.once("error", onError);
  });
}

function readResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("SMTP connection timed out."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve({
          code: Number(last.slice(0, 3)),
          message: lines.join("\n"),
        });
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

function expectResponse(response, expectedCodes, action) {
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP server rejected ${action}: ${response.message}`);
  }
}

async function runCommand(socket, command, expectedCodes, action, timeoutMs) {
  socket.write(`${command}\r\n`);
  const response = await readResponse(socket, timeoutMs);
  expectResponse(response, expectedCodes, action);
  return response;
}

async function connectPlain(host, port, timeoutMs) {
  const socket = net.connect({ host, port });
  socket.setTimeout(timeoutMs);
  await waitForSocket(socket, "connect", timeoutMs, "SMTP connection timed out.");
  return socket;
}

async function connectSecure(host, port, timeoutMs, existingSocket = null) {
  const socket = tls.connect({
    host: existingSocket ? undefined : host,
    port: existingSocket ? undefined : port,
    servername: host,
    socket: existingSocket || undefined,
  });
  socket.setTimeout(timeoutMs);
  await waitForSocket(socket, "secureConnect", timeoutMs, "SMTP TLS connection timed out.");
  return socket;
}

function buildMessage(settings, message) {
  const from = formatAddress(settings.fromEmail, settings.senderName);
  const to = sanitizeLine(message.to);
  const subject = sanitizeLine(message.subject || "EazInvoice email");
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (settings.replyToEmail) headers.push(`Reply-To: ${sanitizeLine(settings.replyToEmail)}`);
  const body = String(message.text || "").replace(/\r?\n\./g, "\r\n..");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export async function sendSmtpMail(settings = {}, message = {}, options = {}) {
  const host = sanitizeLine(settings.smtpHost);
  const port = Number(settings.smtpPort || 0);
  const user = sanitizeLine(settings.smtpUser);
  const pass = String(settings.smtpPass || "");
  const fromEmail = sanitizeLine(settings.fromEmail);
  const to = sanitizeLine(message.to);
  const timeoutMs = Number(options.timeoutMs || 10000);
  if (!host) throw new Error("SMTP host is required.");
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("SMTP port is invalid.");
  if (!user) throw new Error("SMTP user is required.");
  if (!pass) throw new Error("SMTP password is required to send a test email.");
  if (!fromEmail) throw new Error("From email is required.");
  if (!to) throw new Error("Recipient email is required.");

  let socket = null;
  try {
    socket = settings.smtpSecure
      ? await connectSecure(host, port, timeoutMs)
      : await connectPlain(host, port, timeoutMs);
    expectResponse(await readResponse(socket, timeoutMs), [220], "server greeting");
    await runCommand(socket, `EHLO ${sanitizeLine(options.heloName || "eazinvoice.local")}`, [250], "EHLO", timeoutMs);

    if (!settings.smtpSecure && [25, 587].includes(port)) {
      await runCommand(socket, "STARTTLS", [220], "STARTTLS", timeoutMs);
      socket = await connectSecure(host, port, timeoutMs, socket);
      await runCommand(socket, `EHLO ${sanitizeLine(options.heloName || "eazinvoice.local")}`, [250], "EHLO after STARTTLS", timeoutMs);
    }

    await runCommand(socket, "AUTH LOGIN", [334], "AUTH LOGIN", timeoutMs);
    await runCommand(socket, Buffer.from(user).toString("base64"), [334], "SMTP username", timeoutMs);
    await runCommand(socket, Buffer.from(pass).toString("base64"), [235], "SMTP password", timeoutMs);
    await runCommand(socket, `MAIL FROM:<${fromEmail}>`, [250], "sender address", timeoutMs);
    await runCommand(socket, `RCPT TO:<${to}>`, [250, 251], "recipient address", timeoutMs);
    await runCommand(socket, "DATA", [354], "message body", timeoutMs);
    socket.write(`${buildMessage(settings, message)}\r\n.\r\n`);
    expectResponse(await readResponse(socket, timeoutMs), [250], "message delivery");
    socket.write("QUIT\r\n");
    return { ok: true, accepted: [to] };
  } finally {
    if (socket) socket.destroy();
  }
}
