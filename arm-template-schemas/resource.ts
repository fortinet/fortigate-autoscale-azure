// This file contains Typescript types for ARM template schemas
// the types below are for the basic template structure and syntax
// the types are up-to-date per the last modified date of this file.
// the types exported here are partial. More specific fields can be added when needed.
// reference: https://docs.microsoft.com/en-us/azure/azure-resource-manager/templates/template-syntax
// Wish that Microsoft Azure team will export their template schemas for developers to use in Typescript.

export interface Template {
    $schema: string;
    contentVersion: string;
    apiProfile?: string;
    parameters?: {
        [key: string]: Parameter;
    };
    variables?: {
        [key: string]: Variable;
    };
    resources?: Resource[];
    outputs?: {
        [key: string]: Output;
    };
}

export interface Parameter {
    type: string;
    defaultValue?: unknown;
    allowedValues?: unknown[];
    metadata: {
        description: string;
    };
}
export type Variable = unknown;
export interface Resource {
    condition?: string;
    type: string;
    apiVersion: string;
    name: string;
    location: string;
    dependsOn?: string[];
    properties: unknown;
    resources?: Resource[];
}
export interface Output {
    condition?: string;
    type: string;
    value: unknown;
}
