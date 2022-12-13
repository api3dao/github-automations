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
  if (body.action !== 'opened') return successResponse();
  if (!body.pull_request) return successResponse();

  const nodeId = body.pull_request.node_id;

  const query = gql`
  query {
    node(id: "${nodeId}") {
      ... on PullRequest {
        closingIssuesReferences(first: 20) {
          nodes {
            projectItems(first: 1) {
              nodes {
                id
              }
            }
          }
        }
      }
    }
  }
  `;

  const data = await graphQLClient.request(query);
  const issueIds = data.node.closingIssuesReferences.nodes.map(
    (projectIssue: any) => projectIssue.projectItems.nodes[0].id
  );

  for (const issueId of issueIds) {
    const mutation = gql`
    mutation {
      updateProjectV2ItemFieldValue (
        input: {
          projectId: "${process.env.GITHUB_PROJECT_ID}"
          itemId: "${issueId}"
          fieldId: "${process.env.GITHUB_PROJECT_STATUS_FIELD_GQL_ID}"
          value: {
            singleSelectOptionId: "${process.env.GITHUB_PROJECT_STATUS_INREVIEW_ID}"
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

    await graphQLClient.request(mutation);
  }

  return successResponse();
};
