import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-providers";

const client = new DynamoDBClient({
  region: process.env.NEXT_PUBLIC_REGION,
  credentials: fromCognitoIdentityPool({
    clientConfig: { region: process.env.NEXT_PUBLIC_REGION },
    identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID!,
  })
});

export const docClient = DynamoDBDocumentClient.from(client); 