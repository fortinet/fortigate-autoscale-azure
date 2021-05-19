# FortiGate Autoscale for Azure

A collection of **Node.js** modules and cloud-specific templates which support auto scaling functionality for groups of FortiGate-VM instances on various cloud platforms.

This project contains the code and templates for the **Microsoft Azure** deployment. For deployment on other cloud platforms, visit the relevant repository:
* The **AliCloud** deployment is in the  [alicloud-autoscale](https://github.com/fortinet/alicloud-autoscale/) repository.
* The **Amazon AWS** deployment is in the [fortigate-autoscale-aws](https://github.com/fortinet/fortigate-autoscale-aws) repository.
* The **GCP** deployment is in the [fortigate-autoscale-gcp](https://github.com/fortinet/fortigate-autoscale-gcp) repository.

This project is organized in separate node modules:

 * [autoscale-core](https://github.com/fortinet/autoscale-core) contains the core logic and provides an interface that can be extended to deal with the differences in cloud platform APIs.

 * [fortigate-autoscale-azure](https://github.com/fortinet/fortigate-autoscale-azure) contains an implementation for the **Microsoft Azure** platform API and **Cosmos DB** storage backend.


The project also contains a deployment script that can generate packages for each cloud service's *serverless* implementation.

## Deployment packages
To generate local deployment packages:

1. From the [project release page](https://github.com/fortinet/fortigate-autoscale-azure/releases), download the fortigate-autoscale-azure.zip for the latest version.
2. ```


## Deployment guide
A deployment guide is available from the Fortinet Document Library:

  + [ FortiGate / FortiOS 6.4 / Deploying auto scaling on Azure](https://docs.fortinet.com/document/fortigate-public-cloud/6.4.0/azure-administration-guide/161167/deploying-auto-scaling-on-azure)

## Launch a demo
<a href="https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Ffortinet%2Ffortigate-autoscale-azure%2F3.3.0-rc.1%2Ftemplates%2Fdeploy_fortigate_autoscale.hybrid_licensing.json" target="_blank"><img src="http://azuredeploy.net/deploybutton.png"/></a>



## Project development history
| Version | Details | Documentation |
| ------- | ------- | ------------- |
| 3.3.0 (latest) | Added support for FortiAnalyzer integration.|
| 3.0 | The AWS portion of this project has been moved to [fortigate-autoscale-aws](https://github.com/fortinet/fortigate-autoscale-aws). Going forward, this project will be maintained for Azure only. | [ FortiGate / FortiOS 6.2 / Deploying auto scaling on Azure](https://docs.fortinet.com/document/fortigate-public-cloud/6.2.0/azure-administration-guide/161167/deploying-auto-scaling-on-azure) |
| 2.0 | Added support for Hybrid Licensing (any combination of BYOL and/or PAYG instances). | A PDF for AWS is available in the 2.0 branch.<br/>[deploying-auto-scaling-on-aws-2.0.9.pdf](https://github.com/fortinet/fortigate-autoscale/blob/2.0/docs/deploying-auto-scaling-on-aws-2.0.9.pdf) |
| 1.0 | Supports auto scaling for PAYG instances only.  | PDFs for AWS and for Azure are available in the 1.0.6 branch.<br/>[deploying-auto-scaling-on-aws-1.0.pdf](https://github.com/fortinet/fortigate-autoscale/blob/1.0/docs/deploying-auto-scaling-on-aws-1.0.pdf)<br/>[deploying-auto-scaling-on-azure-1.0.pdf](https://github.com/fortinet/fortigate-autoscale/blob/1.0/docs/deploying-auto-scaling-on-azure-1.0.pdf) |

# Support
Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services.
For direct issues, please refer to the [Issues](https://github.com/fortinet/fortigate-autoscale-azure/issues) tab of this GitHub project.

For other questions related to this project, contact [github@fortinet.com](mailto:github@fortinet.com).

## License
[License](./LICENSE) © Fortinet Technologies. All rights reserved.
