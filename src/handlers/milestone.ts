import _ from 'lodash';
import { gql } from 'graphql-request';
import { graphQLClient, successResponse } from '../utils';

const TRACKER_ISSUE_NAME = 'Documentation tracker';
const TRACKER_ISSUE_NO_ISSUES_DESCRIPTION = 'No documentation issues in this milestone.';

const trackerIssueNameForMilestone = (milestoneTitle: string) => `${TRACKER_ISSUE_NAME} - v${milestoneTitle}`;

const createTrackerIssue = async (milestone: any): Promise<string> => {
  const { node_id: id, title } = milestone;
  const newIssueMutation = gql`
  mutation {
    createIssue (
      input: {
        title: "${trackerIssueNameForMilestone(title)}"
        body: "${TRACKER_ISSUE_NO_ISSUES_DESCRIPTION}"
        repositoryId: "${process.env.GITHUB_AIRNODE_REPO_ID}"
        milestoneId: "${id}"
      }
    )
    {
      issue {
        id
      }
    }
  }
  `;

  return (await graphQLClient.request(newIssueMutation)).createIssue.issue.id;
};

const handleNewMilestone = async (milestone: any) => {
  await createTrackerIssue(milestone);

  return successResponse();
};

const getMilestoneDocsIssues = async (milestone: any) => {
  // TODO: There's currently no pagination but I doubt we will ever have more than 100 issues in one milestone
  const milestoneIssuesQuery = gql`
  query {
    search(query: "repo:${process.env.GITHUB_AIRNODE_REPO_NAME} milestone:\\"${milestone.title}\\" label:\\"${process.env.GITHUB_NEEDS_DOCUMENTATION_LABEL}\\"", type: ISSUE, first: 100) {
      edges {
        node {
          ... on Issue {
            title
            url
            closed
          }
        }
      }
    }
  }
  `;

  return (await graphQLClient.request(milestoneIssuesQuery)).search.edges.map((edge: any) => ({
    title: edge.node.title,
    url: edge.node.url,
    closed: edge.node.closed,
  }));
};

const getDocsIssue = async (title: string) => {
  const docsIssueQuery = gql`
  query {
    search(query: "repo:${process.env.GITHUB_DOCUMENTATION_REPO_NAME} in:title \\"${title}\\"", type: ISSUE, first: 1) {
      edges {
        node {
          ... on Issue {
            url
            closed
          }
        }
      }
    }
  }
  `;

  const resp = await graphQLClient.request(docsIssueQuery);

  const edge = resp.search.edges[0];
  if (!edge) return null;

  const node = edge.node;
  if (isEmpty(node))
    return {
      url: `${title} (Missing some GitHub data, check manually)`,
      closed: false,
    };

  return {
    url: node.url,
    closed: node.closed,
  };
};

const getTrackerIssue = async (milestone: any) => {
  const trackerIssueQuery = gql`
  query {
    search(query: "repo:${process.env.GITHUB_AIRNODE_REPO_NAME} in:title \\"${trackerIssueNameForMilestone(
    milestone.title
  )}\\"", type: ISSUE, first: 1) {
      edges {
        node {
          ... on Issue {
            id
          }
        }
      }
    }
  }
  `;

  return (await graphQLClient.request(trackerIssueQuery)).search.edges[0]?.node?.id;
};

const updateTrackerIssue = async (id: string, body: string) => {
  const updateTrackerIssueMutation = gql`
  mutation {
    updateIssue (
      input: {
        body: "${body}"
        id: "${id}"
      }
    )
    {
      issue {
        id
      }
    }
  }
  `;

  return graphQLClient.request(updateTrackerIssueMutation);
};

const handleTrackerIssueUpdate = async (milestone: any) => {
  if (!milestone) return successResponse();

  const milestoneDocsIssues = await getMilestoneDocsIssues(milestone);

  let newTrackerIssueBody = TRACKER_ISSUE_NO_ISSUES_DESCRIPTION;
  if (!_.isEmpty(milestoneDocsIssues)) {
    const docsIssues = [];
    const milestoneMissingDocsIssues = [];
    for (const milestoneDocsIssue of milestoneDocsIssues) {
      const docsIssue = await getDocsIssue(milestoneDocsIssue.title);

      if (!docsIssue) {
        milestoneMissingDocsIssues.push(milestoneDocsIssue);
        continue;
      }

      docsIssues.push(docsIssue);
    }

    newTrackerIssueBody = `
Airnode issues that need documentation:
${_.difference(milestoneDocsIssues, milestoneMissingDocsIssues)
  .map((issue) => `- [${issue.closed ? 'x' : ' '}] ${issue.url}`)
  .join(`\n`)}

Corresponding docuemntation issues:
${docsIssues.map((issue) => `- [${issue.closed ? 'x' : ' '}] ${issue.url}`).join(`\n`)}

${
  _.isEmpty(milestoneMissingDocsIssues)
    ? ''
    : `**Airnode issues that need documentation but don't have a correspoding documentation issue:**\n${milestoneMissingDocsIssues
        .map((issue) => `- [${issue.closed ? 'x' : ' '}] ${issue.url}`)
        .join(`\n`)}`
}
`.trim();
  }

  let trackerIssueId = await getTrackerIssue(milestone);
  if (!trackerIssueId) {
    trackerIssueId = await createTrackerIssue(milestone);
  }
  await updateTrackerIssue(trackerIssueId, newTrackerIssueBody);

  return successResponse();
};

export const run = async (event: AWSLambda.APIGatewayEvent) => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing event body' }),
    };
  }

  const body = JSON.parse(event.body);
  if (body.milestone && body.action === 'created') return await handleNewMilestone(body.milestone);
  if (
    body.issue &&
    ((['labeled', 'unlabeled'].includes(body.action) &&
      body.label.name === process.env.GITHUB_NEEDS_DOCUMENTATION_LABEL) ||
      ['milestoned', 'demilestoned'].includes(body.action))
  )
    return await handleTrackerIssueUpdate(body.milestone || body.issue.milestone);

  return successResponse();
};
