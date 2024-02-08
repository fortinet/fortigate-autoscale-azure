import path from 'path';
import { AutoscaleEnvironment } from './autoscale-environment';
import { AutoscaleSetting, SettingItemDictionary, Settings } from './autoscale-setting';
import { CloudFunctionProxy, CloudFunctionProxyAdapter } from './cloud-function-proxy';
import {
    AutoscaleContext,
    HeartbeatSyncStrategy,
    PrimaryElection,
    PrimaryElectionStrategy,
    PrimaryElectionStrategyResult,
    RoutingEgressTrafficStrategy,
    TaggingVmStrategy,
    VmTagging
} from './context-strategy/autoscale-context';
import {
    LicensingModelContext,
    LicensingStrategy,
    LicensingStrategyResult
} from './context-strategy/licensing-context';
import {
    ScalingGroupContext,
    ScalingGroupStrategy
} from './context-strategy/scaling-group-context';
import { FazIntegrationStrategy } from './faz-integration-strategy';
import { PlatformAdapter } from './platform-adapter';
import {
    HealthCheckRecord,
    HealthCheckResult,
    HealthCheckSyncState,
    PrimaryRecordVoteState
} from './primary-election';
import { VirtualMachine } from './virtual-machine';

export class HttpError extends Error {
    public readonly name: string;
    constructor(
        public status: number,
        message: string
    ) {
        super(message);
        this.name = 'HttpError';
    }
}

/**
 * To provide Cloud Function handling logics
 */
export interface AutoscaleHandler<TReq, TContext, TRes> {
    handleAutoscaleRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
    handleLicenseRequest(
        proxy: CloudFunctionProxy<TReq, TContext, TRes>,
        platform: PlatformAdapter,
        env: AutoscaleEnvironment
    ): Promise<TRes>;
}

export interface AutoscaleCore
    extends AutoscaleContext,
        ScalingGroupContext,
        LicensingModelContext {
    platform: PlatformAdapter;
    proxy: CloudFunctionProxyAdapter;
    env: AutoscaleEnvironment;
    init(): Promise<void>;
    saveSettings(
        input: { [key: string]: string },
        itemDict: SettingItemDictionary
    ): Promise<boolean>;
}

export interface HAActivePassiveBoostrapStrategy {
    prepare(election: PrimaryElection): Promise<void>;
    result(): Promise<PrimaryElection>;
}

export abstract class Autoscale implements AutoscaleCore {
    settings: Settings;
    taggingAutoscaleVmStrategy: TaggingVmStrategy;
    routingEgressTrafficStrategy: RoutingEgressTrafficStrategy;
    scalingGroupStrategy: ScalingGroupStrategy;
    heartbeatSyncStrategy: HeartbeatSyncStrategy;
    primaryElectionStrategy: PrimaryElectionStrategy;
    licensingStrategy: LicensingStrategy;
    fazIntegrationStrategy: FazIntegrationStrategy;
    abstract get platform(): PlatformAdapter;
    abstract set platform(p: PlatformAdapter);
    abstract get proxy(): CloudFunctionProxyAdapter;
    abstract set proxy(x: CloudFunctionProxyAdapter);
    abstract get env(): AutoscaleEnvironment;
    abstract set env(e: AutoscaleEnvironment);
    setScalingGroupStrategy(strategy: ScalingGroupStrategy): void {
        this.scalingGroupStrategy = strategy;
    }
    setPrimaryElectionStrategy(strategy: PrimaryElectionStrategy): void {
        this.primaryElectionStrategy = strategy;
    }
    setHeartbeatSyncStrategy(strategy: HeartbeatSyncStrategy): void {
        this.heartbeatSyncStrategy = strategy;
    }
    setTaggingAutoscaleVmStrategy(strategy: TaggingVmStrategy): void {
        this.taggingAutoscaleVmStrategy = strategy;
    }
    setRoutingEgressTrafficStrategy(strategy: RoutingEgressTrafficStrategy): void {
        this.routingEgressTrafficStrategy = strategy;
    }
    setLicensingStrategy(strategy: LicensingStrategy): void {
        this.licensingStrategy = strategy;
    }
    setFazIntegrationStrategy(strategy: FazIntegrationStrategy): void {
        this.fazIntegrationStrategy = strategy;
    }
    async init(): Promise<void> {
        await this.platform.init();
    }

