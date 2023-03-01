import run from "clvr";
import { defaultParameters } from "../parameters";

run({
  name: "Deploy Test",
  parameters: defaultParameters,
  validations: [
    {
      // relative path to package.json so that we run the rest of the tests using the updated package
      command: "npm i ../../../",
      silent: true,
    },
    {
      // use openssl-legacy-provider flag until we update webpack
      command: "export NODE_OPTIONS=--openssl-legacy-provider sls package",
    },
    // {
    //   command: "sls deploy -p .serverless/${serviceName}.zip",
    //   retries: 3,
    //   stdout: {
    //     shouldContain: [
    //       "Logging into Azure",
    //       "Deployed serverless functions:",
    //       "int-${region}-qa-${serviceName}-rg",
    //       "-> hello: [GET] int-${region}-qa-${serviceName}.azurewebsites.net/api/hello"
    //     ],
    //   }
    // },
    // {
    //   command: `sls invoke -f hello -d ${JSON.stringify({name: "Azure"}).replace(" ", "")}`,
    //   retries: 3,
    //   stdout: {
    //     shouldContain: [
    //       "Hello Azure ${runtime}",
    //       "Environment variable: foo"
    //     ]
    //   },
    //   stderr: {
    //     shouldBeExactly: ""
    //   }
    // },
    // {
    //   command: `sls invoke apim -f hello -d ${JSON.stringify({name: "Azure"}).replace(" ", "")}`,
    //   retries: 3,
    //   stdout: {
    //     shouldContain: [
    //       "Hello Azure ${runtime}",
    //       "Environment variable: foo"
    //     ]
    //   },
    //   stderr: {
    //     shouldBeExactly: ""
    //   },
    // },
    // {
    //   command: "sls remove --force",
    //   retries: 3,
    //   stdout: {
    //     shouldContain: [
    //       "Service successfully removed"
    //     ]
    //   }
    // },
  ]
});
