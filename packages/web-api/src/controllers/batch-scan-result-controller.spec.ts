// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import 'reflect-metadata';
import { InvalidPageScanResultResponse, ItemType, OnDemandPageScanResult, OnDemandPageScanResultResponse } from 'storage-documents';

import { Context } from '@azure/functions';
import { GuidGenerator, RestApiConfig, ServiceConfiguration } from 'common';
import { Logger } from 'logger';
import { OnDemandPageScanRunResultProvider } from 'service-library';
import { IMock, It, Mock, Times } from 'typemoq';
import { ScanBatchRequest } from './../api-contracts/scan-batch-request';
import { BatchScanResultController } from './batch-scan-result-controller';

describe(BatchScanResultController, () => {
    let batchScanResultController: BatchScanResultController;
    let context: Context;
    let onDemandPageScanRunResultProviderMock: IMock<OnDemandPageScanRunResultProvider>;
    let serviceConfigurationMock: IMock<ServiceConfiguration>;
    let loggerMock: IMock<Logger>;
    let guidGeneratorMock: IMock<GuidGenerator>;
    const validScanId = 'valid-scan-id';
    const notFoundScanId = 'not-found-scan-id';
    const invalidScanId = 'invalid-scan-id';
    const requestedTooSoonScanId = 'requested-too-soon-scan-id';
    const batchRequestBody: ScanBatchRequest[] = [
        { scanId: validScanId },
        { scanId: notFoundScanId },
        { scanId: invalidScanId },
        { scanId: requestedTooSoonScanId },
    ];
    const scanFetchedResponse: OnDemandPageScanResult = {
        id: validScanId,
        partitionKey: 'pk',
        url: 'url',
        run: {
            state: 'running',
        },
        priority: 1,
        itemType: ItemType.onDemandPageScanRunResult,
    };

    beforeEach(() => {
        context = <Context>(<unknown>{
            req: {
                method: 'POST',
                headers: {},
                rawBody: `[]`,
                query: {},
            },
        });
        context.req.query['api-version'] = '1.0';
        context.req.headers['content-type'] = 'application/json';
        onDemandPageScanRunResultProviderMock = Mock.ofType<OnDemandPageScanRunResultProvider>();
        onDemandPageScanRunResultProviderMock
            // tslint:disable-next-line: no-unsafe-any
            .setup(async o => o.readScanRuns(It.isAny()))
            .returns(async () => Promise.resolve([scanFetchedResponse]));

        guidGeneratorMock = Mock.ofType(GuidGenerator);
        guidGeneratorMock
            .setup(gm => gm.isValidV6Guid(It.isAnyString()))
            .returns(id => {
                return id !== invalidScanId;
            });

        serviceConfigurationMock = Mock.ofType<ServiceConfiguration>();
        serviceConfigurationMock
            .setup(async s => s.getConfigValue('restApiConfig'))
            .returns(async () => {
                // tslint:disable-next-line: no-object-literal-type-assertion
                return {
                    maxScanRequestBatchCount: 2,
                    minimumWaitTimeforScanResultQueryInSeconds: 120,
                } as RestApiConfig;
            });

        loggerMock = Mock.ofType<Logger>();
    });

    function createScanResultController(contextReq: Context): BatchScanResultController {
        return new BatchScanResultController(
            contextReq,
            onDemandPageScanRunResultProviderMock.object,
            guidGeneratorMock.object,
            serviceConfigurationMock.object,
            loggerMock.object,
        );
    }

    function setupGetGuidTimestamp(scanId: string, time: Date): void {
        guidGeneratorMock
            .setup(gm => gm.getGuidTimestamp(scanId))
            .returns(() => time)
            .verifiable(Times.once());
    }

    describe('handleRequest', () => {
        // it('should return empty array if request body is empty array', async () => {
        //     const emptyResponse: OnDemandPageScanResultResponse[] = [];
        //     batchScanResultController = createScanResultController(context);

        //     await batchScanResultController.handleRequest();

        //     expect(context.res.status).toEqual(200);
        //     expect(context.res.body).toEqual(emptyResponse);
        // });

        it('should return different response for different kind of scanIds', async () => {
            context.req.rawBody = JSON.stringify(batchRequestBody);
            batchScanResultController = createScanResultController(context);
            const requestTooSoonTimeStamp = new Date();
            requestTooSoonTimeStamp.setFullYear(requestTooSoonTimeStamp.getFullYear() + 1);
            const validTimeStamp = new Date(0);

            setupGetGuidTimestamp(validScanId, validTimeStamp);
            setupGetGuidTimestamp(requestedTooSoonScanId, requestTooSoonTimeStamp);
            setupGetGuidTimestamp(notFoundScanId, validTimeStamp);

            await batchScanResultController.handleRequest();

            guidGeneratorMock.verifyAll();
            expect(context.res.status).toEqual(200);
            expect(context.res.body).toMatchSnapshot();
        });
    });
});