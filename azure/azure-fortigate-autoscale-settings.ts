import { SettingItemDictionary, SettingItemReference } from '../core';
import {
    FortiGateAutoscaleSetting,
    FortiGateAutoscaleSettingItemDictionary
} from '../fortigate-autoscale';
// NOTE: every key must start with 'Azure' prefix but the value do not need the prefix
export const AzureFortiGateAutoscaleSetting: SettingItemReference = {
    ...FortiGateAutoscaleSetting,
    AzureFortiGateAutoscaleSettingSaved: 'fortigate-autoscale-setting-saved'
};

export const AzureFortiGateAutoscaleSettingItemDictionary: SettingItemDictionary = {
    ...FortiGateAutoscaleSettingItemDictionary,
    [AzureFortiGateAutoscaleSetting.AzureFortiGateAutoscaleSettingSaved]: {
        keyName: AzureFortiGateAutoscaleSetting.AzureFortiGateAutoscaleSettingSaved,
        description: 'The flag whether FortiGate Autoscale settings are saved in db or not.',
        editable: false,
        jsonEncoded: false,
        booleanType: true
    }
};
