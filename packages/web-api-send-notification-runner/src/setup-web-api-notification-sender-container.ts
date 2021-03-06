// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { registerAzureServicesToContainer } from 'azure-services';
import { setupRuntimeConfigContainer } from 'common';
import * as inversify from 'inversify';
import { registerContextAwareLoggerToContainer, registerGlobalLoggerToContainer } from 'logger';
import { registerServiceLibraryToContainer } from 'service-library';

export function setupWebApiNotificationSenderContainer(): inversify.Container {
    const container = new inversify.Container({ autoBindInjectable: true });
    setupRuntimeConfigContainer(container);
    registerGlobalLoggerToContainer(container);
    registerContextAwareLoggerToContainer(container);
    registerAzureServicesToContainer(container);
    registerServiceLibraryToContainer(container);

    return container;
}
