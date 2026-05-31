import { getPreferenceValues } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface Preferences {
  ftBinary?: string;
}

export async function runFt(args: string[]): Promise<string> {
  const prefs = getPreferenceValues<Preferences>();
  const binary = prefs.ftBinary || "ft";
  const { stdout } = await execFileAsync(binary, args, {
    env: { ...process.env, NO_COLOR: "1" },
    maxBuffer: 1024 * 1024 * 8,
  });
  return stdout;
}
