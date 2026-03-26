import { spawn } from "node:child_process";

export type CommandOptions = {
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
};

export async function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 10000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: {
        ...process.env,
        ...options.env
      }
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timeout (${timeoutMs}ms): ${command} ${args.join(" ")}`));
    }, timeoutMs);

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Command spawn failed: ${command} (${error.message})`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const details = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`Command failed: ${command} ${args.join(" ")} | ${details}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

