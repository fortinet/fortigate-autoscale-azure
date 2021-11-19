#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { ResourceDeployment } from '../arm-template-schemas/deployment';
import { Template } from '../arm-template-schemas/resource';
/* eslint-enable @typescript-eslint/no-unused-vars */

const rootDir = path.resolve(path.basename(__filename), '../');
const packageInfo = JSON.parse(String(fs.readFileSync(path.resolve(rootDir, 'package.json'))));
const verStr = packageInfo.version;

// validate version arg
if (!semver.valid(verStr)) {
    throw new Error(`${verStr} isn't a valid semver. Expect a valid semver from the 1st argument.`);
}

let workingDir = './templates';

if (process.argv.length > 2 && process.argv[1] === '--dir' && process.argv[2]) {
    if (path.resolve(rootDir, process.argv[2]).startsWith(rootDir) === false) {
        throw new Error(
            `Working directory: ${process.argv[2]} does not reside in the project root.`
        );
    } else {
        workingDir = process.argv[2];
    }
}

const version = semver.parse(verStr);

console.log(`Package version:, ${chalk.green(version.version)}`);

function syncVersionInTemplates(templateDir: string, newVersion: semver.SemVer): void {
    // update Azure templates version
    const files = fs.readdirSync(templateDir);
    files
        .filter(file => {
            const stat = fs.statSync(path.resolve(templateDir, file));
            return stat.isFile();
        })
        .forEach(file => {
            let changeCount = 0;
            const filePath = path.resolve(templateDir, file);
            const buffer = fs.readFileSync(filePath);
            const templateJSON: Template = JSON.parse(String(buffer));
            // update the template contentVersion
            if (templateJSON.contentVersion) {
                templateJSON.contentVersion = `${newVersion.major}.${newVersion.minor}.${newVersion.patch}.0`;
                console.log(
                    `Template version updates to: ${chalk.green(
                        templateJSON.contentVersion
                    )} on file: ${chalk.green(file)}`
                );
                changeCount++;
            } else {
                console.log(`No contentVersion field found. Skip file: ${file}`);
            }
            // update parameter default values
            if (templateJSON.parameters) {
                Object.keys(templateJSON.parameters).forEach(key => {
                    // locate the parameter: PackageResURL
                    // both template file and parameter file may contain the parameter. however,
                    // the parameters in the file parameter file may not have the defaultValue prop.
                    // so only set which it contains a defaultValue prop.
                    if (
                        key === 'PackageResURL' &&
                        templateJSON.parameters[key].defaultValue !== undefined
                    ) {
                        templateJSON.parameters[
                            key
                        ].defaultValue = `https://github.com/fortinet/fortigate-autoscale-azure/releases/download/${verStr}/fortigate-autoscale-azure-funcapp.zip`;
                        console.log(
                            `Function app zip file url: ${chalk.green(
                                templateJSON.parameters[key].defaultValue
                            )}.`
                        );
                    }
                });
            }
            // update linked template uri
            if (Array.isArray(templateJSON.resources)) {
                templateJSON.resources.forEach((resource, index) => {
                    // locate the linked template resource
                    if (resource.type === 'Microsoft.Resources/deployments') {
                        const deployment: ResourceDeployment = resource as ResourceDeployment;
                        if (
                            deployment.properties.templateLink &&
                            deployment.properties.templateLink.uri
                        ) {
                            const regex = /(?<=https:\/\/raw\.githubusercontent\.com\/fortinet\/fortigate-autoscale-azure\/)(\S*)\/templates\/\S*\.json$/;
                            const uri = String(deployment.properties.templateLink.uri);
                            const [, ref] = uri.match(regex) || [];
                            if (ref) {
                                deployment.properties.templateLink.uri = uri.replace(ref, verStr);
                                console.log(
                                    `linked template: ${chalk.green(resource.name)} is updated.`
                                );
                                console.log(
                                    `uri is updated to: ${chalk.green(
                                        deployment.properties.templateLink.uri
                                    )}`
                                );
                                templateJSON.resources[index] = deployment;
                                changeCount++;
                            }
                        }
                    }
                });
            }
            // update version in the outputs
            if (templateJSON.outputs) {
                Object.keys(templateJSON.outputs).forEach(key => {
                    // locate the output: deploymentPackageVersion
                    if (key === 'deploymentPackageVersion') {
                        templateJSON.outputs[key].value = verStr;
                    }
                });
            }
            fs.writeFileSync(filePath, JSON.stringify(templateJSON, null, 4));
            console.log(`${changeCount} changes have been applied.`);
        });
}

function syncVersionOnReadMe(newVersion: semver.SemVer): void {
    const filePath = path.resolve(rootDir, './README.md');
    console.log(`updating ${filePath}`);
    const readmeContent = fs.readFileSync(filePath).toString();
    const regexUrl = /(?<=https:\/\/raw\.githubusercontent\.com\/fortinet\/fortigate-autoscale-azure\/)(\S*)\/templates\/\S*\.json/;
    const regexEncodedUrl = /(?<=https%3A%2F%2Fraw\.githubusercontent\.com%2Ffortinet%2Ffortigate-autoscale-azure%2F)(\S*)%2Ftemplates%2F\S*\.json/;
    let [place, currentVersion] = readmeContent.match(regexUrl) || [];
    if (!currentVersion) {
        [place, currentVersion] = readmeContent.match(regexEncodedUrl) || [];
    }
    if (currentVersion) {
        console.log(`current version found on README is ${chalk.yellow(currentVersion)}.`);
        console.log(`new version is set to: ${chalk.green(newVersion.version)}.`);
        const rep = place.replace(currentVersion, newVersion.version);
        const newContent = readmeContent.replace(place, rep);
        console.log(`${chalk.yellow(place)} is replaced with ${chalk.green(rep)}`);
        fs.writeFileSync(filePath, newContent);
        console.log(`${filePath} has been updated.`);
    }
}

// sync version on azure templates
syncVersionInTemplates(path.resolve(rootDir, workingDir), version);

// sync version on README.md
syncVersionOnReadMe(version);
console.log('Sync version completed.');
