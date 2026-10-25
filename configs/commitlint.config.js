// Conventional commits: type(scope): subject, e.g. "feat(ranking): score sellers by stars".
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'build',
        'ci',
        'docs',
        'refactor',
        'test',
        'perf',
        'chore',
        'style',
        'revert',
        'data',
        'eval',
      ],
    ],
    // scope is optional and free-form: query, catalog, pricing, ranking, collection, web, ai ...
    'scope-case': [2, 'always', ['kebab-case', 'lower-case']],
    'subject-case': [0],
    // long lines in the body (eval numbers, logs, URLs) must not block a commit
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
  },
};
