import fs from 'fs';
import path from 'path';
import semver from 'semver';
import { err, JSONable, log } from './lib-concourse';

/* eslint-disable @typescript-eslint/no-explicit-any */

function readFile(filePath: string): string {
    log(`reading content from file: ${filePath}`);
    if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            log(`file found: ${filePath}`);
            const buffer = fs.readFileSync(filePath);
            return buffer.toString();
        } else {
            log(`not a file: ${filePath}`);
        }
    } else {
        log(`file not found: ${filePath}`);
    }
    log(`unable to read content from file: ${filePath}`);
    return null;
}

function readJSONTemplate(filePath: string): JSONable {
    try {
        const content = readFile(filePath);
        return content !== null && JSON.parse(content);
    } catch (error) {
        err('error in parsing into JSON object: ', JSON.stringify(error));
    }
    return null;
}

function writeFile(filePath: string, content: string): void {
    log(`writing content into file: ${filePath}`);
    if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
            log(`file found: ${filePath}`);
            fs.writeFileSync(filePath, content);
            log('write file complete');
            return;
        } else {
            log(`not a file: ${filePath}`);
        }
    } else {
        log(`file not found: ${filePath}`);
    }
    log(`unable to write content to file: ${filePath}`);
    return;
}

function extractVersions(filePath: string): string[] {
    try {
        const content = readFile(filePath);
        const items: { name: string; [key: string]: string }[] =
            content !== null && JSON.parse(content);
        if (!Array.isArray(items)) {
            throw new Error(`Not an array: ${content}`);
        }
        const versions: string[] = items
            .map(v => {
                return (v && v.name) || null;
            })
            .filter(v => !!v)
            .sort();
        return versions;
    } catch (error) {
        err('error in parsing into JSON object: ', JSON.stringify(error));
    }
    return [];
}

function extractParams(argv: string[]): { [key: string]: string } {
    const params = {};
    argv.forEach(arg => {
        // format: name=foo,value=bar
        const [p1, p2] = arg.split(','); // get ['name=foo', 'value=bar']
        const name = (p1.indexOf('name=') === 0 && p1.substr('name='.length)) || null;
        const value = (p2.indexOf('value=') === 0 && p2.substr('value='.length)) || null;
        if (name && value) {
            params[name] = value;
        }
    });
    return params;
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
    // const input = await inputFetchAll();
    // log(`running script: ${__filename}`);
    // log('stdin: ', JSON.stringify(input, null, 4));
    log('cwd:', process.cwd());
    log('argv:', JSON.stringify(process.argv, null, 4));
    // argv exlanations by index:
    // 0: node process location
    // 1: script location
    // 2: base branch name
    // 3: head branch name
    // 4 - n: additional parameters
    // rest: parameters to pass to this script
    const params = extractParams(process.argv.slice(4));
    log(JSON.stringify(params));
    // read template file
    const filePathTemplateMain = path.resolve(
        'templates/deploy_fortigate_autoscale.hybrid_licensing.json'
    );
    const filePathTemplateParams = path.resolve(
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
            params['fortigate-byol'] && path.resolve(params['fortigate-byol']),
            params['fortigate-payg'] && path.resolve(params['fortigate-payg']),
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
            params['fortianalyzer-byol'] && path.resolve(params['fortianalyzer-byol']),
            params['fortianalyzer-payg'] && path.resolve(params['fortianalyzer-payg']),
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
        writeFile(filePathTemplateMain, JSON.stringify(templateMain));
        writeFile(filePathTemplateParams, JSON.stringify(templateParams));
    }
    // log('params file: ', JSON.stringify(filePathTemplateParams));
    // NOTE: the formatting of the written files may violate some linting rules. please lint them
    // again
    return;
}

main();
