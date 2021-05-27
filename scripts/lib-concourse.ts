/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import chalk from 'chalk';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type JSONObject = {
    [key in string | number]?: string | number | boolean | JSONObject | JSONObject[];
};

export type JSONable = string | number | boolean | JSONObject | JSONObject[];

export interface Params {
    client_id?: string;
    client_secret?: string;
    subscription?: string;
    tenant?: string;
    url: string;
    from_local_path?: string;
    [key: string]: string;
}

export interface Version {
    hash: string;
    count: string;
}

export function mask(str: string): string {
    // length <= 5, display the left-most character
    if (str.length <= 5) {
        return `${str.charAt(0)}${'*'.repeat(str.length - 1)}`;
    }
    // if length > 5 and length <= 10, display the left-most and right-most characters
    else if (str.length > 5 && str.length <= 10) {
        return `${str.charAt(0)}${'*'.repeat(str.length - 2)}${str.charAt(str.length - 1)}`;
    }
    // else display the left-most char and the 4 right-most chars
    else {
        return `${str.charAt(0)}${'*'.repeat(str.length - 5)}${str.substr(str.length - 4)}`;
    }
}

export function createHash(str: string): string {
    return crypto
        .createHash('sha256')
        .update(str, 'utf8')
        .digest('hex');
}

export function inputFetchAll(): Promise<string> {
    return new Promise(resolve => {
        let buffer = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', chunk => {
            buffer += chunk.toString();
        });
        process.stdin.on('end', () => {
            process.stdin.pause();
            resolve(buffer);
        });
        process.stdin.resume();
    });
}

export function log(data: any, ...moreData: any[]): void {
    console.error(chalk.yellow(data, ...moreData));
}

export function err(data: any, ...moreData: any[]): void {
    console.error(chalk.bgRed('!'), chalk.red(' Error: ', data, ...moreData));
}

export function out(data: any): void {
    // TODO: remove the comments when the project is complete. Keep them for future debugging.
    log('writing data to stdout:', JSON.stringify(data, null, 4));
    console.log(JSON.stringify(data, null, 4));
}

export function put(dir: string, fileName: string, data: any): string {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.resolve(dir, fileName);
    // TODO: remove the comments when the project is complete. Keep them for future debugging.
    // log('putting data to file:', filePath);
    fs.writeFileSync(filePath, JSON.stringify(data));
    return filePath;
}

export function sub(url: string, params: Params): string {
    let s = new String(url);
    Object.entries(params).forEach(([key, value]) => {
        if (key === 'url') {
            return;
        }
        s = s.replace(new RegExp(`{${key}}`, 'g'), value);
    });
    return s.toString();
}

export function loadLocalParams(filePath: string): Params {
    log('reading local params fromfile: ', filePath);
    if (fs.existsSync(filePath)) {
        log('file found.');
        const params = fs.readFileSync(filePath);
        return JSON.parse(params.toString());
    } else {
        log('file not found.');
        return { url: null };
    }
}

export function mergeLocalParams(source: Params): Params {
    let params: Params;
    // check if from_local_path parameter is present. then load content from the local file
    if (source.from_local_path) {
        log(`detected source.from_local_path: ${source.from_local_path}`);
        params = {
            ...loadLocalParams(path.resolve(__dirname, source.from_local_path))
        };
    }

    params = {
        ...params,
        ...source // params in the source have higher precedences
    };

    // required params in the source have the highest precedences.
    params.url = source.url;
    // TODO: remove the comments when the project is complete. Keep them for future debugging.
    // log('params:');
    // Object.entries(params).forEach(([k, v]) => {
    //     if (
    //         ['client_id', 'client_secret', 'tenant', 'subscription'].includes(k)
    //     ) {
    //         log(`${k}: `, '*'.repeat(v.length));
    //     } else {
    //         log(`${k}: `, typeof v === 'string' ? v : JSON.stringify(v));
    //     }
    // });
    return params;
}
