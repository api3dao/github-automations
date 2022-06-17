import { GraphQLClient } from 'graphql-request';
import { GITHUB_GQL_API_ENDPOINT } from './constants';

export const graphQLClient = new GraphQLClient(GITHUB_GQL_API_ENDPOINT, {
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});

export const successResponse = () => ({
  statusCode: 200,
});
