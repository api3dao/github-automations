import { gql } from 'graphql-request';
import axios from 'axios';
import { STATUSES } from '../constants';
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

  const issue = {
    ...data.node,
    status: STATUSES[statusField.value],
    sender: {
      login: body.sender.login,
      url: body.sender.url,
    },
  };

  await axios.post(
    process.env.SLACK_WEBHOOK_URL!,
    {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Issue movement by <${issue.sender.url}|${issue.sender.login}>`,
          },
        },
      ],
      attachments: [
        {
          color: '#24292F',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `<${issue.url}|*#${issue.number} ${issue.title}*> moved to *${issue.status}*`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `<${issue.repository.url}|${issue.repository.nameWithOwner}>`,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  return successResponse();
};
