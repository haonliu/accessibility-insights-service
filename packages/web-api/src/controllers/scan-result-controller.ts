// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Context } from '@azure/functions';
import { GuidGenerator, ServiceConfiguration } from 'common';
import { inject, injectable } from 'inversify';
import { Logger } from 'logger';
import { OnDemandPageScanRunResultProvider } from 'service-library';
import { ItemType, OnDemandPageScanResult } from 'storage-documents';

import { Dictionary, isEmpty, keyBy } from 'lodash';
import { webApiIocTypes } from '../setup-ioc-container';
import { ApiController } from './api-controller';

@injectable()
export class ScanResultController extends ApiController {
    public readonly apiVersion = '1.0';
    public readonly apiName = 'get-scan';

    public constructor(
        @inject(webApiIocTypes.azureFunctionContext) protected readonly context: Context,
        @inject(OnDemandPageScanRunResultProvider) private readonly onDemandPageScanRunResultProvider: OnDemandPageScanRunResultProvider,
        @inject(GuidGenerator) private readonly guidGenerator: GuidGenerator,
        @inject(ServiceConfiguration) protected readonly serviceConfig: ServiceConfiguration,
        @inject(Logger) protected readonly logger: Logger,
    ) {
        super();
    }

    public async handleRequest(): Promise<void> {
        const scanId = <string>this.context.bindingData.scanId;
        const isRequestMadeTooSoon = await this.isRequestMadeTooSoon(scanId);
        if (isRequestMadeTooSoon === undefined) {
            return;
        }

        if (isRequestMadeTooSoon === true) {
            // user made the scan result query too soon after the scan request, will return a default response.
            this.context.res = {
                status: 202, // Accepted
                body: this.getDefaultResponse(scanId),
            };
            this.logger.logInfo('scan result queried too soon', { scanId });

            return;
        }

        const scanResultItemMap = await this.getScanResultMapKeyByScanId([scanId]);
        const scanResult = scanResultItemMap[scanId];

        if (isEmpty(scanResult)) {
            // scan result not found
            this.context.res = {
                status: 404,
            };
            this.logger.logInfo('scan result not found', { scanId });
        } else {
            this.context.res = {
                status: 200,
                body: scanResult,
            };

            this.logger.logInfo('scan result fetched', { scanId });
        }
    }

    private async isRequestMadeTooSoon(scanId: string): Promise<boolean> {
        const timeRequested = this.tryGetScanRequestedTime(scanId);
        if (timeRequested === undefined) {
            // the scanId is invalid.
            return undefined;
        }
        const timeCurrent = new Date();
        const scanResultQueryBufferInSeconds = (await this.getRestApiConfig()).scanResultQueryBufferInSeconds;

        return timeCurrent.getTime() - timeRequested.getTime() <= scanResultQueryBufferInSeconds * 1000;
    }

    private async getScanResultMapKeyByScanId(scanIds: string[]): Promise<Dictionary<OnDemandPageScanResult>> {
        const scanResultItems = await this.onDemandPageScanRunResultProvider.readScanRuns(scanIds);

        return keyBy(scanResultItems, item => item.id);
    }

    private tryGetScanRequestedTime(scanId: string): Date {
        try {
            return this.guidGenerator.getGuidTimestamp(scanId);
        } catch (error) {
            this.context.res = {
                status: 422, // Unprocessable Entity,
                body: `Unprocessable Entity: ${scanId}. ${error}`,
            };
        }

        return undefined;
    }

    private getDefaultResponse(scanId: string): OnDemandPageScanResult {
        return {
            id: scanId,
            partitionKey: undefined,
            url: undefined,
            run: {
                state: 'accepted',
            },
            priority: undefined,
            itemType: ItemType.onDemandPageScanRunResult,
        };
    }
}
