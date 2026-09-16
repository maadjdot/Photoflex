type FilePicker = () => Promise<readonly File[]>;

export function hasNativeDirectoryPicker(): boolean {
  return typeof (globalThis as typeof globalThis & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";
}

interface DirectoryNode {
  readonly directories: Map<string, DirectoryNode>;
  readonly files: Map<string, File>;
}

const node = (): DirectoryNode => ({ directories: new Map(), files: new Map() });

/** A webkitdirectory selection provides File objects, not persistent handles. */
export async function pickWebkitDirectory(filePicker: FilePicker = selectDirectoryFiles): Promise<FileSystemDirectoryHandle> {
  const files = await filePicker();
  const firstPath = files[0]?.webkitRelativePath;
  if (!firstPath?.includes("/")) throw new DOMException("No folder selected", "AbortError");
  const rootName = firstPath.split("/")[0];
  const root = node();
  const signatures: string[] = [];
  for (const file of files) {
    const parts = file.webkitRelativePath.split("/");
    if (parts.shift() !== rootName || !parts.length) continue;
    let current = root;
    for (const part of parts.slice(0, -1)) {
      let child = current.directories.get(part);
      if (!child) { child = node(); current.directories.set(part, child); }
      current = child;
    }
    current.files.set(parts.at(-1)!, file);
    signatures.push(`${parts.join("/")}:${file.size}:${file.lastModified}`);
  }
  if (!signatures.length) throw new DOMException("No folder selected", "AbortError");
  let fingerprint = 2166136261;
  for (const signature of signatures.sort()) {
    for (let index = 0; index < signature.length; index++) fingerprint = Math.imul(fingerprint ^ signature.charCodeAt(index), 16777619);
  }
  const rootIdentity = `${rootName}:${signatures.length}:${(fingerprint >>> 0).toString(16)}`;
  return directoryHandle(rootName, root, rootIdentity);
}

function directoryHandle(name: string, contents: DirectoryNode, identity: string): FileSystemDirectoryHandle {
  const fileHandle = (fileName: string, file: File): FileSystemFileHandle => ({
    kind: "file",
    name: fileName,
    identity: `${identity}/${fileName}`,
    async isSameEntry(other: FileSystemHandle) { return (other as FileSystemHandle & { identity?: string }).identity === `${identity}/${fileName}`; },
    async getFile() { return file; },
  } as unknown as FileSystemFileHandle);
  return {
    kind: "directory",
    name,
    identity,
    async isSameEntry(other: FileSystemHandle) { return (other as FileSystemHandle & { identity?: string }).identity === identity; },
    async queryPermission() { return "granted" as PermissionState; },
    async requestPermission() { return "granted" as PermissionState; },
    async *entries() {
      for (const [childName, child] of contents.directories) yield [childName, directoryHandle(childName, child, `${identity}/${childName}`)] as [string, FileSystemDirectoryHandle];
      for (const [fileName, file] of contents.files) yield [fileName, fileHandle(fileName, file)] as [string, FileSystemFileHandle];
    },
    async getDirectoryHandle(childName: string) {
      const child = contents.directories.get(childName);
      if (!child) throw new DOMException("Directory not found", "NotFoundError");
      return directoryHandle(childName, child, `${identity}/${childName}`);
    },
    async getFileHandle(fileName: string) {
      const file = contents.files.get(fileName);
      if (!file) throw new DOMException("File not found", "NotFoundError");
      return fileHandle(fileName, file);
    },
  } as unknown as FileSystemDirectoryHandle;
}

function selectDirectoryFiles(): Promise<readonly File[]> {
  if (typeof document === "undefined") return Promise.reject(new Error("Folder selection unavailable"));
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.setAttribute("webkitdirectory", "");
    input.style.display = "none";
    const finish = (files?: readonly File[]) => {
      window.removeEventListener("focus", onFocus);
      input.remove();
      if (files?.length) resolve(files);
      else reject(new DOMException("Folder selection cancelled", "AbortError"));
    };
    const onFocus = () => { window.setTimeout(() => { if (input.isConnected) finish(); }, 1000); };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish(), { once: true });
    window.addEventListener("focus", onFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}