    async handleLaunchingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchingVm.');
        const result = await this.scalingGroupStrategy.onLaunchingVm();
        this.proxy.logAsInfo('called handleLaunchingVm.');
        return result;
    }
    async handleLaunchedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleLaunchedVm.');
        const result = await this.scalingGroupStrategy.onLaunchedVm();
        this.proxy.logAsInfo('called handleLaunchedVm.');
        return result;
    }
    async handleVmNotLaunched(): Promise<string> {
        this.proxy.logAsInfo('calling handleVmNotLaunched.');
        const result = await this.scalingGroupStrategy.onLaunchedVm();
        this.proxy.logAsInfo('called handleVmNotLaunched.');
        return result;
    }
    async handleTerminatingVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatingVm.');
        // NOTE: There are some rare cases when vm is terminating before being added to monitor,
        // for instance, vm launch unsuccessful.
        // In such case, no health check record for the vm is created in the DB. Need to check
        // if it is needed to update heartbeat sync status so do additional checking as below:

        const targetVm = this.env.targetVm || (await this.platform.getTargetVm());
        // fetch the health check record
        this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
            this.env.targetVm.id
        );
        // the following handling are conditional
        if (this.env.targetHealthCheckRecord) {
            // in terminating vm, should do:
            // 1. mark it as heartbeat out-of-sync to prevent it from syncing again.
            // load target vm
            this.heartbeatSyncStrategy.prepare(targetVm);
            const success = await this.heartbeatSyncStrategy.forceOutOfSync();
            if (success) {
                this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                    this.env.targetVm.id
                );
            }
            // 2. if it is a primary vm, remove its primary tag
            if (this.platform.vmEquals(targetVm, this.env.primaryVm)) {
                const vmTaggings: VmTagging[] = [
                    {
                        vmId: targetVm.id,
                        clear: true
                    }
                ];
                await this.handleTaggingAutoscaleVm(vmTaggings);
            }
        }
        // ASSERT: this.scalingGroupStrategy.onTerminatingVm() creates a terminating lifecycle item
        await this.scalingGroupStrategy.onTerminatingVm();
        await this.scalingGroupStrategy.completeTerminating(true);
        this.proxy.logAsInfo('called handleTerminatingVm.');
        return '';
    }
    async handleTerminatedVm(): Promise<string> {
        this.proxy.logAsInfo('calling handleTerminatedVm.');
        const result = await this.scalingGroupStrategy.onTerminatedVm();
        this.proxy.logAsInfo('called handleTerminatedVm.');
        return result;
    }
    async handleHeartbeatSync(): Promise<string> {
        this.proxy.logAsInfo('calling handleHeartbeatSync.');
        const settings = await this.platform.getSettings();
        let response = '';
        let error: Error;
        const unhealthyVms: VirtualMachine[] = [];

        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            error = new Error(`Requested non-existing vm (id:${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        // prepare to apply the heartbeatSyncStrategy to get vm health check records
        // ASSERT: this.env.targetVm is available
        this.heartbeatSyncStrategy.prepare(this.env.targetVm);
        // apply the heartbeat sync strategy to be able to get vm health check records
        await this.heartbeatSyncStrategy.apply();
        // ASSERT: the heartbeatSyncStrategy is done

        // load target health check record
        if (this.heartbeatSyncStrategy.targetHealthCheckRecord.upToDate) {
            this.env.targetHealthCheckRecord = this.heartbeatSyncStrategy.targetHealthCheckRecord;
        }
        // if it's not up to date, load it from db.
        else {
            this.env.targetHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.targetVm.id
            );
        }

        const isFirstHeartbeat = this.heartbeatSyncStrategy.targetVmFirstHeartbeat;

        // the 1st hb is also the indication of the the vm is fully configured and becoming
        // in-service. Run the onVmFullyConfigured() hook. Platform specific class can override
        // the hook to perform additional actions.
        if (isFirstHeartbeat) {
            await this.onVmFullyConfigured();
        }

        const heartbeatResult = await this.heartbeatSyncStrategy.healthCheckResultDetail;
        const heartbeatTiming = heartbeatResult.result;
        let notificationSubject: string;
        let notificationMessage: string;
        const terminateUnhealthyVmSettingItem = settings.get(AutoscaleSetting.TerminateUnhealthyVm);
        const terminateUnhealthyVm =
            terminateUnhealthyVmSettingItem && terminateUnhealthyVmSettingItem.truthValue;

        // If the timing indicates that it should be dropped,
        // don't update. Respond immediately. return.
        if (heartbeatTiming === HealthCheckResult.Dropped) {
            return '';
        } else if (heartbeatTiming === HealthCheckResult.Recovering) {
            notificationSubject = 'FortiGate Autoscale out-of-sync VM is recovering';
            notificationMessage =
                `FortiGate (id: ${this.env.targetVm.id}) is recovering from` +
                ` an out-of-sync state. It requires ${heartbeatResult.syncRecoveryCount}` +
                ` out of ${heartbeatResult.maxSyncRecoveryCount} more on-time heartbeat(s)` +
                ' to go back to the in-sync state.\n\n' +
                'Note: If a new primary election is needed,' +
                ' only VM in in-sync state can be an eligible primary role.';
            await this.sendAutoscaleNotifications(
                this.env.targetVm,
                notificationMessage,
                notificationSubject
            );
        } else if (heartbeatTiming === HealthCheckResult.Recovered) {
            notificationSubject = 'FortiGate Autoscale out-of-sync VM is recovered';
            notificationMessage =
                `FortiGate (id: ${this.env.targetVm.id}) is recovered from` +
                ' the out-of-sync state and now is in-sync. It will participate in' +
                ' any further primary election.';
            await this.sendAutoscaleNotifications(
                this.env.targetVm,
                notificationMessage,
                notificationSubject
            );
        }

        // If the timing indicates that it is a late heartbeat,
        // send notification for late heartbeat
        else if (heartbeatTiming === HealthCheckResult.Late) {
            notificationSubject = 'FortiGate Autoscale late heartbeat occurred';
            notificationMessage =
                `One late heartbeat occurred on FortiGate (id: ${this.env.targetVm.id}` +
                `, ip: ${this.env.targetVm.primaryPrivateIpAddress}).\n\nDetails:\n` +
                ` heartbeat sequence: ${heartbeatResult.sequence},\n` +
                ` expected arrive time: ${heartbeatResult.expectedArriveTime} ms,\n` +
                ` actual arrive time: ${heartbeatResult.actualArriveTime} ms,\n` +
                ` actual delay: ${heartbeatResult.actualDelay} ms,\n` +
                ` delay allowance: ${heartbeatResult.delayAllowance} ms,\n` +
                ` adjusted delay: ${heartbeatResult.calculatedDelay} ms,\n` +
                ' heartbeat interval:' +
                ` ${heartbeatResult.oldHeartbeatInerval}->${heartbeatResult.heartbeatInterval} ms,\n` +
                ' heartbeat loss count:' +
                ` ${heartbeatResult.heartbeatLossCount}/${heartbeatResult.maxHeartbeatLossCount}.\n\n` +
                'Note: once the VM heartbeat loss count reached the ' +
                `maximum count ${heartbeatResult.maxHeartbeatLossCount},` +
                ' it enters into out-of-sync state.';
            if (terminateUnhealthyVm) {
                notificationMessage =
                    `${notificationMessage}\n\n` +
                    'Out-of-sync (unhealthy) VM will be terminated.' +
                    ' Termination on unhealthy' +
                    " VM is turned 'on' in the FortiGate Autoscale Settings." +
                    " The configuration can be manually turned 'off'.";
            } else {
                notificationMessage =
                    `${notificationMessage}\n\n` +
                    'Out-of-sync (unhealthy) VM will be temporarily excluded from' +
                    ' further primary election until it recovers and becomes in-sync again.' +
                    ' Termination on unhealthy' +
                    " VM is turned 'off' in the FortiGate Autoscale Settings." +
                    " The configuration can be manually turned 'on'.";
            }
            await this.sendAutoscaleNotifications(
                this.env.targetVm,
                notificationMessage,
                notificationSubject
            );
        }

        // if primary exists?
        // get primary vm
        this.env.primaryVm = this.env.primaryVm || (await this.platform.getPrimaryVm());

        // get primary healthcheck record
        if (this.env.primaryVm) {
            this.env.primaryHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.primaryVm.id
            );
        } else {
            this.env.primaryHealthCheckRecord = undefined;
        }

        // is the primary responsive?
        if (
            this.env.primaryHealthCheckRecord &&
            this.env.primaryHealthCheckRecord.irresponsivePeriod > 0
        ) {
            this.env.primaryHealthCheckRecord.healthy = false;
            this.env.primaryHealthCheckRecord.syncState = HealthCheckSyncState.OutOfSync;
        }

        // get primary record
        this.env.primaryRecord = this.env.primaryRecord || (await this.platform.getPrimaryRecord());

        // about to handle to the primary election

        // NOTE: primary election relies on health check record of both target and primary vm,
        // ensure the two values are up to date.

        // ASSERT: the following values are up-to-date before handling primary election.
        // this.env.targetVm
        // this.env.primaryVm
        // this.env.primaryRecord

        const primaryElection = await this.handlePrimaryElection();

        // handle unhealthy vm

        // target not healthy?

        // if new primary is elected, reload the primaryVm, primary record to this.env.
        if (primaryElection.newPrimary) {
            this.env.primaryVm = primaryElection.newPrimary;
            this.env.primaryRecord = primaryElection.newPrimaryRecord;
            // load the healthcheck record for the primary
            this.env.primaryHealthCheckRecord = await this.platform.getHealthCheckRecord(
                this.env.primaryVm.id
            );

            // what to do with the old primary?

            // old primary unhealthy?
            const oldPrimaryHealthCheck =
                primaryElection.oldPrimary &&
                (await this.platform.getHealthCheckRecord(primaryElection.oldPrimary.id));
            // if the primary vm is gone, no one will update the health check record so the record
            // will be stale. compare the irresponsivePeriod against the remainingLossAllowed to
            // see if the vm should be cleanup from the monitor
            const oldPrimaryIsStale =
                oldPrimaryHealthCheck &&
                (!oldPrimaryHealthCheck.healthy ||
                    oldPrimaryHealthCheck.irresponsivePeriod >=
                        oldPrimaryHealthCheck.remainingLossAllowed);
            if (oldPrimaryIsStale) {
                if (
                    unhealthyVms.filter(vm => {
                        return this.platform.vmEquals(vm, primaryElection.oldPrimary);
                    }).length === 0
                ) {
                    unhealthyVms.push(primaryElection.oldPrimary);
                }
            }
        }

        // ASSERT: target healthcheck record is up to date
        if (!this.env.targetHealthCheckRecord.healthy) {
            if (
                unhealthyVms.filter(vm => {
                    return this.platform.vmEquals(vm, this.env.targetVm);
                }).length === 0
            ) {
                unhealthyVms.push(this.env.targetVm);
            }
        }

        await this.handleUnhealthyVm(unhealthyVms);

        // if target is unhealthy, respond immediately as if the heartbeat sync normally completed.
        if (!this.env.targetHealthCheckRecord.healthy) {
            this.proxy.logAsInfo('called handleHeartbeatSync.');
            return response;
        }

        // the health check record may need to update again.
        let needToUpdateHealthCheckRecord = false;
        let primaryIpHasChanged = false;
        let updatedPrimaryIp: string;

        // if there's a new primary elected, and the new primary ip doesn't match the primary ip of
        // the target, assign the new primary to the target
        if (
            primaryElection.newPrimary &&
            this.env.targetHealthCheckRecord.primaryIp !==
                primaryElection.newPrimary.primaryPrivateIpAddress
        ) {
            needToUpdateHealthCheckRecord = true;
            primaryIpHasChanged = true;
            updatedPrimaryIp = primaryElection.newPrimary.primaryPrivateIpAddress;
        }
        // if there's an old primary, and it's in healthy state, and the target vm doesn't have
        // an assigned primary ip, or the primary ip is different, assign the old healthy primary to it
        else if (
            primaryElection.oldPrimary &&
            this.env.primaryVm &&
            this.env.primaryHealthCheckRecord &&
            primaryElection.oldPrimary.id === this.env.primaryVm.id &&
            this.env.primaryHealthCheckRecord.healthy &&
            this.env.targetHealthCheckRecord.primaryIp !==
                primaryElection.oldPrimary.primaryPrivateIpAddress
        ) {
            needToUpdateHealthCheckRecord = true;
            primaryIpHasChanged = true;
            updatedPrimaryIp = primaryElection.oldPrimary.primaryPrivateIpAddress;
        }

        if (primaryElection.newPrimary) {
            // add primary tag to the new primary
            const vmTaggings: VmTagging[] = [
                {
                    vmId: primaryElection.newPrimary.id,
                    newVm: false, // ASSERT: vm making heartbeat sync request isn't a new vm
                    newPrimaryRole: true
                }
            ];
            await this.handleTaggingAutoscaleVm(vmTaggings);

            // need to update egress traffic route when primary role has changed.
            // egress traffic route table is set in in EgressTrafficRouteTableList
            await this.handleEgressTrafficRoute();
        }

        // need to update the health check record again due to primary ip changes.
        if (needToUpdateHealthCheckRecord) {
            this.env.targetHealthCheckRecord.primaryIp = updatedPrimaryIp;
            await this.platform
                .updateHealthCheckRecord(this.env.targetHealthCheckRecord)
                .catch(err => {
                    this.proxy.logForError('Error in updating health check record', err);
                });
            if (primaryIpHasChanged) {
                response = JSON.stringify({
                    'master-ip': updatedPrimaryIp,
                    'primary-ip': updatedPrimaryIp
                });
                this.proxy.logAsInfo('Primary IP has changed to');
                this.proxy.logAsDebug(`New primary IP: ${updatedPrimaryIp}`);
                this.proxy.logAsDebug(`Response: ${response}`);
            }
        }
        this.proxy.logAsInfo('called handleHeartbeatSync.');
        return response;
    }
    async handleTaggingAutoscaleVm(taggings: VmTagging[]): Promise<void> {
        this.proxy.logAsInfo('calling handleTaggingAutoscaleVm.');
        this.taggingAutoscaleVmStrategy.prepare(taggings);
        await this.taggingAutoscaleVmStrategy.apply();
        this.proxy.logAsInfo('called handleTaggingAutoscaleVm.');
    }

    async handlePrimaryElection(): Promise<PrimaryElection> {
        this.proxy.logAsInfo('calling handlePrimaryElection.');
        const settings = await this.platform.getSettings();
        const electionTimeout = Number(settings.get(AutoscaleSetting.PrimaryElectionTimeout).value);
        let election: PrimaryElection = {
            oldPrimary: this.env.primaryVm,
            oldPrimaryRecord: this.env.primaryRecord,
            newPrimary: null,
            newPrimaryRecord: null,
            candidate: this.env.targetVm,
            candidateHealthCheck: this.env.targetHealthCheckRecord || undefined,
            electionDuration: electionTimeout,
            signature: null
        };
        // the action for updating primary record
        let action: 'save' | 'delete' | 'noop' = 'noop';
        let redoElection = false;
        let reloadPrimaryRecord = false;

        // in general, possible primary election results include:
        // 1. ineligible candidate, no existing election, no reference to the new primary vm, no reference to the old primary vm
        // 2. ineligible candidate, no existing election, no reference to the new primary vm, has reference to the old primary vm
        // 3. existing primary election is pending, this vm is the new primary vm, has a reference to the old primary vm
        // 4. existing primary eleciion is pending, this vm is not the new primary, has a reference to new primary vm, has no reference to the old primary vm
        // 5. existing primary election is done, this vm is the new primary, has reference to the old primary
        // 6. existing primary election is done, this vm is not the new primary, has reference to the new primary vm, has no fererence to the new primary vm

        // Primary Election handling diagram is available in: https://github.com/fortinet/autoscale-core
        // workflow: if primary record not exists, start a new election
        if (!this.env.primaryRecord) {
            // flag the action now, and handle it later, separately.
            action = 'save';
            // need to redo election
            redoElection = true;
            // should reload the primary record
            reloadPrimaryRecord = true;
        }
        // else, primary record exists
        else {
            // workflow: check the existing primary record state
            // vote state: pending
            if (this.env.primaryRecord.voteState === PrimaryRecordVoteState.Pending) {
                // workflow: check the current vm ID
                // the target is the pending primary
                if (
                    this.env.targetVm &&
                    this.env.primaryVm &&
                    this.env.targetVm.id === this.env.primaryVm.id
                ) {
                    // workflow: check the vm health state
                    // vm is healthy
                    if (
                        this.env.targetHealthCheckRecord &&
                        this.env.targetHealthCheckRecord.healthy &&
                        this.env.targetHealthCheckRecord.syncState === HealthCheckSyncState.InSync
                    ) {
                        // change the election to done
                        this.env.primaryRecord.voteState = PrimaryRecordVoteState.Done;
                        // update the election result
                        // reference the new primary to the target vm
                        election.newPrimary = this.env.targetVm;
                        election.newPrimaryRecord = this.env.primaryRecord;
                        // need to save primary record,
                        // flag the action now, and handle it later, separately.
                        action = 'save';
                        // do not need to redo election
                        redoElection = false;
                        // should reload the primary record
                        reloadPrimaryRecord = true;
                    }
                    // vm is unhealthy
                    else {
                        // need to delete the primary record,
                        // flag the action now, and handle it later, separately.
                        action = 'delete';
                        // do not need to redo election
                        redoElection = false;
                        // should reload the primary record
                        reloadPrimaryRecord = true;
                    }
                }
                // the target vm isn't the pending primary
                else {
                    // workflow: handling ends and returns election result
                    // do nothing in this case
                    // flag the action now, and handle it later, separately.
                    action = 'noop';
                    // do not need to redo election
                    redoElection = false;
                    // should not reload primary record
                    reloadPrimaryRecord = false;
                }
            }
            // vote state: timeout
            else if (this.env.primaryRecord.voteState === PrimaryRecordVoteState.Timeout) {
                // if primary election already timeout, redo the primary election
                // workflow: if state is timeout -> delete primary record
                // need to delete the primary record,
                // flag the action now, and handle it later, separately.
                action = 'delete';
                // should redo the primary election
                redoElection = true;
                // should reload the primary record
                reloadPrimaryRecord = true;
            }
            // vote state: done
            else if (this.env.primaryRecord.voteState === PrimaryRecordVoteState.Done) {
                // workflow: check the health state of recorded primary vm
                if (this.env.primaryVm) {
                    this.env.primaryHealthCheckRecord = await this.platform.getHealthCheckRecord(
                        this.env.primaryVm.id
                    );
                    // is the primary responsive?
                    if (
                        this.env.primaryHealthCheckRecord &&
                        this.env.primaryHealthCheckRecord.irresponsivePeriod > 0
                    ) {
                        this.env.primaryHealthCheckRecord.healthy = false;
                        this.env.primaryHealthCheckRecord.syncState =
                            HealthCheckSyncState.OutOfSync;
                    }
                }
                if (
                    this.env.primaryHealthCheckRecord &&
                    this.env.primaryHealthCheckRecord.syncState === HealthCheckSyncState.InSync
                ) {
                    // primary vm is healthy
                    // workflow: handling ends and returns election result
                    // do nothing in this case
                    // flag the action now, and handle it later, separately.
                    action = 'noop';
                    // do not need to redo election
                    redoElection = false;
                    // should not reload the primary record
                    reloadPrimaryRecord = false;
                }
                // otherwise,
                else {
                    // primary mv is unhealthy
                    // workflow: if vm is healthy  -- (false) -> delete primary record
                    // need to delete the primary record,
                    // flag the action now, and handle it later, separately.
                    action = 'delete';
                    // should redo the primary election
                    redoElection = true;
                    // should reload the primary record
                    reloadPrimaryRecord = true;
                }
            }
        }

        // dealing with updating the primary record
        if (action === 'delete') {
            // NOTE: providing the primary record data to put strict condition on the deletion
            try {
                this.proxy.logAsInfo(
                    'Delete the current primary record: ',
                    JSON.stringify(this.env.primaryRecord)
                );
                await this.platform.deletePrimaryRecord(this.env.primaryRecord);
            } catch (error) {
                // unable to delete but that is okay. no impact
                this.proxy.logAsWarning(
                    'Unable to delete. This message can be discarded. ' + `error: ${error}`
                );
            }
        }
        // primary election need to redo?
        if (redoElection) {
            try {
                this.proxy.logAsInfo('Primary election starting now.');
                // because it needs to redo the election, all those stale health check records
                // should be removed.
                await this.handleStaleVm();
                await this.primaryElectionStrategy.prepare(election);
                // workflow: start a new primary election
                const decision = await this.primaryElectionStrategy.apply();
                // get the election result.
                election = await this.primaryElectionStrategy.result();
                // if new primary election started
                // election will be avaialble: new primary vm and new primary record will not be null
                this.env.primaryRecord = election.newPrimaryRecord;
                this.env.primaryVm = election.newPrimary;
                // only when primary record isn't null, it needs to save the primary record
                if (election.newPrimary && election.newPrimaryRecord) {
                    this.proxy.logAsInfo(
                        'Primary election strategy completed.' +
                            ` The new primary is: vmId: ${election.newPrimaryRecord.vmId},` +
                            ` ip: ${election.newPrimaryRecord.ip}.`
                    );
                    // If the target VM is new elected primary, and is already in the monitor,
                    // can resolve the primary immediately
                    // otherwise, the primary election will be resolved when the elected primary
                    // state becomes in-service
                    if (
                        this.platform.vmEquals(this.env.targetVm, election.newPrimary) &&
                        this.env.targetHealthCheckRecord
                    ) {
                        election.newPrimaryRecord.voteEndTime = Date.now(); // election ends immediately
                        election.newPrimaryRecord.voteState = PrimaryRecordVoteState.Done;
                    }
                    // send notification
                    await this.sendAutoscaleNotifications(
                        this.env.targetVm,
                        'An Autoscale primary election was just completed successfully.\n' +
                            `The new primary is: vmId: ${election.newPrimaryRecord.vmId},` +
                            ` ip: ${election.newPrimaryRecord.ip}.`,
                        'Autoscale Primary Election Occurred (Sucess)'
                    );
                    action = 'save';
                    // should reload primary record
                    reloadPrimaryRecord = true;
                } else {
                    // if primary election is needed but no primary can be elected, should send
                    // notifications to ask for manual observation or troubleshooting
                    if (decision === PrimaryElectionStrategyResult.CannotDeterminePrimary) {
                        this.proxy.logAsWarning(
                            'Autoscale unable to determine the new primary device'
                        );
                        await this.sendAutoscaleNotifications(
                            this.env.targetVm,
                            'The Autoscale primary election strategy cannot automatically' +
                                ' determine the new primary device using the device information.' +
                                ' Manually configuring the primary device is needed.',
                            'Autoscale unable to determine the new primary device'
                        );
                    }
                    // NOTE: wait for the next round
                    else if (decision === PrimaryElectionStrategyResult.SkipAndContinue) {
                        // TODO: any action to take here?
                        this.proxy.logAsInfo(
                            'Primary election strategy suggests that election' +
                                ' should skip this round and will restart in the next round.'
                        );
                    }
                    // do not need to save the primary record
                    action = 'noop';
                    // should not reload the primary record
                    reloadPrimaryRecord = false;
                }
            } catch (error) {
                this.proxy.logForError('Primary election does not start. Error occurs.', error);
                // do not need to save the primary record
                action = 'noop';
                // election isn't needed so new primary should be null
                election.newPrimary = null;
                election.newPrimaryRecord = null;
                // should not reload the primary record
                reloadPrimaryRecord = false;
            }
        } else {
            // election isn't needed so new primary should be null
            election.newPrimary = null;
            election.newPrimaryRecord = null;
        }

        if (action === 'save') {
            // CAUTION: there may be race conditions when updating the primary record
            try {
                this.proxy.logAsInfo(
                    'Saving the primary record. ',
                    JSON.stringify(this.env.primaryRecord)
                );
                // NOTE: this is an upsert operation
                await this.platform.updatePrimaryRecord(this.env.primaryRecord);
                // primary record is saved, need to reload it
                reloadPrimaryRecord = true;
            } catch (error) {
                // primary record is not saved, need to reload it anyway
                reloadPrimaryRecord = true;
                this.proxy.logForError('Unable to save primary record. ', error);
            }
        }

        if (reloadPrimaryRecord) {
            this.env.primaryRecord = await this.platform.getPrimaryRecord();
            this.env.primaryVm = await this.platform.getPrimaryVm();
        }

        this.proxy.logAsInfo('called handlePrimaryElection.');
        return election;
    }
    async handleStaleVm(): Promise<HealthCheckRecord[]> {
        const [activeVms, healthcheckRecords] = await Promise.all([
            this.platform.listAutoscaleVm(false, false),
            this.platform.listHealthCheckRecord()
        ]);
        const activeVmIds = activeVms.map(vm => vm.id);
        const activeHealthCheckRecords = healthcheckRecords.filter(rec =>
            activeVmIds.includes(rec.vmId)
        );
        const staleHealthCheckRecords = healthcheckRecords.filter(
            rec => !activeVmIds.includes(rec.vmId)
        );
        // delete those stale healthcheck records
        await Promise.all(
            staleHealthCheckRecords.map(rec => {
                this.proxy.logAsInfo(
                    `Deleting health check record of vm (id: ${rec.vmId}) ` +
                        'that no longer exists.'
                );
                return this.platform.deleteHealthCheckRecord(rec);
            })
        );
        return activeHealthCheckRecords;
    }
    async handleUnhealthyVm(vms: VirtualMachine[]): Promise<void> {
        this.proxy.logAsInfo('calling handleUnhealthyVm.');
        // call the platform scaling group to terminate the vm in the list
        const settings = await this.platform.getSettings();
        const terminateUnhealthyVmSettingItem = settings.get(AutoscaleSetting.TerminateUnhealthyVm);
        const terminateUnhealthyVm =
            terminateUnhealthyVmSettingItem && terminateUnhealthyVmSettingItem.truthValue;
        const vmHandler = async (vm: VirtualMachine): Promise<void> => {
            this.proxy.logAsInfo(`handling unhealthy vm(id: ${vm.id})...`);
            const subject = 'Autoscale unhealthy vm is detected';
            let message =
                `Device (id: ${vm.id}, ip: ${vm.primaryPrivateIpAddress}) has` +
                ' been deemed unhealthy and marked as out-of-sync by the Autoscale.\n\n';
            this.proxy.logAsWarning(
                'Termination of unhealthy vm is ' +
                    `${terminateUnhealthyVm ? 'enabled' : 'disabled'}.` +
                    ` vm (id: ${vm.id}) will ${terminateUnhealthyVm ? '' : 'not '}be deleted.`
            );
            // if termination of unhealthy vm is set to true, terminate it
            if (terminateUnhealthyVm) {
                try {
                    await this.platform.deleteVmFromScalingGroup(vm.id);
                    // delete corresponding health check record
                    const healthcheckRecord = await this.platform.getHealthCheckRecord(vm.id);
                    if (healthcheckRecord) {
                        await this.platform.deleteHealthCheckRecord(healthcheckRecord);
                    }
                    try {
                        message +=
                            'Autoscale is now terminating this device.\n' +
                            'Depending on the scaling policies, a replacement device may be created.' +
                            ' Further investigation for the cause of termination may be necessary.';
                        this.sendAutoscaleNotifications(vm, message, subject);
                        this.proxy.logAsInfo(`handling vm (id: ${vm.id}) completed.`);
                    } catch (err) {
                        this.proxy.logForError('unable to send Autoscale notifications.', err);
                    }
                } catch (error) {
                    this.proxy.logForError('handling unhealthy vm failed.', error);
                }
            }
            // otherwise, send a warning for this unhealthy vm and keep it
            else {
                // get the health check record for the vm.
                const healthcheckRecord = await this.platform.getHealthCheckRecord(vm.id);
                try {
                    message +=
                        ' This device is excluded from being candidate of primary device.\n' +
                        ` It requires (${healthcheckRecord.syncRecoveryCount})` +
                        ' on-time heartbeats to recover from out-of-sync state to in-sync state.\n' +
                        ' A full recovery will include this device into primary elections again.\n';
                    this.sendAutoscaleNotifications(vm, message, subject);
                } catch (err) {
                    this.proxy.logForError('unable to send Autoscale notifications.', err);
                }
            }
        };
        await Promise.all(vms.map(vmHandler));
        this.proxy.logAsInfo('called handleUnhealthyVm.');
    }
    async handleLicenseAssignment(productName: string): Promise<string> {
        this.proxy.logAsInfo('calling handleLicenseAssignment.');
        // load target vm
        if (!this.env.targetVm) {
            this.env.targetVm = await this.platform.getTargetVm();
        }
        // if target vm doesn't exist, unknown request
        if (!this.env.targetVm) {
            const error = new Error(`Requested non - existing vm(id: ${this.env.targetId}).`);
            this.proxy.logForError('', error);
            throw error;
        }
        const settings = await this.platform.getSettings();
        // assume to use the custom asset container as the storage directory for license files.
        const customAssetContainer =
            (settings.get(AutoscaleSetting.CustomAssetContainer) &&
                settings.get(AutoscaleSetting.CustomAssetContainer).value) ||
            '';
        const customAssetDirectory =
            (settings.get(AutoscaleSetting.CustomAssetDirectory) &&
                settings.get(AutoscaleSetting.CustomAssetDirectory).value) ||
            '';
        const defaultAssetContainer =
            (settings.get(AutoscaleSetting.AssetStorageContainer) &&
                settings.get(AutoscaleSetting.AssetStorageContainer).value) ||
            '';
        const defaultAssetDirectory =
            (settings.get(AutoscaleSetting.AssetStorageDirectory) &&
                settings.get(AutoscaleSetting.AssetStorageDirectory).value) ||
            '';
        const licenseFileDirectory =
            (settings.get(AutoscaleSetting.LicenseFileDirectory) &&
                settings.get(AutoscaleSetting.LicenseFileDirectory).value) ||
            '';
        const assetContainer = customAssetContainer || defaultAssetContainer;
        const assetDirectory =
            (customAssetContainer && customAssetDirectory) || defaultAssetDirectory;

        const licenseDirectory: string = path.posix.join(
            assetDirectory,
            licenseFileDirectory,
            productName
        );
        this.licensingStrategy.prepare(
            this.env.targetVm,
            productName,
            assetContainer,
            licenseDirectory
        );
        let result: LicensingStrategyResult;
        let licenseContent = '';
        try {
            result = await this.licensingStrategy.apply();
        } catch (e) {
            this.proxy.logForError('Error in running licensing strategy.', e);
        }
        if (result === LicensingStrategyResult.LicenseAssigned) {
            licenseContent = await this.licensingStrategy.getLicenseContent();
        } else if (result === LicensingStrategyResult.LicenseNotRequired) {
            this.proxy.logAsInfo(
                `license isn't required for this vm (id: ${this.env.targetVm.id})`
            );
        } else if (result === LicensingStrategyResult.LicenseOutOfStock) {
            const notificationSubject = 'FortiGate Autoscale license assignment error';
            const notificationMessage =
                `FortiGate (id: ${this.env.targetVm.id}) cannot be assigned a license` +
                ' because all available licenses have been allocated.' +
                ' Please check the Autoscale handler function logs for more details.';
            await this.sendAutoscaleNotifications(
                this.env.targetVm,
                notificationMessage,
                notificationSubject
            );
            this.proxy.logAsError(
                'License out of stock. ' +
                    `No license is assigned to this vm (id: ${this.env.targetVm.id})`
            );
        }
        this.proxy.logAsInfo('called handleLicenseAssignment.');
        return licenseContent;
    }

    async saveSettings(
        input: { [key: string]: string },
        itemDict: SettingItemDictionary
    ): Promise<boolean> {
        const errorTasks: string[] = [];
        const unsupportedKeys: string[] = [];
        const settingItemDefKey: string[] = Object.keys(itemDict);
        const tasks = Object.entries(input).map(([settingKey, settingValue]) => {
            const key = settingKey.toLowerCase();
            if (settingItemDefKey.includes(key)) {
                const def = itemDict[key];
                let value = settingValue;
                if (def.booleanType) {
                    value = (settingValue === 'true' && 'true') || 'false';
                }

                return this.platform
                    .saveSettingItem(
                        def.keyName,
                        value,
                        def.description,
                        def.jsonEncoded,
                        def.editable
                    )
                    .then(() => true)
                    .catch(error => {
                        this.proxy.logForError(`failed to save setting for key: ${key}. `, error);
                        errorTasks.push(key);
                        return true;
                    });
            } else {
                unsupportedKeys.push(key);
                return Promise.resolve(true);
            }
        });

        if (unsupportedKeys.length > 0) {
            this.proxy.logAsWarning(
                `Unsupported setting cannot be saved: ${unsupportedKeys.join(', ')}.`
            );
        }

        await Promise.all(tasks);
        return errorTasks.length === 0;
    }

    onVmFullyConfigured(): Promise<void> {
        this.proxy.logAsInfo(`Vm (id: ${this.env.targetVm.id}) is fully configured.`);
        return Promise.resolve();
    }

    async handleEgressTrafficRoute(): Promise<void> {
        this.proxy.logAsInfo('calling handleEgressTrafficRoute.');
        await this.routingEgressTrafficStrategy.apply();
        this.proxy.logAsInfo('called handleEgressTrafficRoute.');
    }

    sendAutoscaleNotifications(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        vm: VirtualMachine,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        message?: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        subject?: string
    ): Promise<void> {
        this.proxy.logAsWarning('sendAutoscaleNotifications not implemented.');
        return Promise.resolve();
    }
}

type FinderRef = { [key: string]: FinderRef } | [] | string | null;
export function configSetResourceFinder(resObject: FinderRef, nodePath: string): FinderRef {
    const [, mPath] = nodePath.match(/^{(.+)}$/i);
    if (!resObject || !nodePath) {
        return '';
    }
    const nodes = mPath.split('.');
    let ref = resObject;

    nodes.find(nodeName => {
        const matches = nodeName.match(/^([A-Za-z_@-]+)#([0-9])+$/i);
        if (matches && Array.isArray(ref[matches[1]]) && ref[matches[1]].length > matches[2]) {
            ref = ref[matches[1]][matches[2]];
        } else if (!ref[nodeName]) {
            ref = null;
            return null;
        } else {
            ref =
                Array.isArray(ref[nodeName]) && ref[nodeName].length > 0
                    ? ref[nodeName][0]
                    : ref[nodeName];
        }
    });
    return ref;
}
