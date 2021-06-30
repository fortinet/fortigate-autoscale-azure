import AdmZip from 'adm-zip';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

interface ZipMapping {
    src: string;
    des: string;
}

// WARNING: this script expects to run after the project src being built.
// NOTE: this script will use the node process current working directory as root directory
const rootDir = process.cwd();
console.log(`${chalk.blueBright('Set current working directory:')} ${rootDir}`);

// NOTE: this script will look for the dist folder on the top level of the root directory
// unless --distdir is specified. However, the distdir MUST reside in the current working directory.
let distDir = 'dist';
if (process.argv.length > 1 && process.argv.includes('--distdir')) {
    const argi = process.argv.indexOf('--distdir');
    if (argi === process.argv.length - 1) {
        throw new Error('Argument --distdir cannot use an empty value.');
    }
    const fullPath = path.resolve(rootDir, process.argv[argi + 1]);
    if (!fullPath.startsWith(rootDir)) {
        throw new Error(`distdir must reside in the current working directory: ${rootDir}`);
    }
    distDir = fullPath.replace(rootDir, '');
}

const add = (name: string | ZipMapping, zip: AdmZip): void => {
    const fPath = path.resolve(
        rootDir,
        typeof name === 'object' && name.src ? name.src : (name as string)
    );
    const zPath = typeof name === 'object' && name.des ? name.des : '';
    const stat = fs.statSync(fPath);
    if (stat.isDirectory()) {
        zip.addLocalFolder(
            fPath,
            typeof name === 'object' && name.des ? name.des : (name as string)
        );
        console.log(
            `${chalk.blueBright('Added folder:')} ${fPath} ${chalk.blueBright('to:')} ${zPath}.`
        );
    } else if (stat.isFile()) {
        zip.addLocalFile(fPath, typeof name === 'object' && name.des ? name.des : '');
        console.log(
            `${chalk.blueBright('Added file:')} ${fPath} ${chalk.blueBright('to:')} ${zPath}.`
        );
    } else {
        console.warn(`${chalk.yellow('skipped (neither a directory nor file):')} ${path}`);
    }
};

const fileFuncapp = path.resolve(rootDir, 'fortigate-autoscale-azure-funcapp.zip');
const filePackage = path.resolve(rootDir, 'fortigate-autoscale-azure.zip');
const zipFuncapp = new AdmZip();
const zipPackage = new AdmZip();

const azureFunctionAppRequiredFileLocations = [
    distDir,
    'byol-license',
    'faz-auth-handler',
    'faz-auth-scheduler',
    'fgt-as-handler',
    '.funcignore',
    'host.json',
    'proxies.json',
    'package.json',
    'README.md',
    'LICENSE'
];
const deploymentPackageRequiredFileLocations = [
    fileFuncapp,
    'templates',
    'package.json',
    'README.md',
    'LICENSE',
    {
        src: 'node_modules/@fortinet/fortigate-autoscale/assets/configset/baseconfig',
        des: 'assets/configset'
    },
    {
        src: 'node_modules/@fortinet/fortigate-autoscale/assets/configset/fazintegration',
        des: 'assets/configset'
    },
    {
        src: 'node_modules/@fortinet/fortigate-autoscale/assets/configset/port2config',
        des: 'assets/configset'
    },
    {
        src: 'node_modules/@fortinet/fortigate-autoscale/assets/configset/azure/extraports',
        des: 'assets/configset'
    }
];

// zip function app first
console.log(chalk.blueBright('( ͡° ͜ʖ ͡°)'), ' processing function app.');
// remove the zip file if exists.
if (fs.existsSync(fileFuncapp)) {
    fs.unlinkSync(fileFuncapp);
}
console.log(`${chalk.cyan('Removed file:')} ${fileFuncapp}`);
// copy Azure function app related files to dist
azureFunctionAppRequiredFileLocations.forEach(name => add(name, zipFuncapp));
zipFuncapp.writeZip(fileFuncapp);
console.log(`${chalk.cyan('Created zip file:')} ${fileFuncapp}`);

// zip deployment package
console.log(chalk.blueBright('( ͡° ͜ʖ ͡°)'), ' processing deployment package.');
// remove the zip file if exists.
if (fs.existsSync(filePackage)) {
    fs.unlinkSync(filePackage);
}
console.log(`${chalk.cyan('Removed file:')} ${filePackage}`);
// copy project related files
deploymentPackageRequiredFileLocations.forEach(name => add(name, zipPackage));
zipPackage.writeZip(filePackage);
console.log(`${chalk.cyan('Created zip file:')} ${filePackage}`);
console.log(chalk.blueBright('( ͡° ͜ʖ ͡°)'), ' all done.');
