import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { appError } from "../errors.js";

const execFile = promisify(execFileCallback);
const SCRIPT = 'POSIX path of (choose folder with prompt "选择代码工程")';

export interface DirectoryPicker {
  select(): Promise<string | null>;
}

type Executor = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export class MacDirectoryPicker implements DirectoryPicker {
  constructor(private readonly execute: Executor = execFile) {}

  async select(): Promise<string | null> {
    try {
      const { stdout } = await this.execute("/usr/bin/osascript", ["-e", SCRIPT]);
      return stdout.trim();
    } catch (error) {
      if (error instanceof Error && error.message.includes("-128")) {
        return null;
      }
      throw appError("DIRECTORY_PICKER_FAILED");
    }
  }
}
