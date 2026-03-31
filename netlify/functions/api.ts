import serverless from "serverless-http";
import app from "../../src/server/app";

export const handler = serverless(app);
