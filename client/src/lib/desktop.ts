export function isDesktopApp() {
  return typeof window !== "undefined" && Boolean(window.electronAPI?.isDesktop);
}

export async function openExternalUrl(url: string) {
  if (window.electronAPI?.openExternal) {
    await window.electronAPI.openExternal(url);
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function savePdfFromApi(url: string, defaultName: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not prepare the PDF download.");
  }

  if (window.electronAPI?.savePdfDialog && window.electronAPI?.writePdf) {
    const filePath = await window.electronAPI.savePdfDialog(defaultName);
    if (!filePath) {
      return { saved: false, canceled: true };
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";

    for (let index = 0; index < bytes.length; index += 0x8000) {
      const chunk = bytes.subarray(index, index + 0x8000);
      binary += Array.from(chunk, (byte) => String.fromCharCode(byte)).join("");
    }

    await window.electronAPI.writePdf(filePath, btoa(binary));
    return { saved: true, canceled: false };
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = defaultName;
  link.click();
  window.URL.revokeObjectURL(objectUrl);

  return { saved: true, canceled: false };
}
