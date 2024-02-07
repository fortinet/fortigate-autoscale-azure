#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */
import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { JSONable, log } from './lib-concourse';
/* eslint-enable @typescript-eslint/no-unused-vars */

/* eslint-disable @typescript-eslint/no-explicit-any */
function readJSONTemplate(filePath: string): JSONable {
    let contents = '';
    try {
        contents = fs.readFileSync(filePath).toString();
    } catch (error) {
        (error as Error).message = `error in reading the JSON template: ${filePath}.`;
        throw error;
    }
    try {
        return contents !== null && JSON.parse(contents);
    } catch (error) {
        (error as Error).message =
            `error in parsing content into JSON object from file: ${filePath}.`;
        throw error;
    }
}

function extractVersions(filePath: string): string[] {
    let contents = '';
    try {
        contents = fs.readFileSync(filePath).toString();
    } catch (error) {
        (error as Error).message = `error in reading the JSON template: ${filePath}.`;
        throw error;
    }
    let items: { name: string; [key: string]: string }[] = [];
    try {
        items = contents !== null && JSON.parse(contents);
    } catch (error) {
        (error as Error).message =
            `error in parsing content into JSON object, content: ${contents}.`;
        throw error;
    }
    if (!Array.isArray(items)) {
        throw new Error(`Not an array: ${contents}`);
    }
    const versions: string[] = items
        .map(v => {
            return (v && v.name) || null;
        })
        .filter(v => !!v)
        .sort();
    return versions;
}

function extractParams(argv: string[]): { [key: string]: string } {
    return argv.reduce((result, arg) => {
        const [, key, val] = /^([^=]+)=(.*)$/.exec(arg) || [];
        if (key && val) {
            result[key] = val;
        }
        return result;
    }, {});
}

function filterVersions(filePathBYOL: string, filePathPAYG: string, semverRange: string): string[] {
    const versionBYOL: string[] = (filePathBYOL && extractVersions(filePathBYOL)) || [];
    const versionPAYG: string[] = (filePathPAYG && extractVersions(filePathPAYG)) || [];
    // find the intersection.
    log(
        `versionBYOL: ${JSON.stringify(versionBYOL)}`,
        `versionPAYG, ${JSON.stringify(versionPAYG)}`
    );
    let versions: string[] = [];
    if (versionBYOL.length && versionPAYG.length) {
        versions = versionBYOL.filter(v => versionPAYG.includes(v));
    } else {
        versions = (versionBYOL.length && versionBYOL) || (versionPAYG.length && versionPAYG) || [];
    }

    // filter version by semver rule
    if (semverRange) {
        return versions.filter(v => {
            return semver.satisfies(v, semverRange);
        });
    } else {
        return versions;
    }
}

function main(): void {
    let updated = false;
    log('cwd:', process.cwd());
    const currentWorkingDir = path.resolve(path.dirname(__filename), '../../');
    log('argv:', JSON.stringify(process.argv, null, 4));
    // argv exlanations by index:
    // 0: node process location
    // 1: script location
    // 2 - n: parameters to pass to this script
    const params = extractParams(process.argv.slice(2));
    log(JSON.stringify(params));
    // read template file
    const filePathTemplateMain = path.resolve(
        currentWorkingDir,
        'templates/deploy_fortigate_autoscale.hybrid_licensing.json'
    );
    const filePathTemplateParams = path.resolve(
        currentWorkingDir,
        'templates/deploy_fortigate_autoscale.hybrid_licensing.params.json'
    );
    const templateMain = readJSONTemplate(filePathTemplateMain) as { [key: string]: any };
    const templateParams = readJSONTemplate(filePathTemplateParams) as { [key: string]: any };
    // update FOS version if specified
    if (
        templateMain.parameters &&
        templateMain.parameters.FOSVersion &&
        (params['fortigate-byol'] || params['fortigate-payg'])
    ) {
        const fosVersions = filterVersions(
            params['fortigate-byol'] && path.resolve(currentWorkingDir, params['fortigate-byol']),
            params['fortigate-payg'] && path.resolve(currentWorkingDir, params['fortigate-payg']),
            params['fortigate-semver-range']
        );
        log('updating fos versions.', `valid versions: ${JSON.stringify(fosVersions)}`);
        // update main template
        // the version are in ascending order, latest version in at the end of array.
        templateMain.parameters.FOSVersion.defaultValue = fosVersions[fosVersions.length - 1];
        templateMain.parameters.FOSVersion.allowedValues = [...fosVersions];
        // update template parameters file
        if (templateParams.parameters && templateParams.parameters.FOSVersion) {
            // the version are in ascending order, latest version in at the end of array.
            templateParams.parameters.FOSVersion.value = fosVersions[fosVersions.length - 1];
        }
        updated = true;
    }
    // update FAZ version if specified
    if (
        templateMain.parameters &&
        templateMain.parameters.FortiAnalyzerVersion &&
        (params['fortianalyzer-byol'] || params['fortianalyzer-payg'])
    ) {
        const fazVersions = filterVersions(
            params['fortianalyzer-byol'] &&
                path.resolve(currentWorkingDir, params['fortianalyzer-byol']),
            params['fortianalyzer-payg'] &&
                path.resolve(currentWorkingDir, params['fortianalyzer-payg']),
            params['fortianalyzer-semver-range']
        );
        log('updating faz versions.', `valid versions: ${JSON.stringify(fazVersions)}`);
        // update main template
        // the version are in ascending order, latest version in at the end of array.
        templateMain.parameters.FortiAnalyzerVersion.defaultValue =
            fazVersions[fazVersions.length - 1];
        templateMain.parameters.FortiAnalyzerVersion.allowedValues = [...fazVersions];
        // update template parameters file
        if (templateParams.parameters && templateParams.parameters.FortiAnalyzerVersion) {
            // the version are in ascending order, latest version in at the end of array.
            templateParams.parameters.FortiAnalyzerVersion.value =
                fazVersions[fazVersions.length - 1];
        }
        updated = true;
    }
    // save files if updated
    if (updated) {
        log(`writing content into file: ${filePathTemplateMain}`);
        fs.writeFileSync(filePathTemplateMain, JSON.stringify(templateMain));
        log(`writing content into file: ${filePathTemplateParams}`);
        fs.writeFileSync(filePathTemplateParams, JSON.stringify(templateParams));
    }
    // NOTE: the formatting of the written files may violate some linting rules. please lint them
    // again
    return;
}

main();
