// This is an ARM template schema to Typescript type
// the schema is pulled from the latest Azure docs: https://docs.microsoft.com/en-us/azure/templates/microsoft.resources/deployments?tabs=json
// the schema is up-to-date per the last modified date of this file.
// the schema type exported here is partial. More can be added when needed.
import { Resource } from './resource';

export interface ResourceDeployment extends Resource {
    properties: {
        template?: unknown;
        templateLink?: {
            uri: string;
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}
