import { gql } from 'graphql-request';
import { graphQLClient, successResponse } from '../utils';

export const run = async (event: AWSLambda.APIGatewayEvent) => {
  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing event body' }),
    };
  }

  const body = JSON.parse(event.body);
  if (body.action !== 'labeled') return successResponse();
  if (!body.issue || !body.label) return successResponse();
  if (body.label.name !== process.env.GITHUB_NEEDS_DOCUMENTATION_LABEL) return successResponse();

  const issue = body.issue;

  const newIssueMutation = gql`
  mutation {
    createIssue (
      input: {
        body: "Documentation for ${issue.html_url}"
        repositoryId: "${process.env.GITHUB_DOCUMENTATION_REPO_ID}"
        title: "${issue.title}"
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

  await graphQLClient.request(addIssueToProjectMutation);

  return successResponse();
};
