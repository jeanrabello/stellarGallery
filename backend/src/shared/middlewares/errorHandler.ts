import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import CustomError from "../classes/CustomError";

export default async function errorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, _request: FastifyRequest, reply: FastifyReply) => {
    if (Array.isArray((error as any).validation)) {
      const issues = (error as any).validation as Array<{
        instancePath: string;
        message: string;
      }>;
      const fields = issues.map((i) => i.instancePath.replace(/^\//, ""));
      return reply.status(400).send({
        message: "Validation error",
        fields,
        details: issues.map((i) => i.message),
      });
    }

    if (error instanceof CustomError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    if ((error as any).statusCode === 429) {
      return reply.status(429).send({ message: "Too many requests" });
    }

    app.log.error(error);
    return reply.status(500).send({ message: "Internal server error" });
  });
}
