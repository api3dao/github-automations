export const GITHUB_GQL_API_ENDPOINT = 'https://api.github.com/graphql';

export const STATUSES = {
  [process.env.GITHUB_PROJECT_STATUS_BACKLOG_ID!]: 'Backlog',
  [process.env.GITHUB_PROJECT_STATUS_TODO_ID!]: 'TODO',
  [process.env.GITHUB_PROJECT_STATUS_BLOCKED_ID!]: 'Blocked',
  [process.env.GITHUB_PROJECT_STATUS_INPROGRESS_ID!]: 'In progress',
  [process.env.GITHUB_PROJECT_STATUS_INREVIEW_ID!]: 'In review',
  [process.env.GITHUB_PROJECT_STATUS_TESTING_ID!]: 'Testing',
  [process.env.GITHUB_PROJECT_STATUS_DONE_ID!]: 'Done',
};
