import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  findProtectedDirectoryCandidate,
  isInsideMacosProtectedFolder,
  preflightMacosProtectedDirectoryAccess,
} from "../protected-folder-preflight.mjs";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

test("Electron package metadata declares macOS protected-folder usage descriptions", () => {
  const extendInfo = packageJson.build?.mac?.extendInfo;

  assert.equal(
    extendInfo?.NSDocumentsFolderUsageDescription,
    "DevRyan needs access to work with your projects.",
  );
  assert.equal(
    extendInfo?.NSDesktopFolderUsageDescription,
    "DevRyan needs access to work with your projects.",
  );
  assert.equal(
    extendInfo?.NSDownloadsFolderUsageDescription,
    "DevRyan needs access to work with your projects.",
  );
  assert.equal(
    extendInfo?.NSAppleEventsUsageDescription,
    "DevRyan needs to run the OpenCode CLI to provide AI coding assistance.",
  );
});

test("protected-folder preflight prefers lastDirectory over active and first project", () => {
  const settings = {
    lastDirectory: "/Users/test/Documents/Current",
    activeProjectId: "active",
    projects: [
      { id: "first", path: "/Users/test/Documents/First" },
      { id: "active", path: "/Users/test/Documents/Active" },
    ],
  };

  assert.equal(
    findProtectedDirectoryCandidate(settings, "/Users/test"),
    "/Users/test/Documents/Current",
  );
});

test("protected-folder preflight falls back to active project then first project", () => {
  assert.equal(
    findProtectedDirectoryCandidate(
      {
        activeProjectId: "active",
        projects: [
          { id: "first", path: "/Users/test/Documents/First" },
          { id: "active", path: "/Users/test/Documents/Active" },
        ],
      },
      "/Users/test",
    ),
    "/Users/test/Documents/Active",
  );

  assert.equal(
    findProtectedDirectoryCandidate(
      {
        projects: [
          { id: "first", path: "/Users/test/Documents/First" },
        ],
      },
      "/Users/test",
    ),
    "/Users/test/Documents/First",
  );
});

test("protected-folder detection only matches descendants of macOS protected folders", () => {
  assert.equal(isInsideMacosProtectedFolder("/Users/test/Documents/App", "/Users/test"), true);
  assert.equal(isInsideMacosProtectedFolder("/Users/test/Desktop/App", "/Users/test"), true);
  assert.equal(isInsideMacosProtectedFolder("/Users/test/Downloads/App", "/Users/test"), true);
  assert.equal(isInsideMacosProtectedFolder("/Users/test/DocumentsSibling/App", "/Users/test"), false);
  assert.equal(isInsideMacosProtectedFolder("/Users/test/Code/App", "/Users/test"), false);
});

test("macOS preflight stats protected candidate once", async () => {
  const calls = [];
  const result = await preflightMacosProtectedDirectoryAccess({
    platform: "darwin",
    homeDirectory: "/Users/test",
    settings: { lastDirectory: "/Users/test/Documents/App" },
    fsPromises: {
      stat: async (candidate) => {
        calls.push(candidate);
        return { isDirectory: () => true };
      },
    },
    log: { info() {}, warn() {} },
  });

  assert.deepEqual(calls, ["/Users/test/Documents/App"]);
  assert.equal(result.status, "granted");
});

test("macOS preflight reports denied protected-folder access without throwing", async () => {
  const result = await preflightMacosProtectedDirectoryAccess({
    platform: "darwin",
    homeDirectory: "/Users/test",
    settings: { lastDirectory: "/Users/test/Documents/App" },
    fsPromises: {
      stat: async () => {
        const error = new Error("operation not permitted");
        error.code = "EPERM";
        throw error;
      },
    },
    log: { info() {}, warn() {} },
  });

  assert.equal(result.status, "denied");
  assert.equal(result.path, "/Users/test/Documents/App");
});
