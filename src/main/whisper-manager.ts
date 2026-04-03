import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const WHISPER_REPO_URL = "https://github.com/ggerganov/whisper.cpp.git";

// On Windows the built binary has a .exe extension
const BINARY_NAME =
  process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";

export interface WhisperStatus {
  installed: boolean;
  path?: string;
  version?: string;
}

export type WhisperInstallProgressCallback = (progress: {
  percent: number;
  status: string;
}) => void;

export class WhisperManager {
  private binDir: string;
  private buildDir: string;
  private onProgress: WhisperInstallProgressCallback | null = null;

  constructor() {
    this.binDir = path.join(app.getPath("userData"), "bin");
    this.buildDir = path.join(app.getPath("userData"), "whisper-build");
  }

  private getBinaryPath(): string {
    // 1. Check env var override (for dev)
    const envPath = process.env.WHISPER_BIN_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    // 2. Check packaged app resources
    if (app.isPackaged) {
      const resourcePath = path.join(
        process.resourcesPath,
        "bin",
        BINARY_NAME,
      );
      if (fs.existsSync(resourcePath)) {
        return resourcePath;
      }
    }

    // 3. Check user data directory
    return path.join(this.binDir, BINARY_NAME);
  }

  async getStatus(): Promise<WhisperStatus> {
    const binPath = this.getBinaryPath();

    if (!fs.existsSync(binPath)) {
      return { installed: false };
    }

    try {
      const { stdout } = await execFile(binPath, ["--version"], {
        timeout: 5000,
      });
      const version = stdout.trim();
      return { installed: true, path: binPath, version };
    } catch {
      // Binary exists but version check failed — still consider it installed
      return { installed: true, path: binPath };
    }
  }

  setProgressCallback(cb: WhisperInstallProgressCallback | null): void {
    this.onProgress = cb;
  }

  async install(): Promise<{ ok: boolean; error?: string }> {
    try {
      // Check prerequisites
      await this.checkPrerequisites();

      await fs.promises.mkdir(this.binDir, { recursive: true });
      await fs.promises.mkdir(this.buildDir, { recursive: true });

      const srcDir = path.join(this.buildDir, "whisper.cpp");

      // Clone or update repo
      if (fs.existsSync(path.join(srcDir, "CMakeLists.txt"))) {
        this.emitProgress(5, "Updating whisper.cpp source...");
        await execFile("git", ["pull", "--ff-only"], {
          cwd: srcDir,
          timeout: 60000,
        });
      } else {
        this.emitProgress(5, "Cloning whisper.cpp...");
        // Clean up any partial clone
        await fs.promises
          .rm(srcDir, { recursive: true, force: true })
          .catch(() => {});
        await execFile(
          "git",
          ["clone", "--depth", "1", WHISPER_REPO_URL, srcDir],
          { timeout: 120000 },
        );
      }

      this.emitProgress(30, "Configuring build with cmake...");

      const cmakeBuildDir = path.join(srcDir, "build");
      // Always start with a clean cmake build dir to avoid stale cache conflicts
      await fs.promises.rm(cmakeBuildDir, { recursive: true, force: true });
      await fs.promises.mkdir(cmakeBuildDir, { recursive: true });

      // Platform-conditional cmake flags:
      // - Metal acceleration is macOS-only; use CPU-only on Windows
      const cmakeConfigArgs = [
        "..",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DWHISPER_COREML=OFF",
        "-DBUILD_SHARED_LIBS=OFF",
      ];
      if (process.platform === "win32") {
        // Force x64 — ARM64 MSVC toolset is rarely available
        cmakeConfigArgs.push("-A", "x64");
      } else {
        cmakeConfigArgs.push("-DWHISPER_METAL=ON");
      }

      await execFile("cmake", cmakeConfigArgs, {
        cwd: cmakeBuildDir,
        timeout: 60000,
      });

      this.emitProgress(50, "Building whisper.cpp (this may take a few minutes)...");

      // Build with parallel jobs
      const cpuCount = (await import("node:os")).cpus().length;
      await execFile(
        "cmake",
        ["--build", ".", "--config", "Release", "-j", String(cpuCount)],
        {
          cwd: cmakeBuildDir,
          timeout: 600000, // 10 minutes
          maxBuffer: 50 * 1024 * 1024,
        },
      );

      this.emitProgress(90, "Installing binary...");

      // Find the built binary.
      // On Windows with MSVC the output lands in a Release/ subdirectory.
      const possiblePaths = [
        path.join(cmakeBuildDir, "bin", BINARY_NAME),
        path.join(cmakeBuildDir, BINARY_NAME),
        // Windows: MSVC multi-config generator puts output in Release/
        path.join(cmakeBuildDir, "bin", "Release", BINARY_NAME),
        path.join(cmakeBuildDir, "Release", BINARY_NAME),
        // Legacy whisper.cpp binary name (pre-rename)
        path.join(cmakeBuildDir, "bin", "main"),
        path.join(cmakeBuildDir, "main"),
      ];

      let builtBinary: string | null = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          builtBinary = p;
          break;
        }
      }

