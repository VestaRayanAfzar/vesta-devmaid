import { execSync } from "child_process";

export function genIndex(path: string) {
  try {
    execSync("npx barrelsby  --delete", { stdio: "inherit", cwd: path });
  } catch (e) {
    //
  }
}
