import { describe, expect, it, mock } from "bun:test";
import { getShutdownHostCommand, scheduleHostShutdown } from "./host-shutdown";

describe("host shutdown", () => {
  it("schedules passwordless sudo shutdown detached", () => {
    const unref = mock(() => undefined);
    const sudoProbe = mock(() => ({ status: 0, stderr: "" }));
    const spawnDetached = mock(() => ({ unref }));

    const result = scheduleHostShutdown({ sudoProbe, spawnDetached });

    expect(result).toEqual({
      success: true,
      command: ["sudo", "-n", "shutdown", "-P", "now"],
    });
    expect(sudoProbe).toHaveBeenCalledWith("sudo", ["-n", "true"], {
      timeout: 1_000,
      env: process.env,
    });
    expect(spawnDetached).toHaveBeenCalledWith(
      "sudo",
      ["-n", "shutdown", "-P", "now"],
      { detached: true, stdio: "ignore", env: process.env },
    );
    expect(unref).toHaveBeenCalled();
  });

  it("does not schedule shutdown when sudo needs a password", () => {
    const sudoProbe = mock(() => ({
      status: 1,
      stderr: "sudo: a password is required",
    }));
    const spawnDetached = mock(() => ({ unref: mock(() => undefined) }));

    const result = scheduleHostShutdown({ sudoProbe, spawnDetached });

    expect(result).toEqual({
      success: false,
      error: "sudo: a password is required",
    });
    expect(spawnDetached).not.toHaveBeenCalled();
  });

  it("exposes the exact dashboard shutdown command", () => {
    expect(getShutdownHostCommand()).toEqual([
      "sudo",
      "-n",
      "shutdown",
      "-P",
      "now",
    ]);
  });
});
