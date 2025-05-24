#! /usr/bin/env bun
import { LinearClient } from "@linear/sdk";
import { IssueCreateInput } from "@linear/sdk/dist/_generated_documents";
import { $ } from "bun";
import { parseArgs } from "util";

interface Config {
  api_key: string;
  teamid: string;
  update_state_id: string;
}
interface State {
  parentid: string;
  issues: {
    id: string;
    title: string;
  }[];
}

async function main() {
  // TODO zod typechecking
  const [config, initial] = await getConfig();
  if (initial) {
    console.log(
      "Make sure you add `.todo.state.json` to your global gitignore!",
    );
    console.log("Run again to process TODOs");
    return;
  }

  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      "dry-run": {
        type: "boolean",
      },
    },
    strict: true,
    allowPositionals: true,
  });
  if (values["dry-run"]) {
    const todos = await getTodos();
    todos.forEach((t) => console.log(t));
    return;
  }

  const linearClient = new LinearClient({
    apiKey: config.api_key,
  });

  const me = await linearClient.viewer;

  const cwd = await getCurrentDir();
  const todos = await getTodos();
  const state = await getTodoState();

  // Create parent issue if it doesnt exist
  let parentId = state?.parentid;
  if (!parentId) {
    const res = await linearClient.createIssue({
      teamId: config.teamid,
      title: cwd,
      assigneeId: me.id,
    });
    parentId = res.issueId;
  }
  if (!parentId) throw "no parent id found, how did you get here";

  const overlap = [] as Array<string>;
  const existingTitles = state?.issues.map((i) => i.title) ?? [];
  const existingIds = state?.issues.map((i) => i.id) ?? [];
  const old_issues: State["issues"] = [];
  const issues = todos
    .filter((l) => {
      const [, , ...title] = l.split(":");
      const fulltitle = title.reduce((t, n) => t + n, "");
      if (fulltitle.trim().length == 0) return false;
      return true;
    })
    .map((l) => {
      const [file, lineno, ...title] = l.split(":");
      const folder = file.split("/")[0];
      const fulltitle = (
        folder +
        " - " +
        title.reduce((t, n) => t + n, "").trim()
      ).trim();
      const index = existingTitles.findIndex((i) => i == fulltitle);
      if (index != -1) {
        overlap.push(existingIds[index]);
        old_issues.push({ title: fulltitle, id: existingIds[index] });
        return null;
      }
      return {
        teamId: config.teamid,
        title: fulltitle,
        description: `${file} line ${lineno}`,
        assigneeId: me.id,
        parentId: parentId,
      } as IssueCreateInput;
    })
    .filter((l) => !!l);

  const needs_updated = existingIds.filter((i) => !overlap.includes(i));
  if (needs_updated.length) {
    await linearClient.updateIssueBatch(needs_updated, {
      stateId: config.update_state_id,
    });
    console.log(`Updated status for ${needs_updated}`);
  }
  let created_issues = [] as State["issues"];
  if (issues.length != 0) {
    const bres = await linearClient.createIssueBatch({
      issues,
    });
    created_issues = bres.issues.map((i) => ({ id: i.id, title: i.title }));
  }
  await updateState({
    parentid: parentId,
    issues: [...created_issues, ...old_issues],
  });
  console.log("TODOS updated and saved to .todo.state.json");
  return;
}

async function updateState(state: State) {
  const file = Bun.file(`${await getGitDir()}/.todo.state.json`);
  await file.write(JSON.stringify(state, null, 2));
}

async function getTodos() {
  try {
    const todos = (
      await $`rg "\/\/\s*TODO(.)*(\n[\t ]*\/\/.*)*" --trim -U -n | sed s/TODO//g | sed s/\\/\\///g`
        .nothrow()
        .text()
    )
      .trim()
      .split("\n")
      .filter((l) => l.trim().split(":")[2].length != 0);
    return todos;
  } catch (e) {
    throw "failed getting todos";
  }
}

async function getGitDir() {
  try {
    return (await $`git rev-parse --show-toplevel`.text()).trim();
  } catch (e) {
    throw "not a current git directory";
  }
}

async function getCurrentDir() {
  try {
    const pwd = await getGitDir();
    return pwd.split("/").pop()!.trim();
  } catch {
    throw "not a current git directory";
  }
}

async function getTodoState() {
  const file = Bun.file(`${await getGitDir()}/.todo.state.json`);
  if (!(await file.exists())) {
    return null;
  }
  return (await file.json()) as State;
}

async function getConfig(): Promise<[Config, boolean]> {
  const home = process.env.HOME;
  const configfile = Bun.file(home + "/.todo.json");
  const exists = await configfile.exists();
  if (exists) {
    const conf = (await configfile.json()) as Config;
    if (conf.api_key && conf.teamid && conf.update_state_id)
      return [(await configfile.json()) as Config, false];
  }
  console.log("No config file found, creating...");
  const api_key = await getInput(
    "Enter Linear API key (https://linear.app//settings/account/security/api-keys/new): ",
  );
  const linearClient = new LinearClient({
    apiKey: api_key,
  });
  console.log("Fetching teams...");
  const teams = await linearClient.teams();
  teams.nodes.forEach((t, i) => console.log(`${i}: ${t.name}`));
  let selection = await getInput("Select a default team [0]: ");
  const teamid = teams.nodes[Number(selection)]?.id;
  console.log("Fetching states...");
  const states = (await linearClient.workflowStates()).nodes.filter(
    (s) => s.teamId == teamid,
  );
  states.forEach((s, i) => console.log(`${i}: ${s.name}`));
  selection = await getInput(
    "Select a default status when previously generated todos are not found [0]: ",
  );
  const stateid = states[Number(selection)]?.id;

  if (!teamid || !api_key || !stateid) throw "invalid inputs";

  console.log(`Creating config file at ${home}/.todo.json`);
  const config: Config = { api_key, teamid, update_state_id: stateid };
  await configfile.write(JSON.stringify(config, null, 2));
  return [config, true];
}

async function getInput(prompt: string) {
  process.stdout.write(prompt);
  for await (const line of console) {
    if (!line.trim().length) continue;
    return line.trim();
  }
  throw new Error("Failed to read input"); // Handle potential errors
}

await main();
process.exit();
