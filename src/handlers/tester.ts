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
  if (body.action !== 'edited') return successResponse();
  if (!body.projects_v2_item) return successResponse();
  if (
    body.changes?.field_value?.field_node_id &&
    body.changes.field_value.field_node_id !== process.env.GITHUB_PROJECT_STATUS_FIELD_EVENT_ID
  )
    return successResponse();

  const contentNodeId = body.projects_v2_item.content_node_id;

  const query = gql`
  query {
    node(id: "${contentNodeId}") {
      ... on Issue {
        title
        url
        number
        repository {
          nameWithOwner
          url
        }
        projectNextItems(first: 1) {
          nodes {
            fieldValues(first: 20) {
              nodes {
                projectField {
                  id
                }
                value
              }
            }
          }
        }
      }
    }
  }
  `;

  const data = await graphQLClient.request(query);
  const fields = data.node.projectNextItems.nodes[0].fieldValues.nodes;
  const statusField = fields.find(
    (field: any) => field.projectField.id === process.env.GITHUB_PROJECT_STATUS_FIELD_GQL_ID
  );

  if (statusField.value !== process.env.GITHUB_PROJECT_STATUS_TESTING_ID) return successResponse();

  const mutation = gql`
  mutation {
      updateIssue (
      input: {
        assigneeIds: ["${process.env.GITHUB_TESTER_ID}"]
        id: "${contentNodeId}"
      }
    )
    {
      issue {
        id
      }
    }
  }
  `;

  await graphQLClient.request(mutation);

  return successResponse();
};
