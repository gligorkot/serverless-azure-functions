import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import mockFs from "mock-fs";
import Serverless from "serverless";
import { MockFactory } from "../test/mockFactory";
import { FunctionAppService } from "./functionAppService";
import { ArmService } from "./armService";
import { FunctionAppResource } from "../armTemplates/resources/functionApp";

jest.mock("@azure/arm-appservice")
import { WebSiteManagementClient } from "@azure/arm-appservice";
import { ArmDeployment, ArmTemplateType } from "../models/armTemplates";
jest.mock("@azure/arm-resources")

describe("Function App Service", () => {
  const app = MockFactory.createTestSite();
  const slsService = MockFactory.createTestService();
  const variables = MockFactory.createTestVariables();
  const provider = MockFactory.createTestAzureServiceProvider();

  const masterKey = "masterKey";
  const authKey = "authKey";
  const syncTriggersMessage = "sync triggers success";
  const deleteFunctionMessage = "delete function success";
  const functions = MockFactory.createTestSlsFunctionConfig();
  const functionsResponse = MockFactory.createTestFunctionsResponse(functions);

  const baseUrl = "https://management.azure.com"
  const masterKeyUrl = `https://${app.defaultHostName}/admin/host/systemkeys/_master`;
  const authKeyUrl = `${baseUrl}${app.id}/functions/admin/token?api-version=2016-08-01`;
  const syncTriggersUrl = `${baseUrl}${app.id}/syncfunctiontriggers?api-version=2016-08-01`;
  const listFunctionsUrl = `${baseUrl}${app.id}/functions?api-version=2016-08-01`;

  beforeAll(() => {
    const axiosMock = new MockAdapter(axios);

    // Master Key
    axiosMock.onGet(masterKeyUrl).reply(200, { value: masterKey });
    // Auth Key
    axiosMock.onGet(authKeyUrl).reply(200, authKey);
    // Sync Triggers
    axiosMock.onPost(syncTriggersUrl).reply(200, syncTriggersMessage);
    // List Functions
    axiosMock.onGet(listFunctionsUrl).reply(200, { value: functionsResponse });
    // Delete Function
    for (const funcName of Object.keys(functions)) {
      axiosMock.onDelete(`${baseUrl}${app.id}/functions/${funcName}?api-version=2016-08-01`)
        .reply(200, deleteFunctionMessage);
    }

    mockFs({
      "app.zip": "contents",
    }, { createCwd: true, createTmp: true });
  });

  beforeEach(() => {
    WebSiteManagementClient.prototype.webApps = {
      get: jest.fn(() => app),
      deleteFunction: jest.fn(),
    } as any;
    (FunctionAppService.prototype as any).sendFile = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  })

  afterAll(() => {
    mockFs.restore();
  });

  function createService(sls?: Serverless, options?: Serverless.Options) {
    return new FunctionAppService(
      sls || MockFactory.createTestServerless({
        service: slsService,
        variables: variables,
      }),
      options || MockFactory.createTestServerlessOptions()
    )
  }

  it("get returns function app", async () => {
    const service = createService();
    const result = await service.get();
    expect(WebSiteManagementClient.prototype.webApps.get)
      .toBeCalledWith(provider.resourceGroup, FunctionAppResource.getResourceName(slsService as any));
    expect(result).toEqual(app)
  });

  it("get returns null if error occurred", async () => {
    const service = createService();
    WebSiteManagementClient.prototype.webApps = {
      get: jest.fn(() => { return { error: { code: "ResourceNotFound" } } }),
      deleteFunction: jest.fn(),
    } as any;
    const result = await service.get();
    expect(WebSiteManagementClient.prototype.webApps.get)
      .toBeCalledWith(provider.resourceGroup, FunctionAppResource.getResourceName(slsService as any));
    expect(result).toBeNull();
  });

  it("gets master key", async () => {
    const service = createService();
    const masterKey = await service.getMasterKey();
    expect(masterKey).toEqual(masterKey);

  });

  it("deletes function", async () => {
    const service = createService();
    const response = await service.deleteFunction(app, Object.keys(functions)[0]);
    expect(response.data).toEqual(deleteFunctionMessage);

  });

  it("syncs triggers", async () => {
    const service = createService();
    const result = await service.syncTriggers(app);
    expect(result.data).toEqual(syncTriggersMessage)
  });

  it("cleans up", async () => {
    const sls = MockFactory.createTestServerless();
    const service = createService(sls);
    const result = await service.cleanUp(app);
    const functionNames = Object.keys(functions);
    expect(result).toHaveLength(functionNames.length);
    const logCalls = (sls.cli.log as any).mock.calls as any[];
    for (let i = 0; i < functionNames.length; i++) {
      const functionName = functionNames[i];
      expect(logCalls[i + 1][0]).toEqual(`-> Deleting function: ${functionName}`);
    }
  });

  it("lists functions", async () => {
    const service = createService();
    expect(await service.listFunctions(app)).toEqual(functionsResponse.map((f) => f.properties));
  });

  describe("Deployments", () => {
    const expectedDeployment: ArmDeployment = {
      parameters: {},
      template: MockFactory.createTestArmTemplate(),
    };

    const expectedSite = MockFactory.createTestSite();

    beforeEach(() => {
      FunctionAppService.prototype.get = jest.fn(() => Promise.resolve(expectedSite));
      ArmService.prototype.createDeploymentFromConfig = jest.fn(() => Promise.resolve(expectedDeployment));
      ArmService.prototype.createDeploymentFromType = jest.fn(() => Promise.resolve(expectedDeployment));
      ArmService.prototype.deployTemplate = jest.fn(() => Promise.resolve(null));
    });

    it("deploys ARM templates with custom configuration", async () => {
      slsService.provider["armTemplate"] = {};

      const service = createService();
      const site = await service.deploy();

      expect(site).toEqual(expectedSite);
      expect(ArmService.prototype.createDeploymentFromConfig).toBeCalledWith(slsService.provider["armTemplate"]);
      expect(ArmService.prototype.createDeploymentFromType).not.toBeCalled();
      expect(ArmService.prototype.deployTemplate).toBeCalledWith(expectedDeployment);
    });

    it("deploys ARM template from well-known (default) configuration", async () => {
      slsService.provider["armTemplate"] = null;

      const service = createService();
      const site = await service.deploy();

      expect(site).toEqual(expectedSite);
      expect(ArmService.prototype.createDeploymentFromConfig).not.toBeCalled();
      expect(ArmService.prototype.createDeploymentFromType).toBeCalledWith(ArmTemplateType.Consumption);
      expect(ArmService.prototype.deployTemplate).toBeCalledWith(expectedDeployment);
    });

    it("deploys ARM template from well-known configuration", async () => {
      slsService.provider["armTemplate"] = null;
      slsService.provider["type"] = "premium";

      const service = createService();
      const site = await service.deploy();

      expect(site).toEqual(expectedSite);
      expect(ArmService.prototype.createDeploymentFromConfig).not.toBeCalled();
      expect(ArmService.prototype.createDeploymentFromType).toBeCalledWith(ArmTemplateType.Premium);
      expect(ArmService.prototype.deployTemplate).toBeCalledWith(expectedDeployment);
    });
  });

  it("uploads functions", async () => {
    const scmDomain = app.enabledHostNames.find((hostname) => hostname.endsWith("scm.azurewebsites.net"));
    const expectedUploadUrl = `https://${scmDomain}/api/zipdeploy/`;

    const service = createService();
    await service.uploadFunctions(app);

    expect((FunctionAppService.prototype as any).sendFile).toBeCalledWith({
      method: "POST",
      uri: expectedUploadUrl,
      json: true,
      headers: {
        Authorization: `Bearer ${variables["azureCredentials"].tokenCache._entries[0].accessToken}`,
        Accept: "*/*",
        ContentType: "application/octet-stream",
      }
    }, slsService["artifact"])
  });

  it("uploads functions with custom SCM domain (aka App service environments)", async () => {
    const customApp = {
      ...MockFactory.createTestSite("CustomAppWithinASE"),
      enabledHostNames: [
        "myapi.customase.p.azurewebsites.net",
        "myapi.scm.customase.p.azurewebsites.net"
      ],
    }

    const expectedUploadUrl = `https://${customApp.enabledHostNames[1]}/api/zipdeploy/`;

    const service = createService();
    await service.uploadFunctions(customApp);

    expect((FunctionAppService.prototype as any).sendFile).toBeCalledWith({
      method: "POST",
      uri: expectedUploadUrl,
      json: true,
      headers: {
        Authorization: `Bearer ${variables["azureCredentials"].tokenCache._entries[0].accessToken}`,
        Accept: "*/*",
        ContentType: "application/octet-stream",
      }
    }, slsService["artifact"])
  });

  it("throws an error with no zip file", async () => {
    const sls = MockFactory.createTestServerless();
    delete sls.service["artifact"];
    const service = createService(sls);
    await expect(service.uploadFunctions(app)).rejects.not.toBeNull()
  });
});