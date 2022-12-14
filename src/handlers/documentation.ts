import { gql } from 'graphql-request';
import { graphQLClient, successResponse } from '../utils';

const createDocsIssue = async (issue: any) => {
  const newIssueMutation = gql`
  mutation {
    createIssue (
      input: {
        body: "Documentation for ${issue.html_url}"
        repositoryId: "${process.env.GITHUB_DOCUMENTATION_REPO_ID}"
        title: "${issue.title}"
        assigneeIds: [${issue.assignees.map((assignee: any) => `"${assignee.node_id}"`)}]
      }
    )
    {
      issue {
        id
      }
    }
  }
  `;

  const createIssueRes = await graphQLClient.request(newIssueMutation);
  const { issue: newIssue } = createIssueRes.createIssue;

  const addIssueToProjectMutation = gql`
  mutation {
    addProjectV2ItemById (
      input: {
        contentId: "${newIssue.id}"
        projectId: "${process.env.GITHUB_PROJECT_ID}"
      }
    )
    {
      item {
        id
      }
    }
  }
  `;
  const docsIssueId = (await graphQLClient.request(addIssueToProjectMutation)).addProjectV2ItemById.item.id;

  const statusQuery = gql`
  query {
    node(id: "${issue.node_id}") {
      ... on Issue {
        projectItems(first: 1) {
          nodes {
						fieldValueByName(name: "${process.env.GITHUB_PROJECT_STATUS_FIELD_NAME}") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                optionId
                field {
                  ... on ProjectV2SingleSelectField {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  `;
  const data = await graphQLClient.request(statusQuery);
  const statusFieldId = data.node.projectItems.nodes[0].fieldValueByName.field.id;
  const statusId = data.node.projectItems.nodes[0].fieldValueByName.optionId;

  if (statusId !== process.env.GITHUB_PROJECT_STATUS_BACKLOG_ID) {
    const updateStatusMutation = gql`
    mutation {
      updateProjectV2ItemFieldValue (
        input: {
          projectId: "${process.env.GITHUB_PROJECT_ID}"
          itemId: "${docsIssueId}"
          fieldId: "${statusFieldId}"
          value: {
            singleSelectOptionId: "${process.env.GITHUB_PROJECT_STATUS_TODO_ID}"
          }
        }
      )
      {
        projectV2Item {
          id
        }
      }
    }
    `;

    await graphQLClient.request(updateStatusMutation);
  }
};

const updateDocsIssueAssignees = async (assignees: any, docsIssueId: string) => {
  const updateAssigneeMutation = gql`
  mutation {
      updateIssue (
      input: {
        assigneeIds: [${assignees.map((assignee: any) => `"${assignee.node_id}"`)}]
        id: "${docsIssueId}"
      }
    )
    {
      issue {
        id
      }
    }
  }
  `;
  await graphQLClient.request(updateAssigneeMutation);
};

const findDocsIssueByTitle = async (title: string): Promise<string | undefined> => {
  const docsIssueQuery = gql`
  query {
    search(query: "repo:${process.env.GITHUB_DOCUMENTATION_REPO_NAME} in:title \"${title}\"", type: ISSUE, first: 1) {
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

  const data = await graphQLClient.request(docsIssueQuery);
  return data.search.edges[0]?.node?.id;
};

const handleNewLabel = async (ghEvent: any) => {
  if (!ghEvent.label) return successResponse();
  if (ghEvent.label.name !== process.env.GITHUB_NEEDS_DOCUMENTATION_LABEL) return successResponse();

  const issue = ghEvent.issue;
  const docsIssueId = await findDocsIssueByTitle(issue.title);
  if (docsIssueId) {
    await updateDocsIssueAssignees(issue.assignees, docsIssueId);
    return successResponse();
  }

  await createDocsIssue(issue);

  return successResponse();
};

const handleNewAssignee = async (ghEvent: any) => {
  const issue = ghEvent.issue;
  const issueLabels: string[] = issue.labels.map((label: any) => label.name);

  if (!issueLabels.includes(process.env.GITHUB_NEEDS_DOCUMENTATION_LABEL!)) return successResponse();

  const docsIssueId = await findDocsIssueByTitle(issue.title);
  // The situation when the issue has the correct label but the corresponding docs issue was not created can happen due to the GitHub bug ignoring the label assignments when done via the board
  if (!docsIssueId) {
    await createDocsIssue(issue);
    return successResponse();
  }

  await updateDocsIssueAssignees(issue.assignees, docsIssueId);

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
  if (!body.issue) return successResponse();
  if (body.action === 'labeled') return await handleNewLabel(body);
  if (['assigned', 'unassigned'].includes(body.action)) return await handleNewAssignee(body);

  return successResponse();
};