      if (!builtBinary) {
        // Fall back to recursive search
        builtBinary = await this.findBinary(cmakeBuildDir, BINARY_NAME);
        // On macOS also try the legacy 'main' binary name
        if (!builtBinary && process.platform !== "win32") {
          builtBinary = await this.findBinary(cmakeBuildDir, "main");
        }
      }

      if (!builtBinary) {
        throw new Error(
          "Build succeeded but could not find the whisper-cli binary",
        );
      }

      // Copy binary to bin directory
      const targetPath = path.join(this.binDir, BINARY_NAME);
      await fs.promises.copyFile(builtBinary, targetPath);

      // Set executable bit on Unix; not needed (or meaningful) on Windows
      if (process.platform !== "win32") {
        await fs.promises.chmod(targetPath, 0o755);
      }

      // Fix macOS dylib rpaths so the binary is self-contained.
      // otool / install_name_tool are macOS-only tools; skip on Windows.
      if (process.platform === "darwin") {
        this.emitProgress(90, "Fixing library paths...");
        await this.fixDylibs(cmakeBuildDir, targetPath);
      }

      this.emitProgress(95, "Cleaning up build files...");

      // Clean up build directory to save space
      await fs.promises
        .rm(this.buildDir, { recursive: true, force: true })
        .catch(() => {});

      this.emitProgress(100, "Installed successfully");
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    }
  }

  private async checkPrerequisites(): Promise<void> {
    this.emitProgress(0, "Checking prerequisites...");

    try {
      await execFile("git", ["--version"], { timeout: 5000 });
    } catch {
      const msg =
        process.platform === "win32"
          ? "git is required to install whisper.cpp. Install Git for Windows from https://git-scm.com"
          : "git is required to install whisper.cpp. Please install Xcode Command Line Tools: xcode-select --install";
      throw new Error(msg);
    }

    try {
      await execFile("cmake", ["--version"], { timeout: 5000 });
    } catch {
      const msg =
        process.platform === "win32"
          ? "cmake is required to build whisper.cpp. Install Visual Studio Build Tools (includes cmake) from https://visualstudio.microsoft.com/visual-cpp-build-tools"
          : "cmake is required to build whisper.cpp. Install it via: brew install cmake";
      throw new Error(msg);
    }
  }

  private async fixDylibs(
    buildDir: string,
    binaryPath: string,
  ): Promise<void> {
    try {
      // Check what dylibs the binary needs
      const { stdout } = await execFile("otool", ["-L", binaryPath], {
        timeout: 5000,
      });

      const lines = stdout.split("\n");
      for (const line of lines) {
        const match = line.match(/\s+(@rpath\/\S+)/);
        if (!match) continue;

        const rpathRef = match[1]; // e.g. @rpath/libwhisper.1.dylib
        const libName = path.basename(rpathRef);

        // Find this lib in the build directory
        const libPath = await this.findFile(buildDir, libName);
        if (libPath) {
          // Copy lib next to binary
          const destLib = path.join(this.binDir, libName);
          await fs.promises.copyFile(libPath, destLib);
          await fs.promises.chmod(destLib, 0o755);

          // Update the binary to look for the lib next to itself
          await execFile(
            "install_name_tool",
            [
              "-change",
              rpathRef,
              `@executable_path/${libName}`,
              binaryPath,
            ],
            { timeout: 5000 },
          );

          // Also fix any dylib cross-references
          const { stdout: libOtool } = await execFile(
            "otool",
            ["-L", destLib],
            { timeout: 5000 },
          );
          for (const libLine of libOtool.split("\n")) {
            const libMatch = libLine.match(/\s+(@rpath\/\S+)/);
            if (!libMatch) continue;
            const depRef = libMatch[1];
            const depName = path.basename(depRef);

            if (depName === libName) {
              // Fix the lib's own install name
              await execFile(
                "install_name_tool",
                ["-id", `@executable_path/${depName}`, destLib],
                { timeout: 5000 },
              );
            } else {
              // Find and copy the dependency too
              const depPath = await this.findFile(buildDir, depName);
              if (depPath) {
                const destDep = path.join(this.binDir, depName);
                if (!fs.existsSync(destDep)) {
                  await fs.promises.copyFile(depPath, destDep);
                  await fs.promises.chmod(destDep, 0o755);
                }
                await execFile(
                  "install_name_tool",
                  [
                    "-change",
                    depRef,
                    `@executable_path/${depName}`,
                    destLib,
                  ],
                  { timeout: 5000 },
                );
              }
            }
          }
        }
      }
    } catch (err) {
      // If fixing dylibs fails, the binary might still work (static build)
      console.warn("Warning: could not fix dylib paths:", err);
    }
  }

  private async findFile(
    dir: string,
    name: string,
  ): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const found = await this.findFile(fullPath, name);
        if (found) return found;
      }
    }
    return null;
  }

  private async findBinary(
    dir: string,
    name: string,
  ): Promise<string | null> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === name) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const found = await this.findBinary(fullPath, name);
        if (found) return found;
      }
    }
    return null;
  }

  private emitProgress(percent: number, status: string): void {
    this.onProgress?.({ percent, status });
  }

  getWhisperPath(): string {
    return this.getBinaryPath();
  }
}
