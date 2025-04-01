import { defineData } from '@aws-amplify/backend';

const schema = `
  type ChatHistory @model {
    id: ID! @primaryKey
    UserId: String! @index(name: "byUserId", sortKeyFields: ["Timestamp"])
    Timestamp: String!
    Message: String!
  }
`;

export const data = defineData({
  schema,
  name: 'ChatHistory'
}); 