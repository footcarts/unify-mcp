import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { TOKEN_CACHE_DIR } from "../config.js";

const credentialsSchema = z.object({
  email: z.string(),
  password: z.string(),
});

export type Credentials = z.infer<typeof credentialsSchema>;

const FILE = "credentials.json";

const dir = () => join(homedir(), TOKEN_CACHE_DIR);
const file = () => join(dir(), FILE);

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const raw = await readFile(file(), "utf8");
    const parsed = credentialsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveCredentials(c: Credentials): Promise<void> {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(file(), JSON.stringify(c, null, 2), { mode: 0o600 });
}

export async function clearCredentials(): Promise<void> {
  try {
    await unlink(file());
  } catch {
    // ignore
  }
}
