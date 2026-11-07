// Vitest global setup for integration tests: starts a throwaway PocketBase
// instance (free port, temporary data dir, test superuser) with this
// project's pb_hooks/ and pb_migrations/, and stops it afterwards.
import { randomBytes } from "node:crypto";
import type { TestProject } from "vitest/node";
import { startPocketBase } from "./pocketbase-process.js";

export interface PocketBaseTestInstance {
  url: string;
  superuser: { email: string; password: string };
}

declare module "vitest" {
  export interface ProvidedContext {
    pocketbase: PocketBaseTestInstance;
  }
}

export default async function setup(project: TestProject) {
  const superuser = {
    email: "superuser@diane.test",
    password: randomBytes(16).toString("hex"),
  };
  const pocketbase = await startPocketBase({ superuser });

  project.provide("pocketbase", { url: pocketbase.url, superuser });
  return pocketbase.stop;
}
