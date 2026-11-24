/**
 * GitCut GitHub App (Probot).
 *
 * A thin router: it listens on PRs, checks who asked, and starts the GitCut workflow in
 * the video repo. The workflow does the work and posts the results on the PR itself.
 *
 * Env (besides Probot's APP_ID / PRIVATE_KEY / WEBHOOK_SECRET):
 *   VIDEO_REPO      owner/repo that holds the pipeline        (e.g. zekooo0/gitcut)
 *   VIDEO_WORKFLOW  workflow file name                        (default gitcut.yml)
 *   VIDEO_REF       branch the workflow runs from             (default main)
 *   AUTO_PLAN       label | feat-merged | off                 (default label)
 *   TRIGGER_LABEL   label that starts a plan                  (default gitcut)
 */
import { HELP, autoPlan, canRun, parseCommand, workflowInputs } from "./commands.js";

// .env values often carry a stray trailing space ("owner/repo ") that breaks the API path
const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const cfg = () => {
  const [vOwner, vRepo] = env("VIDEO_REPO").split("/").map((s) => s.trim());
  if (!vOwner || !vRepo) throw new Error("VIDEO_REPO must be owner/repo");
  return {
    vOwner,
    vRepo,
    workflow: env("VIDEO_WORKFLOW", "gitcut.yml"),
    ref: env("VIDEO_REF", "main"),
    auto: env("AUTO_PLAN", "label"),
    label: env("TRIGGER_LABEL", "gitcut"),
  };
};

/** An Octokit authenticated as the App's installation on the VIDEO repo (may differ from the PR's). */
async function videoRepoOctokit(app, c) {
  const jwt = await app.auth();
  const { data } = await jwt.rest.apps.getRepoInstallation({ owner: c.vOwner, repo: c.vRepo });
  return app.auth(data.id);
}

async function dispatch(app, context, pr, d) {
  const c = cfg();
  const inputs = workflowInputs(pr, d);
  const octo = await videoRepoOctokit(app, c);
  await octo.rest.actions.createWorkflowDispatch({
    owner: c.vOwner,
    repo: c.vRepo,
    workflow_id: c.workflow,
    ref: c.ref,
    inputs,
  });
  const runs = `https://github.com/${c.vOwner}/${c.vRepo}/actions/workflows/${c.workflow}`;
  const what = { plan: "Planning", recapture: "Capturing again", render: "Rendering", edit: "Editing" }[d.mode];
  await context.octokit.rest.issues.createComment(
    context.repo({
      issue_number: pr.number,
      body: `🎬 ${what} the feature video… I post the result here when it finishes ([runs](${runs})).`,
    }),
  );
  app.log.info({ inputs }, "gitcut dispatched");
}

/** @param {import('probot').Probot} app */
export default (app) => {
  app.on("issue_comment.created", async (context) => {
    const { comment, issue, repository } = context.payload;
    if (!issue.pull_request) return; // PR comments only
    if (comment.user.type === "Bot") return;
    const cmd = parseCommand(comment.body);
    if (!cmd) return;

    const reply = (body) =>
      context.octokit.rest.issues.createComment(context.repo({ issue_number: issue.number, body }));

    if (cmd.kind === "help") return reply(HELP);
    if (cmd.kind === "error") return reply(`${cmd.message}\n\n${HELP}`);

    const { data: perm } = await context.octokit.rest.repos.getCollaboratorPermissionLevel(
      context.repo({ username: comment.user.login }),
    );
    if (!canRun(perm.permission)) {
      return reply(`@${comment.user.login} only people with write access can start a feature video.`);
    }
    await context.octokit.rest.reactions
      .createForIssueComment(context.repo({ comment_id: comment.id, content: "eyes" }))
      .catch(() => {});
    const pr = { owner: repository.owner.login, repo: repository.name, number: issue.number };
    try {
      await dispatch(app, context, pr, cmd.dispatch);
    } catch (err) {
      app.log.error(err);
      await reply(`⚠️ Could not start the video workflow: ${err.message}`);
    }
  });

  app.on(["pull_request.labeled", "pull_request.closed"], async (context) => {
    const c = cfg();
    if (!autoPlan(context.payload, { mode: c.auto, label: c.label })) return;
    const { pull_request: p, repository } = context.payload;
    const pr = { owner: repository.owner.login, repo: repository.name, number: p.number };
    try {
      await dispatch(app, context, pr, { mode: "plan" });
    } catch (err) {
      app.log.error(err);
    }
  });
};
