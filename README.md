# FortiGate Autoscale for Azure

[![version on main branch](https://img.shields.io/github/package-json/v/fortinet/fortigate-autoscale-azure?label=version%20on%20main%20branch)](./) [![latest release version](https://img.shields.io/github/v/release/fortinet/fortigate-autoscale-azure?label=latest%20release%20version)](https://github.com/fortinet/fortigate-autoscale-azure/releases/latest) [![platform](https://img.shields.io/badge/platform-Azure-green.svg)](./) [![supported FOS version](https://img.shields.io/badge/supported%20FOS%20version-6.4.5-green.svg)](./)

An implementation of FortiGate Autoscale for the Microsoft Azure platform API with a Cosmos DB storage backend.

This project contains the code and templates for the **Microsoft Azure** deployment. For deployment on other cloud platforms, visit the relevant repository:

* The **AliCloud** deployment is in the  [alicloud-autoscale](https://github.com/fortinet/alicloud-autoscale/) repository.
* The **Amazon AWS** deployment is in the [fortigate-autoscale-aws](https://github.com/fortinet/fortigate-autoscale-aws) repository.
* The **GCP** deployment is in the [fortigate-autoscale-gcp](https://github.com/fortinet/fortigate-autoscale-gcp) repository.

This project has the following features:

1. Multi-group Hybrid Licensing models:
    * **BYOL-Only**: 1 dynamically scalable Autoscale group of (0 or more) Bring Your Own License (BYOL) FortiGate instances.
    * **PAYG-Only**: 1 dynamically scalable Autoscale group of (0 or more) on-demand FortiGate instances.
    * **Hybrid**: 1 fix-sized Autoscale group of 2 (or more) BYOL FortiGate instances, and 1 dynamically scalable Autoscale group of (0 or more) on-demand FortiGate instances.
2. FortiAnalyzer integration.

[autoscale-core](https://github.com/fortinet/autoscale-core) contains the core logic and provides an interface that can be extended to deal with the differences in cloud platform APIs.

## Deployment package

The FortiGate Autoscale for Azure deployment package is located in the Fortinet Autoscale for Azure GitHub project.

To obtain the package, go to the FortiGate Autoscale for Azure [GitHub project release page](https://github.com/fortinet/fortigate-autoscale-azure/releases) and download `fortigate-autoscale-azure.zip` for the latest version.

## Deployment guide

A deployment guide is available from the Fortinet Document Library:

  + [ FortiGate / FortiOS 6.4 / Deploying auto scaling on Azure](https://docs.fortinet.com/document/fortigate-public-cloud/6.4.0/azure-administration-guide/161167/deploying-auto-scaling-on-azure)

## Launch a demo

<a href="https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Ffortinet%2Ffortigate-autoscale-azure%2F3.3.0%2Ftemplates%2Fdeploy_fortigate_autoscale.hybrid_licensing.json" target="_blank"><img src="http://azuredeploy.net/deploybutton.png"/></a>

# Support

Fortinet-provided scripts in this and other GitHub projects do not fall under the regular Fortinet technical support scope and are not supported by FortiCare Support Services.
For direct issues, please refer to the [Issues](https://github.com/fortinet/fortigate-autoscale-azure/issues) tab of this GitHub project.

For other questions related to this project, contact [github@fortinet.com](mailto:github@fortinet.com).

## License

[License](./LICENSE) © Fortinet Technologies. All rights reserved.
