import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relativePath => fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('repository documentation uses the canonical Hunger Tracker identity', () => {
    const readme = read('../README.md');

    assert.match(readme, /^# Hunger Tracker$/m);
    assert.match(readme, /https:\/\/github\.com\/dkylepeppers-alt\/hunger-tracker/);
    assert.match(readme, /Install extension/i);
    assert.match(readme, /hunger-tracker/);
    assert.doesNotMatch(readme, /elena-succubus-tracker/);
});

test('agent instructions document the project contract and validation commands', () => {
    const agents = read('../AGENTS.md');
    const copilot = read('../.github/copilot-instructions.md');
    const tests = read('../.github/instructions/tests.instructions.md');
    const maintainer = read('../.github/agents/hunger-tracker-maintainer.agent.md');

    assert.match(agents, /plain browser ES modules/i);
    assert.match(agents, /schema version 8/i);
    assert.match(agents, /npm test/);
    assert.match(agents, /npm run check/);
    assert.match(copilot, /AGENTS\.md/);
    assert.match(copilot, /red-green-refactor/i);
    assert.match(tests, /^applyTo: "tests\/\*\*\/\*\.test\.js"$/m);
    assert.match(tests, /node:test/);
    assert.match(maintainer, /^name: Hunger Tracker Maintainer$/m);
    assert.match(maintainer, /^description:/m);
    assert.match(maintainer, /read/);
    assert.match(maintainer, /search/);
    assert.match(maintainer, /edit/);
    assert.match(maintainer, /execute/);
});

test('CI and Copilot setup use the validated Node environment and least privilege', () => {
    const ci = read('../.github/workflows/ci.yml');
    const setup = read('../.github/workflows/copilot-setup-steps.yml');
    const workflows = `${ci}\n${setup}`;

    assert.match(ci, /^name: CI$/m);
    assert.match(ci, /^  quality:$/m);
    assert.match(setup, /^  copilot-setup-steps:$/m);
    assert.match(setup, /workflow_dispatch:/);
    assert.match(workflows, /permissions:\n  contents: read/g);
    assert.match(workflows, /actions\/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0/g);
    assert.match(workflows, /actions\/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e/g);
    assert.match(workflows, /node-version: 20/g);
    assert.match(workflows, /run: npm test/g);
    assert.match(workflows, /run: npm run check/g);
    assert.doesNotMatch(workflows, /npm (?:ci|install)/);
});

test('GitHub contribution templates support agent-ready issue and PR work', () => {
    const bug = read('../.github/ISSUE_TEMPLATE/bug-report.yml');
    const feature = read('../.github/ISSUE_TEMPLATE/feature-request.yml');
    const config = read('../.github/ISSUE_TEMPLATE/config.yml');
    const pullRequest = read('../.github/pull_request_template.md');

    assert.match(bug, /^name: Bug report$/m);
    assert.match(bug, /validation/i);
    assert.match(feature, /^name: Feature request$/m);
    assert.match(feature, /acceptance criteria/i);
    assert.match(config, /^blank_issues_enabled: false$/m);
    assert.match(pullRequest, /npm test/);
    assert.match(pullRequest, /npm run check/);
});
