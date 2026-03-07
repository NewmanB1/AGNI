'use strict';

/**
 * Compile-time DAG validation for the OLS skill prerequisite graph.
 * Detects cycles that would make lessons permanently ineligible at runtime.
 *
 * Uses the same graph structure as theta's buildSkillGraph:
 * graph[providedSkill] = Set(requiredSkills) — edges point from skill to its prerequisites.
 *
 * @module @agni/utils/skill-dag-validate
 */

/**
 * Build the skill graph from lesson index and optional curriculum.
 * Mirrors theta.js buildSkillGraph for consistency.
 *
 * @param  {Array<object>} lessonIndex   [{ skillsProvided, skillsRequired }, ...]
 * @param  {object} [curriculum]         { graph: { [skill]: string[] } } — overrides lesson-derived graph
 * @returns {object}                     { [skill]: Set<string> }
 */
function buildSkillGraph(lessonIndex, curriculum) {
  const graph = {};
  if (curriculum && curriculum.graph && Object.keys(curriculum.graph).length > 0) {
    for (const [skill, reqs] of Object.entries(curriculum.graph)) {
      graph[skill] = new Set(Array.isArray(reqs) ? reqs : []);
    }
    return graph;
  }
  (lessonIndex || []).forEach(function (lesson) {
    (lesson.skillsProvided || []).forEach(function (p) {
      const skill = typeof p === 'string' ? p : p.skill;
      if (!skill) return;
      if (!graph[skill]) graph[skill] = new Set();
      (lesson.skillsRequired || []).forEach(function (r) {
        const req = typeof r === 'string' ? r : (r && r.skill) ? r.skill : r;
        if (req) graph[skill].add(req);
      });
    });
  });
  return graph;
}

/**
 * Find a cycle in the skill graph using DFS.
 * Returns the first cycle found, or null if the graph is acyclic.
 *
 * @param  {object} graph   { [skill]: Set<string> }
 * @returns {string[]|null} Cycle as ordered skill ids, or null
 */
function findCycle(graph) {
  const visited = new Set();
  const recStack = new Set();
  const path = [];
  const pathIndex = {};

  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    path.push(node);
    pathIndex[node] = path.length - 1;

    const deps = graph[node];
    if (deps) {
      for (const dep of deps) {
        if (!visited.has(dep)) {
          const cycle = dfs(dep);
          if (cycle) return cycle;
        } else if (recStack.has(dep)) {
          return path.slice(pathIndex[dep]).concat(dep);
        }
      }
    }

    recStack.delete(node);
    path.pop();
    delete pathIndex[node];
    return null;
  }

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/**
 * Validate that the skill prerequisite graph is acyclic.
 *
 * @param  {Array<object>} lessonIndex   Lesson index (skillsProvided, skillsRequired)
 * @param  {object} [curriculum]         Optional curriculum.graph override
 * @returns {{ ok: boolean, cycles: string[][], message?: string }}
 */
function validateSkillDag(lessonIndex, curriculum) {
  const graph = buildSkillGraph(lessonIndex, curriculum);
  if (Object.keys(graph).length === 0) {
    return { ok: true, cycles: [] };
  }

  const cycle = findCycle(graph);
  if (!cycle) {
    return { ok: true, cycles: [] };
  }
  const cycleStr = cycle.join(' \u2192 ');
  return {
    ok: false,
    cycles: [cycle],
    message: 'Skill graph contains cycle (lessons in cycle permanently ineligible): ' + cycleStr
  };
}

module.exports = {
  buildSkillGraph: buildSkillGraph,
  findCycle: findCycle,
  validateSkillDag: validateSkillDag
};
