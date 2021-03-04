#!/usr/bin/env node

import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import semver from 'semver';

const rootDir = path.resolve(path.basename(__filename), '../');
const packageInfo = JSON.parse(String(fs.readFileSync(path.resolve(rootDir, 'package.json'))));
const verStr = packageInfo.version;

// validate version arg
if (!semver.valid(verStr)) {
    throw new Error(`${verStr} isn't a valid semver. Expect a valid semver from the 1st argument.`);
}

const version = semver.parse(verStr);

console.log(`Package version:, ${chalk.green(version.version)}`);

// update Azure templates version
const templateDir = path.resolve(rootDir, 'templates');

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
        const templateJSON = JSON.parse(String(buffer));
        // update the template contentVersion
        if (templateJSON.contentVersion) {
            templateJSON.contentVersion = `${version.major}.${version.minor}.${version.patch}.0`;
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
        // update linked template uri
        if (Array.isArray(templateJSON.resources)) {
            templateJSON.resources.forEach((resource, index) => {
                // locate the linked template resource
                if (
                    resource.type === 'Microsoft.Resources/deployments' &&
                    resource.properties &&
                    resource.properties.templateLink &&
                    resource.properties.templateLink.uri
                ) {
                    const regex = /(?<=https:\/\/raw\.githubusercontent\.com\/fortinet\/fortigate-autoscale-azure\/)(\S*)\/templates\/\S*\.json$/;
                    const uri = String(resource.properties.templateLink.uri);
                    const [, ref] = uri.match(regex) || [];
                    if (ref) {
                        resource.properties.templateLink.uri = uri.replace(ref, verStr);
                        console.log(`linked template: ${chalk.green(resource.name)} is updated.`);
                        console.log(
                            `uri is updated to: ${chalk.green(
                                resource.properties.templateLink.uri
                            )}`
                        );
                        templateJSON.resources[index] = resource;
                        changeCount++;
                    }
                }
            });
        }
        fs.writeFileSync(filePath, JSON.stringify(templateJSON, null, 4));
        console.log(`${changeCount} changes have been applied.`);
    });
console.log('Sync version completed.');
