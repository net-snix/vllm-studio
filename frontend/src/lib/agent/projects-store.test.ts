import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { addProjectToStore, listProjectsFromStore, removeProjectFromStore } from "./projects-store";

const originalProjectsFile = process.env.VLLM_STUDIO_PROJECTS_FILE;
const tempRoots: string[] = [];

function setupStore(): { root: string; file: string } {
  const root = mkdtempSync(path.join(tmpdir(), "vllm-projects-"));
  const file = path.join(root, "projects.json");
  tempRoots.push(root);
  process.env.VLLM_STUDIO_PROJECTS_FILE = file;
  return { root, file };
}

function restoreProjectsFile(): void {
  if (originalProjectsFile === undefined) {
    delete process.env.VLLM_STUDIO_PROJECTS_FILE;
    return;
  }
  process.env.VLLM_STUDIO_PROJECTS_FILE = originalProjectsFile;
}

afterEach(() => {
  restoreProjectsFile();
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop()!, { force: true, recursive: true });
  }
});

test("listProjectsFromStore hides persisted projects that duplicate the built-in Chats folder", () => {
  const { file } = setupStore();
  const chatsPath = path.join(process.env.HOME ?? "", ".vllm-studio");
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        projects: [
          {
            id: "proj-duplicate-chats",
            name: ".vllm-studio",
            path: chatsPath,
            addedAt: "2026-05-31T20:17:28.920Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const projects = listProjectsFromStore();

  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.id, "chats");
  assert.equal(projects[0]?.path, chatsPath);
});

test("addProjectToStore returns the built-in Chats project instead of storing a duplicate", () => {
  setupStore();
  const chatsPath = path.join(process.env.HOME ?? "", ".vllm-studio");

  const project = addProjectToStore(`${chatsPath}/`);
  const projects = listProjectsFromStore();

  assert.equal(project.id, "chats");
  assert.equal(project.path, chatsPath);
  assert.equal(projects.length, 1);
  assert.equal(projects[0]?.id, "chats");
});

test("removeProjectFromStore keeps the built-in Chats project", () => {
  setupStore();

  removeProjectFromStore("chats");

  assert.equal(listProjectsFromStore()[0]?.id, "chats");
});
