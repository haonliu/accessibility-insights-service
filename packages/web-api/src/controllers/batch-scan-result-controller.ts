// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Context } from '@azure/functions';
import { GuidGenerator, ServiceConfiguration } from 'common';
import { inject, injectable } from 'inversify';
import { isEmpty } from 'lodash';
import { Logger } from 'logger';
import { OnDemandPageScanRunResultProvider } from 'service-library';
import { OnDemandPageScanResultResponse } from 'storage-documents';

import { webApiIocTypes } from '../setup-ioc-container';
import { ScanBatchRequest } from './../api-contracts/scan-batch-request';
import { BaseScanResultController } from './base-scan-result-controller';

@injectable()
export class BatchScanResultController extends BaseScanResultController {
    public readonly apiVersion = '1.0';
    public readonly apiName = 'get-scans';

    public constructor(
        @inject(webApiIocTypes.azureFunctionContext) protected readonly context: Context,
        @inject(OnDemandPageScanRunResultProvider) protected readonly onDemandPageScanRunResultProvider: OnDemandPageScanRunResultProvider,
        @inject(GuidGenerator) protected readonly guidGenerator: GuidGenerator,
        @inject(ServiceConfiguration) protected readonly serviceConfig: ServiceConfiguration,
        @inject(Logger) protected readonly logger: Logger,
    ) {
        super();
    }

    public async handleRequest(): Promise<void> {
        const payload = this.tryGetPayload<ScanBatchRequest[]>();
        const scanIds = payload.map(request => request.scanId);
        const responseBody: OnDemandPageScanResultResponse[] = [];
        const scanIdsToQuery: string[] = [];

        for (const scanId of scanIds) {
            const isRequestMadeTooSoon = await this.isRequestMadeTooSoon(scanId);
            if (isRequestMadeTooSoon === true) {
                responseBody.push(this.getTooSoonRequestResponse(scanId));
            } else if (isRequestMadeTooSoon === undefined) {
                responseBody.push(this.getInvalidRequestResponse(scanId));
            } else {
                scanIdsToQuery.push(scanId);
            }
        }

        const scanResultItemMap = await this.getScanResultMapKeyByScanId(scanIdsToQuery);

        scanIdsToQuery.forEach(scanId => {
            if (isEmpty(scanResultItemMap[scanId])) {
                responseBody.push(this.get404Response(scanId));
            } else {
                responseBody.push(scanResultItemMap[scanId]);
            }
        });

        this.context.res = {
            status: 200,
            body: responseBody,
        };

        this.logger.logInfo('batch scan result fetched');
    }

    // tslint:disable-next-line: no-empty
    protected handleInvalidRequest(): void {}
}
