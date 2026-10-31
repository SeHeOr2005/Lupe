/**
 * Exporta la especificación OpenAPI (src/docs/swagger.ts) a openapi.json en la
 * raíz del proyecto, para importarla en Postman, Insomnia, etc.
 *
 *   npm run docs:export
 */
import { writeFileSync } from "node:fs";
import { swaggerSpec } from "../docs/swagger.js";

writeFileSync("openapi.json", `${JSON.stringify(swaggerSpec, null, 2)}\n`);
console.log("openapi.json exportado.");
