// ============================================================
// Upload guard — one denylist for every place a file can enter
// Orleia (Noor attachments, editor images).
//
// Orleia is local-first: attachments never leave the device, so
// there is no server to attack. The threats are (1) prompt
// injection via server-script code read as text into Noor's
// context, and (2) workspace storage abuse. These formats are
// never legitimately needed, so they are blocked outright.
// ============================================================

const BLOCKED_EXTENSIONS =
  /\.(php|php3|php4|php5|php7|php8|phtml|jsp|jspx|jspf|jsw|jsv|war|asp|aspx|asax|ascx|cfm|shtml|shtm|exe|msi|bat|cmd|com|scr|ps1|psm1|sh|bash|zsh|dll|jar|vbs|wsf|wsf|hta|cpl|scf|lnk|reg|iso|dmg|deb|rpm|apk|appimage)$/i;

const BLOCKED_MIMES = [
  "application/x-httpd-php",
  "application/x-php",
  "text/x-php",
  "application/x-jsp",
  "application/x-jsp",
  "text/x-jsp",
  "application/x-asp",
  "text/asp",
  "application/x-msdownload",
  "application/x-msi",
  "application/x-bat",
  "application/x-sh",
  "application/x-shellscript",
  "application/x-msdos-program",
  "application/java-archive",
];

export function isBlockedUpload(file: { name: string; type?: string }): boolean {
  const name = (file.name || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  return (
    BLOCKED_EXTENSIONS.test(name) ||
    BLOCKED_MIMES.some((m) => mime === m)
  );
}

export function blockedUploadReason(file: { name: string }): string {
  return `• ${file.name}: script and executable files (.php/.jsp/.exe/…) are not allowed`;
}
