import axios, { AxiosRequestConfig } from 'axios';
import https from 'https';

// NOTE: Due to FortiAnalyer API schema and limitation, cannot use strict code style so
// disable the following eslint rules:

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
export interface ConnectingDevice {
    adm_user: string;
    adm_pass: string;
    mgmt_mode: number;
    mr: number;
    platform_id: number;
}

export class FortiAnalyzerConnector {
    username: string;
    password: string;
    token: string;
    constructor(
        readonly host: string,
        readonly port = 80
    ) {}
    async requestAsync(data): Promise<any> {
        // original command:
        // eslint-disable-next-line max-len
        // let command = `curl -m 5 --silent -k -H "Accept: application/json" -X POST "https://${this.host}:${this.port}/jsonrpc" -d '${JSON.stringify(data)}'`;

        const options: AxiosRequestConfig = {
            method: 'POST',
            headers: {
                Accept: 'application/json'
            },
            url: `https://${this.host}:${this.port}/jsonrpc`,
            data: data, // data in JSON form to sent as request body
            timeout: 30000,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }) // resolve self signed certificate issue
        };
        const response = await axios(options);
        return response.data;
    }

    async connect(username, password): Promise<string> {
        this.username = username;
        this.password = password;
        const connectData = {
            method: 'exec',
            params: [
                {
                    url: '/sys/login/user',
                    data: {
                        user: username,
                        passwd: password
                    }
                }
            ],
            id: 1
        };
        const data = await this.requestAsync(connectData);
        if (data && data.session) {
            this.token = data.session;
            return this.token;
        }
        throw new Error('session not found in data.');
    }

    async listDevices(): Promise<any[]> {
        const data = {
            method: 'get',
            id: '1',
            params: [
                {
                    url: '/dvmdb/device'
                }
            ],
            jsonrpc: '1.0',
            session: this.token
        };
        const result = await this.requestAsync(data);
        if (result && result.result && result.result.length > 0 && result.result[0].data) {
            return result.result[0].data;
        }
        throw new Error(`Invalid result for list devices. Result: ${JSON.stringify(result)}`);
    }

    async authorizeDevice(deviceList): Promise<any> {
        // filter the unregistered device and authorize them
        const devices = deviceList
            .filter(device => {
                // TODO: what criteria to distinguish a unregister device?
                return device;
            })
            .map(device => {
                device.adm_usr = this.username;
                device.adm_pass = this.password;
                device.mgmt_mode = 2; // what it means?
                device.mr = 6; // what it means?
                device.platform_Id = -1; // what it means?
                return device;
            }, this);
        const req = {
            method: 'exec',
            id: '1',
            params: [
                {
                    url: '/dvm/cmd/add/dev-list',
                    data: {
                        flags: ['create_task', 'noblocking'],
                        adom: 'root',
                        'add-dev-list': devices
                    }
                }
            ],
            session: this.token
        };

        return await this.requestAsync(req);
    }
}
