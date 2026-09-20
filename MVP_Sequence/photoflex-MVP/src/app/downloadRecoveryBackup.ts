/** Emergency export only when a failed write leaves a draft open. */
export function downloadRecoveryBackup(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "PhotoFlex recovery.photoflex.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
